import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function debugUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Get all users and show their firebaseUid status
    const users = await db.collection('users').find({}).toArray();
    console.log(`\nTotal users: ${users.length}`);
    
    users.forEach((user, i) => {
      const hasField = 'firebaseUid' in user;
      const value = user.firebaseUid;
      console.log(`\nUser ${i + 1}: ${user.mobile}`);
      console.log(`  - hasField: ${hasField}`);
      console.log(`  - value: ${value}`);
      console.log(`  - typeof: ${typeof value}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugUsers();
