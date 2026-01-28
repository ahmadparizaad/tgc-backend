import Joi from 'joi';

export const createAdminUserSchema = Joi.object({
  fullName: Joi.string().required(),
  mobile: Joi.string().required().pattern(/^[0-9]{10}$/),
  password: Joi.string().required().min(6),
  city: Joi.string().allow('').optional(),
  
  // Subscription Options (Optional)
  planId: Joi.string().optional(),
  accessDuration: Joi.alternatives().try(
    Joi.string().valid('unlimited'),
    Joi.number().min(1)
  ).optional(),
  planTier: Joi.string().valid('Regular', 'Premium', 'International').optional(), // Only for custom duration
});
