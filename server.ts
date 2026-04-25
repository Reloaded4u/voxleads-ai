import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import validator from "validator";
import dns from "dns";
import { promisify } from "util";
import fs from "fs";
import * as cheerio from "cheerio";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import twilio from "twilio";
import { google } from "googleapis";

const resolve4 = promisify(dns.resolve4);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin and Firestore with correct database ID
let db: admin.firestore.Firestore;

try {
  console.log("[Startup] GOOGLE_APPLICATION_CREDENTIALS_JSON present:", !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
  }

  const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  // Get the database ID from environment variable or from the local config file
  let databaseId = process.env.FIREBASE_DATABASE_ID;
  
  try {
    const configPath = path.resolve(__dirname, "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (!databaseId) databaseId = config.firestoreDatabaseId;
      console.log("[Startup] Found database ID in config file:", databaseId);
    }
  } catch (e) {
    console.warn("[Startup] Could not load database ID from config file, will use fallback or default");
  }

  // Initialize Firestore with the database ID
  if (databaseId && databaseId !== "(default)") {
  db = getFirestore(databaseId);
} else {
  db = getFirestore();
};

  console.log(`[Startup] Firebase Admin and Firestore initialized successfully. Using Database: ${databaseId || 'default'}`);
} catch (err) {
  console.error("[Startup] Firebase Admin initialization failed:", err);
  throw err;
}

// Initialize Twilio
const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_URL = process.env.APP_URL || "";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = `${APP_URL}/auth/callback/google`;

function getGoogleOAuthClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return null;
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

async function getGoogleClientForUser(uid: string) {
  const oauth2Client = getGoogleOAuthClient();

  if (!oauth2Client) return null;

  try {
    const tokenDoc = await db.collection('googleTokens').doc(uid).get();

    if (!tokenDoc.exists) return null;

    oauth2Client.setCredentials(tokenDoc.data() as any);

    return oauth2Client;
  } catch (error) {
    console.error(`[Google Auth] Failed for user ${uid}:`, error);
    return null;
  }
}

// Phone Number Normalization
function normalizePhoneNumber(phone: string) {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+91' + cleaned;
    else if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = '+' + cleaned;
  }
  return cleaned;
}

