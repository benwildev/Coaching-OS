import prisma from '@/lib/db';
import {
  PaymentGatewayProviderType,
  PaymentMethod,
  GatewayTransactionStatus,
  ManualPaymentStatus,
  Prisma,
} from '@prisma/client';
import { encryptCredentials, decryptCredentials } from './crypto.service';
import { recordAuditLog } from './audit.service';
import { getPaymentProvider } from '../gateways';
import { createPayment } from './payment.service';
import { randomBytes } from 'node:crypto';

export interface PublicGatewayConfig {
  provider: PaymentGatewayProviderType;
  isEnabled: boolean;
  isSandbox: boolean;
  isConfigured: boolean;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  updatedAt: Date | null;
}

export interface UpsertGatewayConfigInput {
  provider: PaymentGatewayProviderType;
  isEnabled?: boolean;
  isSandbox?: boolean;
  credentials?: Record<string, string | undefined>;
}

export interface UpsertManualInstructionInput {
  paymentMethod: PaymentMethod;
  accountType?: string;
  accountNumber?: string;
  bankName?: string;
  branchName?: string;
  routingNumber?: string;
  accountTitle?: string;
  instructions?: string;
  instructionsBn?: string;
  isEnabled?: boolean;
  displayOrder?: number;
}

/**
 * Returns sanitized gateway configs for the coaching center.
 * NEVER returns secrets or ciphertext.
 */
export async function getGatewayConfigs(coachingCenterId: string): Promise<PublicGatewayConfig[]> {
  const configs = await prisma.paymentGatewayConfig.findMany({
    where: { coachingCenterId },
  });

  const supported = [PaymentGatewayProviderType.BKASH, PaymentGatewayProviderType.SSLCOMMERZ];

  return supported.map((provider) => {
    const existing = configs.find((c) => c.provider === provider);
    if (!existing) {
      return {
        provider,
        isEnabled: false,
        isSandbox: true,
        isConfigured: false,
        lastTestedAt: null,
        lastTestStatus: null,
        lastTestError: null,
        updatedAt: null,
      };
    }
    return {
      provider: existing.provider,
      isEnabled: existing.isEnabled,
      isSandbox: existing.isSandbox,
      isConfigured: Boolean(existing.credentialsEncrypted),
      lastTestedAt: existing.lastTestedAt,
      lastTestStatus: existing.lastTestStatus,
      lastTestError: existing.lastTestError,
      updatedAt: existing.updatedAt,
    };
  });
}

/**
 * Configure / update payment gateway credentials and environment.
 * Secrets are encrypted at rest using CREDENTIALS_ENCRYPTION_KEY.
 */
