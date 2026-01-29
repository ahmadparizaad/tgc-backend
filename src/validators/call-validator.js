import Joi from 'joi';

// Create call schema
export const createCallSchema = Joi.object({
  commodity: Joi.string()
    .valid('Gold', 'Silver', 'Copper', 'Crude', 'CMX Gold', 'CMX Silver', 'Custom')
    .required()
    .messages({
      'any.only': 'Invalid commodity name',
      'any.required': 'Commodity is required',
    }),
  customCommodity: Joi.string()
    .max(50)
    .pattern(/^[a-zA-Z0-9\s]+$/)
    .allow(null, '')
    .messages({
      'string.max': 'Custom commodity name too long',
      'string.pattern.base': 'Custom commodity name contains invalid characters',
    }),
  type: Joi.string()
    .valid('buy', 'sell')
    .required()
    .messages({
      'any.only': 'Type must be either buy or sell',
      'any.required': 'Type is required',
    }),
  entryPrice: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'Entry price must be a positive number',
      'any.required': 'Entry price is required',
    }),
  targetPrices: Joi.array()
    .items(Joi.object({
      price: Joi.number().positive().required(),
      label: Joi.string().required(),
      order: Joi.number().integer().min(1).default(1),
      isAcheived: Joi.boolean().default(false)
    }))
    .min(1)
    .max(6)
    .required()
    .messages({
      'array.min': 'At least one target price is required',
      'array.max': 'Exactly up to 6 target prices are allowed',
      'any.required': 'Target prices are required',
    }),
  stopLoss: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'Stop loss must be a positive number',
      'any.required': 'Stop loss is required',
    }),
  analysis: Joi.string()
    .required()
    .max(2000)
    .messages({
      'string.max': 'Analysis cannot exceed 2000 characters',
      'any.required': 'Analysis is required',
    }),
  date: Joi.date()
    .required()
    .messages({
      'date.base': 'Invalid date format',
      'any.required': 'Date is required',
    }),
  status: Joi.string()
    .valid('active', 'partial_hit', 'all_hit', 'hit_stoploss', 'expired')
    .default('active'),
});

// Update call schema
export const updateCallSchema = Joi.object({
  commodity: Joi.string()
    .valid('Gold', 'Silver', 'Copper', 'Crude', 'CMX Gold', 'CMX Silver', 'Custom'),
  customCommodity: Joi.string()
    .max(50)
    .pattern(/^[a-zA-Z0-9\s]+$/)
    .allow(null, ''),
  type: Joi.string()
    .valid('buy', 'sell'),
  entryPrice: Joi.number()
    .positive(),
  targetPrices: Joi.array()
    .items(Joi.object({
      _id: Joi.string(), // For updates
      price: Joi.number().positive(),
      label: Joi.string(),
      order: Joi.number().integer().min(1),
      isAcheived: Joi.boolean()
    }))
    .min(1)
    .max(6),
  stopLoss: Joi.number()
    .positive(),
  analysis: Joi.string()
    .max(2000),
  date: Joi.date(),
  status: Joi.string()
    .valid('active', 'partial_hit', 'all_hit', 'hit_stoploss', 'expired'),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

// Target status toggle schema
export const toggleTargetStatusSchema = Joi.object({
  isAcheived: Joi.boolean().required()
});

// Call list query schema
export const callListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  commodity: Joi.string().valid('Gold', 'Silver', 'Copper', 'Crude', 'CMX Gold', 'CMX Silver', 'Custom'),
  status: Joi.string().valid('active', 'partial_hit', 'all_hit', 'hit_stoploss', 'expired'),
  type: Joi.string().valid('buy', 'sell'),
  startDate: Joi.date(),
  endDate: Joi.date(),
  sortBy: Joi.string().valid('date', 'createdAt', 'commodity', 'status').default('date'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
