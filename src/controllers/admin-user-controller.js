import User from '../models/User.js';
import Payment from '../models/Payment.js';
import AppError from '../utils/app-error.js';
import { catchAsync, parsePagination, formatPaginationResponse } from '../utils/helpers.js';

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
  const { fullName, mobile, city, isActive = true, accessDays, isUnlimited = false } = req.body;
  
  // Check if user with this mobile already exists
  const existingUser = await User.findOne({ mobile });
  if (existingUser) {
    throw new AppError('A user with this mobile number already exists', 409);
  }
  
  // Build user data (don't set firebaseUid - leave it undefined for sparse index)
  const userData = {
    mobile,
    isActive,
  };
  
  // Only set optional fields if they have values
  if (fullName) userData.fullName = fullName;
  if (city) userData.city = city;
  
  // Set subscription if accessDays or isUnlimited provided
  if (accessDays || isUnlimited) {
    const now = new Date();
    userData.subscription = {
      plan: 'custom',
      startDate: now,
      endDate: isUnlimited ? null : new Date(now.getTime() + accessDays * 24 * 60 * 60 * 1000),
      isActive: true,
      isUnlimited,
    };
  }
  
  const user = await User.create(userData);
  
  res.status(201).json({
    status: 'success',
    message: 'User created successfully',
    data: { user },
  });
});

/**
 * Update user (admin only)
 * PUT /api/admin/users/:id
 */
export const updateUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { fullName, mobile, city, isActive, accessDays, isUnlimited, extendSubscription = false } = req.body;
  
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
        plan: 'custom',
        startDate: user.subscription.isActive ? user.subscription.startDate : now,
        endDate: null,
        isActive: true,
        isUnlimited: true,
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
        plan: 'custom',
        startDate: extendSubscription && user.subscription.startDate ? user.subscription.startDate : now,
        endDate: newEndDate,
        isActive: true,
        isUnlimited: false,
      };
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
  getUserPayments,
  activateSubscription,
  createUser,
  updateUser,
  deleteUser,
};
