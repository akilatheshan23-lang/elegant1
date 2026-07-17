import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Email from './models/Email.js';
import { connectDB } from './config/db.js';
import { analyzeEmail } from './services/gemini.js';

dotenv.config();

async function run() {
  await connectDB();
  
  try {
    const emails = await Email.find({});
    console.log(`Found ${emails.length} total emails to re-analyze.`);
    
    let updatedCount = 0;
    for (const email of emails) {
      // We only run analysis on customer emails, or we can run on replies too to determine mood
      console.log(`Analyzing [${email.subject}] from ${email.sender}...`);
      const analysis = await analyzeEmail(email.subject, email.sender, email.body);
      
      email.mood = analysis.mood;
      email.priority = analysis.priority;
      
      if (analysis.messageType) {
        email.messageType = analysis.messageType;
      }
      
      // Update summary and suggestedReply only if it's a customer email (not a reply)
      if (!email.isReply) {
        email.summary = analysis.summary;
        email.suggestedReply = analysis.suggestedReply;
      }
      
      await email.save();
      updatedCount++;
    }
    
    console.log(`Successfully re-analyzed and updated ${updatedCount} emails in the database.`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

run();
