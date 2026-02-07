import notificationService from '../services/notification-service.js';
import User from '../models/User.js';
import AppError from '../utils/app-error.js';
import { catchAsync } from '../utils/helpers.js';
import logger from '../utils/logger.js';

/**
 * Send notification to all active subscribers
 * POST /api/admin/notifications/send
 */
export const sendNotification = catchAsync(async (req, res) => {
  const { title, body, targetAudience, data } = req.body;
  
  if (!title || !body) {
    throw new AppError('Title and body are required', 400);
  }
  
  const notification = { title, body };
  let result;
  
  switch (targetAudience) {
    case 'all':
      result = await notificationService.sendToAllUsers(notification, data || {});
      break;
    case 'subscribers':
    default:
      result = await notificationService.sendToActiveSubscribers(notification, data || {});
      break;
  }
  
  // Cleanup invalid tokens if any
  if (result.invalidTokens && result.invalidTokens.length > 0) {
    await notificationService.cleanupInvalidTokens(result.invalidTokens);
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Notification sent successfully',
    data: {
      successCount: result.successCount || 0,
      failureCount: result.failureCount || 0,
    },
  });
});

/**
 * Send notification to a specific user
 * POST /api/admin/notifications/send/:userId
 */
export const sendToUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { title, body, data } = req.body;
  
  if (!title || !body) {
    throw new AppError('Title and body are required', 400);
  }
  
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  if (!user.fcmToken) {
    throw new AppError('User does not have FCM token registered', 400);
  }
  
  const notification = { title, body };
  const result = await notificationService.sendToUser(user.fcmToken, notification, data || {});
  
  // Cleanup invalid token if needed
  if (result.invalidToken) {
    await notificationService.cleanupInvalidTokens([user.fcmToken]);
  }
  
  if (!result.success) {
    throw new AppError(`Failed to send notification: ${result.error}`, 500);
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Notification sent to user successfully',
    data: {
      messageId: result.messageId,
    },
  });
});

/**
 * Send test notification (for testing FCM setup)
 * POST /api/admin/notifications/test
 */
export const sendTestNotification = catchAsync(async (req, res) => {
  const { fcmToken } = req.body;
  
  if (!fcmToken) {
    throw new AppError('FCM token is required', 400);
  }
  
  const notification = {
    title: '🔔 Test Notification',
    body: 'This is a test notification from The Green Candle Admin',
  };
  
  const result = await notificationService.sendToUser(fcmToken, notification, {
    type: 'test',
    timestamp: new Date().toISOString(),
  });
  
  if (!result.success) {
    throw new AppError(`Failed to send test notification: ${result.error}`, 500);
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Test notification sent successfully',
    data: {
      messageId: result.messageId,
    },
  });
});

/**
 * Get notification stats
 * GET /api/admin/notifications/stats
 */
export const getNotificationStats = catchAsync(async (req, res) => {
  const now = new Date();
  
  // Count users with FCM tokens
  const totalWithToken = await User.countDocuments({
    fcmToken: { $exists: true, $ne: null },
  });
  
  // Count active subscribers with FCM tokens
  const activeSubscribersWithToken = await User.countDocuments({
    isActive: true,
    'subscription.isActive': true,
    $or: [
      { 'subscription.endDate': { $gt: now } },
      { 'subscription.endDate': null }
    ],
    fcmToken: { $exists: true, $ne: null },
  });
  
  // Count active users (non-subscribers) with FCM tokens
  const activeUsersWithToken = await User.countDocuments({
    isActive: true,
    fcmToken: { $exists: true, $ne: null },
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      totalUsersWithToken: totalWithToken,
      activeUsersWithToken,
      activeSubscribersWithToken,
      reachableUsers: activeUsersWithToken,
      reachableSubscribers: activeSubscribersWithToken,
    },
  });
});

export default {
  sendNotification,
  sendToUser,
  sendTestNotification,
  getNotificationStats,
};
