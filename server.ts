import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from 'firebase-admin';
import validator from 'validator';
import dns from 'dns';
import { promisify } from 'util';
import fs from 'fs';
import * as cheerio from 'cheerio';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import twilio from 'twilio';

const resolve4 = promisify(dns.resolve4);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
admin.initializeApp({
  projectId: config.projectId
});

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_URL = process.env.APP_URL || '';

// Phone Number Normalization
function normalizePhoneNumber(phone: string) {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+91' + cleaned;
    else if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = '+' + cleaned;
  }
  return cleaned;
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
  // In admin SDK, these are usually instances of FieldValue
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
    const callDoc = await admin.firestore().collection('calls').doc(callId as string).get();
    if (!callDoc.exists) {
      console.warn('[Twilio Webhook] Call record not found for validation:', callId);
      return res.status(404).send('Call not found');
    }
    const ownerId = callDoc.data()?.ownerId;
    
    // Fetch owner's Twilio config
    const userDoc = await admin.firestore().collection('users').doc(ownerId).get();
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
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  const userData = userDoc.data();
  const userIntegrations = userData?.integrations;

  const sid = userIntegrations?.twilioSid || process.env.TWILIO_ACCOUNT_SID;
  const token = userIntegrations?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
  const phone = userIntegrations?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

  if (sid && token && phone) {
    return {
      client: twilio(sid, token),
      phoneNumber: phone,
      isUserConfig: !!userIntegrations?.twilioSid
    };
  }
  return null;
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
    const db = admin.firestore();
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
  const db = admin.firestore();
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
    
    await callRef.set(sanitizeForFirestore({
      id: callId,
      ownerId: item.ownerId,
      leadId: item.leadId,
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
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
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
      const attempts = (item.attempts || 0) + 1;
      const maxAttempts = userData.settings?.maxRetryAttempts || 3;
      const retryDelay = userData.settings?.retryDelayMinutes || 20;
      
      if (attempts < maxAttempts) {
        const nextRetry = new Date(Date.now() + retryDelay * 60 * 1000);
        await queueRef.update(sanitizeForFirestore({
          status: 'scheduled',
          attempts: attempts,
          nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetry),
          scheduledTime: admin.firestore.Timestamp.fromDate(nextRetry),
          retryReason: error instanceof Error ? error.message : String(error),
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }));
      } else {
        await queueRef.update(sanitizeForFirestore({
          status: 'failed',
          attempts: attempts,
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
  const PORT = 3000;

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
    
    console.log(`[Backend] Voice call request received for lead ${leadId}`);
    if (knowledgeBase) {
      console.log(`[Backend] Knowledge Base context received for call ${callId}`);
    }

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
      console.log(`[Backend] Auth verified for user: ${uid}`);
      
      // Fetch user settings for recording
      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const userData = userDoc.data();
      const recordingEnabled = userData?.communication?.recordingEnabled || false;

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      const twilioConfig = await getTwilioConfig(uid);

      if (twilioConfig) {
        console.log(`[Backend] Initiating real Twilio call to ${normalizedPhone} (Call ID: ${callId}) using ${twilioConfig.isUserConfig ? 'user' : 'system'} credentials`);
        
        const call = await twilioConfig.client.calls.create({
          from: twilioConfig.phoneNumber,
          to: normalizedPhone,
          url: `${APP_URL}/api/voice/twiml?callId=${callId}&ownerId=${uid}`,
          statusCallback: `${APP_URL}/api/webhooks/twilio/status?callId=${callId}`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          record: recordingEnabled,
          recordingStatusCallback: `${APP_URL}/api/webhooks/twilio/recording?callId=${callId}`
        });

        // Update Firestore with Twilio SID and status
        await admin.firestore().collection('calls').doc(callId).update({
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
      }

      console.log(`[Backend] Initiating mock call to ${phoneNumber} for lead ${leadId} (Call ID: ${callId})`);
      
      // Fallback to mock
      res.json({ 
        success: true, 
        message: "Call initiated (mock)",
        callSid: `live-sid-${Date.now()}`,
        mode: 'test'
      });
    } catch (error) {
      console.error('[Backend] Firebase ID token verification failed:', error);
      const message = error instanceof Error ? error.message : "Token verification failed";
      res.status(401).json({ 
        success: false, 
        message: `Authentication failed: ${message}` 
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
          await admin.firestore().collection('smsLogs').doc(logId).update({
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
          await admin.firestore().collection('smsLogs').doc(req.body.logId).update({
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

  // Twilio TwiML Route
  app.post("/api/voice/twiml", async (req, res) => {
    const { callId, ownerId } = req.query;
    const response = new twilio.twiml.VoiceResponse();
    
    console.log(`[Backend] Generating TwiML for call ${callId}`);

    let message = "Hello, this is an automated call from your AI assistant. We are testing the real telephony integration. Have a great day!";

    try {
      if (callId) {
        const callDoc = await admin.firestore().collection('calls').doc(callId as string).get();
        if (callDoc.exists) {
          const callData = callDoc.data();
          const kb = callData?.knowledgeBaseSnapshot;
          
          if (kb) {
            const businessName = kb.profile?.name || "our company";
            const greeting = kb.guidance?.greeting || "Hello";
            const pitch = kb.guidance?.mainPitch || "We are calling to follow up on your interest.";
            
            // Construct a dynamic message
            message = `${greeting}. This is a call from ${businessName}. ${pitch}`;
            console.log(`[Backend] Using KB-driven message for call ${callId}`);
          }
        }
      }
    } catch (err) {
      console.error('[Backend] Error fetching KB for TwiML:', err);
    }

    // Phase 1: Simple message playback
    response.say({ 
      voice: 'Polly.Amy',
      language: 'en-US'
    }, message);
    
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
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

    if (CallStatus === 'completed') {
      updates.endedAt = admin.firestore.FieldValue.serverTimestamp();
      if (CallDuration) {
        updates.duration = parseInt(CallDuration, 10);
      }
    }

    try {
      await admin.firestore().collection('calls').doc(callId as string).update(sanitizeForFirestore(updates));
      
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
          const db = admin.firestore();
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
      await admin.firestore().collection('calls').doc(callId as string).update(sanitizeForFirestore({
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

  // Voice Control Route (Agent Join/Takeover)
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

      // Here you would use Twilio's Update Call API to bridge the agent or modify the TwiML
      res.json({ success: true });
    } catch (error) {
      console.error('[Backend] Voice control error:', error);
      res.status(500).json({ success: false, message: "Failed to update call control" });
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

      // Here you would use Twilio's Recording API
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
      // 1. Verify Authentication
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      // 2. Rate Limiting
      if (!checkRateLimit(uid)) {
        return res.status(429).json({ 
          success: false, 
          message: "Too many test requests. Please wait a minute and try again." 
        });
      }

      // 3. URL Validation & SSRF Protection
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
      
      // Handle Firebase Auth errors specifically
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
      
      // Trigger processing for this specific user only
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
      // 1. Verify Authentication
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      // 2. Rate Limiting
      if (!checkRateLimit(uid)) {
        return res.status(429).json({ 
          success: false, 
          message: "Too many import requests. Please wait a minute." 
        });
      }

      // 3. URL Validation & SSRF Protection
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

      // Remove noise
      $('script, style, nav, footer, header, iframe, noscript, .ads, #ads').remove();

      // Extract meaningful text
      const title = $('title').text().trim();
      const metaDescription = $('meta[name="description"]').attr('content') || '';
      
      // Get main content areas
      const mainContent = $('main, article, #content, .content, .main').text() || $('body').text();
      
      // Clean up whitespace
      const cleanText = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim()
        .substring(0, 15000); // Limit to 15k chars for AI processing

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

  // Call Queue Worker
  // Removed redundant processCallQueue in favor of startCallQueueWorker
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startCallQueueWorker();
  });
}

startServer();
