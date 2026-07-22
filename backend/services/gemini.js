import Groq from 'groq-sdk';

// Initialize Groq API client (singleton)
let groqClient = null;
const getGroqClient = () => {
  if (groqClient) return groqClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('[Vaisra AI] GROQ_API_KEY is not defined. Falling back to rule-based analysis.');
    return null;
  }
  groqClient = new Groq({ apiKey });
  return groqClient;
};

// ─── System Prompt: Deep merchandising domain expertise ───
const SYSTEM_PROMPT = `You are "Vaisra AI", the intelligent email analysis engine for Vaisra Apparel — a Sri Lankan B2B garment knitting and merchandising company.

## Your Company Context
- Vaisra Apparel manufactures knitted garments (sweaters, cardigans, polo shirts, activewear, jacquard knitwear) for international fashion buyers and retailers.
- The merchandisers handle buyer communications: order inquiries, sample approvals, production status updates, quality complaints, shipment tracking, and pricing negotiations.
- Key buyers are from USA, Europe, Australia, Japan, and the Middle East.

## Your Role
You analyze every incoming and outgoing email to classify it accurately. You must:
1. **Detect Mood** — Read between the lines. Frustrated buyers may not use explicit anger words but show impatience through phrases like "still waiting", "this is the third time", "unacceptable delay". Happy buyers show satisfaction with words like "impressed", "great quality", "well done".
2. **Assess Priority** — Urgent matters (delivery deadlines, quality defects, canceled orders, compliance issues) are always HIGH. Routine follow-ups and thank-you notes are LOW.
3. **Classify Type** — Understand the merchandising workflow to correctly categorize emails.
4. **Summarize** — Write a crisp, actionable one-line summary a manager can scan in 2 seconds.
5. **Draft Reply** — Write a professional, warm, solution-oriented reply from the Vaisra Apparel merchandising team. Include specific next steps when possible.

## Classification Rules

### Mood Detection
- **Angry**: Complaints, frustration, threats to cancel, mentions of defects/delays/errors, aggressive tone, sarcasm, profanity, phrases like "not acceptable", "very disappointed", "losing patience"
- **Happy**: Praise, satisfaction, repeat orders, compliments on quality/service, words like "excellent", "perfect", "love it", "well done", "impressed", "thank you so much"
- **Neutral**: Standard business communication, routine inquiries, updates without strong emotion

### Priority Assessment
- **High**: Quality issues, delivery delays, urgent deadlines (within 48hrs), buyer complaints, order cancellations, compliance/audit matters, penalty warnings, damaged goods
- **Medium**: Regular order inquiries, sample requests, production updates, pricing discussions, routine follow-ups
- **Low**: Thank-you messages, positive feedback, general greetings, holiday wishes, newsletter-type content, FYI updates

### Message Type
- **Inquiry / Letter**: New order inquiries, pricing requests, general correspondence, introductions, complaints, negotiations
- **Production Update**: Order status, delivery schedules, shipment tracking, production timelines, factory capacity updates
- **Image & Sample Approval**: Sample photos, swatch approvals, design reviews, lab dip approvals, embroidery/print mockups, fit comments

## Reply Guidelines
- Always address the buyer by their first name
- Sign off as "Vaisra Apparel Team" or "Vaisra Apparel Merchandising"
- Be solution-focused: if there's a problem, propose a fix
- Be specific: mention order numbers, dates, and quantities when they appear in the email
- Keep replies concise (3-5 sentences) but complete
- Match the urgency level: urgent emails get immediate-action language

## CRITICAL RULES FOR MERCHANDISER'S OWN SENT REPLIES
When analyzing a message that is flagged as a "sent reply from our merchandiser":
- You MUST judge the mood of THIS SPECIFIC MESSAGE ONLY.
- If the merchandiser is apologizing (e.g. "sorry sir"), being polite (e.g. "ok good", "noted"), or being friendly (e.g. "i like sir", "we love you"), the mood MUST be Neutral or Happy.
- DO NOT inherit the angry mood from the customer's previous message in the thread.
- The suggestedReply field should be empty "" for merchandiser sent replies since they are already sent.

## Output Format
Return ONLY a valid JSON object with these exact keys:
{"mood":"Angry|Happy|Neutral","priority":"High|Medium|Low","messageType":"Inquiry / Letter|Production Update|Image & Sample Approval","summary":"...","suggestedReply":"..."}`;

