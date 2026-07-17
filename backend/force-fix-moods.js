import { connectDB } from './config/db.js';
import Email from './models/Email.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Force-fix remaining merchandiser replies still stuck as "Angry"
 * These failed AI re-analysis due to token limits but are clearly
 * neutral professional IT emails (VOIP thread, CloudTalk thread).
 */
const forceFixRemaining = async () => {
  await connectDB();

  const remaining = await Email.find({ isReply: true, mood: 'Angry' });
  console.log(`Found ${remaining.length} merchandiser replies still marked as Angry.`);

  for (const email of remaining) {
    const body = (email.body || '').toLowerCase();
    
    // Determine correct mood based on content
    let newMood = 'Neutral'; // Default for professional IT emails
    if (body.includes('thank') || body.includes('noted with thanks') || body.includes('got it thanks')) {
      newMood = 'Happy';
    }

    console.log(`Fixing: "${email.subject?.substring(0, 60)}" | "${email.body?.substring(0, 50)}" → ${newMood}`);
    email.mood = newMood;
    await email.save();
  }

  console.log(`\n🎉 Done! Force-fixed ${remaining.length} remaining replies.`);
  process.exit(0);
};

forceFixRemaining();
