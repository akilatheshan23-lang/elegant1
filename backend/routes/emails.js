import express from 'express';
import Email from '../models/Email.js';
import { syncAllAccounts } from '../services/sync.js';
import { analyzeEmail } from '../services/gemini.js';

const router = express.Router();

// GET /api/emails - Get all emails with filters
router.get('/', async (req, res) => {
  const { mood, priority, status, search, receiver } = req.query;
  const filter = {};

  if (mood) filter.mood = mood;
  if (priority) filter.priority = priority;
  if (status) filter.status = status;
  if (receiver) filter.receiver = receiver;

  if (search) {
    filter.$or = [
      { sender: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
      { body: { $regex: search, $options: 'i' } },
    ];
  }

  try {
    const emails = await Email.find(filter).sort({ receivedAt: -1 });
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve emails', details: error.message });
  }
});

// GET /api/emails/threads - Group emails by threadId
router.get('/threads', async (req, res) => {
  try {
    const emails = await Email.find().sort({ receivedAt: 1 });
    
    // Group in memory for clean list structure
    const threadsMap = {};
    for (const email of emails) {
      if (!threadsMap[email.threadId]) {
        threadsMap[email.threadId] = {
          threadId: email.threadId,
          subject: email.subject,
          receiver: email.receiver,
          sender: email.sender,
          lastReceived: email.receivedAt,
          highestPriority: email.priority,
          dominantMood: email.mood,
          messageType: email.messageType || 'Inquiry / Letter',
          emails: [],
        };
      }
      
      threadsMap[email.threadId].emails.push(email);
      
      // Update thread properties based on latest email
      threadsMap[email.threadId].lastReceived = email.receivedAt;
      
      // Update priority, mood, and type only from customer messages
      if (email.priority) {
        if (email.priority === 'High') {
          threadsMap[email.threadId].highestPriority = 'High';
        } else if (email.priority === 'Medium' && (threadsMap[email.threadId].highestPriority === 'Low' || !threadsMap[email.threadId].highestPriority)) {
          threadsMap[email.threadId].highestPriority = 'Medium';
        } else if (!threadsMap[email.threadId].highestPriority) {
          threadsMap[email.threadId].highestPriority = email.priority;
        }
      }
      
      // Update mood and type ONLY from customer messages (not merchandiser replies)
      // This ensures thread shows the CUSTOMER's mood, not the merchandiser's polite reply
      if (email.mood && !email.isReply) {
        // Angry always takes priority — if any customer email is angry, the thread is angry
        if (email.mood === 'Angry') {
          threadsMap[email.threadId].dominantMood = 'Angry';
        } else if (threadsMap[email.threadId].dominantMood !== 'Angry') {
          threadsMap[email.threadId].dominantMood = email.mood;
        }
      }

      if (email.messageType && !email.isReply) {
        threadsMap[email.threadId].messageType = email.messageType;
      }
    }

    const threads = Object.values(threadsMap).sort((a, b) => new Date(b.lastReceived) - new Date(a.lastReceived));
    res.json(threads);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve conversation threads', details: error.message });
  }
});

// POST /api/emails/sync - Trigger manual sync for all active accounts
router.post('/sync', async (req, res) => {
  try {
    console.log('Manual sync triggered via API endpoint');
    const syncResults = await syncAllAccounts();
    res.json({ message: 'Sync complete', results: syncResults });
  } catch (error) {
    res.status(500).json({ error: 'Sync operation failed', details: error.message });
  }
});

// POST /api/emails/threads/:threadId/respond - Manually mark a thread as Responded
router.post('/threads/:threadId/respond', async (req, res) => {
  const { threadId } = req.params;
  try {
    const emails = await Email.find({ threadId }).sort({ receivedAt: 1 });
    if (emails.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Calculate response time from the first email received in the thread
    const firstEmail = emails[0];
    const now = new Date();
    const responseTimeMinutes = Math.max(0, Math.round((now - firstEmail.receivedAt) / 60000));

    // Update all emails in this thread to Responded
    await Email.updateMany(
      { threadId },
      {
        $set: {
          status: 'Responded',
          respondedAt: now,
          responseTime: responseTimeMinutes
        }
      }
    );

    console.log(`Thread ${threadId} manually marked as Responded (Response Time: ${responseTimeMinutes}m)`);
    res.json({ message: 'Thread marked as responded successfully', responseTime: responseTimeMinutes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark thread as responded', details: error.message });
  }
});

// DELETE /api/emails/:id - Delete an email log
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await Email.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Email not found' });
    }
    res.json({ message: 'Email successfully deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete email', details: error.message });
  }
});

