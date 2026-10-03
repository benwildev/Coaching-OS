import { NextResponse } from 'next/server';
import { requireTenant, requirePermission, assertBranchAccess, resolveEffectiveBranchId } from '@/lib/auth/session';
import { apiErrorResponse } from '@/lib/api-error';
import { can } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/services/audit.service';
import { notifyUsers } from '@/lib/services/notification.service';
import prisma from '@/lib/db';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const discountRequestSchema = z.object({
  invoiceId: z.string().uuid(),
  type: z.enum(['DISCOUNT', 'WAIVER']),
  amount: z.number().positive(),
  reason: z.string().trim().min(3).max(500),
});

export async function GET(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.read');

    const { searchParams } = new URL(request.url);
    const filterStatus = searchParams.get('status') || 'ALL'; // PENDING, APPROVED, REJECTED, ALL
    const filterType = searchParams.get('type') || 'ALL'; // DISCOUNT, WAIVER, ALL
    const branchId = resolveEffectiveBranchId(user, searchParams.get('branch') || undefined);

    const where: Prisma.FeeDiscountWhereInput = {
      coachingCenterId,
      ...(filterType !== 'ALL' ? { type: filterType as any } : {}),
      ...(branchId
        ? {
            feeInvoice: { branchId },
          }
        : {}),
    };

    const allDiscounts = await prisma.feeDiscount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        feeInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            dueAmount: true,
            status: true,
            branchId: true,
            student: {
              select: {
                id: true,
                studentIdCode: true,
                name: true,
                banglaName: true,
                phone: true,
              },
            },
          },
        },
        studentFeeAssignment: {
          select: {
            id: true,
            name: true,
            finalAmount: true,
            student: {
              select: {
                id: true,
                studentIdCode: true,
                name: true,
                banglaName: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      take: 100,
    });

    const items = allDiscounts.map((d) => {
      let status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED';
      let cleanReason = d.reason;
      let reviewerNote: string | null = null;

      if (d.reason.startsWith('[PENDING_APPROVAL')) {
        status = 'PENDING';
        cleanReason = d.reason.replace(/^\[PENDING_APPROVAL[^\]]*\]\s*/, '');
      } else if (d.reason.startsWith('[REJECTED')) {
        status = 'REJECTED';
        const match = d.reason.match(/^\[REJECTED:\s*([^\]]+)\]\s*(.*)$/);
        if (match) {
          reviewerNote = match[1];
          cleanReason = match[2];
        } else {
          cleanReason = d.reason.replace(/^\[REJECTED[^\]]*\]\s*/, '');
        }
      } else if (d.reason.startsWith('[APPROVED')) {
        status = 'APPROVED';
        cleanReason = d.reason.replace(/^\[APPROVED[^\]]*\]\s*/, '');
      }

      const student = d.feeInvoice?.student || d.studentFeeAssignment?.student;

      return {
        id: d.id,
        type: d.type,
        amount: Number(d.amount),
        rawReason: d.reason,
        reason: cleanReason,
        reviewerNote,
        status,
        createdAt: d.createdAt,
        createdByName: d.createdBy?.name || 'System',
        invoiceId: d.feeInvoiceId,
        invoiceNumber: d.feeInvoice?.invoiceNumber || null,
        invoiceDueAmount: d.feeInvoice ? Number(d.feeInvoice.dueAmount) : null,
        invoiceStatus: d.feeInvoice?.status || null,
        studentId: student?.id || null,
        studentIdCode: student?.studentIdCode || '—',
        studentName: student?.name || '—',
        studentBanglaName: student?.banglaName || null,
      };
    });

    const filtered = filterStatus === 'ALL' ? items : items.filter((i) => i.status === filterStatus);

    return NextResponse.json({
      success: true,
      count: filtered.length,
      discounts: filtered,
    });
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/discounts GET');
  }
}

