import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/emails.js';
import analyticsRoutes from './routes/analytics.js';
import { syncAllAccounts } from './services/sync.js';

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

// Real-time automatic background polling loop (runs every 2 seconds)
console.log('[Elegant AI] ⚡ Initializing ultra-fast background email polling (2s interval)...');
let isSyncing = false;
setInterval(async () => {
  if (isSyncing) return; // Previous sync still running, skip silently
  isSyncing = true;
  try {
    await syncAllAccounts();
  } catch (error) {
    console.error(`[Sync Loop] Background sync failed:`, error);
  } finally {
    isSyncing = false;
  }
}, 2000); // 2 seconds

// Start listening
app.listen(PORT, () => {
  console.log(`[Elegant AI] 🚀 Server running on port ${PORT}`);
  console.log(`[Elegant AI] ⚡ Auto-polling: every 2 seconds | Frontend polling: every 2 seconds`);
});
