import User from '../models/User.js';
import Call from '../models/Call.js';
import Payment from '../models/Payment.js';
import { catchAsync } from '../utils/helpers.js';

/**
 * Get dashboard overview stats
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = catchAsync(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Get first day of current month
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // Run all queries in parallel
  const [
    totalUsers,
    activeUsers,
    activeSubscriptions,
    todayCalls,
    monthlyRevenue,
    callStats,
  ] = await Promise.all([
    // Total users
    User.countDocuments(),
    
    // Active users (not disabled)
    User.countDocuments({ isActive: true }),
    
    // Active subscriptions
    User.countDocuments({
      'subscription.isActive': true,
      $or: [
        { 'subscription.endDate': { $gt: new Date() } },
        { 'subscription.endDate': null }
      ]
    }),
    
    // Today's calls count
    Call.countDocuments({
      date: { $gte: today, $lt: tomorrow },
    }),
    
    // Monthly revenue
    Payment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: firstDayOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]),
    
    // Call performance stats
    Call.aggregate([
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          hitTarget: {
            $sum: { $cond: [{ $in: ['$status', ['partial_hit', 'all_hit']] }, 1, 0] },
          },
          hitStoploss: {
            $sum: { $cond: [{ $eq: ['$status', 'hit_stoploss'] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  // Calculate accuracy
  const stats = callStats[0] || { totalCalls: 0, hitTarget: 0, hitStoploss: 0 };
  const completedCalls = stats.hitTarget + stats.hitStoploss;
  const accuracy = completedCalls > 0 
    ? ((stats.hitTarget / completedCalls) * 100).toFixed(2) 
    : 0;

  res.status(200).json({
    status: 'success',
    data: {
      totalUsers,
      activeUsers,
      activeSubscriptions,
      todayCalls,
      monthlyRevenue: monthlyRevenue[0]?.total || 0,
      callAccuracy: parseFloat(accuracy),
      totalCalls: stats.totalCalls,
    },
  });
});

/**
 * Get recent payment transactions
 * GET /api/admin/dashboard/recent-payments
 */
export const getRecentPayments = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  const payments = await Payment.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user', 'mobile')
    .select('-__v');

  res.status(200).json({
    status: 'success',
    data: { payments },
  });
});

/**
 * Get subscription metrics
 * GET /api/admin/dashboard/subscription-metrics
 */
export const getSubscriptionMetrics = catchAsync(async (req, res) => {
  const now = new Date();

  const [planCounts, expiringToday, expiredRecently] = await Promise.all([
    // Count by plan type
    User.aggregate([
      {
        $match: {
          'subscription.isActive': true,
          $or: [
            { 'subscription.endDate': { $gt: now } },
            { 'subscription.endDate': null }
          ]
        },
      },
      {
        $group: {
          _id: '$subscription.planTier',
          count: { $sum: 1 },
        },
      },
    ]),
    
    // Expiring today
    User.countDocuments({
      'subscription.isActive': true,
      'subscription.endDate': {
        $gte: new Date(now.setHours(0, 0, 0, 0)),
        $lt: new Date(now.setHours(23, 59, 59, 999)),
      },
    }),
    
    // Expired in last 7 days
    User.countDocuments({
      'subscription.endDate': {
        $lt: new Date(),
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  // Format plan counts
  const plans = {
    Regular: 0,
    Premium: 0,
    International: 0,
  };
  
  planCounts.forEach(({ _id, count }) => {
    if (_id && plans.hasOwnProperty(_id)) {
      plans[_id] = count;
    }
  });

  res.status(200).json({
    status: 'success',
    data: {
      activeByPlan: plans,
      totalActive: Object.values(plans).reduce((a, b) => a + b, 0),
      expiringToday,
      expiredRecently,
    },
  });
});

/**
 * Get revenue trend for the last 7 months
 * GET /api/admin/dashboard/revenue-trend
 */
export const getRevenueTrend = catchAsync(async (req, res) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  
  const revenueData = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: sixMonthsAgo }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$amount' }
      }
    }
  ]);

  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthData = revenueData.find(r => 
      r._id.year === d.getFullYear() && r._id.month === (d.getMonth() + 1)
    );
    
    result.push({
      name: months[d.getMonth()],
      revenue: monthData ? monthData.revenue : 0,
    });
  }

  res.status(200).json({
    status: 'success',
    data: { trend: result },
  });
});

export default {
  getDashboardStats,
  getRecentPayments,
  getSubscriptionMetrics,
  getRevenueTrend,
};