export async function POST(request: Request) {
  try {
    const { coachingCenterId, user } = await requireTenant();
    await requirePermission('fees.discount.request');

    const body = await request.json();
    const validated = discountRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { invoiceId, type, amount, reason } = validated.data;

    // Verify invoice exists and belongs to tenant
    const invoice = await prisma.feeInvoice.findFirst({
      where: { id: invoiceId, coachingCenterId },
      include: {
        student: true,
        items: {
          take: 1,
          select: { studentFeeAssignmentId: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    assertBranchAccess(user, invoice.branchId);

    if (invoice.status === 'CANCELLED' || invoice.status === 'PAID') {
      return NextResponse.json(
        { success: false, error: `Cannot adjust an invoice with status ${invoice.status}` },
        { status: 400 }
      );
    }

    const currentDue = Number(invoice.dueAmount);
    if (amount > currentDue) {
      return NextResponse.json(
        { success: false, error: `Adjustment amount (৳${amount}) cannot exceed the invoice current due (৳${currentDue})` },
        { status: 400 }
      );
    }

    // OWNER-only permission (ownerLocked): equivalent to the old OWNER role check.
    const isOwner = can(user, 'fees.discount.approve');
    const assignmentId = invoice.items[0]?.studentFeeAssignmentId || null;

    if (isOwner) {
      // OWNER: directly apply adjustment transactionally
      const result = await prisma.$transaction(async (tx) => {
        const discountRecord = await tx.feeDiscount.create({
          data: {
            coachingCenterId,
            feeInvoiceId: invoice.id,
            studentFeeAssignmentId: assignmentId,
            type,
            amount,
            reason: `[APPROVED] ${reason}`,
            createdById: user.userId,
          },
        });

        const newDiscount = type === 'DISCOUNT' ? Number(invoice.discountAmount) + amount : Number(invoice.discountAmount);
        const newWaiver = type === 'WAIVER' ? Number(invoice.waiverAmount) + amount : Number(invoice.waiverAmount);
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

        if (assignmentId) {
          const fa = await tx.studentFeeAssignment.findUnique({ where: { id: assignmentId } });
          if (fa) {
            const faDiscount = type === 'DISCOUNT' ? Number(fa.discountAmount) + amount : Number(fa.discountAmount);
            const faWaiver = type === 'WAIVER' ? Number(fa.waiverAmount) + amount : Number(fa.waiverAmount);
            const faFinal = Math.max(0, Number(fa.originalAmount) - faDiscount - faWaiver);
            await tx.studentFeeAssignment.update({
              where: { id: assignmentId },
              data: { discountAmount: faDiscount, waiverAmount: faWaiver, finalAmount: faFinal },
            });
          }
        }

        return { discountRecord, updatedInvoice };
      });

      await recordAuditLog({
        coachingCenterId,
        userId: user.userId,
        action: type === 'DISCOUNT' ? 'DISCOUNT_APPROVED' : 'WAIVER_APPROVED',
        entity: 'FeeDiscount',
        entityId: result.discountRecord.id,
        details: {
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount,
          type,
          reason,
          autoApprovedByOwner: true,
        },
      });

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        message: `${type === 'DISCOUNT' ? 'Discount' : 'Waiver'} applied directly by Owner`,
        discount: result.discountRecord,
      }, { status: 201 });
    } else {
      // ADMIN or STAFF: create pending approval request
      const discountRecord = await prisma.feeDiscount.create({
        data: {
          coachingCenterId,
          feeInvoiceId: invoice.id,
          studentFeeAssignmentId: assignmentId,
          type,
          amount,
          reason: `[PENDING_APPROVAL: Requested by ${user.role}] ${reason}`,
          createdById: user.userId,
        },
      });

      await recordAuditLog({
        coachingCenterId,
        userId: user.userId,
        action: type === 'DISCOUNT' ? 'DISCOUNT_REQUESTED' : 'WAIVER_REQUESTED',
        entity: 'FeeDiscount',
        entityId: discountRecord.id,
        details: {
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount,
          type,
          reason,
          requesterRole: user.role,
        },
      });

      // Notify active owners in the coaching center
      try {
        const owners = await prisma.user.findMany({
          where: {
            coachingCenterId,
            status: 'ACTIVE',
            roleAssignments: {
              some: {
                role: {
                  code: 'OWNER',
                },
              },
            },
          },
          select: { id: true },
        });

        if (owners.length > 0) {
          const typeLabelEn = type === 'DISCOUNT' ? 'Discount' : 'Waiver';
          const typeLabelBn = type === 'DISCOUNT' ? 'ডিসকাউন্ট' : 'মওকুফ';
          const studentName = invoice.student?.name || 'Student';
          const studentBanglaName = invoice.student?.banglaName || studentName;
          const studentIdCode = invoice.student?.studentIdCode || invoice.student?.id || '—';

          await notifyUsers({
            coachingCenterId,
            userIds: owners.map((o) => o.id),
            type: 'FEE_DISCOUNT_REQUESTED',
            title: `New ${typeLabelEn} Request / নতুন ${typeLabelBn} আবেদন`,
            body: `${user.name} requested a ${typeLabelEn.toLowerCase()} of ৳${amount} for ${studentName} (ID: ${studentIdCode}, Invoice: ${invoice.invoiceNumber}).\n${user.name} শিক্ষার্থী ${studentBanglaName} (আইডি: ${studentIdCode}, ইনভয়েস: ${invoice.invoiceNumber})-এর জন্য ৳${amount} ${typeLabelBn}-এর আবেদন করেছেন।`,
            actionUrl: '/fees/discounts',
            sourceType: 'FeeDiscount',
            sourceId: discountRecord.id,
          });
        }
      } catch (notifyErr) {
        console.error('[FeeDiscount] Failed to notify owners:', notifyErr);
      }

      return NextResponse.json({
        success: true,
        status: 'PENDING_APPROVAL',
        message: `${type === 'DISCOUNT' ? 'Discount' : 'Waiver'} request submitted for Owner approval`,
        discount: discountRecord,
      }, { status: 201 });
    }
  } catch (error) {
    return apiErrorResponse(error, '/api/fees/discounts POST');
  }
}
