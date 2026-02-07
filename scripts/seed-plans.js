import mongoose from 'mongoose';
import env from '../src/config/env.js';
import connectDB from '../src/config/db.js';
import SubscriptionPlan from '../src/models/SubscriptionPlan.js';

const seedPlans = async () => {
    try {
        await connectDB();

        // Clear existing plans
        await SubscriptionPlan.deleteMany({});

        const plans = [
            // Regular Plans
            {
                name: 'Regular Daily',
                tier: 'Regular',
                durationDays: 1,
                durationLabel: '1 Day',
                price: 99,
                currency: 'INR',
                maxTargetsVisible: 2,
                reminderHours: 2
            },
            {
                name: 'Regular Weekly',
                tier: 'Regular',
                durationDays: 7,
                durationLabel: '7 Days',
                price: 499,
                currency: 'INR',
                maxTargetsVisible: 2,
                reminderHours: 24
            },
            // Premium Plans
            {
                name: 'Premium Daily',
                tier: 'Premium',
                durationDays: 1,
                durationLabel: '1 Day',
                price: 199,
                currency: 'INR',
                maxTargetsVisible: 6,
                reminderHours: 2
            },
            {
                name: 'Premium Weekly',
                tier: 'Premium',
                durationDays: 7,
                durationLabel: '7 Days',
                price: 999,
                currency: 'INR',
                maxTargetsVisible: 6,
                reminderHours: 24
            },
            // International Plans
            {
                name: 'International Weekly',
                tier: 'International',
                durationDays: 7,
                durationLabel: '7 Days',
                price: 1999,
                currency: 'INR',
                maxTargetsVisible: 6,
                reminderHours: 24
            }
        ];

        await SubscriptionPlan.insertMany(plans);
        console.log('Subscription plans seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding plans:', error);
        process.exit(1);
    }
};

seedPlans();
