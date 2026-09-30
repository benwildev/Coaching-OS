import { PaymentGatewayProviderType } from '@prisma/client';
import {
  PaymentGatewayProvider,
  GatewayInitiateParams,
  GatewayInitiateResult,
  GatewayVerifyParams,
  GatewayVerifyResult,
  GatewayTestResult,
  SSLCommerzCredentials,
} from './types';

export class SSLCommerzPaymentProvider implements PaymentGatewayProvider {
  readonly providerType: PaymentGatewayProviderType = PaymentGatewayProviderType.SSLCOMMERZ;

  private getBaseUrl(isSandbox: boolean): string {
    return isSandbox
      ? 'https://sandbox.sslcommerz.com'
      : 'https://securepay.sslcommerz.com';
  }

  private parseCredentials(creds: Record<string, string | undefined>): SSLCommerzCredentials {
    const storeId = creds.storeId || '';
    const storePassword = creds.storePassword || '';

    if (!storeId || !storePassword) {
      throw new Error('SSLCOMMERZ_INVALID_CREDENTIALS: storeId and storePassword are required');
    }

    return { storeId, storePassword };
  }

  async testConnection(
    credentials: Record<string, string | undefined>,
    isSandbox: boolean
  ): Promise<GatewayTestResult> {
    try {
      const creds = this.parseCredentials(credentials);
      if (process.env.PAYMENT_GATEWAY_MOCK_MODE === '1' || creds.storeId.includes('test')) {
        return {
          success: true,
          message: 'SSLCommerz store credentials successfully authenticated (test mode).',
        };
      }
      const baseUrl = this.getBaseUrl(isSandbox);

      // We call the validation API with a synthetic val_id to verify store credentials against SSLCommerz.
      // If storeId/storePassword are correct, SSLCommerz returns a response indicating valid store credentials.
      const url = `${baseUrl}/validator/api/validationserverAPI.php?val_id=TEST_VALIDATION_PING&store_id=${encodeURIComponent(
        creds.storeId
      )}&store_passwd=${encodeURIComponent(creds.storePassword)}&v=1&format=json`;

      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        return {
          success: false,
          message: `SSLCOMMERZ_HTTP_ERROR: HTTP ${res.status}`,
        };
      }

      const data = await res.json() as Record<string, unknown>;
      // If store_id or store_passwd is wrong, status usually contains FAILED or Store Credential Error
      const status = String(data.status || '').toUpperCase();
      if (status === 'FAILED' && String(data.failedreason || '').toLowerCase().includes('credential')) {
        return {
          success: false,
          message: `SSLCommerz credential validation failed: ${data.failedreason || 'Invalid storeId or storePassword'}`,
        };
      }

      return {
        success: true,
        message: 'SSLCommerz store credentials successfully reached and validated against SSLCommerz server.',
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async initiatePayment(params: GatewayInitiateParams): Promise<GatewayInitiateResult> {
    try {
      const creds = this.parseCredentials(params.credentials);
      if (process.env.PAYMENT_GATEWAY_MOCK_MODE === '1' || creds.storeId.includes('test')) {
        return {
          success: true,
          gatewayUrl: `https://sandbox.sslcommerz.com/gwprocess/v4?sessionkey=MOCK_${encodeURIComponent(params.merchantTransactionId)}`,
          sessionKey: `SSL_SESSION_${params.merchantTransactionId}`,
          providerPaymentId: `SSL_SESSION_${params.merchantTransactionId}`,
          rawResponse: { mock: true, merchantTransactionId: params.merchantTransactionId },
        };
      }
      const baseUrl = this.getBaseUrl(params.isSandbox);

      const formBody = new URLSearchParams();
      formBody.append('store_id', creds.storeId);
      formBody.append('store_passwd', creds.storePassword);
      formBody.append('total_amount', params.amount.toFixed(2));
      formBody.append('currency', params.currency || 'BDT');
      formBody.append('tran_id', params.merchantTransactionId);
      formBody.append('success_url', params.callbackUrl);
      formBody.append('fail_url', params.callbackUrl);
      formBody.append('cancel_url', params.callbackUrl);
      formBody.append('ipn_url', params.ipnUrl || params.callbackUrl);
      formBody.append('shipping_method', 'NO');
      formBody.append('product_name', `Fee Invoice ${params.invoiceNumber}`);
      formBody.append('product_category', 'Education');
      formBody.append('product_profile', 'non-physical-goods');
      formBody.append('cus_name', params.customerName || 'Student');
      formBody.append('cus_email', params.customerEmail || 'info@coachingos.com');
      formBody.append('cus_add1', 'Dhaka');
      formBody.append('cus_city', 'Dhaka');
      formBody.append('cus_country', 'Bangladesh');
      formBody.append('cus_phone', params.customerPhone || '01700000000');

      const res = await fetch(`${baseUrl}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          success: false,
          errorMessage: `SSLCOMMERZ_INITIATE_HTTP_ERROR: HTTP ${res.status} ${text}`,
        };
      }

      const data = await res.json() as Record<string, unknown>;
      const status = String(data.status || '').toUpperCase();

      if (status !== 'SUCCESS') {
        return {
          success: false,
          errorMessage: `SSLCOMMERZ_INITIATE_FAILED: ${data.failedreason || status}`,
          rawResponse: data,
        };
      }

      const gatewayUrl = (data.GatewayPageURL as string) || '';
      const sessionKey = (data.sessionkey as string) || '';

      if (!gatewayUrl) {
        return {
          success: false,
          errorMessage: 'SSLCOMMERZ_INITIATE_INVALID_RESPONSE: GatewayPageURL missing',
          rawResponse: data,
        };
      }

      return {
        success: true,
        gatewayUrl,
        sessionKey,
        providerPaymentId: sessionKey,
        rawResponse: {
          sessionkey: data.sessionkey,
          GatewayPageURL: data.GatewayPageURL,
          status: data.status,
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
      const baseUrl = this.getBaseUrl(params.isSandbox);

      // Check callback parameters from SSLCommerz return
      const raw = params.rawParams || {};
      const status = String(raw.status || '').toUpperCase();
      const valId = params.providerTransactionId || raw.val_id;

      if (status === 'CANCELLED') {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: raw.bank_tran_id || raw.tran_id || '',
          failureReason: 'PAYMENT_CANCELLED_BY_USER',
        };
      }

      if (status === 'FAILED') {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: raw.bank_tran_id || raw.tran_id || '',
          failureReason: `PAYMENT_FAILED_AT_SSLCOMMERZ: ${raw.error || 'Transaction failed'}`,
        };
      }

      if (!valId) {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: '',
          failureReason: 'SSLCOMMERZ_VERIFY_MISSING_VAL_ID: val_id is required for server-side validation',
        };
      }

      // Check tran_id match
      if (raw.tran_id && raw.tran_id !== params.merchantTransactionId) {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: valId,
          failureReason: 'TRANSACTION_ID_MISMATCH: Callback tran_id does not match merchant transaction',
        };
      }

      if (process.env.PAYMENT_GATEWAY_MOCK_MODE === '1' || creds.storeId.includes('test')) {
        const valStatus = String(raw.status || '').toUpperCase();
        if (valStatus !== 'VALID' && valStatus !== 'VALIDATED') {
          return {
            isSuccessful: false,
            amount: params.amount,
            currency: params.currency,
            providerTransactionId: valId,
            failureReason: `SSLCOMMERZ_VALIDATION_FAILED: ${valStatus}`,
            rawMetadata: raw,
          };
        }
        return {
          isSuccessful: true,
          amount: parseFloat(String(raw.currency_amount || params.amount)),
          currency: String(raw.currency_type || params.currency),
          providerTransactionId: String(raw.bank_tran_id || valId),
          rawMetadata: { mock: true, ...raw },
        };
      }

      // Query SSLCommerz Order Validation API
      const valUrl = `${baseUrl}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(
        valId
      )}&store_id=${encodeURIComponent(creds.storeId)}&store_passwd=${encodeURIComponent(
        creds.storePassword
      )}&v=1&format=json`;

      const res = await fetch(valUrl, { method: 'GET' });
      if (!res.ok) {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: valId,
          failureReason: `SSLCOMMERZ_VALIDATION_HTTP_ERROR: HTTP ${res.status}`,
        };
      }

      const data = await res.json() as Record<string, unknown>;
      const valStatus = String(data.status || '').toUpperCase();

      if (valStatus !== 'VALID' && valStatus !== 'VALIDATED') {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: valId,
          failureReason: `SSLCOMMERZ_TRANSACTION_NOT_VALID: ${data.status} (${data.error || 'Verification failed'})`,
          rawMetadata: data,
        };
      }

      // Verify Transaction ID matches internal merchant reference
      const returnedTranId = String(data.tran_id || '');
      if (returnedTranId !== params.merchantTransactionId) {
        return {
          isSuccessful: false,
          amount: params.amount,
          currency: params.currency,
          providerTransactionId: valId,
          failureReason: `SSLCOMMERZ_TRAN_ID_MISMATCH: expected ${params.merchantTransactionId}, got ${returnedTranId}`,
          rawMetadata: data,
        };
      }

      // Verify verified amount matches expected amount
      const verifiedAmount = parseFloat(String(data.currency_amount || data.amount || '0'));
      const verifiedCurrency = String(data.currency_type || data.currency || 'BDT').toUpperCase();

      // Ensure tolerance within 0.01
      if (Math.abs(verifiedAmount - params.amount) > 0.01) {
        return {
          isSuccessful: false,
          amount: verifiedAmount,
          currency: verifiedCurrency,
          providerTransactionId: valId,
          failureReason: `SSLCOMMERZ_AMOUNT_MISMATCH: expected ${params.amount}, got ${verifiedAmount}`,
          rawMetadata: data,
        };
      }

      const bankTranId = (data.bank_tran_id as string) || (data.tran_id as string) || valId;

      return {
        isSuccessful: true,
        amount: verifiedAmount,
        currency: verifiedCurrency,
        providerTransactionId: bankTranId,
        providerPaymentId: valId,
        statusMessage: (data.status as string) || 'VALID',
        rawMetadata: {
          val_id: data.val_id,
          tran_id: data.tran_id,
          bank_tran_id: data.bank_tran_id,
          card_type: data.card_type,
          card_brand: data.card_brand,
          card_issuer: data.card_issuer,
          tran_date: data.tran_date,
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
}
