import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// Plan configuration
export const PLANS = {
  daily: {
    name: 'Daily',
    amount: 99, // INR
    duration: 1, // days
  },
  weekly: {
    name: 'Weekly',
    amount: 499, // INR
    duration: 7, // days
  },
};

// PhonePe API endpoints
const getPhonePeBaseUrl = () => {
  return env.phonepe.env === 'PROD'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
};

/**
 * Generate a unique merchant transaction ID
 */
export const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `GREEN_CANDLE_${timestamp}_${random}`;
};

/**
 * Create SHA256 hash for PhonePe signature
 */
const createChecksum = (payload, endpoint) => {
  const string = payload + endpoint + env.phonepe.saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return `${sha256}###${env.phonepe.saltIndex}`;
};

/**
 * Initiate PhonePe payment
 * @param {Object} params - Payment parameters
 * @param {string} params.transactionId - Merchant transaction ID
 * @param {number} params.amount - Amount in INR
 * @param {string} params.userId - User ID for reference
 * @param {string} params.mobile - User mobile number
 * @param {string} params.callbackUrl - Server callback URL
 * @param {string} params.redirectUrl - Frontend redirect URL
 * @returns {Promise<Object>} PhonePe payment response
 */
export const initiatePayment = async ({
  transactionId,
  amount,
  userId,
  mobile,
  callbackUrl,
  redirectUrl,
}) => {
  const payload = {
    merchantId: env.phonepe.merchantId,
    merchantTransactionId: transactionId,
    merchantUserId: userId,
    amount: amount * 100, // Convert to paisa
    redirectUrl,
    redirectMode: 'POST',
    callbackUrl,
    mobileNumber: mobile,
    paymentInstrument: {
      type: 'PAY_PAGE',
    },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const checksum = createChecksum(base64Payload, '/pg/v1/pay');

  try {
    const response = await fetch(`${getPhonePeBaseUrl()}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const data = await response.json();
    
    logger.info(`PhonePe payment initiation response: ${JSON.stringify(data)}`);

    if (data.success) {
      return {
        success: true,
        paymentUrl: data.data.instrumentResponse.redirectInfo.url,
        transactionId,
      };
    }

    return {
      success: false,
      error: data.message || 'Payment initiation failed',
    };
  } catch (error) {
    logger.error(`PhonePe payment initiation error: ${error.message}`);
    return {
      success: false,
      error: 'Payment service unavailable',
    };
  }
};

/**
 * Verify PhonePe callback signature
 * @param {string} response - Base64 encoded response from PhonePe
 * @param {string} xVerify - X-VERIFY header from PhonePe
 * @returns {boolean} Whether signature is valid
 */
export const verifyCallback = (response, xVerify) => {
  try {
    const expectedChecksum = createChecksum(response, '/pg/v1/pay');
    return expectedChecksum === xVerify;
  } catch (error) {
    logger.error(`PhonePe callback verification error: ${error.message}`);
    return false;
  }
};

/**
 * Decode PhonePe callback response
 * @param {string} response - Base64 encoded response
 * @returns {Object} Decoded response
 */
export const decodeCallbackResponse = (response) => {
  try {
    const decoded = Buffer.from(response, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    logger.error(`PhonePe response decode error: ${error.message}`);
    return null;
  }
};

/**
 * Check payment status from PhonePe
 * @param {string} transactionId - Merchant transaction ID
 * @returns {Promise<Object>} Payment status
 */
export const checkPaymentStatus = async (transactionId) => {
  const endpoint = `/pg/v1/status/${env.phonepe.merchantId}/${transactionId}`;
  const checksum = createChecksum('', endpoint);

  try {
    const response = await fetch(`${getPhonePeBaseUrl()}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': env.phonepe.merchantId,
      },
    });

    const data = await response.json();
    
    logger.info(`PhonePe status check response: ${JSON.stringify(data)}`);

    if (data.success && data.code === 'PAYMENT_SUCCESS') {
      return {
        success: true,
        status: 'completed',
        phonepeTransactionId: data.data.transactionId,
        amount: data.data.amount / 100, // Convert from paisa to INR
      };
    }

    if (data.code === 'PAYMENT_PENDING') {
      return {
        success: true,
        status: 'pending',
      };
    }

    return {
      success: false,
      status: 'failed',
      error: data.message || 'Payment failed',
    };
  } catch (error) {
    logger.error(`PhonePe status check error: ${error.message}`);
    return {
      success: false,
      status: 'failed',
      error: 'Unable to check payment status',
    };
  }
};

export default {
  PLANS,
  generateTransactionId,
  initiatePayment,
  verifyCallback,
  decodeCallbackResponse,
  checkPaymentStatus,
};
