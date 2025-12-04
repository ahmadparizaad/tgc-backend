import User from '../models/User.js';
import firebaseService from '../services/firebase-service.js';
import AppError from '../utils/app-error.js';
import { catchAsync } from '../utils/helpers.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middlewares/auth-middleware.js';

/**
 * Verify Firebase ID token and create/get user
 * POST /api/auth/verify-token
 */
export const verifyFirebaseToken = catchAsync(async (req, res) => {
  const { idToken } = req.body;
  
  // Verify Firebase ID token
  const decodedToken = await firebaseService.verifyIdToken(idToken);
  
  // Extract phone number from token
  const { uid, phone_number: phoneNumber } = decodedToken;
  
  if (!phoneNumber) {
    throw new AppError('Phone number not found in Firebase token', 400);
  }
  
  // Find user by firebaseUid first, then fallback to mobile (for admin-created users)
  let user = await User.findOne({ firebaseUid: uid });
  
  if (!user) {
    // Check if admin-created user exists with this mobile (no firebaseUid)
    user = await User.findOne({ mobile: phoneNumber, firebaseUid: null });
    
    if (user) {
      // Link admin-created user to Firebase account
      user.firebaseUid = uid;
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        firebaseUid: uid,
        mobile: phoneNumber,
      });
    }
  }
  
  // Check if user is active
  if (!user.isActive) {
    throw new AppError('Your account has been disabled', 403);
  }
  
  // Generate tokens
  const accessToken = generateAccessToken(user._id, 'user');
  const { token: refreshToken } = await generateRefreshToken(user._id, 'user', { ip: req.ip, userAgent: req.headers['user-agent'] });
  
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: user._id,
        mobile: user.mobile,
        isActive: user.isActive,
        subscription: user.subscription,
        hasActiveSubscription: user.hasActiveSubscription,
      },
      accessToken,
      refreshToken,
    },
  });
});

/**
 * Refresh access token using refresh token
 * POST /api/auth/refresh
 */
export const refreshAccessToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;
  
  // Verify refresh token
  let decoded; let tokenRecord;
  try {
    const verification = await verifyRefreshToken(refreshToken);
    decoded = verification.decoded;
    tokenRecord = verification.tokenRecord;
  } catch (error) {
    throw new AppError('Invalid or expired refresh token', 401);
  }
  
  // Check token type
  if (decoded.type !== 'user') {
    throw new AppError('Invalid token type', 401);
  }
  
  // Find user
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new AppError('User not found', 401);
  }
  
  // Check if user is active
  if (!user.isActive) {
    throw new AppError('Your account has been disabled', 403);
  }
  
  // Generate new tokens
  const newAccessToken = generateAccessToken(user._id, 'user');
  const { token: newRefreshToken, tokenRecord: newRefreshRecord } = await generateRefreshToken(user._id, 'user', { ip: req.ip, userAgent: req.headers['user-agent'] });

  // Revoke previous refresh token and mark rotation
  tokenRecord.revokedAt = new Date();
  tokenRecord.replacedBy = newRefreshRecord._id;
  await tokenRecord.save();
  
  res.status(200).json({
    status: 'success',
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    },
  });
});

/**
 * Logout (revoke refresh token)
 * POST /api/auth/logout
 */
export const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  let verification;
  try {
    verification = await verifyRefreshToken(refreshToken);
  } catch (error) {
    // If invalid, return success to avoid token fishing
    return res.status(200).json({ status: 'success' });
  }

  const { tokenRecord } = verification;
  tokenRecord.revokedAt = new Date();
  await tokenRecord.save();

  res.status(200).json({ status: 'success' });
});

export default {
  verifyFirebaseToken,
  refreshAccessToken,
  logout,
};
