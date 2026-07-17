import mongoose from 'mongoose';
import Email from './models/Email.js';

const MONGODB_URI = 'mongodb+srv://akilaelegant_db_user:cwhiqyun8PxBsrdQ@cluster0.ahe1ld1.mongodb.net/elegant';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const emails = await Email.find({
    $or: [
      { receiver: /akilatheshan23/i },
      { sender: /akilatheshan23/i }
    ]
  });

  console.log(`Found ${emails.length} matching emails:`);
  for (const e of emails) {
    console.log(`- ID: ${e._id} | MsgID: ${e.messageId} | Sender: ${e.sender} | Receiver: ${e.receiver} | Subject: ${e.subject} | Status: ${e.status} | Priority: ${e.priority} | HasSuggested: ${!!e.suggestedReply}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