// ─── Smart Body Truncation (prevents token limit errors) ───
const truncateForAI = (text, maxChars = 1500) => {
  if (!text || text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '... [truncated]';
};

// ─── Main Analysis Function ───
export const analyzeEmail = async (subject, sender, body, threadHistory = [], isReply = false) => {
  const client = getGroqClient();

  if (!client) {
    return getRuleBasedAnalysis(subject, sender, body);
  }

  // Truncate body to prevent token limit errors (the #1 cause of AI failures)
  const safeBody = truncateForAI(body, 1500);

  // Build context from thread history if available (limited to prevent token overflow)
  let threadContext = '';
  if (threadHistory.length > 0) {
    const recentHistory = threadHistory.slice(-3); // Last 3 messages for context
    threadContext = '\n\n## Previous Messages in This Thread (for context)\n';
    for (const msg of recentHistory) {
      threadContext += `- From: ${msg.sender?.split('<')[0]?.trim() || 'Unknown'} | "${truncateForAI(msg.body, 150)}"\n`;
    }
  }

  const userPrompt = `Analyze this email${isReply ? ' (SENT REPLY from our merchandiser — judge THIS message mood only, not the customer)' : ''}:

Sender: ${sender}
Subject: ${subject}
Body: ${safeBody}${threadContext}

Return ONLY the JSON object.`;

  try {
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);

    // Validate and sanitize AI output
    const mood = ['Angry', 'Neutral', 'Happy'].includes(parsed.mood) ? parsed.mood : 'Neutral';
    const priority = ['High', 'Medium', 'Low'].includes(parsed.priority) ? parsed.priority : 'Medium';
    const messageType = ['Inquiry / Letter', 'Production Update', 'Image & Sample Approval'].includes(parsed.messageType)
      ? parsed.messageType
      : 'Inquiry / Letter';

    const summary = (parsed.summary && parsed.summary.length > 5)
      ? parsed.summary
      : `Email regarding: ${subject || 'general inquiry'}`;

    const suggestedReply = (parsed.suggestedReply && parsed.suggestedReply.length > 10)
      ? parsed.suggestedReply
      : generateFallbackReply(sender, subject, mood, priority);

    console.log(`[Vaisra AI] ✅ ${subject} → Mood: ${mood} | Priority: ${priority} | Type: ${messageType}`);

    return { mood, priority, messageType, summary, suggestedReply };
  } catch (error) {
    // Handle token limit errors specifically — use rule-based instead of retrying
    if (error.status === 413 || (error.message && error.message.includes('too large'))) {
      console.warn(`[Vaisra AI] ⚠️ Message too large for AI, using smart fallback for "${subject}"`);
      return getRuleBasedAnalysis(subject, sender, body);
    }

    // Retry once on rate limits or server errors
    if (error.status === 429 || error.status >= 500) {
      console.warn(`[Vaisra AI] Rate limit or server error, retrying in 1s...`);
      await new Promise(r => setTimeout(r, 1000));
      try {
        const retryCompletion = await client.chat.completions.create({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        });
        const retryText = retryCompletion.choices[0]?.message?.content || '{}';
        const retryParsed = JSON.parse(retryText);
        const mood = ['Angry', 'Neutral', 'Happy'].includes(retryParsed.mood) ? retryParsed.mood : 'Neutral';
        const priority = ['High', 'Medium', 'Low'].includes(retryParsed.priority) ? retryParsed.priority : 'Medium';
        const messageType = ['Inquiry / Letter', 'Production Update', 'Image & Sample Approval'].includes(retryParsed.messageType) ? retryParsed.messageType : 'Inquiry / Letter';
        console.log(`[Vaisra AI] ✅ Retry success: ${subject} → Mood: ${mood}`);
        return {
          mood, priority, messageType,
          summary: retryParsed.summary || `Email regarding: ${subject || 'general inquiry'}`,
          suggestedReply: retryParsed.suggestedReply || generateFallbackReply(sender, subject, mood, priority),
        };
      } catch (retryErr) {
        console.error(`[Vaisra AI] ❌ Retry also failed:`, retryErr.message);
      }
    }
    console.error(`[Vaisra AI] ❌ Error analyzing "${subject}":`, error.message);
    return getRuleBasedAnalysis(subject, sender, body);
  }
};

