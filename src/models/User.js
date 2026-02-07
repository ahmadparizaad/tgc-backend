import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  displayId: {
    type: String,
    unique: true,
    index: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    select: false,
  },
  fullName: {
    type: String,
    trim: true,
    required: [true, 'Please provide your full name'],
  },
  mobile: {
    type: String,
    required: [true, 'Please provide your mobile number'],
    unique: true,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  subscription: {
    planTier: {
      type: String,
      enum: ['Regular', 'Premium', 'International', 'None'],
      default: 'None',
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isUnlimited: {
      type: Boolean,
      default: false,
    },
    maxTargetsVisible: {
      type: Number,
      default: 2,
    },
    reminderHours: {
      type: Number,
      default: 2,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
  },
  fcmToken: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// Index for subscription queries
userSchema.index({ 'subscription.isActive': 1, 'subscription.endDate': 1 });

// Generate displayId and hash password before saving
userSchema.pre('save', async function(next) {
  // Generate random 8-character hex for displayId only on creation
  if (this.isNew && !this.displayId) {
    this.displayId = crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  // Hash password only if modified
  if (!this.isModified('password')) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Virtual to check if subscription is valid
userSchema.virtual('hasActiveSubscription').get(function() {
  if (!this.subscription.isActive) {
    return false;
  }
  // Unlimited subscriptions (null endDate) or explicit isUnlimited are always active
  if (!this.subscription.endDate || this.subscription.isUnlimited) {
    return true;
  }
  return new Date() < this.subscription.endDate;
});

// Ensure virtuals are included in JSON output
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

export default User;
