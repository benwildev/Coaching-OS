import { NextResponse } from 'next/server';
import { requireTenant, requireRole } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { recordAuditLog } from '@/lib/services/audit.service';
import { notifyUser } from '@/lib/services/notification.service';
import prisma from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

type RouteProps = {
  params: Promise<{ discountId: string }>;
};

export async function POST(request: Request, props: RouteProps) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    // Deliverable 3: Owner-only permission to approve
    await requireRole(['OWNER']);

    const { discountId } = await props.params;

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is acceptable
    }
    const validated = approveSchema.safeParse(body);
    const ownerNote = validated.success && validated.data.note ? validated.data.note : null;

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

    // 2. Prevent duplicate approval or approving already rejected/approved items
    if (!discount.reason.startsWith('[PENDING_APPROVAL')) {
      if (discount.reason.startsWith('[APPROVED')) {
        return NextResponse.json(
          { success: false, error: 'Discount request is already approved' },
          { status: 400 }
        );
      }
      if (discount.reason.startsWith('[REJECTED')) {
        return NextResponse.json(
          { success: false, error: 'Discount request has already been rejected' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Discount request is not in a pending state' },
        { status: 400 }
      );
    }

    // 3. Locate the associated FeeInvoice
    let invoice = discount.feeInvoice;
    if (!invoice && discount.studentFeeAssignmentId) {
      const invoiceItem = await prisma.feeInvoiceItem.findFirst({
        where: { studentFeeAssignmentId: discount.studentFeeAssignmentId },
        include: { invoice: { include: { student: true } } },
      });
      if (invoiceItem?.invoice && invoiceItem.invoice.coachingCenterId === coachingCenterId) {
        invoice = invoiceItem.invoice;
      }
    }

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Associated invoice not found for this discount request' },
        { status: 404 }
      );
    }

    if (invoice.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'Cannot approve discount on a cancelled invoice' },
        { status: 400 }
      );
    }

    const discountAmount = Number(discount.amount);
    const currentDue = Number(invoice.dueAmount);

    if (discountAmount > currentDue) {
      return NextResponse.json(
        {
          success: false,
          error: `Adjustment amount (৳${discountAmount}) exceeds the invoice current due balance (৳${currentDue})`,
        },
        { status: 400 }
      );
    }

    // 4. Clean original reason (remove [PENDING_APPROVAL: ...])
    const cleanReason = discount.reason.replace(/^\[PENDING_APPROVAL[^\]]*\]\s*/, '');
    const newReasonPrefix = ownerNote ? `[APPROVED: ${ownerNote}]` : `[APPROVED]`;
    const finalReason = `${newReasonPrefix} ${cleanReason}`.trim();

    // 5. Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update FeeDiscount
      const updatedDiscount = await tx.feeDiscount.update({
        where: { id: discount.id },
        data: {
          feeInvoiceId: invoice.id,
          reason: finalReason,
        },
      });

      // Update FeeInvoice
      const newDiscount =
        discount.type === 'DISCOUNT' ? Number(invoice.discountAmount) + discountAmount : Number(invoice.discountAmount);
      const newWaiver =
        discount.type === 'WAIVER' ? Number(invoice.waiverAmount) + discountAmount : Number(invoice.waiverAmount);
      const newTotal = Math.max(0, Number(invoice.subtotalAmount) - newDiscount - newWaiver);
      const newDue = Math.max(0, newTotal - Number(invoice.paidAmount));
      const newStatus = newDue <= 0 ? 'PAID' : Number(invoice.paidAmount) > 0 ? 'PARTIAL' : 'ISSUED';

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          discountAmount: newDiscount,
          waiverAmount: newWaiver,
          totalAmount: newTotal,
          dueAmount: newDue,
          status: newStatus,
        },
      });

      // Update StudentFeeAssignment if linked
      const assignmentId = discount.studentFeeAssignmentId;
      if (assignmentId) {
        const fa = await tx.studentFeeAssignment.findUnique({ where: { id: assignmentId } });
        if (fa) {
          const faDiscount =
            discount.type === 'DISCOUNT' ? Number(fa.discountAmount) + discountAmount : Number(fa.discountAmount);
          const faWaiver =
            discount.type === 'WAIVER' ? Number(fa.waiverAmount) + discountAmount : Number(fa.waiverAmount);
          const faFinal = Math.max(0, Number(fa.originalAmount) - faDiscount - faWaiver);
          await tx.studentFeeAssignment.update({
            where: { id: assignmentId },
            data: { discountAmount: faDiscount, waiverAmount: faWaiver, finalAmount: faFinal },
          });
        }
      }

      return { updatedDiscount, updatedInvoice };
    });

    // 6. Record audit log
    await recordAuditLog({
      coachingCenterId,
      userId: user.userId,
      action: discount.type === 'DISCOUNT' ? 'DISCOUNT_APPROVED' : 'WAIVER_APPROVED',
      entity: 'FeeDiscount',
      entityId: discount.id,
      details: {
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount: discountAmount,
        type: discount.type,
        ownerNote,
        originalReason: cleanReason,
      },
    });

    // 7. Notify original requester if present
    if (discount.createdById) {
      try {
        const student = invoice.student || discount.studentFeeAssignment?.student;
        const studentName = student?.name || 'Student';
        const studentBanglaName = student?.banglaName || studentName;
        const typeLabelEn = discount.type === 'DISCOUNT' ? 'Discount' : 'Waiver';
        const typeLabelBn = discount.type === 'DISCOUNT' ? 'ডিসকাউন্ট' : 'মওকুফ';
        const noteSuffixEn = ownerNote ? ` Note: ${ownerNote}` : '';
        const noteSuffixBn = ownerNote ? ` নোট: ${ownerNote}` : '';

        await notifyUser({
          coachingCenterId,
          userId: discount.createdById,
          type: 'FEE_DISCOUNT_APPROVED',
          title: `${typeLabelEn} Request Approved / ${typeLabelBn} আবেদন অনুমোদিত`,
          body: `Your ${typeLabelEn.toLowerCase()} request of ৳${discountAmount} for ${studentName} has been approved.${noteSuffixEn}\n${studentBanglaName}-এর জন্য আপনার ৳${discountAmount} ${typeLabelBn}-এর আবেদন অনুমোদিত হয়েছে।${noteSuffixBn}`,
          actionUrl: '/fees/discounts',
          sourceType: 'FeeDiscount',
          sourceId: discount.id,
        });
      } catch (notifyErr) {
        console.error('[FeeDiscountApprove] Failed to notify requester:', notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${discount.type === 'DISCOUNT' ? 'Discount' : 'Waiver'} approved successfully`,
      discount: result.updatedDiscount,
      invoice: {
        id: result.updatedInvoice.id,
        invoiceNumber: result.updatedInvoice.invoiceNumber,
        totalAmount: Number(result.updatedInvoice.totalAmount),
        paidAmount: Number(result.updatedInvoice.paidAmount),
        dueAmount: Number(result.updatedInvoice.dueAmount),
        status: result.updatedInvoice.status,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/discounts/[discountId]/approve POST');
  }
}
