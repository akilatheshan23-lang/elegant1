import mongoose from 'mongoose';
import Email from './models/Email.js';
import Account from './models/Account.js';

const MONGODB_URI = 'mongodb+srv://akilaelegant_db_user:cwhiqyun8PxBsrdQ@cluster0.ahe1ld1.mongodb.net/elegant';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const accounts = await Account.find();
  const activeEmails = accounts.map(a => a.email.toLowerCase());
  console.log('Active accounts in DB:', activeEmails);

  // Mark any message sent by a connected account or mock merchandiser as a reply
  const result = await Email.updateMany(
    {
      $or: [
        { sender: { $in: activeEmails } },
        { sender: /akilaelegant/i },
        { sender: /merchandiser/i }
      ]
    },
    { $set: { isReply: true } }
  );

  console.log(`Completed cleanup. Marked ${result.modifiedCount} documents with isReply: true.`);
  await mongoose.disconnect();
}

run().catch(console.error);
