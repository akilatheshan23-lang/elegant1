import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/emails.js';
import analyticsRoutes from './routes/analytics.js';
import { syncAllAccounts } from './services/sync.js';
import Account from './models/Account.js';
import { syncEmailsForAccount } from './services/sync.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ─── SMART PER-ACCOUNT POLLING ENGINE ───
// Business/Workspace accounts: poll every 10 seconds (high quota)
// Personal Gmail accounts: poll every 45 seconds (strict quota)
// This prevents personal accounts from getting rate-limited while
// keeping business accounts ultra-fast.

const BUSINESS_INTERVAL = 10000;  // 10 seconds for business accounts
const PERSONAL_INTERVAL = 10000;  // 10 seconds for personal Gmail (ultra-fast)

const accountSyncLocks = {};

const syncSingleAccount = async (account) => {
  const email = account.email;
  if (accountSyncLocks[email]) return; // Already syncing
  accountSyncLocks[email] = true;
  try {
    await syncEmailsForAccount(account);
  } catch (error) {
    console.error(`[Sync] Error syncing ${email}:`, error.message);
  } finally {
    accountSyncLocks[email] = false;
  }
};

const isBusinessAccount = (email) => {
  // Personal Gmail ends with @gmail.com or @googlemail.com
  const personal = ['@gmail.com', '@googlemail.com'];
  return !personal.some(suffix => email.toLowerCase().endsWith(suffix));
};

// Start the smart polling engine
const startSmartPolling = async () => {
  console.log('[Elegant AI] ⚡ Starting Smart Polling Engine...');
  console.log(`[Elegant AI] 🏢 Business accounts: every ${BUSINESS_INTERVAL / 1000}s`);
  console.log(`[Elegant AI] 📧 Personal accounts: every ${PERSONAL_INTERVAL / 1000}s`);

  // Business Polling Loop
  setInterval(async () => {
    try {
      const accounts = await Account.find({ status: { $ne: 'expired' } });
      for (const account of accounts) {
        if (isBusinessAccount(account.email)) {
          syncSingleAccount(account);
        }
      }
    } catch (err) {
      console.error('[Sync] Error in business polling loop:', err.message);
    }
  }, BUSINESS_INTERVAL);

  // Personal Polling Loop
  setInterval(async () => {
    try {
      const accounts = await Account.find({ status: { $ne: 'expired' } });
      for (const account of accounts) {
        if (!isBusinessAccount(account.email)) {
          syncSingleAccount(account);
        }
      }
    } catch (err) {
      console.error('[Sync] Error in personal polling loop:', err.message);
    }
  }, PERSONAL_INTERVAL);

  // Trigger an immediate sync on startup for all
  try {
    const accounts = await Account.find({ status: { $ne: 'expired' } });
    for (const account of accounts) {
      syncSingleAccount(account);
    }
  } catch (err) {
    console.error('[Sync] Error during initial startup sync:', err.message);
  }
};

// Wait for DB connection, then start polling
setTimeout(startSmartPolling, 3000);

// Start listening
app.listen(PORT, () => {
  console.log(`[Elegant AI] 🚀 Server running on port ${PORT}`);
  console.log(`[Elegant AI] ⚡ Smart per-account polling active | Frontend polling: every 2 seconds`);
});
