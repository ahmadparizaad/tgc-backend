import AppError from '../utils/app-error.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * Middleware to verify user has an active subscription
 * Must be used after verifyUserToken middleware
 */
export const requireActiveSubscription = async (req, res, next) => {
  try {
    // Get user from previous middleware
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    
    // Fetch fresh user data to check subscription
    const user = await User.findById(userId).select('subscription isActive');
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    
    if (!user.isActive) {
      return next(new AppError('Your account has been disabled. Please contact support.', 403));
    }
    
    // Check subscription status
    const subscription = user.subscription;
    
    if (!subscription || !subscription.isActive) {
      return next(new AppError('Active subscription required to access this resource', 403));
    }
    
    // Check if subscription has expired
    if (subscription.endDate && new Date(subscription.endDate) <= new Date()) {
      // Update subscription status to inactive
      await User.findByIdAndUpdate(userId, {
        'subscription.isActive': false,
      });
      
      return next(new AppError('Your subscription has expired. Please renew to continue.', 403));
    }
    
    // Attach subscription info to request for downstream use
    req.subscription = {
      plan: subscription.planTier || subscription.plan,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      daysRemaining: subscription.endDate 
        ? Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
        : 9999, // Unlimited access
    };
    
    next();
  } catch (error) {
    logger.error(`Subscription validation error: ${error.message}`);
    next(new AppError('Failed to validate subscription', 500));
  }
};

/**
 * Middleware to check subscription status without blocking
 * Attaches subscription info to request but allows access regardless
 */
export const checkSubscriptionStatus = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      req.subscription = null;
      return next();
    }
    
    const user = await User.findById(userId).select('subscription isActive');
    
    if (!user || !user.isActive) {
      req.subscription = null;
      return next();
    }
    
    const subscription = user.subscription;
    
    if (!subscription || !subscription.isActive) {
      req.subscription = { active: false };
      return next();
    }
    
    // Check if subscription has expired
    const isExpired = subscription.endDate && new Date(subscription.endDate) <= new Date();
    
    if (isExpired) {
      // Update subscription status
      await User.findByIdAndUpdate(userId, {
        'subscription.isActive': false,
      });
      req.subscription = { active: false, expired: true };
      return next();
    }
    
    req.subscription = {
      active: true,
      plan: subscription.planTier || subscription.plan,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      daysRemaining: subscription.endDate 
        ? Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
        : 9999, // Unlimited access
    };
    
    next();
  } catch (error) {
    logger.error(`Subscription check error: ${error.message}`);
    req.subscription = null;
    next();
  }
};

/**
 * Middleware to allow access with subscription info (soft check)
 * Allows access but marks if content should be restricted
 */
export const softSubscriptionCheck = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      req.hasActiveSubscription = false;
      return next();
    }
    
    const user = await User.findById(userId).select('subscription isActive');
    
    if (!user || !user.isActive) {
      req.hasActiveSubscription = false;
      return next();
    }
    
    const subscription = user.subscription;
    const hasActive = subscription?.isActive && 
      (!subscription?.endDate || new Date(subscription.endDate) > new Date());
    
    req.hasActiveSubscription = hasActive;
    
    next();
  } catch (error) {
    logger.error(`Soft subscription check error: ${error.message}`);
    req.hasActiveSubscription = false;
    next();
  }
};

export default {
  requireActiveSubscription,
  checkSubscriptionStatus,
  softSubscriptionCheck,
};
