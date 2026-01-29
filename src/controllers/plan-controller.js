import SubscriptionPlan from '../models/SubscriptionPlan.js';
import AppError from '../utils/app-error.js';
import { catchAsync } from '../utils/helpers.js';

/**
 * Get all active subscription plans
 * GET /api/plans
 */
export const getActivePlans = catchAsync(async (req, res) => {
  const plans = await SubscriptionPlan.find({ isActive: true });
  
  res.status(200).json({
    status: 'success',
    data: { plans },
  });
});

/**
 * Get all plans (admin only)
 * GET /api/admin/plans
 */
export const getAllPlans = catchAsync(async (req, res) => {
  const plans = await SubscriptionPlan.find();
  
  res.status(200).json({
    status: 'success',
    data: { plans },
  });
});

/**
 * Create a new plan (admin only)
 * POST /api/admin/plans
 */
export const createPlan = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: { plan },
  });
});

/**
 * Update a plan (admin only)
 * PATCH /api/admin/plans/:id
 */
export const updatePlan = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  
  if (!plan) {
    throw new AppError('No plan found with that ID', 404);
  }
  
  res.status(200).json({
    status: 'success',
    data: { plan },
  });
});

/**
 * Delete a plan (admin only)
 * DELETE /api/admin/plans/:id
 */
export const deletePlan = catchAsync(async (req, res) => {
  const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
  
  if (!plan) {
    throw new AppError('No plan found with that ID', 404);
  }
  
  res.status(200).json({
    status: 'success',
    data: null,
  });
});

export default {
  getActivePlans,
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
};
