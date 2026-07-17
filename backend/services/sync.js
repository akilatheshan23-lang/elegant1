import Account from '../models/Account.js';
import Email from '../models/Email.js';
import { getGmailClient, fetchRecentEmails, getOAuth2Client, parseMessageBody, cleanEmailAddress } from './gmail.js';
import { analyzeEmail } from './gemini.js';

export const syncEmailsForAccount = async (account) => {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiryDate,
    });

    const isExpired = account.expiryDate ? Date.now() >= account.expiryDate - 60000 : true;
    
    if (isExpired) {
      console.log(`Token expired for ${account.email}, refreshing...`);
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      account.accessToken = credentials.access_token;
      account.expiryDate = credentials.expiry_date;
      if (credentials.refresh_token) {
        account.refreshToken = credentials.refresh_token;
      }
      account.status = 'active';
      await account.save();
      console.log(`Token refreshed successfully for ${account.email}`);
    }

    const gmail = getGmailClient({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiryDate,
    });

    const recentEmails = await fetchRecentEmails(gmail, account.lastSync);

    let newEmailsCount = 0;
    
    // Track thread IDs we have already processed in this sync cycle
    const processedThreadIds = new Set();

    for (const emailData of recentEmails) {
      if (processedThreadIds.has(emailData.threadId)) continue;
      processedThreadIds.add(emailData.threadId);

      // ─── ULTRA-FAST PATH: Check DB before hitting Gmail API ───
      // This single DB query is ~1ms vs ~200ms for a Gmail API call
      const latestMessageSynced = await Email.exists({ messageId: emailData.id });
      const hasPendingInThread = await Email.exists({ threadId: emailData.threadId, status: 'Pending' });

      // If latest message is already synced AND nothing pending needs updating, skip entirely
      if (latestMessageSynced && !hasPendingInThread) {
        continue;
      }

      // ─── This thread needs syncing — fetch full details from Gmail ───
      let threadRes;
      try {
        threadRes = await gmail.users.threads.get({
          userId: 'me',
          id: emailData.threadId,
        });
      } catch (threadErr) {
        console.warn(`Failed to fetch thread ${emailData.threadId}: ${threadErr.message}`);
        continue;
      }

      const messages = threadRes.data.messages || [];
      messages.sort((a, b) => parseInt(a.internalDate) - parseInt(b.internalDate));

      // Quick check: if ALL messages are already synced AND no pending, skip
      const existingCount = await Email.countDocuments({ 
        messageId: { $in: messages.map(m => m.id) } 
      });
      if (existingCount === messages.length && !hasPendingInThread) {
        continue;
      }

      // ─── Sync each message in the thread ───
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        let emailDoc = await Email.findOne({ messageId: msg.id });

        if (!emailDoc) {
          // Parse message headers
          const headers = msg.payload.headers || [];
          const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
          const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
          const toHeader = headers.find(h => h.name.toLowerCase() === 'to');
          const ccHeader = headers.find(h => h.name.toLowerCase() === 'cc');
          const bccHeader = headers.find(h => h.name.toLowerCase() === 'bcc');
          const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');

          const subject = subjectHeader ? subjectHeader.value : '(No Subject)';
          const sender = fromHeader ? fromHeader.value : '';
          const receiver = toHeader ? toHeader.value : (ccHeader ? ccHeader.value : (bccHeader ? bccHeader.value : 'Unknown'));
          const dateStr = dateHeader ? dateHeader.value : new Date().toISOString();
          const receivedAt = new Date(dateStr);

          const rawBody = parseMessageBody(msg.payload);
          const body = rawBody.replace(/\s+/g, ' ').trim();

          const fromEmail = cleanEmailAddress(sender);
          const isFromMerchandiser = fromEmail === account.email.toLowerCase();

          // Build thread history from previously synced emails in this thread
          const existingThreadEmails = await Email.find({ threadId: emailData.threadId }).sort({ receivedAt: 1 }).lean();
          const threadHistory = existingThreadEmails.map(e => ({ sender: e.sender, body: e.body }));

          if (isFromMerchandiser) {
            // It's a sent reply from the merchandiser
            console.log(`Analyzing merchandiser reply: "${subject}"`);
            const analysis = await analyzeEmail(subject, sender, body, threadHistory, true);
            emailDoc = new Email({
              messageId: msg.id,
              threadId: emailData.threadId,
              sender,
              receiver,
              subject,
              body,
              receivedAt,
              status: 'Responded',
              isReply: true,
              mood: analysis.mood,
            });
            await emailDoc.save();
            newEmailsCount++;
            console.log(`✅ Synced reply: "${subject}" (Mood: ${analysis.mood})`);
          } else {
            // It's an incoming customer message
            // Find if there is a reply from the merchandiser chronologically after this message
            let responseCheck = { responded: false };
            for (let j = i + 1; j < messages.length; j++) {
              const nextMsg = messages[j];
              const nextHeaders = nextMsg.payload.headers || [];
              const nextFromHeader = nextHeaders.find(h => h.name.toLowerCase() === 'from');
              const nextFromEmail = cleanEmailAddress(nextFromHeader ? nextFromHeader.value : '');
              if (nextFromEmail === account.email.toLowerCase()) {
                const incomingTime = parseInt(msg.internalDate);
                const replyTime = parseInt(nextMsg.internalDate);
                const responseTimeMinutes = Math.max(0, Math.round((replyTime - incomingTime) / 60000));
                responseCheck = {
                  responded: true,
                  respondedAt: new Date(replyTime),
                  responseTime: responseTimeMinutes,
                };
                break;
              }
            }

            console.log(`Analyzing customer email: "${subject}" from ${sender}`);
            const analysis = await analyzeEmail(subject, sender, body, threadHistory);

            emailDoc = new Email({
              messageId: msg.id,
              threadId: emailData.threadId,
              sender,
              receiver,
              subject,
              body,
              receivedAt,
              mood: analysis.mood,
              priority: analysis.priority,
              messageType: analysis.messageType,
              summary: analysis.summary,
              suggestedReply: analysis.suggestedReply,
              status: responseCheck.responded ? 'Responded' : 'Pending',
              respondedAt: responseCheck.responded ? responseCheck.respondedAt : null,
              responseTime: responseCheck.responded ? responseCheck.responseTime : null,
            });
            await emailDoc.save();
            newEmailsCount++;
          }
        } else {
          // Email document exists in our DB, check if its status needs updating from Pending to Responded
          if (emailDoc.status === 'Pending') {
            // Check if there is a response later in the thread
            let responseCheck = { responded: false };
            for (let j = i + 1; j < messages.length; j++) {
              const nextMsg = messages[j];
              const nextHeaders = nextMsg.payload.headers || [];
              const nextFromHeader = nextHeaders.find(h => h.name.toLowerCase() === 'from');
              const nextFromEmail = cleanEmailAddress(nextFromHeader ? nextFromHeader.value : '');
              if (nextFromEmail === account.email.toLowerCase()) {
                const incomingTime = parseInt(msg.internalDate);
                const replyTime = parseInt(nextMsg.internalDate);
                const responseTimeMinutes = Math.max(0, Math.round((replyTime - incomingTime) / 60000));
                responseCheck = {
                  responded: true,
                  respondedAt: new Date(replyTime),
                  responseTime: responseTimeMinutes,
                };
                break;
              }
            }

            if (responseCheck.responded) {
              emailDoc.status = 'Responded';
              emailDoc.respondedAt = responseCheck.respondedAt;
              emailDoc.responseTime = responseCheck.responseTime;
              await emailDoc.save();
              console.log(`📨 Status updated: "${emailDoc.subject}" → Responded (${responseCheck.responseTime}m)`);
            }
          }
        }
      }
    }

    // Update account lastSync
    account.lastSync = new Date();
    account.status = 'active';
    await account.save();
    
    if (newEmailsCount > 0) {
      console.log(`🎉 Sync completed for ${account.email}. Added ${newEmailsCount} new messages.`);
    }
    return { success: true, email: account.email, added: newEmailsCount };
  } catch (error) {
    console.error(`Sync failed for ${account.email}:`, error);
    
    // Only mark account as error (expired) if it's an authentication issue
    const errMsg = (error.message || '').toLowerCase();
    if (errMsg.includes('invalid_grant') || errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('unauthorized')) {
      account.status = 'error';
      await account.save();
    }
    
    return { success: false, email: account.email, error: error.message };
  }
};

export const syncAllAccounts = async () => {
  const accounts = await Account.find({ status: { $ne: 'expired' } });
  const results = await Promise.all(accounts.map(account => syncEmailsForAccount(account)));
  return results;
};
