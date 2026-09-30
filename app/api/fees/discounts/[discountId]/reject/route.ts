import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/services/audit.service';
import { notifyUser } from '@/lib/services/notification.service';
import prisma from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

type RouteProps = {
  params: Promise<{ discountId: string }>;
};

export async function POST(request: Request, props: RouteProps) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    // Deliverable 3: Owner-only permission to reject
    await requireRole(['OWNER']);

    const { discountId } = await props.params;

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is acceptable
    }
    const validated = rejectSchema.safeParse(body);
    const rejectionNote = (validated.success && (validated.data.reason || validated.data.note))
      ? (validated.data.reason || validated.data.note)
      : 'Rejected by Owner';

    // 1. Fetch discount within tenant
    const discount = await prisma.feeDiscount.findFirst({
      where: {
        id: discountId,
        coachingCenterId,
      },
      include: {
        feeInvoice: {
          include: { student: true },
        },
        studentFeeAssignment: {
          include: { student: true },
        },
      },
    });

    if (!discount) {
      return NextResponse.json({ success: false, error: 'Discount request not found' }, { status: 404 });
    }

    // 2. Prevent duplicate rejection or rejecting already approved/rejected items
    if (!discount.reason.startsWith('[PENDING_APPROVAL')) {
      if (discount.reason.startsWith('[APPROVED')) {
        return NextResponse.json(
          { success: false, error: 'Discount request has already been approved and cannot be rejected' },
          { status: 400 }
        );
      }
      if (discount.reason.startsWith('[REJECTED')) {
        return NextResponse.json(
          { success: false, error: 'Discount request is already rejected' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Discount request is not in a pending state' },
        { status: 400 }
      );
    }

    // 3. Clean original reason (remove [PENDING_APPROVAL: ...])
    const cleanReason = discount.reason.replace(/^\[PENDING_APPROVAL[^\]]*\]\s*/, '');
    const finalReason = `[REJECTED: ${rejectionNote}] ${cleanReason}`.trim();

    // 4. Update FeeDiscount - invoice remains untouched
    const updatedDiscount = await prisma.feeDiscount.update({
      where: { id: discount.id },
      data: {
        reason: finalReason,
      },
    });

    // 5. Record audit log
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: discount.type === 'DISCOUNT' ? 'DISCOUNT_REJECTED' : 'WAIVER_REJECTED',
      entity: 'FeeDiscount',
      entityId: discount.id,
      details: {
        invoiceId: discount.feeInvoiceId,
        amount: Number(discount.amount),
        type: discount.type,
        rejectionReason: rejectionNote,
        originalReason: cleanReason,
      },
    });

    // 6. Notify original requester if present
    if (discount.createdById) {
      try {
        const student = discount.feeInvoice?.student || discount.studentFeeAssignment?.student;
        const studentName = student?.name || 'Student';
        const typeLabelEn = discount.type === 'DISCOUNT' ? 'Discount' : 'Waiver';
        const typeLabelBn = discount.type === 'DISCOUNT' ? 'ডিসকাউন্ট' : 'মওকুফ';
        const discountAmount = Number(discount.amount);

        await notifyUser({
          coachingCenterId,
          userId: discount.createdById,
          type: 'FEE_DISCOUNT_REJECTED',
          title: `${typeLabelEn} Request Rejected / ${typeLabelBn} আবেদন প্রত্যাখ্যাত`,
          body: `Your ${typeLabelEn.toLowerCase()} request of ৳${discountAmount} for ${studentName} was rejected. Reason: ${rejectionNote}\n${studentName}-এর জন্য আপনার ৳${discountAmount} ${typeLabelBn}-এর আবেদন প্রত্যাখ্যাত হয়েছে। কারণ: ${rejectionNote}`,
          actionUrl: '/fees/discounts',
          sourceType: 'FeeDiscount',
          sourceId: discount.id,
        });
      } catch (notifyErr) {
        console.error('[FeeDiscountReject] Failed to notify requester:', notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${discount.type === 'DISCOUNT' ? 'Discount' : 'Waiver'} request rejected`,
      discount: updatedDiscount,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/discounts/[discountId]/reject POST');
  }
}
