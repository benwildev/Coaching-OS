import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import prisma from '@/lib/db';
import { recordAuditLog } from '@/lib/services/audit.service';

export const dynamic = 'force-dynamic';

interface WhatsAppStatusEntry {
  id: string; // provider message id
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

interface WhatsAppWebhookPayload {
  entry?: { changes?: { value?: { statuses?: WhatsAppStatusEntry[] } }[] }[];
}

/** Meta's subscription verification handshake. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token');
  const challenge = sp.get('hub.challenge');

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return NextResponse.json({ success: false, error: 'VERIFICATION_FAILED' }, { status: 403 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * WhatsApp Cloud API delivery-status callback. Never trusts any tenant/
 * guardian/student identifier from the payload itself — the only thing
 * cross-checked against our own data is the provider's own message id,
 * matched to a CommunicationLog row we created. Unsigned or badly-signed
 * payloads are rejected outright (Phase 10.8 §23).
 */
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const rawBody = await request.text();

  if (!appSecret || !isValidSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ success: false, error: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const statuses = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.statuses ?? []) ?? []) ?? [];

  for (const statusEntry of statuses) {
    if (statusEntry.status !== 'delivered' && statusEntry.status !== 'failed') continue; // 'sent'/'read' don't change our stored state

    const log = await prisma.communicationLog.findFirst({
      where: { providerMessageId: statusEntry.id, channel: 'WHATSAPP' },
    });
    if (!log) continue; // unknown message id — never create/guess a record from webhook data alone

    // Idempotent: a replayed webhook, or a late 'failed' arriving after an
    // already-recorded 'delivered', must never regress a terminal state.
    if (log.status === 'DELIVERED') continue;
    const newStatus = statusEntry.status === 'delivered' ? 'DELIVERED' : 'FAILED';
    if (log.status === newStatus) continue;

    await prisma.communicationLog.update({
      where: { id: log.id },
      data: {
        status: newStatus,
        deliveredAt: newStatus === 'DELIVERED' ? new Date() : log.deliveredAt,
      },
    });

    await recordAuditLog({
      coachingCenterId: log.coachingCenterId,
      userId: null,
      action: 'COMMUNICATION_DELIVERY_STATUS_UPDATED',
      entity: 'CommunicationLog',
      entityId: log.id,
      details: { channel: 'WHATSAPP', previousStatus: log.status, newStatus },
    });
  }

  return NextResponse.json({ success: true });
}
