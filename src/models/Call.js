import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  commodity: {
    type: String,
    enum: ['Gold', 'Silver', 'Copper', 'Crude', 'CMX Gold', 'CMX Silver', 'Custom'],
    required: true,
    index: true,
  },
  customCommodity: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true,
  },
  entryPrice: {
    type: Number,
    required: true,
  },
  targetPrices: [{
    price: {
      type: Number,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      default: 1
    },
    isAcheived: {
      type: Boolean,
      default: false
    }
  }],
  stopLoss: {
    type: Number,
    required: true,
  },
  analysis: {
    type: String,
    trim: true,
    required: [true, 'Analysis/Rationale is required'],
  },
  tradeType: {
    type: String,
    enum: ['intraday', 'short_term'],
    default: 'intraday',
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'partial_hit', 'all_hit', 'hit_stoploss', 'expired'],
    default: 'active',
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
}, {
  timestamps: true,
});

// Compound index for date-based queries
callSchema.index({ date: -1, commodity: 1 });
callSchema.index({ status: 1, date: -1 });
callSchema.index({ tradeType: 1, date: -1 });
callSchema.index({ tradeType: 1, status: 1, date: -1 });

const Call = mongoose.model('Call', callSchema);

export default Call;
