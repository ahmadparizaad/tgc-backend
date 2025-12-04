import admin from 'firebase-admin';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import env from '../config/env.js';

/**
 * Check if FCM is enabled and Firebase is initialized
 * @returns {boolean}
 */
const isFCMEnabled = () => {
  if (!env.fcm?.enabled) {
    logger.debug('FCM is disabled in configuration');
    return false;
  }
  
  try {
    // Check if Firebase is initialized
    admin.app();
    return true;
  } catch {
    logger.warn('Firebase not initialized, FCM unavailable');
    return false;
  }
};

/**
 * Send push notification to a single user
 * @param {string} fcmToken - User's FCM token
 * @param {Object} notification - Notification payload
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {Object} data - Additional data payload
 * @returns {Promise<Object>} Send result
 */
export const sendToUser = async (fcmToken, notification, data = {}) => {
  if (!isFCMEnabled()) {
    return { success: false, error: 'FCM not enabled', disabled: true };
  }
  
  if (!fcmToken) {
    logger.warn('No FCM token provided for notification');
    return { success: false, error: 'No FCM token' };
  }

  try {
    const message = {
      token: fcmToken,
          notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'green_candle_calls',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`Notification sent successfully: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    logger.error(`Failed to send notification: ${error.message}`);
    
    // Handle invalid token
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      return { success: false, error: 'Invalid token', invalidToken: true };
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<Object>} Send results
 */
export const sendToMultipleUsers = async (fcmTokens, notification, data = {}) => {
  if (!isFCMEnabled()) {
    return { success: false, error: 'FCM not enabled', disabled: true };
  }
  
  if (!fcmTokens || fcmTokens.length === 0) {
    logger.warn('No FCM tokens provided for batch notification');
    return { success: false, error: 'No FCM tokens' };
  }

  // Filter out null/undefined tokens
  const validTokens = fcmTokens.filter(token => token);
  
  if (validTokens.length === 0) {
    return { success: false, error: 'No valid FCM tokens' };
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'green_candle_calls',
          priority: 'high',
          defaultSound: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: validTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    logger.info(`Batch notification sent: ${response.successCount} success, ${response.failureCount} failures`);
    
    // Collect invalid tokens for cleanup
    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const error = res.error;
        if (error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(validTokens[idx]);
        }
      }
    });
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    logger.error(`Failed to send batch notification: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to all users with active subscriptions
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<Object>} Send results
 */
export const sendToActiveSubscribers = async (notification, data = {}) => {
  try {
    const now = new Date();
    
    // Find all active subscribers with FCM tokens
    const activeUsers = await User.find({
      isActive: true,
      'subscription.isActive': true,
      'subscription.endDate': { $gt: now },
      fcmToken: { $exists: true, $ne: null },
    }).select('fcmToken');
    
    const fcmTokens = activeUsers.map(user => user.fcmToken);
    
    if (fcmTokens.length === 0) {
      logger.info('No active subscribers with FCM tokens to notify');
      return { success: true, successCount: 0, failureCount: 0 };
    }
    
    logger.info(`Sending notification to ${fcmTokens.length} active subscribers`);
    return await sendToMultipleUsers(fcmTokens, notification, data);
  } catch (error) {
    logger.error(`Failed to send to active subscribers: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to all users (for announcements)
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<Object>} Send results
 */
export const sendToAllUsers = async (notification, data = {}) => {
  try {
    // Find all users with FCM tokens
    const users = await User.find({
      isActive: true,
      fcmToken: { $exists: true, $ne: null },
    }).select('fcmToken');
    
    const fcmTokens = users.map(user => user.fcmToken);
    
    if (fcmTokens.length === 0) {
      logger.info('No users with FCM tokens to notify');
      return { success: true, successCount: 0, failureCount: 0 };
    }
    
    logger.info(`Sending notification to ${fcmTokens.length} users`);
    return await sendToMultipleUsers(fcmTokens, notification, data);
  } catch (error) {
    logger.error(`Failed to send to all users: ${error.message}`);
    return { success: false, error: error.message };
  }
};

/**
 * Send new call notification to subscribers
 * @param {Object} call - Call object
 * @returns {Promise<Object>} Send results
 */
export const sendNewCallNotification = async (call) => {
  const commodityNames = {
    gold: 'Gold',
    silver: 'Silver',
    nifty: 'Nifty',
    copper: 'Copper',
  };
  
  const typeEmoji = call.type === 'buy' ? '🟢' : '🔴';
  const commodity = commodityNames[call.commodity] || call.commodity;
  
  const notification = {
    title: `${typeEmoji} New ${call.type.toUpperCase()} Call - ${commodity}`,
    body: `Entry: ₹${call.entryPrice} | Target: ₹${call.target} | SL: ₹${call.stopLoss}`,
  };
  
  const data = {
    type: 'new_call',
    callId: call._id.toString(),
    commodity: call.commodity,
    callType: call.type,
  };
  
  return await sendToActiveSubscribers(notification, data);
};

/**
 * Send call update notification
 * @param {Object} call - Updated call object
 * @param {string} updateType - Type of update (hit_target, hit_stoploss, expired)
 * @returns {Promise<Object>} Send results
 */
export const sendCallUpdateNotification = async (call, updateType) => {
  const commodityNames = {
    gold: 'Gold',
    silver: 'Silver',
    nifty: 'Nifty',
    copper: 'Copper',
  };
  
  const commodity = commodityNames[call.commodity] || call.commodity;
  
  let title, body;
  
  switch (updateType) {
    case 'hit_target':
      title = `🎯 Target Hit - ${commodity}`;
      body = `${call.type.toUpperCase()} call target of ₹${call.target} achieved!`;
      break;
    case 'hit_stoploss':
      title = `⛔ Stop Loss Hit - ${commodity}`;
      body = `${call.type.toUpperCase()} call hit stop loss at ₹${call.stopLoss}`;
      break;
    case 'expired':
      title = `⏰ Call Expired - ${commodity}`;
      body = `${call.type.toUpperCase()} call has expired`;
      break;
    default:
      title = `📊 Call Update - ${commodity}`;
      body = `${call.type.toUpperCase()} call has been updated`;
  }
  
  const notification = { title, body };
  
  const data = {
    type: 'call_update',
    callId: call._id.toString(),
    commodity: call.commodity,
    updateType,
  };
  
  return await sendToActiveSubscribers(notification, data);
};

/**
 * Clean up invalid FCM tokens from users
 * @param {string[]} invalidTokens - Array of invalid tokens
 */
export const cleanupInvalidTokens = async (invalidTokens) => {
  if (!invalidTokens || invalidTokens.length === 0) return;
  
  try {
    const result = await User.updateMany(
      { fcmToken: { $in: invalidTokens } },
      { $unset: { fcmToken: '' } }
    );
    
    logger.info(`Cleaned up ${result.modifiedCount} invalid FCM tokens`);
  } catch (error) {
    logger.error(`Failed to cleanup invalid tokens: ${error.message}`);
  }
};

export default {
  sendToUser,
  sendToMultipleUsers,
  sendToActiveSubscribers,
  sendToAllUsers,
  sendNewCallNotification,
  sendCallUpdateNotification,
  cleanupInvalidTokens,
};
