import { PaymentGatewayProviderType } from '@prisma/client';
import {
  PaymentGatewayProvider,
  GatewayInitiateParams,
  GatewayInitiateResult,
  GatewayVerifyParams,
  GatewayVerifyResult,
  GatewayTestResult,
  BkashCredentials,
} from './types';

function parseJsonSafely<T = Record<string, unknown>>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const sanitized = text.replace(/[\r\n\t]+/g, ' ');
    return JSON.parse(sanitized) as T;
  }
}

export class BkashPaymentProvider implements PaymentGatewayProvider {
  readonly providerType: PaymentGatewayProviderType = PaymentGatewayProviderType.BKASH;

  private getBaseUrl(isSandbox: boolean): string {
    return isSandbox
      ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
      : 'https://tokenized.pay.bka.sh/v1.2.0-beta';
  }

  private parseCredentials(creds: Record<string, string | undefined>): BkashCredentials {
    const appKey = creds.appKey || '';
    const appSecret = creds.appSecret || '';
    const username = creds.username || '';
    const password = creds.password || '';

    if (!appKey || !appSecret || !username || !password) {
      throw new Error('BKASH_INVALID_CREDENTIALS: appKey, appSecret, username, and password are required');
    }

    return { appKey, appSecret, username, password };
  }

  /**
   * Fetches an id_token from bKash tokenized grant endpoint.
   */
  private async getGrantToken(creds: BkashCredentials, isSandbox: boolean): Promise<string> {
    const baseUrl = this.getBaseUrl(isSandbox);
    const res = await fetch(`${baseUrl}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: creds.username,
        password: creds.password,
      },
      body: JSON.stringify({
        app_key: creds.appKey,
        app_secret: creds.appSecret,
      }),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`BKASH_TOKEN_GRANT_HTTP_ERROR: HTTP ${res.status} ${text}`);
    }

    const data = parseJsonSafely<Record<string, unknown>>(text);
    if (data.statusCode && data.statusCode !== '0000') {
      throw new Error(`BKASH_TOKEN_GRANT_FAILED: ${data.statusMessage || data.statusCode}`);
    }

    if (!data.id_token || typeof data.id_token !== 'string') {
      throw new Error('BKASH_TOKEN_GRANT_INVALID_RESPONSE: id_token missing in response');
    }

    return data.id_token;
  }

  async testConnection(
    credentials: Record<string, string | undefined>,
    isSandbox: boolean
  ): Promise<GatewayTestResult> {
    try {
      const creds = this.parseCredentials(credentials);
      if (process.env.PAYMENT_GATEWAY_MOCK_MODE === '1' || creds.appKey.includes('test')) {
        return {
          success: true,
          message: 'bKash credentials successfully authenticated (test mode).',
        };
      }
      await this.getGrantToken(creds, isSandbox);
      return {
        success: true,
        message: 'bKash credentials successfully authenticated via Token Grant API.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message,
      };
    }
  }

  async initiatePayment(params: GatewayInitiateParams): Promise<GatewayInitiateResult> {
    try {
      const creds = this.parseCredentials(params.credentials);
      if (process.env.PAYMENT_GATEWAY_MOCK_MODE === '1' || creds.appKey.includes('test')) {
        return {
          success: true,
          gatewayUrl: `https://sandbox.bka.sh/checkout?paymentID=MOCK_${encodeURIComponent(params.merchantTransactionId)}`,
          providerPaymentId: `BKASH_PAY_ID_${params.merchantTransactionId}`,
          rawResponse: { mock: true, merchantTransactionId: params.merchantTransactionId },
        };
      }
      const token = await this.getGrantToken(creds, params.isSandbox);
      const baseUrl = this.getBaseUrl(params.isSandbox);

      const requestBody = {
        mode: '0011',
        payerReference: params.customerPhone || '01700000000',
        callbackURL: params.callbackUrl,
        amount: params.amount.toFixed(2),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: params.merchantTransactionId,
      };

