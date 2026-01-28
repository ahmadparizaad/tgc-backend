import User from '../models/User.js';
import Payment from '../models/Payment.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import AppError from '../utils/app-error.js';
import { catchAsync, parsePagination, formatPaginationResponse } from '../utils/helpers.js';
import moment from 'moment-timezone';

/**
 * Get all users with pagination
 * GET /api/admin/users
 */
export const getAllUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, subscriptionStatus } = req.query;
  
  // Build filter
  const filter = {};
  
  if (search) {
    // Search by mobile, fullName, or city
    filter.$or = [
      { mobile: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
    ];
  }
  
  if (subscriptionStatus === 'active') {
    filter['subscription.isActive'] = true;
    filter['subscription.endDate'] = { $gt: new Date() };
  } else if (subscriptionStatus === 'inactive') {
    filter.$or = [
      { 'subscription.isActive': false },
      { 'subscription.endDate': { $lte: new Date() } },
    ];
  }
  
  // Execute query with pagination
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    User.countDocuments(filter),
  ]);
  
  res.status(200).json({
    status: 'success',
    ...formatPaginationResponse(users, total, page, limit),
  });
});

/**
 * Get single user by ID
 * GET /api/admin/users/:id
 */
export const getUserById = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  const user = await User.findById(id).select('-__v');
  
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  res.status(200).json({
    status: 'success',
    data: { user },
  });
});

/**
 * Update user status (enable/disable)
 * PATCH /api/admin/users/:id/status
 */
export const updateUserStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;
  
  const user = await User.findByIdAndUpdate(
    id,
    { isActive },
    { new: true, runValidators: true }
  ).select('-__v');
  
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  res.status(200).json({
    status: 'success',
    data: { user },
  });
});

/**
 * Get user payment history
 * GET /api/admin/users/:id/payments
 */
export const getUserPayments = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { page, limit, skip } = parsePagination(req.query);
  
  // Verify user exists
  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  // Get payments
  const [payments, total] = await Promise.all([
    Payment.find({ user: id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
    Payment.countDocuments({ user: id }),
  ]);
  
  res.status(200).json({
    status: 'success',
    ...formatPaginationResponse(payments, total, page, limit),
  });
});

/**
 * Get all payments (admin)
 * GET /api/admin/payments
 */
export const getAllPayments = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, status, fromDate, toDate } = req.query;

  // Build filter
  const filter = {};

  if (search) {
    // search by user mobile
    // we can attempt to match mobile directly in the payment.user.mobile via populate match
    // but Mongo can't filter on populated fields directly without lookup — use regex on user field by joining in aggregation
    // For simplicity, search by user mobile requires us to lookup users
    const users = await User.find({ mobile: { $regex: search, $options: 'i' } }).select('_id');
    const userIds = users.map((u) => u._id);
    filter.user = { $in: userIds };
  }

  if (status) {
    filter.status = status;
  }

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'mobile')
      .select('-__v'),
    Payment.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    ...formatPaginationResponse(payments, total, page, limit),
  });
});

/**
 * Export all successful payments to CSV
 * GET /api/admin/payments/export
 */
export const exportAllPaymentsCSV = catchAsync(async (req, res) => {
  const { fromDate, toDate } = req.query;

  const filter = { status: 'completed' };
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const payments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .populate('user', 'mobile displayId fullName');

  let csv = 'Date (IST),User ID,User Name,Mobile,Plan Type,Amount,Currency,Status,Transaction ID\n';
  
  payments.forEach(p => {
    const dateIST = moment(p.createdAt).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
    const user = p.user || {};
    csv += `${dateIST},${user.displayId || 'N/A'},"${user.fullName || 'N/A'}",${user.mobile || 'N/A'},${p.plan},${p.amount},${p.currency},${p.status},${p.transactionId}\n`;
  });

  res.header('Content-Type', 'text/csv');
  res.attachment(`payments_export_${moment().format('YYYY-MM-DD')}.csv`);
  return res.send(csv);
});

/**
 * Activate subscription manually (for admin)
 * POST /api/admin/users/:id/activate-subscription
 */
export const activateSubscription = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { plan } = req.body;
  
  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  const durationDays = plan === 'daily' ? 1 : 7;
  const now = new Date();
  
  user.subscription = {
    plan,
    startDate: now,
    endDate: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
    isActive: true,
    isUnlimited: false,
  };
  
  await user.save();
  
  res.status(200).json({
    status: 'success',
    message: 'Subscription activated successfully',
    data: { user },
  });
});

/**
 * Create new user (admin only)
 * POST /api/admin/users
 */
