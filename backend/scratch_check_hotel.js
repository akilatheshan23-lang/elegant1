import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Email from './models/Email.js';
import { connectDB } from './config/db.js';

dotenv.config();

async function run() {
  await connectDB();
  
  try {
    const emails = await Email.find({ subject: { $regex: 'Hotel', $options: 'i' } });
    console.log(`Found ${emails.length} emails matching "Hotel":`);
    emails.forEach(email => {
      console.log(`ID: ${email._id} | Subject: ${email.subject} | Sender: ${email.sender} | Status: ${email.status} | isReply: ${email.isReply}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

run();