export async function upsertGatewayConfig(
  coachingCenterId: string,
  input: UpsertGatewayConfigInput,
  actorId?: string
): Promise<PublicGatewayConfig> {
  const existing = await prisma.paymentGatewayConfig.findUnique({
    where: { coachingCenterId_provider: { coachingCenterId, provider: input.provider } },
  });

  let credentialsEncrypted: string | undefined;
  if (input.credentials && Object.keys(input.credentials).length > 0) {
    credentialsEncrypted = encryptCredentials(input.credentials);
  } else if (existing) {
    credentialsEncrypted = existing.credentialsEncrypted;
  } else {
    throw new Error('GATEWAY_CREDENTIALS_REQUIRED: Credentials are required to configure this gateway');
  }

  const isEnabled = input.isEnabled !== undefined ? input.isEnabled : existing?.isEnabled ?? false;
  const isSandbox = input.isSandbox !== undefined ? input.isSandbox : existing?.isSandbox ?? true;

  const saved = await prisma.paymentGatewayConfig.upsert({
    where: { coachingCenterId_provider: { coachingCenterId, provider: input.provider } },
    create: {
      coachingCenterId,
      provider: input.provider,
      isEnabled,
      isSandbox,
      credentialsEncrypted,
      updatedById: actorId,
    },
    update: {
      isEnabled,
      isSandbox,
      credentialsEncrypted,
      updatedById: actorId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: existing ? 'GATEWAY_CONFIG_UPDATED' : 'GATEWAY_CONFIG_CREATED',
    entity: 'PaymentGatewayConfig',
    entityId: saved.id,
    details: {
      provider: input.provider,
      isEnabled,
      isSandbox,
      // NOTE: Never log secrets!
    },
  });

  return {
    provider: saved.provider,
    isEnabled: saved.isEnabled,
    isSandbox: saved.isSandbox,
    isConfigured: true,
    lastTestedAt: saved.lastTestedAt,
    lastTestStatus: saved.lastTestStatus,
    lastTestError: saved.lastTestError,
    updatedAt: saved.updatedAt,
  };
}

/**
 * Tests connection with the provider using configured encrypted credentials.
 */
export async function testGatewayConfig(
  coachingCenterId: string,
  providerType: PaymentGatewayProviderType,
  actorId?: string
): Promise<{ success: boolean; message: string }> {
  const config = await prisma.paymentGatewayConfig.findUnique({
    where: { coachingCenterId_provider: { coachingCenterId, provider: providerType } },
  });

  if (!config || !config.credentialsEncrypted) {
    throw new Error('GATEWAY_NOT_CONFIGURED: Gateway has not been configured with credentials');
  }

  const creds = decryptCredentials(config.credentialsEncrypted);
  const provider = getPaymentProvider(providerType);
  const testRes = await provider.testConnection(creds, config.isSandbox);

  await prisma.paymentGatewayConfig.update({
    where: { id: config.id },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: testRes.success ? 'SUCCESS' : 'FAILED',
      lastTestError: testRes.success ? null : testRes.message,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'GATEWAY_TESTED',
    entity: 'PaymentGatewayConfig',
    entityId: config.id,
    details: {
      provider: providerType,
      success: testRes.success,
      message: testRes.message,
    },
  });

  return testRes;
}

/**
 * Enables or disables a payment gateway for student/guardian checkout.
 */
export async function toggleGatewayConfig(
  coachingCenterId: string,
  providerType: PaymentGatewayProviderType,
  isEnabled: boolean,
  actorId?: string
): Promise<PublicGatewayConfig> {
  const existing = await prisma.paymentGatewayConfig.findUnique({
    where: { coachingCenterId_provider: { coachingCenterId, provider: providerType } },
  });

  if (!existing || !existing.credentialsEncrypted) {
    throw new Error('GATEWAY_NOT_CONFIGURED: Cannot enable an unconfigured payment gateway');
  }

  const updated = await prisma.paymentGatewayConfig.update({
    where: { id: existing.id },
    data: { isEnabled, updatedById: actorId },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: isEnabled ? 'GATEWAY_ENABLED' : 'GATEWAY_DISABLED',
    entity: 'PaymentGatewayConfig',
    entityId: updated.id,
    details: { provider: providerType, isEnabled },
  });

  return {
    provider: updated.provider,
    isEnabled: updated.isEnabled,
    isSandbox: updated.isSandbox,
    isConfigured: true,
    lastTestedAt: updated.lastTestedAt,
    lastTestStatus: updated.lastTestStatus,
    lastTestError: updated.lastTestError,
    updatedAt: updated.updatedAt,
  };
}

/**
 * List configured manual payment instructions for a coaching center.
 */
export async function getManualPaymentInstructions(coachingCenterId: string, onlyEnabled = false) {
  return await prisma.manualPaymentInstruction.findMany({
    where: {
      coachingCenterId,
      ...(onlyEnabled ? { isEnabled: true } : {}),
    },
    orderBy: { displayOrder: 'asc' },
  });
}

/**
 * Create or update manual payment instructions.
 */
export async function upsertManualPaymentInstruction(
  coachingCenterId: string,
  input: UpsertManualInstructionInput,
  actorId?: string
) {
  const record = await prisma.manualPaymentInstruction.upsert({
    where: {
      coachingCenterId_paymentMethod: {
        coachingCenterId,
        paymentMethod: input.paymentMethod,
      },
    },
    create: {
      coachingCenterId,
      paymentMethod: input.paymentMethod,
      accountType: input.accountType?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      bankName: input.bankName?.trim() || null,
      branchName: input.branchName?.trim() || null,
      routingNumber: input.routingNumber?.trim() || null,
      accountTitle: input.accountTitle?.trim() || null,
      instructions: input.instructions?.trim() || null,
      instructionsBn: input.instructionsBn?.trim() || null,
      isEnabled: input.isEnabled !== undefined ? input.isEnabled : true,
      displayOrder: input.displayOrder ?? 0,
      updatedById: actorId,
    },
    update: {
      accountType: input.accountType?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      bankName: input.bankName?.trim() || null,
      branchName: input.branchName?.trim() || null,
      routingNumber: input.routingNumber?.trim() || null,
      accountTitle: input.accountTitle?.trim() || null,
      instructions: input.instructions?.trim() || null,
      instructionsBn: input.instructionsBn?.trim() || null,
      isEnabled: input.isEnabled !== undefined ? input.isEnabled : true,
      displayOrder: input.displayOrder !== undefined ? input.displayOrder : undefined,
      updatedById: actorId,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    action: 'MANUAL_PAYMENT_INSTRUCTION_UPDATED',
    entity: 'ManualPaymentInstruction',
    entityId: record.id,
    details: { paymentMethod: input.paymentMethod, isEnabled: record.isEnabled },
  });

  return record;
}

/**
 * Dynamically determines portal payment options (online gateways + manual instructions)
 * strictly based on active tenant configuration.
 */
export async function getPortalPaymentOptions(coachingCenterId: string, invoiceId?: string) {
  // 1. Online gateways: only return enabled ones
  const activeGateways = await prisma.paymentGatewayConfig.findMany({
    where: { coachingCenterId, isEnabled: true },
  });

  const availableOnlineGateways = activeGateways.map((g) => ({
    provider: g.provider,
    name: g.provider === PaymentGatewayProviderType.BKASH ? 'bKash' : 'SSLCommerz',
    isSandbox: g.isSandbox,
  }));

  // 2. Manual payment instructions: always available fallback
  const manualInstructions = await getManualPaymentInstructions(coachingCenterId, true);

  let invoiceSummary: {
    invoiceId: string;
    invoiceNumber: string;
    dueAmount: number;
    totalAmount: number;
    status: string;
  } | undefined;

  if (invoiceId) {
    const inv = await prisma.feeInvoice.findFirst({
      where: { id: invoiceId, coachingCenterId },
    });
    if (inv) {
      invoiceSummary = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        dueAmount: Number(inv.dueAmount),
        totalAmount: Number(inv.totalAmount),
        status: inv.status,
      };
    }
  }

  return {
    availableOnlineGateways,
    manualInstructions,
    invoiceSummary,
  };
}

/**
 * Initiates an online gateway payment for an invoice.
 * Server recalculates authoritative due amount — NEVER trusts amount from frontend.
 */
export async function initiateOnlinePayment(params: {
  coachingCenterId: string;
  invoiceId: string;
  studentId: string;
  providerType: PaymentGatewayProviderType;
  callbackBaseUrl: string;
  ipnBaseUrl?: string;
  customerPhone?: string;
  customerEmail?: string;
  actorId?: string;
}) {
  const { coachingCenterId, invoiceId, studentId, providerType, callbackBaseUrl, ipnBaseUrl } = params;

  // 1. Validate invoice ownership and status
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId, coachingCenterId, studentId },
    include: { student: true },
  });

  if (!invoice) {
    throw new Error('INVOICE_NOT_FOUND: Invoice does not exist or does not belong to this student/center');
  }

  if (invoice.status === 'PAID') {
    throw new Error('INVOICE_ALREADY_PAID: This invoice has already been fully paid');
  }

  if (invoice.status === 'CANCELLED') {
    throw new Error('INVOICE_CANCELLED: Cancelled invoices cannot be paid');
  }

  const authoritativeDue = Number(invoice.dueAmount);
  if (authoritativeDue <= 0) {
    throw new Error('INVOICE_NOT_PAYABLE: Outstanding due amount must be greater than zero');
  }

  // 2. Check active provider config
  const config = await prisma.paymentGatewayConfig.findUnique({
    where: { coachingCenterId_provider: { coachingCenterId, provider: providerType } },
  });

  if (!config || !config.isEnabled || !config.credentialsEncrypted) {
    throw new Error(`GATEWAY_NOT_AVAILABLE: ${providerType} is not configured or enabled for this coaching center`);
  }

  const creds = decryptCredentials(config.credentialsEncrypted);
  const provider = getPaymentProvider(providerType);

  // 3. Mint unique internal transaction reference
  const randomSuffix = randomBytes(4).toString('hex');
  const merchantTransactionId = `TXN-${Date.now()}-${randomSuffix}`;

  // 4. Create PaymentGatewayTransaction record with status INITIATED
  const transaction = await prisma.paymentGatewayTransaction.create({
    data: {
      coachingCenterId,
      branchId: invoice.branchId,
      invoiceId,
      studentId,
      provider: providerType,
      merchantTransactionId,
      amount: authoritativeDue,
      currency: 'BDT',
      status: GatewayTransactionStatus.INITIATED,
    },
  });

  // Construct callback URLs
  const callbackUrl = `${callbackBaseUrl}/api/payments/gateways/${providerType.toLowerCase()}/callback?merchantTxId=${encodeURIComponent(
    merchantTransactionId
  )}&centerId=${encodeURIComponent(coachingCenterId)}`;

  const ipnUrl = ipnBaseUrl
    ? `${ipnBaseUrl}/api/payments/gateways/${providerType.toLowerCase()}/ipn?merchantTxId=${encodeURIComponent(
        merchantTransactionId
      )}&centerId=${encodeURIComponent(coachingCenterId)}`
    : undefined;

  // 5. Invoke provider initiation
  const initiateResult = await provider.initiatePayment({
    merchantTransactionId,
    amount: authoritativeDue,
    currency: 'BDT',
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    studentId,
    customerName: invoice.student.name,
    customerPhone: params.customerPhone || invoice.student.phone || '01700000000',
    customerEmail: params.customerEmail || invoice.student.email || undefined,
    callbackUrl,
    ipnUrl,
    isSandbox: config.isSandbox,
    credentials: creds,
  });

  if (!initiateResult.success || !initiateResult.gatewayUrl) {
    await prisma.paymentGatewayTransaction.update({
      where: { id: transaction.id },
      data: {
        status: GatewayTransactionStatus.FAILED,
        failureReason: initiateResult.errorMessage || 'Gateway initiation failed',
      },
    });

    await recordAuditLog({
      coachingCenterId,
      userId: params.actorId,
      studentId,
      action: 'ONLINE_PAYMENT_FAILED',
      entity: 'PaymentGatewayTransaction',
      entityId: transaction.id,
      details: {
        provider: providerType,
        merchantTransactionId,
        error: initiateResult.errorMessage,
      },
    });

    throw new Error(`GATEWAY_INITIATION_FAILED: ${initiateResult.errorMessage || 'Unable to connect to gateway'}`);
  }

  // Update transaction with providerPaymentId and status PENDING
  await prisma.paymentGatewayTransaction.update({
    where: { id: transaction.id },
    data: {
      status: GatewayTransactionStatus.PENDING,
      providerTransactionId: initiateResult.providerPaymentId || null,
      metadata: initiateResult.rawResponse as Prisma.InputJsonValue | undefined,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: params.actorId,
    studentId,
    action: 'ONLINE_PAYMENT_INITIATED',
    entity: 'PaymentGatewayTransaction',
    entityId: transaction.id,
    details: {
      provider: providerType,
      merchantTransactionId,
      amount: authoritativeDue,
      invoiceId,
    },
  });

  return {
    success: true,
    gatewayUrl: initiateResult.gatewayUrl,
    merchantTransactionId,
  };
}

