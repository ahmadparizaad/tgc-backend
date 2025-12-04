import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkAndFixIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // List all indexes on users collection
    const indexes = await db.collection('users').indexes();
    console.log('\nCurrent indexes on users collection:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.sparse ? '(sparse)' : '');
    });

    // Check documents with firebaseUid
    const withNull = await db.collection('users').countDocuments({ firebaseUid: null });
    const withValue = await db.collection('users').countDocuments({ firebaseUid: { $ne: null, $exists: true } });
    const withoutField = await db.collection('users').countDocuments({ firebaseUid: { $exists: false } });
    
    console.log('\nDocument counts:');
    console.log(`  - With firebaseUid = null: ${withNull}`);
    console.log(`  - With firebaseUid value: ${withValue}`);
    console.log(`  - Without firebaseUid field: ${withoutField}`);

    // Remove firebaseUid field where it's null
    if (withNull > 0) {
      const result = await db.collection('users').updateMany(
        { firebaseUid: null },
        { $unset: { firebaseUid: "" } }
      );
      console.log(`\n✓ Removed firebaseUid field from ${result.modifiedCount} documents`);
    }

    // Drop the non-sparse index if it exists
    try {
      await db.collection('users').dropIndex('firebaseUid_1');
      console.log('✓ Dropped firebaseUid_1 index');
    } catch (e) {
      console.log('Index firebaseUid_1 not found (already dropped)');
    }

    // Create the sparse index manually
    await db.collection('users').createIndex(
      { firebaseUid: 1 },
      { unique: true, sparse: true, name: 'firebaseUid_1_sparse' }
    );
    console.log('✓ Created new sparse unique index on firebaseUid');

    // Verify indexes again
    const newIndexes = await db.collection('users').indexes();
    console.log('\nUpdated indexes:');
    newIndexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.sparse ? '(sparse)' : '');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAndFixIndexes();