// DELETE /api/emails/threads/:threadId - Delete all emails in a thread
router.delete('/threads/:threadId', async (req, res) => {
  const { threadId } = req.params;
  try {
    const result = await Email.deleteMany({ threadId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }
    console.log(`Thread ${threadId} deleted (${result.deletedCount} emails removed)`);
    res.json({ message: `Thread deleted successfully (${result.deletedCount} emails removed)` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete thread', details: error.message });
  }
});

// POST /api/emails/mock - Generate custom mock data for Akila Elegant demonstration
router.post('/mock', async (req, res) => {
  try {
    // Clear all existing emails from the database
    console.log('Clearing all previous email database entries...');
    await Email.deleteMany({});

    const mockEmails = [
      {
        messageId: 'mock_msg_101',
        threadId: 'mock_thread_101',
        sender: 'John Miller <john.miller@usaretailers.com>',
        receiver: 'akilaelegant@gmail.com',
        subject: 'URGENT: Sample approval for Elegant Knitting order #EK-2026',
        body: 'Dear Akila, We are waiting for the final sample approval of the knitted jacquard sweaters under order #EK-2026. The shipment schedule is very tight, and if we do not approve the samples by tomorrow, we will miss our fall launch. Please send the high-res photos and courier tracking number immediately.',
        receivedAt: new Date(Date.now() - 2.5 * 3600 * 1000), // 2.5 hrs ago
        mood: 'Angry',
        priority: 'High',
        summary: 'Customer is demanding sample photos and courier tracking from Akila for jacquard order #EK-2026 to prevent missing their fall product launch.',
        suggestedReply: 'Dear John, I sincerely apologize for the delay. The samples were knitted yesterday and have been dispatched via DHL (Tracking Number: DHL-7892154). I have attached high-resolution photos of the chest embroidery and seam stitching for your preliminary approval. Let me know if you need anything else.',
        status: 'Pending',
      },
      {
        messageId: 'mock_msg_102',
        threadId: 'mock_thread_102',
        sender: 'Sophie Laurent <sophie@parisboutique.fr>',
        receiver: 'akilaelegant@gmail.com',
        subject: 'Feedback: Cardigans shipment arrived at Paris Boutique!',
        body: 'Hello Akila, I wanted to let you know that the container of cotton knit cardigans arrived yesterday. The silver linings look extremely elegant and the hand-feel of the yarn is exactly what our customers wanted. Excellent work by the Elegant Knitting team. We are drafting the next order sheet for 2,000 units.',
        receivedAt: new Date(Date.now() - 5 * 3600 * 1000), // 5 hrs ago
        mood: 'Happy',
        priority: 'Low',
        summary: 'Sophie Laurent praises Akila and the team for cardigan quality (yarn hand-feel and silver linings) and promises a new order for 2,000 units.',
        suggestedReply: 'Dear Sophie, Thank you so much for your wonderful feedback! The knitting and QC teams are thrilled to hear that the cardigans exceeded your expectations. We look forward to receiving your new order details and will pre-book production slots for you. Best regards.',
        status: 'Responded',
        respondedAt: new Date(Date.now() - 4.5 * 3600 * 1000), // replied in 30 mins
        responseTime: 30,
      },
      {
        messageId: 'mock_msg_103',
        threadId: 'mock_thread_103',
        sender: 'Kenji Sato <sato@tokyo-active.jp>',
        receiver: 'akilaelegant@gmail.com',
        subject: 'Inquiry: Bamboo fiber knit fabric specs',
        body: 'Dear Akila, We are designing a new sportswear line and want to inquire if Elegant Knitting can knit bamboo fiber blends. What is the minimum order quantity (MOQ) for bamboo-cotton blends and what fabric weight (GSM) options do you support? Best regards, Sato.',
        receivedAt: new Date(Date.now() - 18 * 3600 * 1000), // 18 hrs ago
        mood: 'Neutral',
        priority: 'Medium',
        summary: 'Kenji Sato inquires about bamboo fiber blends fabric options, MOQ, and GSM weights for a new sports design.',
        suggestedReply: 'Dear Sato-san, Thank you for contacting Elegant Knitting. Yes, we support bamboo-cotton blends (typically 70/30 ratios). Our MOQ is 500kg per dye batch, and we can knit weights from 140 GSM to 280 GSM. I am emailing our digital catalog and yarn technical sheets now.',
        status: 'Responded',
        respondedAt: new Date(Date.now() - 16 * 3600 * 1000), // replied in 2 hours
        responseTime: 120,
      },
      {
        messageId: 'mock_msg_104',
        threadId: 'mock_thread_104',
        sender: 'Marcus Aurelius <marcus@nordicfashion.se>',
        receiver: 'akilaelegant@gmail.com',
        subject: 'Quality Issue: Defective necklines in V-neck knitwear order #EK-3012',
        body: 'Hello Akila, We received V-neck sweaters under order #EK-3012 today. While inspecting, we noticed that around 15% of the garments have loose threads around the collar, making them look unfinished. This is a quality assurance failure. How do you intend to compensate us for this? We cannot sell these.',
        receivedAt: new Date(Date.now() - 28 * 3600 * 1000), // 28 hrs ago
        mood: 'Angry',
        priority: 'High',
        summary: 'Customer reports 15% defective collars with loose sewing threads in Batch #3 V-neck sweaters under order #EK-3012 and requests compensation.',
        suggestedReply: 'Dear Marcus, We are deeply sorry for this defect. This does not represent our standard. Please send a photo of the defects so we can log it with QC. We will issue a credit note for the defective 15% immediately, or we can rush-knitted replacements and ship them via air freight next week. Please advise.',
        status: 'Pending',
      },
      {
        messageId: 'mock_msg_105',
        threadId: 'mock_thread_105',
        sender: 'Sarah Jenkins <s.jenkins@activewear.au>',
        receiver: 'akilaelegant@gmail.com',
        subject: 'Updates on Fall Jacquard sample swatches?',
        body: 'Hi Akila, just checking if you have sample swatches ready for the new Fall Jacquard patterns. You mentioned last week that they would be ready for dispatch by today. Please send tracking if they are on the way.',
        receivedAt: new Date(Date.now() - 44 * 3600 * 1000), // 44 hrs ago
        mood: 'Neutral',
        priority: 'Medium',
        summary: 'Sarah Jenkins inquires if the Fall Jacquard samples swatches promised last week are ready and asks for courier tracking.',
        suggestedReply: 'Hi Sarah, Yes, the jacquard sample swatches were dispatched via DHL Express this morning. The tracking number is DHL-92817452. They should arrive in Sydney by Friday. Let me know if you need anything else.',
        status: 'Responded',
        respondedAt: new Date(Date.now() - 42.5 * 3600 * 1000), // replied in 1.5 hours
        responseTime: 90,
      },
      // Seeded Merchandiser Replies for completed threads
      {
        messageId: 'mock_reply_102',
        threadId: 'mock_thread_102',
        sender: 'akilaelegant@gmail.com',
        receiver: 'Sophie Laurent <sophie@parisboutique.fr>',
        subject: 'Re: Feedback: Cardigans shipment arrived at Paris Boutique!',
        body: 'Dear Sophie, Thank you so much for your wonderful feedback! The knitting and QC teams are thrilled to hear that the cardigans exceeded your expectations. We look forward to receiving your new order details and will pre-book production slots for you. Best regards.',
        receivedAt: new Date(Date.now() - 4.5 * 3600 * 1000), // replied in 30 mins
        status: 'Responded',
        isReply: true,
        mood: 'Happy',
      },
      {
        messageId: 'mock_reply_103',
        threadId: 'mock_thread_103',
        sender: 'akilaelegant@gmail.com',
        receiver: 'Kenji Sato <sato@tokyo-active.jp>',
        subject: 'Re: Inquiry: Bamboo fiber knit fabric specs',
        body: 'Dear Sato-san, Thank you for contacting Elegant Knitting. Yes, we support bamboo-cotton blends (typically 70/30 ratios). Our MOQ is 500kg per dye batch, and we can knit weights from 140 GSM to 280 GSM. I am emailing our digital catalog and yarn technical sheets now.',
        receivedAt: new Date(Date.now() - 16 * 3600 * 1000), // replied in 2 hours
        status: 'Responded',
        isReply: true,
        mood: 'Neutral',
      },
      {
        messageId: 'mock_reply_105',
        threadId: 'mock_thread_105',
        sender: 'akilaelegant@gmail.com',
        receiver: 'Sarah Jenkins <s.jenkins@activewear.au>',
        subject: 'Re: Updates on Fall Jacquard sample swatches?',
        body: 'Hi Sarah, Yes, the jacquard sample swatches were dispatched via DHL Express this morning. The tracking number is DHL-92817452. They should arrive in Sydney by Friday. Let me know if you need anything else.',
        receivedAt: new Date(Date.now() - 42.5 * 3600 * 1000), // replied in 1.5 hours
        status: 'Responded',
        isReply: true,
        mood: 'Neutral',
      },
      // Seeded Akila Elegant Office work thread matching screenshots
      {
        messageId: 'mock_msg_201',
        threadId: 'mock_thread_201',
        sender: 'Theshan Akila <akilatheshan23@gmail.com>',
        receiver: 'akilaelegant@gmail.com',
        subject: 'Office work',
        body: 'What the fuck this work?',
        receivedAt: new Date(Date.now() - 6 * 3600 * 1000),
        mood: 'Angry',
        priority: 'High',
        summary: 'Customer is demanding status updates on his office knit orders and is extremely frustrated with the communication delays.',
        suggestedReply: 'Dear Theshan, I sincerely apologize for the delay. We are finalizing the knitting batch and will have it ready for delivery tomorrow morning. I will send you the delivery note as soon as it leaves the factory.',
        status: 'Responded',
        respondedAt: new Date(Date.now() - 5.8 * 3600 * 1000),
        responseTime: 5,
      },
      {
        messageId: 'mock_msg_202',
        threadId: 'mock_thread_201',
        sender: 'akilaelegant@gmail.com',
        receiver: 'Theshan Akila <akilatheshan23@gmail.com>',
        subject: 'Re: Office work',
        body: 'ok sorry',
        receivedAt: new Date(Date.now() - 5.8 * 3600 * 1000),
        status: 'Responded',
        isReply: true,
        mood: 'Happy',
      },
      {
        messageId: 'mock_msg_203',
        threadId: 'mock_thread_201',
        sender: 'akilaelegant@gmail.com',
        receiver: 'Theshan Akila <akilatheshan23@gmail.com>',
        subject: 'Re: Office work',
        body: 'ok buddy witee',
        receivedAt: new Date(Date.now() - 5.5 * 3600 * 1000),
        status: 'Responded',
        isReply: true,
        mood: 'Happy',
      }
    ];

    const inserted = [];
    for (const email of mockEmails) {
      const doc = new Email(email);
      await doc.save();
      inserted.push(doc);
    }

    res.json({ message: `Successfully cleared database and generated mock data. Inserted ${inserted.length} records.`, count: inserted.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate mock data', details: error.message });
  }
});

export default router;
