import express from 'express';
import { google } from 'googleapis';
import { getAuthUrl, getTokens, getOAuth2Client } from '../services/gmail.js';
import Account from '../models/Account.js';

const router = express.Router();

// GET /api/auth/google/url - Get Google consent page URL
router.get('/google/url', (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate OAuth URL', details: error.message });
  }
});

// GET /api/auth/google/callback - Redirect callback handler
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (!code) {
    return res.redirect(`${clientUrl}/accounts?error=missing_code`);
  }

  try {
    const tokens = await getTokens(code);
    
    // Get user info to retrieve email address
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      return res.redirect(`${clientUrl}/accounts?error=email_not_found`);
    }

    // Save tokens in MongoDB
    // refresh_token might only be returned on the first consent, but since we specify prompt: 'consent' and access_type: 'offline', it should always return refresh_token on flow triggers
    const accountData = {
      email,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
      status: 'active',
    };

    if (tokens.refresh_token) {
      accountData.refreshToken = tokens.refresh_token;
    }

    // Find and update or create new
    let account = await Account.findOne({ email });

    if (account) {
      // If we didn't receive a new refresh token (e.g. user re-authenticated without revoking), keep the old one
      if (!accountData.refreshToken) {
        accountData.refreshToken = account.refreshToken;
      }
      Object.assign(account, accountData);
      await account.save();
    } else {
      if (!accountData.refreshToken) {
        return res.redirect(`${clientUrl}/accounts?error=missing_refresh_token`);
      }
      account = new Account(accountData);
      await account.save();
    }

    console.log(`Successfully connected/updated Gmail account: ${email}`);
    res.redirect(`${clientUrl}/accounts?success=true&email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('Error during Google callback flow:', error);
    res.redirect(`${clientUrl}/accounts?error=auth_failed&details=${encodeURIComponent(error.message)}`);
  }
});

// GET /api/auth/accounts - List all connected accounts
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await Account.find({}, '-accessToken -refreshToken');
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch connected accounts', details: error.message });
  }
});

// DELETE /api/auth/accounts/:email - Remove a connected account
router.delete('/accounts/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const result = await Account.findOneAndDelete({ email });
    if (!result) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: `Successfully disconnected account: ${email}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect account', details: error.message });
  }
});

export default router;