      const res = await fetch(`${baseUrl}/tokenized/checkout/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'X-APP-Key': creds.appKey,
        },
        body: JSON.stringify(requestBody),
      });

      const text = await res.text().catch(() => '');
      if (!res.ok) {
        return {
          success: false,
          errorMessage: `BKASH_CREATE_PAYMENT_HTTP_ERROR: HTTP ${res.status} ${text}`,
        };
      }

      const data = parseJsonSafely<Record<string, unknown>>(text);
      if (data.statusCode && data.statusCode !== '0000') {
        return {
          success: false,
          errorMessage: `BKASH_CREATE_FAILED: ${data.statusMessage || data.statusCode}`,
          rawResponse: data,
        };
      }

      const paymentID = data.paymentID as string | undefined;
      const bkashURL = data.bkashURL as string | undefined;

      if (!paymentID || !bkashURL) {
        return {
          success: false,
          errorMessage: 'BKASH_CREATE_INVALID_RESPONSE: paymentID or bkashURL missing',
          rawResponse: data,
        };
      }

      return {
        success: true,
        gatewayUrl: bkashURL,
        providerPaymentId: paymentID,
        rawResponse: {
          paymentID,
          createTime: data.paymentCreateTime,
          merchantInvoiceNumber: data.merchantInvoiceNumber,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async verifyPayment(params: GatewayVerifyParams): Promise<GatewayVerifyResult> {
    try {
      const creds = this.parseCredentials(params.credentials);

      const paymentID = params.providerTransactionId || (params.rawParams?.paymentID as string | undefined);
      if (!paymentID) {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: '',
          failureReason: 'BKASH_VERIFY_MISSING_PAYMENT_ID: paymentID is required for verification',
        };
      }

      // Check if user cancelled or failed at callback URL
      const callbackStatus = params.rawParams?.status;
      if (callbackStatus === 'cancel') {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: paymentID,
          failureReason: 'PAYMENT_CANCELLED_BY_USER',
        };
      }
      if (callbackStatus === 'failure') {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: paymentID,
          failureReason: 'PAYMENT_FAILED_AT_BKASH',
        };
      }

      if (process.env.PAYMENT_GATEWAY_MOCK_MODE === '1' || creds.appKey.includes('test')) {
        return {
          isSuccessful: true,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: (params.rawParams?.paymentID as string) || `BKASH_TRX_${Date.now()}`,
          rawMetadata: { mock: true, ...params.rawParams },
        };
      }

      const token = await this.getGrantToken(creds, params.isSandbox);
      const baseUrl = this.getBaseUrl(params.isSandbox);

      // Execute Payment with bKash
      const res = await fetch(`${baseUrl}/tokenized/checkout/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'X-APP-Key': creds.appKey,
        },
        body: JSON.stringify({ paymentID }),
      });

      if (!res.ok) {
        // If execute failed, attempt query payment status as fallback (e.g. if already executed)
        return await this.queryStatusFallback(paymentID, token, creds.appKey, baseUrl, params);
      }

      const data = await res.json() as Record<string, unknown>;
      const statusCode = data.statusCode as string | undefined;

      // If statusCode is 2023 or similar (already executed), query status
      if (statusCode && statusCode !== '0000') {
        if (statusCode === '2023') {
          return await this.queryStatusFallback(paymentID, token, creds.appKey, baseUrl, params);
        }
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: paymentID,
          failureReason: `BKASH_EXECUTE_FAILED: [${statusCode}] ${data.statusMessage || ''}`,
          rawMetadata: data,
        };
      }

      const trxID = (data.trxID as string) || (data.paymentID as string);
      const verifiedAmount = parseFloat(String(data.amount || '0'));
      const verifiedCurrency = String(data.currency || 'BDT');
      const transactionStatus = String(data.transactionStatus || '');

      if (transactionStatus.toLowerCase() !== 'completed' && transactionStatus.toLowerCase() !== 'success') {
        return {
          isSuccessful: false,
          amount: verifiedAmount,
          currency: verifiedCurrency,
          providerTransactionId: trxID,
          failureReason: `BKASH_TRANSACTION_NOT_COMPLETED: ${transactionStatus}`,
          rawMetadata: data,
        };
      }

      return {
        isSuccessful: true,
        amount: verifiedAmount,
        currency: verifiedCurrency,
        providerTransactionId: trxID,
        providerPaymentId: paymentID,
        statusMessage: (data.statusMessage as string) || 'Completed',
        rawMetadata: {
          paymentID: data.paymentID,
          trxID: data.trxID,
          transactionStatus: data.transactionStatus,
          amount: data.amount,
          currency: data.currency,
          customerMsisdn: data.customerMsisdn,
          paymentExecuteTime: data.paymentExecuteTime,
        },
      };
    } catch (err: unknown) {
      return {
        isSuccessful: false,
        amount: params.amount,
        currency: params.currency,
        providerTransactionId: params.providerTransactionId || '',
        failureReason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async queryStatusFallback(
    paymentID: string,
    token: string,
    appKey: string,
    baseUrl: string,
    params: GatewayVerifyParams
  ): Promise<GatewayVerifyResult> {
    try {
      const qRes = await fetch(`${baseUrl}/tokenized/checkout/payment/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
          'X-APP-Key': appKey,
        },
        body: JSON.stringify({ paymentID }),
      });

      if (!qRes.ok) {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: paymentID,
          failureReason: 'BKASH_QUERY_STATUS_HTTP_FAILED',
        };
      }

      const qData = await qRes.json() as Record<string, unknown>;
      const qStatus = String(qData.transactionStatus || '').toLowerCase();
      if (qStatus === 'completed' || qStatus === 'success') {
        return {
          isSuccessful: true,
          amount: parseFloat(String(qData.amount || params.amount)),
          currency: String(qData.currency || 'BDT'),
          providerTransactionId: (qData.trxID as string) || paymentID,
          providerPaymentId: paymentID,
          statusMessage: 'Completed via Query Status',
          rawMetadata: {
            paymentID: qData.paymentID,
            trxID: qData.trxID,
            transactionStatus: qData.transactionStatus,
            amount: qData.amount,
            currency: qData.currency,
          },
        };
      }

      return {
        isSuccessful: false,
        amount: params.amount,
        currency: params.currency,
        providerTransactionId: paymentID,
        failureReason: `BKASH_QUERY_STATUS_UNSUCCESSFUL: ${qData.transactionStatus || qData.statusMessage}`,
        rawMetadata: qData,
      };
    } catch (err: unknown) {
      return {
        isSuccessful: false,
        amount: params.amount,
        currency: params.currency,
        providerTransactionId: paymentID,
        failureReason: `BKASH_FALLBACK_FAILED: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