/**
 * Server-side verification and idempotent completion of an online gateway payment.
 * NEVER trusts client-side redirects or amounts alone.
 */
export async function verifyAndCompletePayment(params: {
  coachingCenterId: string;
  providerType: PaymentGatewayProviderType;
  merchantTransactionId: string;
  rawParams?: Record<string, string | undefined>;
}) {
  const { coachingCenterId, providerType, merchantTransactionId, rawParams } = params;

  // 1. Fetch internal transaction
  const tx = await prisma.paymentGatewayTransaction.findUnique({
    where: {
      coachingCenterId_merchantTransactionId: {
        coachingCenterId,
        merchantTransactionId,
      },
    },
    include: {
      invoice: true,
      student: true,
      payment: true,
    },
  });

  if (!tx) {
    throw new Error('TRANSACTION_NOT_FOUND: Gateway transaction reference is invalid or belongs to another tenant');
  }

  // Idempotency: If already SUCCESS and has paymentId, return existing payment
  if (tx.status === GatewayTransactionStatus.SUCCESS && tx.paymentId) {
    return {
      status: 'SUCCESS' as const,
      isAlreadyProcessed: true,
      paymentId: tx.paymentId,
      receiptNumber: tx.payment?.receiptNumber || '',
      amount: Number(tx.amount),
    };
  }

  // 2. Fetch gateway credentials
  const config = await prisma.paymentGatewayConfig.findUnique({
    where: { coachingCenterId_provider: { coachingCenterId, provider: providerType } },
  });

  if (!config || !config.credentialsEncrypted) {
    throw new Error('GATEWAY_CONFIG_MISSING: Gateway configuration missing during verification');
  }

  const creds = decryptCredentials(config.credentialsEncrypted);
  const provider = getPaymentProvider(providerType);

  // 3. Provider server-to-server verification
  const verifyResult = await provider.verifyPayment({
    merchantTransactionId,
    providerTransactionId: tx.providerTransactionId || undefined,
    amount: Number(tx.amount),
    currency: tx.currency,
    credentials: creds,
    isSandbox: config.isSandbox,
    rawParams,
  });

  // Handle failure/cancellation
  if (!verifyResult.isSuccessful) {
    const isCancelled = verifyResult.failureReason === 'PAYMENT_CANCELLED_BY_USER';
    const finalStatus = isCancelled ? GatewayTransactionStatus.CANCELLED : GatewayTransactionStatus.FAILED;

    await prisma.paymentGatewayTransaction.update({
      where: { id: tx.id },
      data: {
        status: finalStatus,
        failureReason: verifyResult.failureReason || 'Verification failed',
        metadata: verifyResult.rawMetadata as Prisma.InputJsonValue | undefined,
      },
    });

    await recordAuditLog({
      coachingCenterId,
      studentId: tx.studentId,
      action: isCancelled ? 'ONLINE_PAYMENT_CANCELLED' : 'ONLINE_PAYMENT_FAILED',
      entity: 'PaymentGatewayTransaction',
      entityId: tx.id,
      details: {
        provider: providerType,
        merchantTransactionId,
        failureReason: verifyResult.failureReason,
      },
    });

    return {
      status: finalStatus,
      isAlreadyProcessed: false,
      failureReason: verifyResult.failureReason || 'Payment failed',
      amount: Number(tx.amount),
    };
  }

  // 4. Validate verified amount against transaction amount
  if (Math.abs(verifyResult.amount - Number(tx.amount)) > 0.01) {
    await prisma.paymentGatewayTransaction.update({
      where: { id: tx.id },
      data: {
        status: GatewayTransactionStatus.FAILED,
        failureReason: `AMOUNT_TAMPERING_DETECTED: Expected ${tx.amount}, verified ${verifyResult.amount}`,
      },
    });

    await recordAuditLog({
      coachingCenterId,
      studentId: tx.studentId,
      action: 'ONLINE_PAYMENT_FAILED',
      entity: 'PaymentGatewayTransaction',
      entityId: tx.id,
      details: {
        provider: providerType,
        merchantTransactionId,
        failureReason: `AMOUNT_TAMPERING_DETECTED: Expected ${tx.amount}, verified ${verifyResult.amount}`,
      },
    });

    return {
      status: GatewayTransactionStatus.FAILED,
      isAlreadyProcessed: false,
      failureReason: `AMOUNT_TAMPERING_DETECTED: Expected ${tx.amount}, verified ${verifyResult.amount}`,
      amount: Number(tx.amount),
    };
  }

  // 5. Create Payment using existing financial engine
  const paymentMethod: PaymentMethod =
    providerType === PaymentGatewayProviderType.BKASH ? PaymentMethod.BKASH : PaymentMethod.CARD;

  const paymentResult = await createPayment(coachingCenterId, tx.invoiceId, {
    amount: verifyResult.amount,
    paymentMethod,
    transactionId: verifyResult.providerTransactionId || tx.merchantTransactionId,
    referenceNumber: tx.merchantTransactionId,
    notes: `Online Gateway Payment via ${providerType} (${config.isSandbox ? 'Sandbox' : 'Production'})`,
    idempotencyKey: tx.merchantTransactionId, // Idempotency protection backed by unique index!
  });

  // 6. Link created Payment to GatewayTransaction and mark SUCCESS
  await prisma.paymentGatewayTransaction.update({
    where: { id: tx.id },
    data: {
      status: GatewayTransactionStatus.SUCCESS,
      providerTransactionId: verifyResult.providerTransactionId,
      completedAt: new Date(),
      paymentId: paymentResult.payment.id,
      metadata: verifyResult.rawMetadata as Prisma.InputJsonValue | undefined,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    studentId: tx.studentId,
    action: 'ONLINE_PAYMENT_VERIFIED',
    entity: 'PaymentGatewayTransaction',
    entityId: tx.id,
    details: {
      provider: providerType,
      merchantTransactionId,
      providerTransactionId: verifyResult.providerTransactionId,
      paymentId: paymentResult.payment.id,
      amount: verifyResult.amount,
    },
  });

  return {
    status: 'SUCCESS' as const,
    isAlreadyProcessed: false,
    paymentId: paymentResult.payment.id,
    receiptNumber: paymentResult.payment.receiptNumber,
    amount: verifyResult.amount,
  };
}

/**
 * Submit a student/guardian manual payment reference for administrative review.
 * Does NOT create a Payment record until approved by Admin/Staff.
 */
export async function submitManualPayment(params: {
  coachingCenterId: string;
  invoiceId: string;
  studentId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  transactionId?: string;
  referenceNumber?: string;
  senderMobile?: string;
  bankName?: string;
  studentNote?: string;
}) {
  const { coachingCenterId, invoiceId, studentId, paymentMethod, amount } = params;

  // Validate invoice
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id: invoiceId, coachingCenterId, studentId },
  });

  if (!invoice) {
    throw new Error('INVOICE_NOT_FOUND: Invoice does not belong to this student or coaching center');
  }

  if (invoice.status === 'PAID') {
    throw new Error('INVOICE_ALREADY_PAID: Invoice is already fully paid');
  }

  if (amount <= 0) {
    throw new Error('INVALID_AMOUNT: Payment amount must be greater than zero');
  }

  if (amount > Number(invoice.dueAmount)) {
    throw new Error('AMOUNT_EXCEEDS_DUE: Submitted amount exceeds current invoice due amount');
  }

  const submission = await prisma.manualPaymentSubmission.create({
    data: {
      coachingCenterId,
      branchId: invoice.branchId,
      invoiceId,
      studentId,
      paymentMethod,
      amount,
      transactionId: params.transactionId?.trim() || null,
      referenceNumber: params.referenceNumber?.trim() || null,
      senderMobile: params.senderMobile?.trim() || null,
      bankName: params.bankName?.trim() || null,
      studentNote: params.studentNote?.trim() || null,
      status: ManualPaymentStatus.PENDING_REVIEW,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    studentId,
    action: 'MANUAL_PAYMENT_SUBMITTED',
    entity: 'ManualPaymentSubmission',
    entityId: submission.id,
    details: {
      invoiceId,
      amount,
      paymentMethod,
      transactionId: params.transactionId,
    },
  });

  return submission;
}

