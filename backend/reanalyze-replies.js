import { connectDB } from './config/db.js';
import Email from './models/Email.js';
import { analyzeEmail } from './services/gemini.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Re-analyze all merchandiser sent replies that were incorrectly tagged
 * with "Angry" mood before the AI prompt was updated.
 */
const reanalyzeReplies = async () => {
  await connectDB();

  // Find all merchandiser replies that are currently marked as "Angry"
  const angryReplies = await Email.find({ isReply: true, mood: 'Angry' });
  console.log(`Found ${angryReplies.length} merchandiser replies incorrectly marked as Angry.`);

  let fixed = 0;
  for (const email of angryReplies) {
    try {
      // Get thread history for context
      const threadEmails = await Email.find({ threadId: email.threadId }).sort({ receivedAt: 1 }).lean();
      const threadHistory = threadEmails
        .filter(e => e._id.toString() !== email._id.toString())
        .map(e => ({ sender: e.sender, body: e.body }));

      console.log(`\nRe-analyzing: "${email.subject}" | Body: "${email.body?.substring(0, 80)}"`);

      // Re-analyze with isReply=true so the AI correctly evaluates the merchandiser's own tone
      const analysis = await analyzeEmail(email.subject, email.sender, email.body, threadHistory, true);

      const oldMood = email.mood;
      email.mood = analysis.mood;
      await email.save();
      fixed++;
      console.log(`  ✅ ${oldMood} → ${analysis.mood}`);

      // Small delay to avoid rate limiting on the AI API
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ❌ Failed to re-analyze ${email.messageId}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Done! Fixed ${fixed}/${angryReplies.length} merchandiser replies.`);
  process.exit(0);
};

reanalyzeReplies();