async function generateAiResponse(userSpeech: string, callData: any, kb: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "I'm sorry, I cannot process your request right now.";

  const businessName = kb?.profile?.name || "our company";
  const mission = kb?.profile?.mission || "assisting customers";

  const context = `You are a professional AI sales assistant for ${businessName}.
Mission: ${mission}.
Caller: ${callData.leadName || 'unknown'}.
Phone: ${callData.leadPhone || 'unknown'}.

Knowledge Base:
Greeting: ${kb?.guidance?.greeting || 'Hello'}
Main Pitch: ${kb?.guidance?.mainPitch || 'How can I help you?'}
Objection Handling: ${kb?.guidance?.objectionHandling || 'Address concerns professionally.'}

Rules:
- Keep response under 2 short sentences.
- Speak naturally like a sales assistant.
- Do not use markdown.
- If unsure, offer a human callback.

Conversation so far:
${callData.transcript || 'No previous history.'}

Caller said: "${userSpeech}"

Reply naturally.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: context }] }]
      })
    });

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I missed that. Could you please repeat?";
    return reply.trim();
  } catch (error) {
    console.error('[AI Response] Gemini error:', error);
    return "I'm sorry, I'm having trouble processing that. Can you please repeat?";
  }
}

/**
 * Escapes characters for XML to prevent TwiML or SSML injection/errors.
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

/**
 * Orchestrates speech placement in TwiML based on user provider configuration.
 * Only uses <Play> for providers with a fully implemented proxy streaming endpoint.
 */
async function addSpeechToResponse(response: any, message: string, ownerId: string) {
  try {
    const userDoc = await db.collection('users').doc(ownerId).get();
    const userData = userDoc.data();
    const integrations = userData?.integrations || {};
    const provider = integrations.ttsProvider || 'polly';

    console.log(`[TwiML] Dispatching synthesis to: ${provider} (User: ${ownerId})`);

    // Use audio proxy ONLY for providers currently implemented in the streaming endpoint
    if (provider === 'elevenlabs' || provider === 'azure') {
      const speechUrl = `${APP_URL}/api/voice/speech?message=${encodeURIComponent(message)}&ownerId=${ownerId}`;
      response.play(speechUrl);
    } else {
      // Fallback for 'polly', 'google', 'custom' (uses Twilio's native Amazon Polly engine)
      const voiceId = integrations.pollyVoiceId || 'Polly.Amy';
      response.say({ 
        voice: voiceId,
        language: 'en-US'
      }, message);
    }
  } catch (error) {
    console.error('[TwiML] Error in speech strategy logic, using emergency fallback:', error);
    response.say(message);
  }
}

async function authenticate(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Missing auth token'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    next();
  } catch (error) {
    console.error('[Auth] Invalid token:', error);

    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
}

/**
 * Recursively removes undefined values from an object.
 * Firestore does not support undefined values in documents.
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(v => sanitizeForFirestore(v));
  }

  // Check if it's a special Firestore object (like FieldValue)
  if (obj instanceof admin.firestore.FieldValue) {
    return obj;
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
  }
  return sanitized;
}

// Twilio Webhook Validation Middleware
async function validateTwilioRequest(req: any, res: any, next: any) {
  if (process.env.NODE_ENV === 'test') return next();
  
  const { callId } = req.query;
  if (!callId) {
    console.warn('[Twilio Webhook] Missing callId for validation');
    return res.status(400).send('Missing callId');
  }

  try {
    // Fetch call record to find owner
    const callDoc = await db.collection('calls').doc(callId as string).get();
    if (!callDoc.exists) {
      console.warn('[Twilio Webhook] Call record not found for validation:', callId);
      return res.status(404).send('Call not found');
    }
    const ownerId = callDoc.data()?.ownerId;
    
    // Fetch owner's Twilio config
    const userDoc = await db.collection('users').doc(ownerId).get();
    const userData = userDoc.data();
    const authToken = userData?.integrations?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;

    if (!authToken) {
      console.error('[Twilio Webhook] No auth token found for validation');
      return res.status(403).send('Configuration missing');
    }

    const signature = req.headers['x-twilio-signature'];
    const url = APP_URL + req.originalUrl;
    const params = req.body;

    if (twilio.validateRequest(authToken, signature, url, params)) {
      next();
    } else {
      console.warn('[Twilio] Invalid signature for webhook:', url);
      res.status(403).send('Invalid signature');
    }
  } catch (error) {
    console.error('[Twilio Webhook] Validation error:', error);
    res.status(500).send('Internal server error');
  }
}

// Helper to get Twilio config for a user
async function getTwilioConfig(uid: string) {
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data();
  const userIntegrations = userData?.integrations;

  if (userIntegrations?.telephonyProvider && userIntegrations.telephonyProvider !== 'twilio') {
    console.log(`[getTwilioConfig] User has selected ${userIntegrations.telephonyProvider}, bypassing Twilio.`);
    return null;
  }

  const sid = userIntegrations?.twilioSid || process.env.TWILIO_ACCOUNT_SID;
  const token = userIntegrations?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
  const phone = userIntegrations?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

  console.log(`[getTwilioConfig] uid: ${uid}`);
  console.log(`[getTwilioConfig] SID found: ${!!sid} (${userIntegrations?.twilioSid ? 'User' : 'System'})`);
  console.log(`[getTwilioConfig] Token found: ${!!token} (${userIntegrations?.twilioAuthToken ? 'User' : 'System'})`);
  console.log(`[getTwilioConfig] Phone found: ${!!phone} (${userIntegrations?.twilioPhoneNumber ? 'User' : 'System'})`);

  if (sid && token && phone) {
    return {
      client: twilio(sid, token),
      phoneNumber: phone,
      isUserConfig: !!userIntegrations?.twilioSid
    };
  }
  return null;
}

async function getVobizConfig(userId?: string) {
  let authId = process.env.VOBIZ_AUTH_ID;
  let authToken = process.env.VOBIZ_AUTH_TOKEN;
  let phoneNumber = process.env.VOBIZ_PHONE_NUMBER;

  if (userId) {
    const userDoc = await db.collection('users').doc(userId).get();

    if (userDoc.exists) {
      const data = userDoc.data();

      if (data?.integrations?.vobizAuthId) {
        authId = data.integrations.vobizAuthId;
      }

      if (data?.integrations?.vobizAuthToken) {
        authToken = data.integrations.vobizAuthToken;
      }

      if (data?.integrations?.vobizPhoneNumber) {
        phoneNumber = data.integrations.vobizPhoneNumber;
      }
    }
  }

  console.log(`[getVobizConfig] Auth ID found: ${!!authId}`);
  console.log(`[getVobizConfig] Auth Token found: ${!!authToken}`);
  console.log(`[getVobizConfig] Phone found: ${!!phoneNumber}`);

  if (!authId || !authToken || !phoneNumber) {
    return null;
  }

  return {
    authId,
    authToken,
    phoneNumber
  };
}

// Helper to check if it's currently within a user's calling hours
function isWithinCallingHours(startTime: string, endTime: string, timezone: string) {
  try {
    const now = new Date();
    const timeInTz = formatInTimeZone(now, timezone, 'HH:mm');
    return timeInTz >= startTime && timeInTz <= endTime;
  } catch (error) {
    console.error('[Worker] Error checking calling hours:', error);
    return false;
  }
}

// Helper to get the next valid calling window start time
function getNextCallingWindow(startTime: string, timezone: string) {
  try {
    const now = new Date();
    const zonedNow = toZonedTime(now, timezone);
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const nextWindow = new Date(zonedNow);
    nextWindow.setHours(hours, minutes, 0, 0);
    
    // If the window for today has already passed, move to tomorrow
    if (nextWindow <= zonedNow) {
      nextWindow.setDate(nextWindow.getDate() + 1);
    }
    
    return fromZonedTime(nextWindow, timezone);
  } catch (error) {
    console.error('[Worker] Error calculating next calling window:', error);
    return new Date(Date.now() + 60 * 60 * 1000); // Fallback: 1 hour from now
  }
}

// Background Worker for Automated Calling
async function startCallQueueWorker() {
  console.log('[Worker] Starting Call Queue Worker...');
  
  setInterval(async () => {
    await processGlobalQueue();
  }, 60000); // Run every minute
}

async function processGlobalQueue(targetUid?: string) {
  try {
    const now = admin.firestore.Timestamp.now();
    
    let usersQuery;
    if (targetUid) {
      // For manual processing, we only care about the specific user
      usersQuery = await db.collection('users').where(admin.firestore.FieldPath.documentId(), '==', targetUid).get();
    } else {
      // For global worker, only process users with auto-calling enabled
      usersQuery = await db.collection('users')
        .where('settings.autoCallingEnabled', '==', true)
        .get();
    }

    if (usersQuery.empty) return;

    for (const userDoc of usersQuery.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;
      const settings = userData.settings || {};
      
      // 2. Check calling hours
      const startTime = settings.callingStartTime || '09:00';
      const endTime = settings.callingEndTime || '18:00';
      const timezone = settings.timezone || 'UTC';

      if (!isWithinCallingHours(startTime, endTime, timezone)) {
        // Reschedule pending items for this user to the next window
        const pendingItems = await db.collection('callQueue')
          .where('ownerId', '==', uid)
          .where('status', 'in', ['pending', 'scheduled'])
          .where('scheduledTime', '<=', now)
          .get();

        if (!pendingItems.empty) {
          const nextWindow = getNextCallingWindow(startTime, timezone);
          console.log(`[Worker] User ${uid} outside hours. Rescheduling ${pendingItems.size} items to ${nextWindow.toISOString()}`);
          
          const batch = db.batch();
          pendingItems.docs.forEach(doc => {
            batch.update(doc.ref, {
              status: 'scheduled',
              scheduledTime: admin.firestore.Timestamp.fromDate(nextWindow),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          });
          await batch.commit();
        }
        continue;
      }

      // 3. Check rate limits (maxCallsPerMinute)
      const maxCalls = settings.maxCallsPerMinute || 5;
      
      // Query for pending or scheduled items for THIS user
      const queueQuery = await db.collection('callQueue')
        .where('ownerId', '==', uid)
        .where('status', 'in', ['pending', 'scheduled'])
        .where('scheduledTime', '<=', now)
        .limit(maxCalls)
        .get();

      if (queueQuery.empty) continue;

      console.log(`[Worker] Processing ${queueQuery.size} items for user ${uid}`);

      for (const queueDoc of queueQuery.docs) {
        await processQueueItem(queueDoc.id, userData);
      }
    }
  } catch (error) {
    console.error('[Worker] Fatal error in worker loop:', error);
  }
}

async function processQueueItem(queueDocId: string, userData: any) {
  const queueRef = db.collection('callQueue').doc(queueDocId);

  try {
    // 1. Transactional Lock to prevent duplicate processing
    const result = await db.runTransaction(async (transaction) => {
      const queueDoc = await transaction.get(queueRef);
      if (!queueDoc.exists) throw new Error('Queue item not found');
      
      const item = queueDoc.data()!;
      if (item.status !== 'pending' && item.status !== 'scheduled') {
        return { skip: true, reason: 'Item already being processed or completed' };
      }

      // Mark as processing
      transaction.update(queueRef, { 
        status: 'processing',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { skip: false, item };
    });

    if (result.skip) {
      console.log(`[Worker] Skipping item ${queueDocId}: ${result.reason}`);
      return;
    }

    const item = result.item;

    // 2. Trigger Call
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const callRef = db.collection('calls').doc(callId);

    // Fetch lead details for snapshotting
    let leadName = 'Unknown Lead';

    try {
      const leadSnap = await db.collection('leads').doc(item.leadId).get();

      if (leadSnap.exists) {
        leadName = leadSnap.data()?.name || leadName;
      }
    } catch (e) {
      console.error('[Worker] Error fetching lead for snapshot:', e);
    }

    await callRef.set(sanitizeForFirestore({
      id: callId,
      ownerId: item.ownerId,
      leadId: item.leadId,
      leadName,
      leadPhone: item.phone,
      status: 'initiated',
      provider: 'mock',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      summary: '',
      transcript: '',
      outcome: 'New'
    }));

    const normalizedPhone = normalizePhoneNumber(item.phone);
    const twilioConfig = await getTwilioConfig(item.ownerId);
    const recordingEnabled = userData.communication?.recordingEnabled || false;

    let callSid = '';
    let provider = 'mock';

    if (twilioConfig && userData.communication?.liveCallingEnabled) {
      try {
        const call = await twilioConfig.client.calls.create({
          from: twilioConfig.phoneNumber,
          to: normalizedPhone,
          url: `${APP_URL}/api/voice/twiml?callId=${callId}&ownerId=${item.ownerId}`,
          statusCallback: `${APP_URL}/api/webhooks/twilio/status?callId=${callId}&queueItemId=${queueDocId}`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no-answer', 'canceled'],
          record: recordingEnabled,
          recordingStatusCallback: `${APP_URL}/api/webhooks/twilio/recording?callId=${callId}`
        });
        callSid = call.sid;
        provider = 'twilio';
        
        await callRef.update(sanitizeForFirestore({
          callSid: call.sid,
          provider: 'twilio'
        }));
      } catch (twilioError) {
        console.error('[Worker] Twilio call failed:', twilioError);
        throw twilioError;
      }
    } else {
      // Mock call
      callSid = `mock-sid-${Date.now()}`;
      await callRef.update(sanitizeForFirestore({
        callSid: callSid,
        provider: 'mock',
        status: 'completed'
      }));
    }

    // 3. Update Queue Item
    await queueRef.update(sanitizeForFirestore({
      activeCallId: callId,
      attempts: admin.firestore.FieldValue.increment(1),
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: provider === 'mock' ? 'completed' : 'processing'
    }));

  } catch (error) {
    console.error(`[Worker] Error processing item ${queueDocId}:`, error);
    
    // Fetch fresh item data for retry logic
    const queueDoc = await queueRef.get();
    const item = queueDoc.data();
    
    if (item) {
      const attempts = (item.attempts || 0);
      const maxAttempts = userData.settings?.maxRetryAttempts || 3;
      const retryDelay = userData.settings?.retryDelayMinutes || 20;
      
      if (attempts < maxAttempts) {
        const nextRetry = new Date(Date.now() + retryDelay * 60 * 1000);
        await queueRef.update(sanitizeForFirestore({
          status: 'scheduled',
          attempts: admin.firestore.FieldValue.increment(1),
          nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetry),
          scheduledTime: admin.firestore.Timestamp.fromDate(nextRetry),
          retryReason: error instanceof Error ? error.message : String(error),
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }));
      } else {
        await queueRef.update(sanitizeForFirestore({
          status: 'failed',
          retryReason: 'Max attempts exceeded',
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }));
      }
    }
  }
}

// SSRF Protection Helpers
function isPrivateIP(ip: string) {
  const parts = ip.split('.').map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127 ||
    ip === '::1'
  );
}

async function validateWebhookUrl(urlStr: string) {
  if (!validator.isURL(urlStr, { protocols: ['http', 'https'], require_protocol: true })) {
    throw new Error('Invalid URL format. Must include http:// or https://');
  }

  const parsedUrl = new URL(urlStr);
  const hostname = parsedUrl.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    throw new Error('Localhost and internal addresses are not allowed');
  }

  try {
    const ips = await resolve4(hostname);
    for (const ip of ips) {
      if (isPrivateIP(ip)) {
        throw new Error(`Targeting private network address ${ip} is not allowed`);
      }
    }
  } catch (err) {
    if (validator.isIP(hostname)) {
      if (isPrivateIP(hostname)) {
        throw new Error(`Targeting private network address ${hostname} is not allowed`);
      }
    } else {
      throw new Error(`Could not resolve hostname: ${hostname}`);
    }
  }
}

// Simple Rate Limiter
const rateLimitMap = new Map<string, { count: number, lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

function checkRateLimit(uid: string) {
  const now = Date.now();
  const limit = rateLimitMap.get(uid) || { count: 0, lastReset: now };
  
  if (now - limit.lastReset > RATE_LIMIT_WINDOW) {
    limit.count = 1;
    limit.lastReset = now;
  } else {
    limit.count++;
  }
  
  rateLimitMap.set(uid, limit);
  return limit.count <= MAX_REQUESTS;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy for AI Voice (Mocking for now, but ready for Twilio/ElevenLabs)
  app.post("/api/voice/call", async (req, res) => {
    const { leadId, phoneNumber, callId, knowledgeBase } = req.body;
    const authHeader = req.headers.authorization;
    
    console.log(`[Backend] 1. Request received for leadId: ${leadId}, callId: ${callId}`);

    if (!authHeader) {
      console.error('[Backend] Authorization header missing');
      return res.status(401).json({ success: false, message: "Authorization header missing" });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.error('[Backend] Invalid Authorization header format');
      return res.status(401).json({ success: false, message: "Invalid Authorization header format. Expected Bearer <token>" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      console.log(`[Backend] 2. Auth verified for user: ${uid}`);
      
      // Fetch user settings for recording
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.data();
      const recordingEnabled = userData?.communication?.recordingEnabled || false;
      const liveCallingEnabled = userData?.communication?.liveCallingEnabled || false;
      const telephonyProvider = userData?.integrations?.telephonyProvider || 'twilio';
      
      console.log(`[Backend] 4. liveCallingEnabled: ${liveCallingEnabled}`);

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      console.log(`[Backend] 5. Normalized phone: ${normalizedPhone}`);
      
      const twilioConfig = telephonyProvider === 'twilio' ? await getTwilioConfig(uid) : null;
      const vobizConfig = telephonyProvider === 'vobiz' ? await getVobizConfig(uid) : null;

      console.log(`[Backend] 3. Selected telephony provider: ${telephonyProvider}`);
      console.log(`[Backend] 3A. Twilio config result: ${twilioConfig ? 'Config found' : 'No config found'}`);
      console.log(`[Backend] 3B. Vobiz config result: ${vobizConfig ? 'Config found' : 'No config found'}`);

      if (!liveCallingEnabled) {
        console.log(`[Backend] Live calling disabled. Falling back to mock.`);
      } else if (twilioConfig) {
        console.log(`[Backend] 6. Entering Twilio branch: YES`);
        
        try {
          console.log(`[Backend] Initiating real Twilio call to ${normalizedPhone} (Call ID: ${callId}) using ${twilioConfig.isUserConfig ? 'user' : 'system'} credentials`);
          
          const call = await twilioConfig.client.calls.create({
            from: twilioConfig.phoneNumber,
            to: normalizedPhone,
            url: `${APP_URL}/api/voice/twiml?callId=${callId}&ownerId=${uid}`,
            statusCallback: `${APP_URL}/api/webhooks/twilio/status?callId=${callId}`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no-answer', 'canceled'],
            record: recordingEnabled,
            recordingStatusCallback: `${APP_URL}/api/webhooks/twilio/recording?callId=${callId}`
          });
          
          console.log(`[Backend] Twilio call created successfully. SID: ${call.sid}`);

          // Update Firestore with Twilio SID and status
          await db.collection('calls').doc(callId).update({
            callSid: call.sid,
            provider: 'twilio',
            status: 'initiated',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          return res.json({ 
            success: true, 
            message: "Twilio call initiated",
            callSid: call.sid,
            mode: 'live'
          });
        } catch (twilioError) {
          console.error(`[Backend] 7. Error thrown by twilio.calls.create():`, twilioError);
          const errorMessage = twilioError instanceof Error ? twilioError.message : String(twilioError);
          return res.status(500).json({
            success: false,
            message: `Twilio call creation failed: ${errorMessage}`,
            mode: 'failed'
          });
        }
      } else if (vobizConfig) {
        console.log(`[Backend] 6. Entering Vobiz branch: YES`);

        try {
          const vobizPayload = {
            from: vobizConfig.phoneNumber,
            to: normalizedPhone,
            answer_url: `${APP_URL}/api/voice/vobizxml?callId=${callId}&ownerId=${uid}`,
            hangup_url: `${APP_URL}/api/webhooks/vobiz/status?callId=${callId}&event=hangup`,
            ring_url: `${APP_URL}/api/webhooks/vobiz/status?callId=${callId}&event=ringing`,
            fallback_url: `${APP_URL}/api/webhooks/vobiz/status?callId=${callId}&event=failed`
          };

          console.log(`[Backend] Initiating real Vobiz call to ${normalizedPhone} (Call ID: ${callId})`);

          const vobizResponse = await fetch(`https://api.vobiz.ai/api/v1/Account/${vobizConfig.authId}/Call/`, {
            method: 'POST',
            headers: {
              'X-Auth-ID': vobizConfig.authId,
              'X-Auth-Token': vobizConfig.authToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(vobizPayload)
          });

          const vobizData = await vobizResponse.json();

          if (!vobizResponse.ok) {
            throw new Error(vobizData?.message || `Vobiz API failed with status ${vobizResponse.status}`);
          }

          const vobizCallId = vobizData.call_id || vobizData.id || vobizData.uuid || `vobiz-${Date.now()}`;

          await db.collection('calls').doc(callId).update({
            callSid: vobizCallId,
            provider: 'vobiz',
            status: 'initiated',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          return res.json({
            success: true,
            message: "Vobiz call initiated",
            callSid: vobizCallId,
            mode: 'live'
          });
        } catch (vobizError) {
          console.error(`[Backend] Vobiz call creation failed:`, vobizError);
          const errorMessage = vobizError instanceof Error ? vobizError.message : String(vobizError);

          return res.status(500).json({
            success: false,
            message: `Vobiz call creation failed: ${errorMessage}`,
            mode: 'failed'
          });
        }
      }

      console.log(`[Backend] 6. No live provider available. Fallback to mock`);
      console.log(`[Backend] Initiating mock call to ${phoneNumber} for lead ${leadId} (Call ID: ${callId})`);
      
      // Fallback to mock
      res.json({ 
        success: true, 
        message: "Call initiated (mock)",
        callSid: `live-sid-${Date.now()}`,
        mode: 'test'
      });
    } catch (error) {
      console.error('[Backend] Firebase ID token verification or processing failed:', error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(500).json({ 
        success: false, 
        message: `Processing failed: ${message}` 
      });
    }
  });

  // SMS Sending Route
  app.post("/api/sms/send", async (req, res) => {
    const { recipient, body, logId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      console.log(`[Backend] User ${uid} sending SMS to ${recipient}: ${body}`);

      const normalizedRecipient = normalizePhoneNumber(recipient);
      const twilioConfig = await getTwilioConfig(uid);

      let messageId = `sms-sid-mock-${Date.now()}`;
      let status = 'sent';

      if (twilioConfig) {
        console.log(`[Backend] Sending real SMS to ${normalizedRecipient} using ${twilioConfig.isUserConfig ? 'user' : 'system'} credentials`);
        const message = await twilioConfig.client.messages.create({
          body: body,
          from: twilioConfig.phoneNumber,
          to: normalizedRecipient
        });
        messageId = message.sid;
        status = message.status === 'failed' ? 'failed' : 'sent';
      } else {
        console.log(`[Backend] Twilio not configured, mocking SMS to ${recipient}`);
      }
      
      if (logId) {
        try {
          await db.collection('smsLogs').doc(logId).update({
            status: status,
            providerMessageId: messageId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (dbError) {
          console.error('[Backend] Error updating SMS log status:', dbError);
        }
      }

      res.json({ 
        success: true, 
        messageId,
        status: status
      });
    } catch (error) {
      console.error('[Backend] SMS send error:', error);
      
      if (req.body.logId) {
        try {
          await db.collection('smsLogs').doc(req.body.logId).update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown backend error',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (dbError) {
          console.error('[Backend] Error updating SMS log failure status:', dbError);
        }
      }

      res.status(500).json({ success: false, message: "Failed to send SMS" });
    }
  });

  // Twilio TwiML Route: Handles incoming call orchestration
  app.post("/api/voice/twiml", async (req, res) => {
    const { callId, ownerId } = req.query;
    const response = new twilio.twiml.VoiceResponse();
    
    let message = "Hello, this is an automated call from your AI assistant. We are testing the real telephony integration.";

    try {
      if (callId) {
        const callDoc = await db.collection('calls').doc(callId as string).get();
        if (callDoc.exists) {
          const callData = callDoc.data();
          const kb = callData?.knowledgeBaseSnapshot;
          
          if (kb) {
            const businessName = kb.profile?.name || "our company";
            let greeting = kb.guidance?.greeting || "Hello";
            const leadName = callData?.leadName || "there";
            greeting = greeting.replace(/\[Lead Name\]/g, leadName).replace(/\[Name\]/g, leadName);
            const pitch = kb.guidance?.mainPitch || "We are calling to follow up on your interest.";
            message = `${greeting}. This is a call from ${businessName}. ${pitch}`;
          }
        }
      }
    } catch (err) {
      console.error('[Backend] Error fetching call context for TwiML:', err);
    }

    const gather = response.gather({
      input: ['speech'],
      action: `${APP_URL}/api/voice/respond?callId=${callId}&ownerId=${ownerId}`,
      enhanced: true,
      speechTimeout: 'auto'
    });

    if (ownerId) {
      await addSpeechToResponse(gather, message, ownerId as string);
    } else {
      gather.say(message);
    }
    

    res.type('text/xml');
    res.send(response.toString());
  });

  app.post("/api/voice/respond", async (req, res) => {
    const { callId, ownerId } = req.query;
    const { SpeechResult } = req.body;
    const response = new twilio.twiml.VoiceResponse();

    if (!SpeechResult) {
      response.say("I'm sorry, I didn't catch that. Could you please repeat?");
      response.gather({
        input: ['speech'],
        action: `${APP_URL}/api/voice/respond?callId=${callId}&ownerId=${ownerId}`,
        enhanced: true,
        speechTimeout: 'auto'
      });

      res.type('text/xml');
      return res.send(response.toString());
    }

    try {
      const callRef = db.collection('calls').doc(callId as string);
      const callDoc = await callRef.get();

      if (!callDoc.exists) {
        throw new Error("Call not found");
      }

      const callData = callDoc.data();
      const currentTranscript = callData?.transcript || "";
      const newTranscript = currentTranscript + `\nLead: ${SpeechResult}`;

      const aiReply = await generateAiResponse(
        SpeechResult,
        { ...callData, transcript: newTranscript },
        callData?.knowledgeBaseSnapshot
      );

      await callRef.update({
        transcript: newTranscript + `\nAI: ${aiReply}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (ownerId) {
        await addSpeechToResponse(response, aiReply, ownerId as string);
      } else {
        response.say(aiReply);
      }

      response.gather({
        input: ['speech'],
        action: `${APP_URL}/api/voice/respond?callId=${callId}&ownerId=${ownerId}`,
        enhanced: true,
        speechTimeout: 'auto'
      });
    } catch (err) {
      console.error('[Twilio Respond] Error:', err);
      response.say("I'm sorry, something went wrong. A team member will follow up with you.");
      response.hangup();
    }

    res.type('text/xml');
    res.send(response.toString());
  });

  // Vobiz XML Route
  app.post("/api/voice/vobizxml", async (req, res) => {
    const { callId, ownerId } = req.query;

    let message =
      "Hello, this is an automated call from VoxLeads AI.";

    try {
      if (callId) {
        const callDoc = await db.collection('calls').doc(callId as string).get();

        if (callDoc.exists) {
          const callData = callDoc.data();
          const kb = callData?.knowledgeBaseSnapshot;

          if (kb) {
            const businessName = kb.profile?.name || "our company";
            let greeting = kb.guidance?.greeting || "Hello";
            const leadName = callData?.leadName || "there";
            greeting = greeting.replace(/\[Lead Name\]/g, leadName).replace(/\[Name\]/g, leadName);
            const pitch =
              kb.guidance?.mainPitch ||
              "We are calling to follow up on your inquiry.";

            message = `${greeting}. This is a call from ${businessName}. ${pitch}`;
          }
        }
      }
    } catch (error) {
      console.error("[Vobiz XML] Error:", error);
    }

    const xml = `
<Response>
  <Speak>${message}</Speak>
  <Hangup/>
</Response>`;

    res.type("text/xml");
    res.send(xml);
  });

  // Vobiz Status Webhook
  app.post("/api/webhooks/vobiz/status", async (req, res) => {
    const { callId, event } = req.query;

    console.log(`[Vobiz Webhook] ${callId}: ${event}`);

    const statusMap: any = {
      ringing: "ringing",
      hangup: "completed",
      failed: "failed"
    };

    const finalStatus = statusMap[event as string] || "completed";
    const isFinalStatus = ["completed", "failed", "busy", "no-answer"].includes(finalStatus);

    try {
      const updates: any = {
        status: finalStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (isFinalStatus) {
        updates.endedAt = admin.firestore.FieldValue.serverTimestamp();
        updates.controlState = "call_ended";
      }

      await db.collection("calls").doc(callId as string).update(
        sanitizeForFirestore(updates)
      );
    } catch (error) {
      console.error("[Vobiz Webhook] Update failed:", error);
    }

    res.status(200).send("OK");
  });

  // Speech Proxy: Streams audio from external providers to Twilio <Play> tags
  app.get("/api/voice/speech", async (req, res) => {
    const { message, ownerId } = req.query;

    if (!message || !ownerId) {
      return res.status(400).send("Bad Request: Missing message or ownerId");
    }

    try {
      const userDoc = await db.collection('users').doc(ownerId as string).get();
      const userData = userDoc.data();
      const integrations = userData?.integrations || {};
      const provider = integrations.ttsProvider || 'polly';

      // ElevenLabs Implementation
      if (provider === 'elevenlabs') {
        const apiKey = integrations.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
        const voiceId = integrations.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
        
        if (!apiKey) throw new Error("ElevenLabs API Key missing");

        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
          body: JSON.stringify({
            text: message as string,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        });

        if (!ttsResponse.ok) throw new Error(`ElevenLabs error: ${ttsResponse.status}`);
        
        res.setHeader('Content-Type', 'audio/mpeg');
        // @ts-ignore
        const reader = ttsResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      }

      // Azure Implementation
      if (provider === 'azure') {
        const key = integrations.azureApiKey;
        const region = integrations.azureRegion;
        const voice = integrations.azureVoiceName || 'en-US-JennyNeural';

        if (!key || !region) throw new Error("Azure credentials missing");

        const escapedMsg = escapeXml(message as string);
        const ssml = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' name='${voice}'>${escapedMsg}</voice></speak>`;

        const ttsResponse = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
            'User-Agent': 'VoxLeadsAI'
          },
          body: ssml
        });

        if (!ttsResponse.ok) throw new Error(`Azure error: ${ttsResponse.status}`);
        
        res.setHeader('Content-Type', 'audio/mpeg');
        // @ts-ignore
        const reader = ttsResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      }

      res.status(404).send(`Provider ${provider} not supported for proxy.`);
    } catch (error) {
      console.error('[Speech Proxy] Fatal synthesis error:', error);
      res.status(500).send("Speech generation failed");
    }
  });

  // Twilio Status Webhook
  app.post("/api/webhooks/twilio/status", validateTwilioRequest, async (req, res) => {
    const { callId, queueItemId } = req.query;
    const { CallStatus, CallDuration } = req.body;

    console.log(`[Twilio Webhook] Status update for ${callId}: ${CallStatus}`);

    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'initiated': 'initiated',
      'ringing': 'ringing',
      'answered': 'in-progress',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no-answer',
      'canceled': 'failed'
    };

    const internalStatus = statusMap[CallStatus] || 'completed';

    const updates: any = {
      status: internalStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (CallStatus === 'answered' || CallStatus === 'in-progress') {
      updates.startedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    const finalTwilioStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];

    if (finalTwilioStatuses.includes(CallStatus)) {
      updates.endedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.controlState = "call_ended";

      if (CallDuration) {
        updates.duration = parseInt(CallDuration, 10);
      }
    }

    try {
      await db.collection('calls').doc(callId as string).update(sanitizeForFirestore(updates));
      
      // Update Queue Item if linked
      if (queueItemId) {
        const queueStatusMap: Record<string, string> = {
          'completed': 'completed',
          'busy': 'busy',
          'failed': 'failed',
          'no-answer': 'no_answer',
          'canceled': 'failed'
        };

        const finalQueueStatus = queueStatusMap[CallStatus];
        if (finalQueueStatus) {
          const queueRef = db.collection('callQueue').doc(queueItemId as string);
          const queueDoc = await queueRef.get();
          const queueData = queueDoc.data();

          if (queueData && queueData.status === 'processing') {
            if (finalQueueStatus === 'completed') {
              await queueRef.update({
                status: 'completed',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } else {
              // Handle Retries for busy/no-answer/failed
              const userDoc = await db.collection('users').doc(queueData.ownerId).get();
              const userData = userDoc.data();
              const maxAttempts = userData?.settings?.maxRetryAttempts || 3;
              const retryDelay = userData?.settings?.retryDelayMinutes || 20;
              const attempts = queueData.attempts || 1;

              if (attempts < maxAttempts) {
                const nextRetry = new Date(Date.now() + retryDelay * 60 * 1000);
                await queueRef.update({
                  status: 'scheduled',
                  scheduledTime: admin.firestore.Timestamp.fromDate(nextRetry),
                  nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetry),
                  retryReason: CallStatus,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
              } else {
                await queueRef.update({
                  status: 'failed',
                  retryReason: `Max attempts exceeded (${CallStatus})`,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[Twilio Webhook] Error updating call status:', err);
    }

    res.status(200).send('OK');
  });

  // Twilio Recording Webhook
  app.post("/api/webhooks/twilio/recording", validateTwilioRequest, async (req, res) => {
    const { callId } = req.query;
    const { RecordingUrl, RecordingSid, RecordingStatus, RecordingDuration } = req.body;

    console.log(`[Twilio Webhook] Recording update for ${callId}: ${RecordingStatus}`);

    try {
      await db.collection('calls').doc(callId as string).update(sanitizeForFirestore({
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        recordingStatus: RecordingStatus === 'completed' ? 'completed' : 'processing',
        duration: RecordingDuration ? parseInt(RecordingDuration, 10) : undefined,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }));
    } catch (err) {
      console.error('[Twilio Webhook] Error updating recording info:', err);
    }

    res.status(200).send('OK');
  });

  // Voice Control Route (Agent Join/Takeover/End Call)
  app.post("/api/voice/control", async (req, res) => {
    const { callId, state, agentId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      console.log(`[Backend] User ${uid} updating call ${callId} control state to ${state}`);

      const updates: any = {
        controlState: state,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (state === 'call_ended' || state === 'call_ended_manually') {
        updates.status = 'completed';
        updates.endedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      if (agentId) {
        updates.assignedAgentId = agentId;
      }

      await db.collection('calls').doc(callId).update(
        sanitizeForFirestore(updates)
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[Backend] Voice control error:', error);
      res.status(500).json({ success: false, message: "Failed to update control state" });
    }
  });

  // Recording Control Route
  app.post("/api/voice/recording", async (req, res) => {
    const { callId, enabled } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      console.log(`[Backend] User ${uid} ${enabled ? 'enabling' : 'disabling'} recording for call ${callId}`);

      res.json({ success: true });
    } catch (error) {
      console.error('[Backend] Recording control error:', error);
      res.status(500).json({ success: false, message: "Failed to update recording state" });
    }
  });

  // Webhook Test Endpoint with Security Hardening
  app.post("/api/webhooks/test", async (req, res) => {
    const { url } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      if (!checkRateLimit(uid)) {
        return res.status(429).json({ 
          success: false, 
          message: "Too many test requests. Please wait a minute and try again." 
        });
      }

      if (!url) return res.status(400).json({ success: false, message: "URL is required" });
      await validateWebhookUrl(url);

      console.log(`User ${uid} testing webhook: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test.webhook',
          timestamp: new Date().toISOString(),
          message: 'This is a test payload from RealEstate AI CRM',
          data: {
            testId: Math.random().toString(36).substring(7),
            status: 'success'
          }
        })
      });

      if (response.ok) {
        res.json({ success: true, message: "Webhook test successful" });
      } else {
        res.status(response.status).json({ 
          success: false, 
          message: `Webhook returned status ${response.status}` 
        });
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      const message = error instanceof Error ? error.message : "Failed to connect to webhook URL";
      
      if (message.includes('decoding Firebase ID token') || message.includes('expired')) {
        return res.status(401).json({ success: false, message: "Invalid or expired session" });
      }

      res.status(message.includes('not allowed') || message.includes('Invalid URL') ? 400 : 500).json({ 
        success: false, 
        message 
      });
    }
  });

  // Manual Queue Processing Endpoint
  app.post("/api/queue/process", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      
      console.log(`[Backend] Manual queue process triggered by user ${uid}`);
      
      await processGlobalQueue(uid);
      
      res.json({ success: true, message: "Queue processing triggered" });
    } catch (error) {
      console.error('[Backend] Manual queue process error:', error);
      res.status(500).json({ success: false, message: "Failed to trigger queue processing" });
    }
  });

  // Website Import Route for Knowledge Base
  app.post("/api/knowledge-base/import", async (req, res) => {
    const { url } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      if (!checkRateLimit(uid)) {
        return res.status(429).json({ 
          success: false, 
          message: "Too many import requests. Please wait a minute." 
        });
      }

      if (!url) return res.status(400).json({ success: false, message: "URL is required" });
      await validateWebhookUrl(url);

      console.log(`User ${uid} importing from website: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ 
          success: false, 
          message: `Website returned status ${response.status}` 
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      $('script, style, nav, footer, header, iframe, noscript, .ads, #ads').remove();

      const title = $('title').text().trim();
      const metaDescription = $('meta[name="description"]').attr('content') || '';
      
      const mainContent = $('main, article, #content, .content, .main').text() || $('body').text();
      
      const cleanText = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim()
        .substring(0, 15000); 

      res.json({ 
        success: true, 
        data: {
          title,
          metaDescription,
          content: cleanText,
          url
        }
      });
    } catch (error) {
      console.error('Website import error:', error);
      const message = error instanceof Error ? error.message : "Failed to import from website";
      res.status(500).json({ success: false, message });
    }
  });

  // Google OAuth Routes

  app.get('/api/auth/google/url', authenticate, (req: any, res) => {
    const oauth2Client = getGoogleOAuthClient();

    if (!oauth2Client) {
      return res.status(500).json({
        success: false,
        message: 'Google OAuth not configured'
      });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ],
      state: req.uid
    });

    res.json({ url });
  });

  app.get('/auth/callback/google', async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send('Missing callback parameters');
    }

    const oauth2Client = getGoogleOAuthClient();

    if (!oauth2Client) {
      return res.status(500).send('OAuth not configured');
    }

    try {
      const { tokens } = await oauth2Client.getToken(code as string);

      await db.collection('googleTokens').doc(state as string).set(
        sanitizeForFirestore(tokens)
      );

      await db.collection('users').doc(state as string).update({
        'integrations.googleCalendarConnected': true,
        'integrations.googleSheetsConnected': true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              }
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(error);
      res.status(500).send('Authentication failed');
    }
  });

  app.post('/api/integrations/google/disconnect', authenticate, async (req: any, res) => {
    try {
      await db.collection('googleTokens').doc(req.uid).delete();

      await db.collection('users').doc(req.uid).update({
        'integrations.googleCalendarConnected': false,
        'integrations.googleSheetsConnected': false
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  });

  app.post('/api/integrations/sheets/export', authenticate, async (req: any, res) => {
    try {
      const auth = await getGoogleClientForUser(req.uid);

      if (!auth) {
        return res.status(401).json({
          success: false,
          message: 'Google not connected'
        });
      }

      const sheets = google.sheets({ version: 'v4', auth });

      const leadsSnap = await db.collection('leads')
        .where('ownerId', '==', req.uid)
        .get();

      const leads = leadsSnap.docs.map(doc => doc.data());

      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `VoxLeads Export ${new Date().toLocaleDateString()}`
          }
        }
      });

      const rows = [
        ['Name', 'Phone', 'Email', 'Status'],
        ...leads.map((l: any) => [
          l.name || '',
          l.phone || '',
          l.email || '',
          l.status || ''
        ])
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheet.data.spreadsheetId!,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: { values: rows }
      });

      res.json({
        success: true,
        spreadsheetUrl: spreadsheet.data.spreadsheetUrl,
        message: 'Export successful'
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: 'Export failed'
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    console.log(`[Production] Serving static assets from: ${distPath}`);
    
    app.use(express.static(distPath, {
      maxAge: '1d',
      etag: true
    }));

   app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  startCallQueueWorker();
});
}

startServer();