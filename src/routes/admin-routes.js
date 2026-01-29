import { Router } from 'express';
import adminUserController from '../controllers/admin-user-controller.js';
import adminAuthController from '../controllers/admin-auth-controller.js';
import dashboardController from '../controllers/dashboard-controller.js';
import * as callController from '../controllers/call-controller.js';
import * as planController from '../controllers/plan-controller.js';
import { verifyAdminToken } from '../middlewares/auth-middleware.js';
import { validate } from '../middlewares/validate-middleware.js';
import { createAdminUserSchema } from '../validators/admin-validator.js';
import { toggleTargetStatusSchema } from '../validators/call-validator.js';

const router = Router();

// Protect all routes with admin token
router.use(verifyAdminToken);

// Admin Profile
router.get('/me', adminAuthController.getCurrentAdmin);

// Dashboard
router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/recent-payments', dashboardController.getRecentPayments);
router.get('/dashboard/subscription-metrics', dashboardController.getSubscriptionMetrics);
router.get('/dashboard/revenue-trend', dashboardController.getRevenueTrend);

// User Management
router.get('/users', adminUserController.getAllUsers);
router.get('/users/:id', adminUserController.getUserById);
router.put('/users/:id', adminUserController.updateUser);
router.delete('/users/:id', adminUserController.deleteUser);
router.get('/users/:id/payments', adminUserController.getUserPayments);
router.get('/payments', adminUserController.getAllPayments);


// Call Management
router.get('/calls', callController.getAllCalls);
router.post('/calls', callController.createCall);
router.get('/calls/:id', callController.getCallById);
router.put('/calls/:id', callController.updateCall);
router.delete('/calls/:id', callController.deleteCall);
router.patch('/calls/:id/targets/:targetId/status', validate(toggleTargetStatusSchema), callController.updateTargetStatus);

// Plan Management
router.get('/plans', planController.getAllPlans);
router.post('/plans', planController.createPlan);
router.patch('/plans/:id', planController.updatePlan);
router.delete('/plans/:id', planController.deletePlan);

// Create user manually (Admin Grant)
router.post(
  '/users/create',
  validate(createAdminUserSchema),
  adminUserController.createUser
);

export default router;
