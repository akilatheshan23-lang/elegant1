import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import Account from './models/Account.js';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const account = await Account.findOne({ email: 'triage@elegantknitting.com.au' });
  if (!account) {
    console.log('Account not found');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://elegant1-snza.onrender.com/api/auth/google/callback'
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    const res = await gmail.users.messages.list({ userId: 'me', maxResults: 1 });
    console.log('SUCCESS');
  } catch (err) {
    console.log('ERROR:', JSON.stringify(err.errors, null, 2));
    console.log(err.message);
  }

  process.exit(0);
});
