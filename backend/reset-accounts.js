import { connectDB } from './config/db.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Account from './models/Account.js';

dotenv.config();

const resetAccounts = async () => {
  await connectDB();
  const result = await Account.updateMany({}, { status: 'active' });
  console.log(`Reset ${result.modifiedCount} accounts to active status.`);
  mongoose.connection.close();
};

resetAccounts();
