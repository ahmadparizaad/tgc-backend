import mongoose from 'mongoose';
import moment from 'moment-timezone';
import connectDB from '../src/config/db.js';
import Call from '../src/models/Call.js';

/**
 * Migration: Convert all call dates from UTC midnight to IST midnight stored as UTC
 * 
 * Current: Dates stored as "2026-02-06T00:00:00.000Z" (UTC midnight)
 * Target: Dates stored as "2026-02-05T18:30:00.000Z" (IST midnight Feb 6 in UTC)
 * 
 * This ensures calls show up on the correct IST date.
 */
const fixCallDates = async () => {
  try {
    await connectDB();
    console.log('Connected to database...');

    // Get all calls - ensure date field is retrieved
    const calls = await Call.find({});
    console.log(`Found ${calls.length} calls to process...`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const call of calls) {
      try {
        if (!call.date) {
          console.log(`Skipping call ${call._id} - no date field`);
          skippedCount++;
          continue;
        }

        // Parse the current date and extract just the date part (ignoring time)
        // Then set it to IST midnight
        const currentDate = moment(call.date);
        const dateString = currentDate.format('YYYY-MM-DD'); // Extract date part
        
        // Convert to IST midnight, then to UTC
        const istMidnightAsUTC = moment.tz(dateString, 'Asia/Kolkata').startOf('day').toDate();
        
        // Debug first few
        if (updatedCount + skippedCount < 3) {
          console.log(`Call ${call._id}:`);
          console.log(`  Original: ${call.date.toISOString()}`);
          console.log(`  IST Date: ${dateString}`);
          console.log(`  New UTC:  ${istMidnightAsUTC.toISOString()}`);
        }
        
        // Check if conversion is needed (avoid unnecessary updates)
        if (call.date.getTime() !== istMidnightAsUTC.getTime()) {
          await Call.findByIdAndUpdate(call._id, { date: istMidnightAsUTC });
          updatedCount++;
          
          if (updatedCount % 10 === 0) {
            console.log(`Processed ${updatedCount} calls...`);
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error processing call ${call._id}:`, error.message);
        console.error(`  Date value:`, call.date);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total calls found: ${calls.length}`);
    console.log(`Calls updated: ${updatedCount}`);
    console.log(`Calls skipped (already correct): ${skippedCount}`);
    console.log('Migration completed successfully.');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

fixCallDates();
