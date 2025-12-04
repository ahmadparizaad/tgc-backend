import Joi from 'joi';

/**
 * Custom Joi extension for MongoDB ObjectId validation
 */
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * MongoDB ObjectId validation schema
 */
export const objectIdSchema = Joi.string()
  .pattern(objectIdPattern)
  .messages({
    'string.pattern.base': 'Invalid ID format',
  });

/**
 * Pagination query schema
 */
export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'mobile').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().trim().max(100).allow(''),
});

/**
 * User ID parameter schema
 */
export const userIdParamSchema = Joi.object({
  id: objectIdSchema.required().messages({
    'any.required': 'User ID is required',
  }),
});

/**
 * User status update schema
 */
export const updateUserStatusSchema = Joi.object({
  isActive: Joi.boolean().required().messages({
    'any.required': 'isActive status is required',
    'boolean.base': 'isActive must be a boolean',
  }),
});

/**
 * Manual subscription activation schema
 */
export const activateSubscriptionSchema = Joi.object({
  plan: Joi.string()
    .valid('daily', 'weekly')
    .required()
    .messages({
      'any.only': 'Plan must be either daily or weekly',
      'any.required': 'Plan is required',
    }),
  durationDays: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .messages({
      'number.min': 'Duration must be at least 1 day',
      'number.max': 'Duration cannot exceed 365 days',
    }),
});

/**
 * User search/filter query schema
 */
export const userFilterQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(''),
  isActive: Joi.boolean(),
  hasSubscription: Joi.boolean(),
  subscriptionPlan: Joi.string().valid('daily', 'weekly', 'custom'),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'mobile', 'subscription.endDate').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

/**
 * Create user schema (for admin)
 */
export const createUserSchema = Joi.object({
  fullName: Joi.string().trim().max(100).allow('', null).messages({
    'string.max': 'Full name cannot exceed 100 characters',
  }),
  mobile: Joi.string().trim().required().messages({
    'any.required': 'Mobile number is required',
    'string.empty': 'Mobile number cannot be empty',
  }),
  city: Joi.string().trim().max(100).allow('', null).messages({
    'string.max': 'City cannot exceed 100 characters',
  }),
  isActive: Joi.boolean().default(true),
  accessDays: Joi.number().integer().min(1).max(3650).messages({
    'number.min': 'Access days must be at least 1',
    'number.max': 'Access days cannot exceed 3650 (10 years)',
  }),
  isUnlimited: Joi.boolean().default(false),
}).custom((value, helpers) => {
  // Either accessDays or isUnlimited must be provided for subscription
  if (!value.isUnlimited && !value.accessDays) {
    // No subscription - that's fine
  }
  if (value.isUnlimited && value.accessDays) {
    return helpers.error('custom.conflictingFields');
  }
  return value;
}).messages({
  'custom.conflictingFields': 'Cannot set both accessDays and isUnlimited',
});

/**
 * Update user schema (for admin)
 */
export const updateUserSchema = Joi.object({
  fullName: Joi.string().trim().max(100).allow('', null).messages({
    'string.max': 'Full name cannot exceed 100 characters',
  }),
  mobile: Joi.string().trim().messages({
    'string.empty': 'Mobile number cannot be empty',
  }),
  city: Joi.string().trim().max(100).allow('', null).messages({
    'string.max': 'City cannot exceed 100 characters',
  }),
  isActive: Joi.boolean(),
  accessDays: Joi.number().integer().min(1).max(3650).messages({
    'number.min': 'Access days must be at least 1',
    'number.max': 'Access days cannot exceed 3650 (10 years)',
  }),
  isUnlimited: Joi.boolean(),
  extendSubscription: Joi.boolean().default(false).messages({
    'boolean.base': 'extendSubscription must be a boolean',
  }),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

export default {
  objectIdSchema,
  paginationQuerySchema,
  userIdParamSchema,
  updateUserStatusSchema,
  activateSubscriptionSchema,
  userFilterQuerySchema,
  createUserSchema,
  updateUserSchema,
};
