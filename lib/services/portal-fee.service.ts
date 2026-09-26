import { getStudentFeeProfile } from './fee.service';

/**
 * Thin wrapper around fee.service.ts:getStudentFeeProfile — reuses its
 * queries and Decimal-safe summary math entirely, strips staff-only fields
 * (createdById, internal discount reasons) before the response reaches a
 * portal user.
 */
export async function getPortalFeeSummary(coachingCenterId: string, studentId: string) {
  const profile = await getStudentFeeProfile(coachingCenterId, studentId);
  if (!profile) throw new Error('STUDENT_NOT_FOUND');

  return {
    student: profile.student,
    summary: profile.summary,
    invoices: profile.invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      subtotalAmount: i.subtotalAmount,
      discountAmount: i.discountAmount,
      waiverAmount: i.waiverAmount,
      totalAmount: i.totalAmount,
      paidAmount: i.paidAmount,
      dueAmount: i.dueAmount,
      status: i.status,
    })),
    payments: profile.payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate,
      status: p.status,
      invoice: p.invoice,
    })),
  };
}
