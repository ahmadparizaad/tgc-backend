import Call from '../models/Call.js';
import AppError from '../utils/app-error.js';
import { catchAsync, parsePagination, formatPaginationResponse } from '../utils/helpers.js';
import moment from 'moment-timezone';

/**
 * Create a new call
 * POST /api/admin/calls
 */
export const createCall = catchAsync(async (req, res) => {
  const { 
    commodity, 
    customCommodity, 
    type, 
    entryPrice, 
    targetPrices, 
    stopLoss, 
    analysis, 
    date, 
    status,
    tradeType
  } = req.body;
  
  const adminId = req.adminId;

  const call = await Call.create({
    commodity,
    customCommodity,
    type,
    entryPrice,
    targetPrices,
    stopLoss,
    analysis,
    date: moment.tz(date, 'Asia/Kolkata').startOf('day').toDate(),
    status: status || 'active',
    tradeType: tradeType || 'intraday',
    createdBy: adminId,
  });

  res.status(201).json({
    status: 'success',
    data: { call },
  });
});

/**
 * Get all calls with filters and pagination
 * GET /api/admin/calls
 */
export const getAllCalls = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { commodity, status, type, tradeType, startDate, endDate, sortBy, sortOrder } = req.query;

  // Build filter
  const filter = {};

  if (commodity) {
    filter.commodity = commodity;
  }

  if (status) {
    filter.status = status;
  }

  if (type) {
    filter.type = type;
  }

  if (tradeType) {
    filter.tradeType = tradeType;
  }

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) {
      filter.date.$gte = moment.tz(startDate, 'Asia/Kolkata').startOf('day').toDate();
    }
    if (endDate) {
      filter.date.$lte = moment.tz(endDate, 'Asia/Kolkata').endOf('day').toDate();
    }
  }

  // Build sort
  const sort = {};
  sort[sortBy || 'date'] = sortOrder === 'asc' ? 1 : -1;

  // Execute query
  const [calls, total] = await Promise.all([
    Call.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'email')
      .select('-__v'),
    Call.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    ...formatPaginationResponse(calls, total, page, limit),
  });
});

/**
 * Get a single call by ID
 * GET /api/admin/calls/:id
 */
export const getCallById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const call = await Call.findById(id)
    .populate('createdBy', 'email')
    .select('-__v');

  if (!call) {
    throw new AppError('Call not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: { call },
  });
});

/**
 * Update a call
 * PUT /api/admin/calls/:id
 */
export const updateCall = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Convert date to IST midnight if provided
  if (updateData.date) {
    updateData.date = moment.tz(updateData.date, 'Asia/Kolkata').startOf('day').toDate();
  }

  const call = await Call.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('createdBy', 'email')
    .select('-__v');

  if (!call) {
    throw new AppError('Call not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: { call },
  });
});

/**
 * Delete a call
 * DELETE /api/admin/calls/:id
 */
export const deleteCall = catchAsync(async (req, res) => {
  const { id } = req.params;

  const call = await Call.findByIdAndDelete(id);

  if (!call) {
    throw new AppError('Call not found', 404);
  }

  res.status(200).json({
    status: 'success',
    message: 'Call deleted successfully',
  });
});

/**
 * Update target status (isAcheived) and auto-update call status
 * PATCH /api/admin/calls/:id/targets/:targetId/status
 */
export const updateTargetStatus = catchAsync(async (req, res) => {
  const { id, targetId } = req.params;
  const { isAcheived } = req.body;

  const call = await Call.findById(id);
  if (!call) {
    throw new AppError('Call not found', 404);
  }

  // Find and update target
  const target = call.targetPrices.id(targetId);
  if (!target) {
    throw new AppError('Target not found', 404);
  }

  target.isAcheived = isAcheived;

  // Auto-update call status
  const totalTargets = call.targetPrices.length;
  const achievedTargets = call.targetPrices.filter(t => t.isAcheived).length;

  if (achievedTargets === 0) {
    call.status = 'active';
  } else if (achievedTargets < totalTargets) {
    call.status = 'partial_hit';
  } else if (achievedTargets === totalTargets) {
    call.status = 'all_hit';
  }

  await call.save();

  res.status(200).json({
    status: 'success',
    data: { call },
  });
});

/**
 * Get today's calls (for users with active subscription)
 * GET /api/calls
 */
