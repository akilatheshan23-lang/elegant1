import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '715303954771-8d8s500rqmc2oj96saq1d97abh6m95tc.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

export const getOAuth2Client = () => {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
};

export const getAuthUrl = () => {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });
};

export const getTokens = async (code) => {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

export const getGmailClient = (tokens) => {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

// Helper function to recursively find and decode body content
export const parseMessageBody = (payload) => {
  if (!payload) return '';
  
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    const buffer = Buffer.from(payload.body.data, 'base64');
    return buffer.toString('utf-8');
  }
  
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    const buffer = Buffer.from(payload.body.data, 'base64');
    // Basic HTML tag stripping
    return buffer.toString('utf-8').replace(/<[^>]*>/g, ' ');
  }
  
  if (payload.parts) {
    let body = '';
    // Look for text/plain first
    const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plainPart) {
      return parseMessageBody(plainPart);
    }
    // Fallback to text/html or other parts
    for (const part of payload.parts) {
      body += parseMessageBody(part);
    }
    return body;
  }
  
  return '';
};

// Helper function to clean email address (e.g. "John Doe <john@example.com>" -> "john@example.com")
export const cleanEmailAddress = (str) => {
  if (!str) return '';
  const match = str.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : str.trim().toLowerCase();
};

// ─── ULTRA-FAST: Only fetch message IDs and threadIds (no full details) ───
// This is 10x faster than fetching full message details for every email.
export const fetchRecentEmails = async (gmail, lastSyncDate) => {
  try {
    const MAX_EMAILS = 50;
    const params = {
      userId: 'me',
      maxResults: MAX_EMAILS,
    };

    const response = await gmail.users.messages.list(params);
    const messages = response.data.messages || [];

    // Return ONLY message IDs and thread IDs — no full details needed here.
    // The sync engine will decide which threads need full fetching.
    console.log(`[Gmail] Found ${messages.length} recent messages (lightweight scan)`);
    return messages.map(m => ({ id: m.id, threadId: m.threadId }));
  } catch (error) {
    console.error('Error fetching emails from Gmail API:', error);
    throw error;
  }
};


// Check if a thread has any replies from the merchandiser (sent mail) to calculate response time
export const checkThreadResponse = async (gmail, threadId, accountEmail) => {
  try {
    const threadResponse = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
    });

    const messages = threadResponse.data.messages || [];
    // Sort messages chronologically by internalDate (string timestamp)
    messages.sort((a, b) => parseInt(a.internalDate) - parseInt(b.internalDate));

    // Find the first incoming message from a customer
    let firstIncoming = null;
    let firstReply = null;

    for (const msg of messages) {
      const headers = msg.payload.headers || [];
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
      const fromEmail = cleanEmailAddress(fromHeader ? fromHeader.value : '');

      if (fromEmail === accountEmail.toLowerCase()) {
        // This is a reply sent by the merchandiser
        if (firstIncoming && !firstReply) {
          firstReply = msg;
          break; // We found the response to the first incoming mail
        }
      } else {
        // This is from the customer
        if (!firstIncoming) {
          firstIncoming = msg;
        }
      }
    }

    if (firstIncoming && firstReply) {
      const incomingTime = parseInt(firstIncoming.internalDate);
      const replyTime = parseInt(firstReply.internalDate);
      const responseTimeMinutes = Math.max(0, Math.round((replyTime - incomingTime) / 60000));
      
      return {
        responded: true,
        respondedAt: new Date(replyTime),
        responseTime: responseTimeMinutes,
      };
    }

    return { responded: false };
  } catch (error) {
    console.error(`Error checking thread response status for ${threadId}:`, error);
    return { responded: false };
  }
};