export const createUser = catchAsync(async (req, res) => {
  const { 
    fullName, 
    mobile, 
    password, 
    city, 
    planId, 
    accessDuration, 
    planTier = 'Regular' 
  } = req.body;
  
  // Check if user with this mobile already exists
  const existingUser = await User.findOne({ mobile });
  if (existingUser) {
    throw new AppError('A user with this mobile number already exists', 409);
  }
  
  // Use provided password or generate random 8-character password
  const finalPassword = password || Math.random().toString(36).slice(-8).toUpperCase();

  // Build user data
  const userData = {
    mobile,
    isActive: true,
    password: finalPassword,
    fullName: fullName || mobile, // Fallback to mobile if name not provided
    city: city || ''
  };
  
  // Set subscription Logic
  let subscription = null;

  if (planId) {
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) throw new AppError('Invalid Plan ID', 400);

    const startDate = new Date();
    // Use moment-timezone for consistency with other controllers (Midnight IST)
    const endDate = moment(startDate)
      .tz('Asia/Kolkata')
      .add(plan.durationDays, 'days')
      .endOf('day')
      .toDate();

    subscription = {
      planTier: plan.tier,
      startDate,
      endDate,
      isActive: true,
      maxTargetsVisible: plan.maxTargetsVisible,
      reminderHours: plan.reminderHours,
      reminderSent: false
    };
  } else if (accessDuration) {
    // Custom logic
    const startDate = new Date();
    let endDate = null;

    if (accessDuration !== 'unlimited') {
       const days = parseInt(accessDuration, 10);
       if (!isNaN(days) && days > 0) {
           endDate = moment(startDate)
            .tz('Asia/Kolkata')
            .add(days, 'days')
            .endOf('day')
            .toDate();
       }
    }
    
    subscription = {
      planTier,
      startDate,
      endDate, // null if unlimited
      isActive: true,
      maxTargetsVisible: planTier === 'Regular' ? 2 : 99,
      reminderHours: 24,
      reminderSent: false
    };
  }

  if (subscription) {
    userData.subscription = subscription;
  }
  
  const user = await User.create(userData);
  
  res.status(201).json({
    status: 'success',
    message: 'User created successfully',
    data: { 
      user: {
        id: user._id,
        displayId: user.displayId,
        mobile: user.mobile,
        fullName: user.fullName,
        subscription: user.subscription
      },
      temp_password: finalPassword
    },
  });
});

/**
 * Update user (admin only)
 * PUT /api/admin/users/:id
 */
export const updateUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { 
    fullName, 
    mobile, 
    city, 
    isActive, 
    accessDays, 
    isUnlimited, 
    planTier,
    extendSubscription = false 
  } = req.body;
  
  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  // Check mobile uniqueness if being updated
  if (mobile && mobile !== user.mobile) {
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      throw new AppError('A user with this mobile number already exists', 409);
    }
    user.mobile = mobile;
  }
  
  // Update fullName if provided
  if (fullName !== undefined) {
    user.fullName = fullName || null;
  }
  
  // Update city if provided
  if (city !== undefined) {
    user.city = city || null;
  }
  
  // Update isActive if provided
  if (typeof isActive === 'boolean') {
    user.isActive = isActive;
  }
  
  // Update subscription if accessDays or isUnlimited provided
  if (accessDays !== undefined || isUnlimited !== undefined) {
    const now = new Date();
    
    if (isUnlimited) {
      // Set unlimited subscription
      user.subscription = {
        planTier: planTier || user.subscription.planTier || 'Regular',
        startDate: user.subscription.isActive ? user.subscription.startDate : now,
        endDate: null,
        isActive: true,
        isUnlimited: true,
        maxTargetsVisible: (planTier || user.subscription.planTier) === 'Regular' ? 2 : 99,
      };
    } else if (accessDays) {
      let newEndDate;
      
      if (extendSubscription && user.subscription.isActive && user.subscription.endDate) {
        // Extend from current end date
        const currentEndDate = new Date(user.subscription.endDate);
        const baseDate = currentEndDate > now ? currentEndDate : now;
        newEndDate = new Date(baseDate.getTime() + accessDays * 24 * 60 * 60 * 1000);
      } else {
        // Replace from today
        newEndDate = new Date(now.getTime() + accessDays * 24 * 60 * 60 * 1000);
      }
      
      user.subscription = {
        planTier: planTier || user.subscription.planTier || 'Regular',
        startDate: extendSubscription && user.subscription.startDate ? user.subscription.startDate : now,
        endDate: newEndDate,
        isActive: true,
        isUnlimited: false,
        maxTargetsVisible: (planTier || user.subscription.planTier) === 'Regular' ? 2 : 99,
      };
    } else if (planTier && user.subscription.isActive) {
        // Just updating the tier for an active subscription
        user.subscription.planTier = planTier;
        user.subscription.maxTargetsVisible = planTier === 'Regular' ? 2 : 99;
        user.markModified('subscription');
    }
  }
  
  await user.save();
  
  res.status(200).json({
    status: 'success',
    message: 'User updated successfully',
    data: { user },
  });
});

/**
 * Delete user (admin only)
 * DELETE /api/admin/users/:id
 */
export const deleteUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  await User.findByIdAndDelete(id);
  
  // Also delete related payments
  await Payment.deleteMany({ user: id });
  
  res.status(200).json({
    status: 'success',
    message: 'User deleted successfully',
  });
});

export default {
  getAllUsers,
  getUserById,
  updateUserStatus,
  getAllPayments,
  getUserPayments,
  exportAllPaymentsCSV,
  activateSubscription,
  createUser,
  updateUser,
  deleteUser,
};
