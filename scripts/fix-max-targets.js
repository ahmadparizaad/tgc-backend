import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import User from '../src/models/User.js';

/**
 * Migration: Cap maxTargetsVisible to 6 for all non-Regular users
 * and fix any users with the hardcoded 99 value.
 */
const migrateMaxTargets = async () => {
  try {
    await connectDB();
    console.log('Connected to database...');

    // 1. Update users who have 99 (the old hardcoded value)
    const result99 = await User.updateMany(
      { 'subscription.maxTargetsVisible': 99 },
      { $set: { 'subscription.maxTargetsVisible': 6 } }
    );
    console.log(`Updated ${result99.modifiedCount} users who had 99 targets visible.`);

    // 2. Ensure all Premium/International users are capped at 6 if they somehow have more
    const resultTiers = await User.updateMany(
      { 
        'subscription.planTier': { $in: ['Premium', 'International'] },
        'subscription.maxTargetsVisible': { $gt: 6 }
      },
      { $set: { 'subscription.maxTargetsVisible': 6 } }
    );
    console.log(`Updated ${resultTiers.modifiedCount} Premium/International users who had > 6 targets.`);

    // 3. Optional: Fix Regular users who might have > 2
    const resultRegular = await User.updateMany(
      { 
        'subscription.planTier': 'Regular',
        'subscription.maxTargetsVisible': { $gt: 2 }
      },
      { $set: { 'subscription.maxTargetsVisible': 2 } }
    );
    console.log(`Updated ${resultRegular.modifiedCount} Regular users who had > 2 targets.`);

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateMaxTargets();