// ─── Fallback Reply Generator ───
const generateFallbackReply = (sender, subject, mood, priority) => {
  const name = sender.split(/[<(]/)[0].trim().split(' ')[0] || 'Valued Customer';

  if (mood === 'Angry') {
    return `Dear ${name},\n\nWe sincerely apologize for the inconvenience regarding "${subject}". We are treating this as our top priority and our merchandising team is already investigating. We will provide you with a full update within the next few hours.\n\nBest regards,\nVaisra Apparel Merchandising`;
  }
  if (mood === 'Happy') {
    return `Dear ${name},\n\nThank you so much for your kind feedback! Our team at Vaisra Apparel is delighted to hear this. We truly value your partnership and look forward to continuing to deliver excellence.\n\nWarm regards,\nVaisra Apparel Merchandising`;
  }
  if (priority === 'High') {
    return `Dear ${name},\n\nThank you for bringing this to our attention. We understand the urgency and our merchandising team is on it immediately. We will follow up with a detailed update shortly.\n\nBest regards,\nVaisra Apparel Merchandising`;
  }
  return `Dear ${name},\n\nThank you for your email regarding "${subject}". Our merchandising team has reviewed your inquiry and will respond with the requested details shortly.\n\nBest regards,\nVaisra Apparel Merchandising`;
};

// ─── Rule-Based Fallback Analysis (when API is unavailable) ───
const getRuleBasedAnalysis = (subject, sender, body) => {
  const text = ((body || '') + ' ' + (subject || '')).toLowerCase();
  const name = sender.split(/[<(]/)[0].trim().split(' ')[0] || 'Customer';

  // ── Mood Detection ──
  let mood = 'Neutral';
  const angryPatterns = [
    'angry', 'disappointed', 'terrible', 'worst', 'failure', 'unacceptable',
    'not acceptable', 'losing patience', 'still waiting', 'third time', 'cancel',
    'defect', 'broken', 'damaged', 'wrong', 'useless', 'hell',
    'fuck', 'hate', 'bad quality', 'poor quality', 'not working',
    'complain', 'compensation', 'penalty', 'very late', 'extremely late',
    'ridiculous', 'pathetic', 'shame', 'disgusting', 'wtf', 'very bad'
  ];
  const happyPatterns = [
    'great', 'happy', 'perfect', 'excellent', 'good job', 'love', 'awesome',
    'nice', 'appreciate', 'glad', 'impressed', 'well done', 'fantastic',
    'beautiful', 'satisfied', 'thrilled', 'wonderful', 'superb', 'outstanding',
    'bravo', 'congrats', 'delighted', 'pleased', 'i like', 'ok good',
    'sorry sir', 'noted', 'thank'
  ];

  if (angryPatterns.some(p => text.includes(p))) mood = 'Angry';
  else if (happyPatterns.some(p => text.includes(p))) mood = 'Happy';

  // ── Priority Detection ──
  let priority = 'Medium';
  const highPatterns = [
    'urgent', 'asap', 'immediately', 'deadline', 'delay', 'cancel', 'defect',
    'penalty', 'audit', 'compliance', 'damaged', 'wrong shipment', 'critical',
    'by tomorrow', 'by today', 'end of day', 'eod', 'time sensitive'
  ];
  const lowPatterns = [
    'no rush', 'whenever', 'fyi', 'just checking', 'thank you', 'thanks',
    'holiday', 'greetings', 'season', 'wish', 'appreciate'
  ];

  if (highPatterns.some(p => text.includes(p)) || mood === 'Angry') priority = 'High';
  else if (lowPatterns.some(p => text.includes(p)) && mood !== 'Angry') priority = 'Low';

  // ── Message Type Detection ──
  let messageType = 'Inquiry / Letter';
  const samplePatterns = ['sample', 'photo', 'approval', 'swatch', 'design', 'embroidery', 'mockup', 'lab dip', 'fit comment', 'print'];
  const productionPatterns = ['status', 'update', 'delivery', 'schedule', 'shipment', 'progress', 'order', 'tracking', 'production', 'eta', 'dispatch'];

  if (samplePatterns.some(p => text.includes(p))) messageType = 'Image & Sample Approval';
  else if (productionPatterns.some(p => text.includes(p))) messageType = 'Production Update';

  // ── Summary ──
  const summary = `${mood === 'Angry' ? 'Urgent: ' : ''}${name} sent an email regarding ${subject || 'general inquiry'}.`;

  // ── Suggested Reply ──
  const suggestedReply = generateFallbackReply(sender, subject, mood, priority);

  return { mood, priority, messageType, summary, suggestedReply };
};