/**
 * Get manual payment submissions for administrative review queue.
 */
export async function getManualSubmissions(
  coachingCenterId: string,
  options?: {
    status?: ManualPaymentStatus;
    branchId?: string;
    studentId?: string;
  }
) {
  return await prisma.manualPaymentSubmission.findMany({
    where: {
      coachingCenterId,
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.branchId ? { branchId: options.branchId } : {}),
      ...(options?.studentId ? { studentId: options.studentId } : {}),
    },
    include: {
      invoice: true,
      student: true,
      reviewedBy: { select: { id: true, name: true, email: true } },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Admin/Staff review of student manual payment submission.
 * APPROVE: Creates normal Payment via existing financial engine.
 * REJECT: Records rejection with reason, no financial ledger update.
 */
export async function reviewManualSubmission(params: {
  coachingCenterId: string;
  submissionId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
  actorId: string;
}) {
  const { coachingCenterId, submissionId, action, rejectionReason, actorId } = params;

  const submission = await prisma.manualPaymentSubmission.findFirst({
    where: { id: submissionId, coachingCenterId },
    include: { invoice: true },
  });

  if (!submission) {
    throw new Error('SUBMISSION_NOT_FOUND: Submission not found for this coaching center');
  }

  if (submission.status !== ManualPaymentStatus.PENDING_REVIEW) {
    throw new Error(`ALREADY_REVIEWED: Submission has already been ${submission.status.toLowerCase()}`);
  }

  if (action === 'REJECT') {
    const updated = await prisma.manualPaymentSubmission.update({
      where: { id: submission.id },
      data: {
        status: ManualPaymentStatus.REJECTED,
        rejectionReason: rejectionReason?.trim() || 'Rejected by staff',
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog({
      coachingCenterId,
      userId: actorId,
      studentId: submission.studentId,
      action: 'MANUAL_PAYMENT_REJECTED',
      entity: 'ManualPaymentSubmission',
      entityId: submission.id,
      details: { rejectionReason },
    });

    return { success: true, status: ManualPaymentStatus.REJECTED, submission: updated };
  }

  // APPROVE: Create Payment using existing financial engine
  const paymentResult = await createPayment(
    coachingCenterId,
    submission.invoiceId,
    {
      amount: Number(submission.amount),
      paymentMethod: submission.paymentMethod,
      transactionId: submission.transactionId || undefined,
      referenceNumber: submission.referenceNumber || undefined,
      senderMobile: submission.senderMobile || undefined,
      bankName: submission.bankName || undefined,
      notes: `Manual portal submission approved by staff (${submission.studentNote || 'No student note'})`,
      idempotencyKey: `MANUAL-${submission.id}`,
    },
    actorId
  );

  const updated = await prisma.manualPaymentSubmission.update({
    where: { id: submission.id },
    data: {
      status: ManualPaymentStatus.APPROVED,
      reviewedById: actorId,
      reviewedAt: new Date(),
      paymentId: paymentResult.payment.id,
    },
  });

  await recordAuditLog({
    coachingCenterId,
    userId: actorId,
    studentId: submission.studentId,
    action: 'MANUAL_PAYMENT_APPROVED',
    entity: 'ManualPaymentSubmission',
    entityId: submission.id,
    details: {
      paymentId: paymentResult.payment.id,
      receiptNumber: paymentResult.payment.receiptNumber,
      amount: Number(submission.amount),
    },
  });

  return {
    success: true,
    status: ManualPaymentStatus.APPROVED,
    submission: updated,
    payment: paymentResult.payment,
  };
}
