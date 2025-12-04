import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function removeNullFirebaseUid() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Find all documents and check each one
    const users = await db.collection('users').find({}).toArray();
    console.log(`Found ${users.length} users`);
    
    let updated = 0;
    for (const user of users) {
      if (user.firebaseUid === null || user.firebaseUid === undefined) {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $unset: { firebaseUid: "" } }
        );
        console.log(`  Removed firebaseUid from user: ${user.mobile}`);
        updated++;
      }
    }
    
    console.log(`\nUpdated ${updated} documents`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

removeNullFirebaseUid();
