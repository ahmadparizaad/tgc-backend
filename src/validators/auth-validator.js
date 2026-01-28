import Joi from 'joi';

// User login schema
export const loginSchema = Joi.object({
  displayId: Joi.string().optional(),
  mobile: Joi.string().pattern(/^[0-9]{10}$/).optional(),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
}).or('displayId', 'mobile').messages({ // Require at least one
  'object.missing': 'Either Display ID or Mobile Number is required'
});

// Refresh token schema
export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'string.empty': 'Refresh token is required',
    'any.required': 'Refresh token is required',
  }),
});

// Admin login schema
export const adminLoginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters',
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});

// Update FCM token schema
export const updateFcmTokenSchema = Joi.object({
  fcmToken: Joi.string().required().messages({
    'string.empty': 'FCM token is required',
    'any.required': 'FCM token is required',
  }),
});

// Pagination query schema
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

// User status update schema
export const userStatusSchema = Joi.object({
  isActive: Joi.boolean().required().messages({
    'any.required': 'isActive status is required',
  }),
});