export const getTodayCalls = catchAsync(async (req, res) => {
  const { tradeType } = req.query;
  
  // IST Midnight check
  const todayIST = moment.tz('Asia/Kolkata').startOf('day');
  const nowIST = moment.tz('Asia/Kolkata');

  // If now is after 12 midnight, but call was from "yesterday" (before reset)
  // Actually, startOf('day') is 12:00 AM IST.
  // The requirement: "After 12 means admin added a call ... not seen ... after 12AM in night"
  // So we only show calls where date >= start of today IST.
  
  const filter = {
    date: { $gte: todayIST.toDate() },
  };
  
  if (tradeType) {
    filter.tradeType = tradeType;
  }
  
  const calls = await Call.find(filter)
    .sort({ createdAt: -1 })
    .select('-__v -createdBy');

  // Filter targetPrices based on subscription tier
  const maxTargets = req.user.subscription?.maxTargetsVisible || (req.user.subscription?.planTier === 'Regular' ? 2 : 6);

  const filteredCalls = calls.map(call => {
    const callObj = call.toObject();
    callObj.targetPrices = callObj.targetPrices
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .slice(0, maxTargets);
    return callObj;
  });

  res.status(200).json({
    status: 'success',
    data: { calls: filteredCalls },
  });
});

/**
 * Get call history with pagination
 * GET /api/calls/history
 */
export const getCallHistory = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { commodity, tradeType, startDate, endDate } = req.query;

  const filter = {};
  if (commodity) {
    filter.commodity = commodity;
  }
  
  if (tradeType) {
    filter.tradeType = tradeType;
  }

  // Default range: last 7 days
  const defaultStartDate = moment.tz('Asia/Kolkata').subtract(7, 'days').startOf('day');
  
  filter.date = {
    $gte: startDate ? moment.tz(startDate, 'Asia/Kolkata').startOf('day').toDate() : defaultStartDate.toDate(),
    $lte: endDate ? moment.tz(endDate, 'Asia/Kolkata').endOf('day').toDate() : moment.tz('Asia/Kolkata').endOf('day').toDate(),
  };

  const [calls, total] = await Promise.all([
    Call.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v -createdBy'),
    Call.countDocuments(filter),
  ]);

  // Filter targets for history too? Usually yes.
  const maxTargets = req.user.subscription?.maxTargetsVisible || (req.user.subscription?.planTier === 'Regular' ? 2 : 6);

  const filteredCalls = calls.map(call => {
    const callObj = call.toObject();
    callObj.targetPrices = callObj.targetPrices
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .slice(0, maxTargets);
    return callObj;
  });

  res.status(200).json({
    status: 'success',
    ...formatPaginationResponse(filteredCalls, total, page, limit),
  });
});

/**
 * Get call performance stats
 * GET /api/calls/history/stats
 */
export const getCallStats = catchAsync(async (req, res) => {
  const stats = await Call.aggregate([
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        hitTarget: {
          $sum: { $cond: [{ $in: ['$status', ['partial_hit', 'all_hit']] }, 1, 0] },
        },
        allTargetsHit: {
          $sum: { $cond: [{ $eq: ['$status', 'all_hit'] }, 1, 0] },
        },
        hitStoploss: {
          $sum: { $cond: [{ $eq: ['$status', 'hit_stoploss'] }, 1, 0] },
        },
        activeCalls: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        expiredCalls: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
        },
      },
    },
  ]);

  const result = stats[0] || {
    totalCalls: 0,
    hitTarget: 0,
    allTargetsHit: 0,
    hitStoploss: 0,
    activeCalls: 0,
    expiredCalls: 0,
  };

  // Calculate accuracy ((partial or all hit) / (hit_target + hit_stoploss))
  const completedCalls = result.hitTarget + result.hitStoploss;
  const accuracy = completedCalls > 0 
    ? ((result.hitTarget / completedCalls) * 100).toFixed(2) 
    : 0;

  res.status(200).json({
    status: 'success',
    data: {
      ...result,
      accuracy: parseFloat(accuracy),
    },
  });
});

/**
 * Get stats by commodity
 * GET /api/calls/history/stats/by-commodity
 */
export const getStatsByCommodity = catchAsync(async (req, res) => {
  const stats = await Call.aggregate([
    {
      $group: {
        _id: '$commodity',
        totalCalls: { $sum: 1 },
        hitTarget: {
          $sum: { $cond: [{ $in: ['$status', ['partial_hit', 'all_hit']] }, 1, 0] },
        },
        hitStoploss: {
          $sum: { $cond: [{ $eq: ['$status', 'hit_stoploss'] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        commodity: '$_id',
        totalCalls: 1,
        hitTarget: 1,
        hitStoploss: 1,
        accuracy: {
          $cond: [
            { $eq: [{ $add: ['$hitTarget', '$hitStoploss'] }, 0] },
            0,
            {
              $multiply: [
                { $divide: ['$hitTarget', { $add: ['$hitTarget', '$hitStoploss'] }] },
                100,
              ],
            },
          ],
        },
        _id: 0,
      },
    },
    { $sort: { commodity: 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { stats },
  });
});

export default {
  createCall,
  getAllCalls,
  getCallById,
  updateCall,
  deleteCall,
  updateTargetStatus,
  getTodayCalls,
  getCallHistory,
  getCallStats,
  getStatsByCommodity,
};
