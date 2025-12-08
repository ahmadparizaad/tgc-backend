import { Router } from 'express';
import { verifyAdminToken } from '../middlewares/auth-middleware.js';
import { validate } from '../middlewares/validate-middleware.js';
import { paginationSchema, userStatusSchema } from '../validators/auth-validator.js';
import { createCallSchema, updateCallSchema, callListQuerySchema } from '../validators/call-validator.js';
import { sendNotificationSchema, sendToUserSchema, testNotificationSchema } from '../validators/notification-validator.js';
import { createUserSchema, updateUserSchema } from '../validators/user-validator.js';
import { notificationLimiter } from '../middlewares/security-middleware.js';
import adminAuthController from '../controllers/admin-auth-controller.js';
import adminUserController from '../controllers/admin-user-controller.js';
import callController from '../controllers/call-controller.js';
import dashboardController from '../controllers/dashboard-controller.js';
import notificationController from '../controllers/notification-controller.js';

const router = Router();

// All routes require admin authentication
router.use(verifyAdminToken);

// Admin profile
router.get('/me', adminAuthController.getCurrentAdmin);

// Dashboard
router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/recent-payments', dashboardController.getRecentPayments);
router.get('/dashboard/subscription-metrics', dashboardController.getSubscriptionMetrics);

// Payments listing
router.get('/payments', validate(paginationSchema, 'query'), adminUserController.getAllPayments);

// User management
router.post(
  '/users',
  validate(createUserSchema),
  adminUserController.createUser
);

router.get(
  '/users',
  validate(paginationSchema, 'query'),
  adminUserController.getAllUsers
);

router.get('/users/:id', adminUserController.getUserById);

router.put(
  '/users/:id',
  validate(updateUserSchema),
  adminUserController.updateUser
);

router.delete('/users/:id', adminUserController.deleteUser);

router.get(
  '/users/:id/payments',
  validate(paginationSchema, 'query'),
  adminUserController.getUserPayments
);

router.patch(
  '/users/:id/status',
  validate(userStatusSchema),
  adminUserController.updateUserStatus
);

router.post(
  '/users/:id/activate-subscription',
  adminUserController.activateSubscription
);

// Calls management
router.get(
  '/calls',
  validate(callListQuerySchema, 'query'),
  callController.getAllCalls
);

router.post(
  '/calls',
  validate(createCallSchema),
  callController.createCall
);

router.get('/calls/:id', callController.getCallById);

router.put(
  '/calls/:id',
  validate(updateCallSchema),
  callController.updateCall
);

router.delete('/calls/:id', callController.deleteCall);

// Notifications (with rate limiting)
router.get('/notifications/stats', notificationController.getNotificationStats);

router.post(
  '/notifications/send',
  notificationLimiter,
  validate(sendNotificationSchema),
  notificationController.sendNotification
);

router.post(
  '/notifications/send/:userId',
  notificationLimiter,
  validate(sendToUserSchema),
  notificationController.sendToUser
);

router.post(
  '/notifications/test',
  notificationLimiter,
  validate(testNotificationSchema),
  notificationController.sendTestNotification
);

export default router;
