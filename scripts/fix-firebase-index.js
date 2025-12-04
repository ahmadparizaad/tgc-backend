import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function fixFirebaseUidIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // First, remove the firebaseUid field from all documents where it's null
    const updateResult = await db.collection('users').updateMany(
      { firebaseUid: null },
      { $unset: { firebaseUid: "" } }
    );
    console.log(`✓ Removed null firebaseUid from ${updateResult.modifiedCount} documents`);
    
    // Drop the existing index
    try {
      await db.collection('users').dropIndex('firebaseUid_1');
      console.log('✓ Dropped old firebaseUid index');
    } catch (e) {
      console.log('Index may not exist or already dropped:', e.message);
    }

    console.log('✓ Done! Restart your backend server to recreate the sparse index.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixFirebaseUidIndex();
