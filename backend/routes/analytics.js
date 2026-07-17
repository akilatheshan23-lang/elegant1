import express from 'express';
import Email from '../models/Email.js';
import Account from '../models/Account.js';

const router = express.Router();

// GET /api/analytics - Compile all dashboard statistics
router.get('/', async (req, res) => {
  try {
    // 1. High level counts (filtered by customer inquiries only, i.e., not a reply)
    const totalEmails = await Email.countDocuments({ isReply: { $ne: true } });
    const respondedEmails = await Email.countDocuments({ status: 'Responded', isReply: { $ne: true } });
    const pendingEmails = await Email.countDocuments({ status: 'Pending', isReply: { $ne: true } });
    const totalAccounts = await Account.countDocuments();

    const responseRate = totalEmails > 0 ? Math.round((respondedEmails / totalEmails) * 100) : 0;

    // 2. Average Response Time (aggregate over responded customer inquiries)
    const avgResponseTimeRes = await Email.aggregate([
      { $match: { status: 'Responded', responseTime: { $ne: null }, isReply: { $ne: true } } },
      { $group: { _id: null, avgTime: { $avg: '$responseTime' } } }
    ]);
    const avgResponseTime = avgResponseTimeRes.length > 0 ? Math.round(avgResponseTimeRes[0].avgTime) : 0;

    // 3. Sentiment Mood distribution
    const moodDistributionRes = await Email.aggregate([
      { $match: { isReply: { $ne: true } } },
      { $group: { _id: '$mood', count: { $sum: 1 } } }
    ]);
    const moods = { Happy: 0, Neutral: 0, Angry: 0 };
    moodDistributionRes.forEach(m => {
      if (m._id && m._id in moods) {
        moods[m._id] = m.count;
      }
    });

    // 4. Priority breakdown
    const priorityDistributionRes = await Email.aggregate([
      { $match: { isReply: { $ne: true } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    const priorities = { High: 0, Medium: 0, Low: 0 };
    priorityDistributionRes.forEach(p => {
      if (p._id && p._id in priorities) {
        priorities[p._id] = p.count;
      }
    });

    // 5. Volume trend (grouped by date of last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const volumeTrendRes = await Email.aggregate([
      { $match: { receivedAt: { $gte: sevenDaysAgo }, isReply: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt' } },
          total: { $sum: 1 },
          responded: { $sum: { $cond: [{ $eq: ['$status', 'Responded'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill in missing dates to make a continuous chart
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const match = volumeTrendRes.find(v => v._id === dateStr);
      trend.push({
        date: dateStr,
        emails: match ? match.total : 0,
        responded: match ? match.responded : 0,
      });
    }

    // 6. Leaderboard (grouped by merchandiser / receiver of the inquiries)
    const accounts = await Account.find({ status: { $ne: 'error' } });
    const leaderboard = [];

    for (const account of accounts) {
      const emailLower = account.email.toLowerCase();
      
      const stats = await Email.aggregate([
        { 
          $match: { 
            isReply: { $ne: true },
            receiver: { $regex: emailLower, $options: 'i' }
          } 
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            responded: { $sum: { $cond: [{ $eq: ['$status', 'Responded'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            avgResponseTime: { $avg: { $cond: [{ $eq: ['$status', 'Responded'] }, '$responseTime', null] } }
          }
        }
      ]);

      if (stats.length > 0) {
        const s = stats[0];
        const responseRate = s.total > 0 ? Math.round((s.responded / s.total) * 100) : 100;
        leaderboard.push({
          email: account.email,
          total: s.total,
          responded: s.responded,
          pending: s.pending,
          avgResponseTime: Math.round(s.avgResponseTime || 0),
          responseRate
        });
      } else {
        leaderboard.push({
          email: account.email,
          total: 0,
          responded: 0,
          pending: 0,
          avgResponseTime: 0,
          responseRate: 100
        });
      }
    }

    // Sort leaderboard by response rate descending, then average response time ascending
    leaderboard.sort((a, b) => b.responseRate - a.responseRate || a.avgResponseTime - b.avgResponseTime);

    res.json({
      summary: {
        totalEmails,
        respondedEmails,
        pendingEmails,
        totalAccounts,
        responseRate,
        avgResponseTime, // in minutes
      },
      sentiment: [
        { name: 'Happy', value: moods.Happy, color: '#10b981' },
        { name: 'Neutral', value: moods.Neutral, color: '#64748b' },
        { name: 'Angry', value: moods.Angry, color: '#ef4444' },
      ],
      priority: [
        { name: 'High', value: priorities.High, color: '#f59e0b' },
        { name: 'Medium', value: priorities.Medium, color: '#3b82f6' },
        { name: 'Low', value: priorities.Low, color: '#6b7280' },
      ],
      volumeTrend: trend,
      leaderboard,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compile analytics statistics', details: error.message });
  }
});

export default router;
