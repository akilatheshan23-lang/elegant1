import mongoose from 'mongoose';
import Account from './models/Account.js';
import Email from './models/Email.js';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
  try {
    const connStr = process.env.MONGODB_URI || 'mongodb+srv://akilaelegant_db_user:cwhiqyun8PxBsrdQ@cluster0.ahe1ld1.mongodb.net/elegant';
    await mongoose.connect(connStr);
    console.log('--- DATABASE DIAGNOSTIC CHECK ---');
    
    const accounts = await Account.find({});
    console.log('Connected Accounts in DB:', JSON.stringify(accounts, null, 2));
    
    const emailsCount = await Email.countDocuments();
    console.log('Total Emails in DB:', emailsCount);
    
    const emails = await Email.find().sort({ receivedAt: -1 }).limit(10);
    console.log('Recent 10 Emails in DB:');
    emails.forEach(e => {
      console.log(`- From: ${e.sender} | To: ${e.receiver} | Subj: ${e.subject} | Date: ${e.receivedAt.toISOString()} | Status: ${e.status}`);
    });
    
  } catch (error) {
    console.error('Error during diagnostic check:', error);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
};
run();
