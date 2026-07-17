import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Account from './models/Account.js';
import Email from './models/Email.js';
import { syncEmailsForAccount } from './services/sync.js';
import { connectDB } from './config/db.js';

dotenv.config();

async function run() {
  await connectDB();
  
  try {
    const accounts = await Account.find();
    console.log('--- Connected Accounts ---');
    accounts.forEach(acc => {
      console.log(`Email: ${acc.email} | Status: ${acc.status} | LastSync: ${acc.lastSync} | ExpiryDate: ${acc.expiryDate}`);
    });
    
    console.log('\n--- Running Sync ---');
    for (const acc of accounts) {
      console.log(`Syncing for ${acc.email}...`);
      const result = await syncEmailsForAccount(acc);
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('Script Error:', err);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

run();
