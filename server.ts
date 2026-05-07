import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
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
// import { spawn } from "child_process"; // removed — ffmpeg not available on Render

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

function firstPresentValue(...values: any[]) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return undefined;
}

function normalizeKbKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findKbSection(source: any, keys: string[]) {
  if (!source || typeof source !== "object") return undefined;
  const normalizedTargets = new Set(keys.map(normalizeKbKey));
  const queue = [source];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = normalizeKbKey(key);
      if (normalizedTargets.has(normalizedKey)) return value;
      if (value && typeof value === "object" && !Array.isArray(value)) queue.push(value);
    }
  }

  return undefined;
}

function normalizeKbForAgent(kb: any = {}) {
  const structured = kb?.structuredKnowledge || kb?.structured || {};
  console.log("[KB RAW KEYS]", Object.keys(kb || {}).join(","));
  console.log("[KB RAW STRUCTURED KEYS]", Object.keys(structured || {}).join(","));
  const source = { ...structured, ...kb };
  const normalized = {
    businessProfile: firstPresentValue(findKbSection(source, ["businessProfile", "business profile", "business", "profile", "companyProfile", "company profile", "businessInfo", "business info"]), {}),
    productsServices: firstPresentValue(findKbSection(source, ["productsServices", "products services", "products / services", "products & services", "products and services", "productServices", "product services", "products", "services", "offerings"]), {}),
    uniqueSellingPoints: firstPresentValue(findKbSection(source, ["uniqueSellingPoints", "unique selling points", "unique selling points usp", "unique selling points / usp", "usp", "usps", "benefits", "whyChooseUs", "why choose us", "valueProposition", "value proposition"]), {}),
    offersPromotions: firstPresentValue(findKbSection(source, ["offersPromotions", "offers promotions", "offers / promotions", "offers & promotions", "offers and promotions", "offers", "promotions", "discounts", "deals", "specialOffers", "special offers"]), {}),
    pricing: firstPresentValue(findKbSection(source, ["pricing", "price", "prices", "cost", "costing", "rates", "rate", "priceRange", "price range", "configurationPricing", "configuration pricing", "startingPrice", "starting price"]), {}),
    location: firstPresentValue(findKbSection(source, ["location", "address", "siteLocation", "site location", "area", "businessLocation", "business location"]), {}),
    amenities: firstPresentValue(findKbSection(source, ["amenities", "amenity", "facilities", "facility", "features"]), {}),
    configurations: firstPresentValue(findKbSection(source, ["configurations", "configuration", "options", "variants", "types", "availableOptions", "available options"]), {}),
    possession: firstPresentValue(findKbSection(source, ["possession", "handover", "completion", "delivery", "timeline", "availabilityDate", "availability date"]), {}),
    investment: firstPresentValue(findKbSection(source, ["investment", "invest", "roi", "returns", "return", "appreciation", "rental"]), {}),
    callGuidance: firstPresentValue(findKbSection(source, ["callGuidance", "call guidance", "guidance", "script"]), {}),
    faqs: firstPresentValue(findKbSection(source, ["faqs", "faq", "questions"])?.items, findKbSection(source, ["faqs", "faq", "questions"]), []),
    objections: firstPresentValue(findKbSection(source, ["objections", "objectionHandling", "objection handling"])?.items, findKbSection(source, ["objections", "objectionHandling", "objection handling"]), []),
    appointments: firstPresentValue(findKbSection(source, ["appointments", "appointment", "scheduling", "appointmentSettings", "appointment settings"]), {}),
    answerBank: firstPresentValue(findKbSection(source, ["answerBank", "answer bank", "answers", "answerBankItems", "answer bank items"]), {}),
    tone: firstPresentValue(findKbSection(source, ["tone", "brandTone", "brand tone", "voiceTone", "voice tone"]), {}),
  };

  console.log("[KB NORMALIZED KEYS]", Object.keys(normalized).filter((key) => {
    const value = (normalized as any)[key];
    return typeof value === "string" ? value.trim() : Array.isArray(value) ? value.length : Object.keys(value || {}).length;
  }).join(","));

  for (const [key, value] of Object.entries(normalized)) {
    console.log("[KB FIELD LENGTH]", key, collectKbText(value).length);
  }

  return normalized;
}

const INTERNAL_KB_KEYS = new Set([
  "ownerid",
  "userid",
  "uid",
  "callid",
  "id",
  "createdat",
  "updatedat",
  "providerid",
  "transcriptbuffer",
  "callcontrolstate",
  "followupinstructions",
  "crminstructions",
  "aftercallactions",
  "aftercall",
  "saveleaddetails",
  "triggernotification",
  "notification",
  "rawmetadata",
  "metadata",
  "provider",
]);

const INTERNAL_TEXT_PATTERNS = [
  /\bafter the call\b/i,
  /\bsave all collected responses\b/i,
  /\bsend lead details to crm\b/i,
  /\btrigger notification\b/i,
  /\bcrm\b/i,
];

function collectKbText(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    if (INTERNAL_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
      console.log("[INTERNAL_KB_EXCLUDED]");
      return "";
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(collectKbText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !INTERNAL_KB_KEYS.has(normalizeKbKey(key)))
      .map(([, item]) => collectKbText(item))
      .filter((item) => item.trim())
      .join(" ");
  }
  return "";
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function trimToSentenceOrWords(value: string, maxWords: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (countWords(clean) <= maxWords) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  let result = "";
  for (const sentence of sentences) {
    const candidate = `${result} ${sentence.trim()}`.trim();
    if (countWords(candidate) > maxWords) break;
    result = candidate;
  }
  if (result) return result;
  return clean.split(/\s+/).slice(0, maxWords).join(" ").replace(/[,:;\-]+$/, "") + ".";
}

function sanitizeOutboundReply(value: string, fallback = "Sorry, could you repeat that?") {
  const original = String(value || "");
  let clean = original
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\b(?:ownerId|userId|callId|providerId|uid|createdAt|updatedAt)\s*[:=]\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean !== original.trim()) {
    console.log("[INTERNAL_ID_REMOVED]");
  }

  if (!clean) clean = fallback;
  console.log("[SAFE_REPLY_FINAL]", clean);
  return clean;
}

function cleanFinalResponse(value: string, fallback = "Sure, what would you like to know?", maxWords = 15) {
  let clean = value
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) {
    console.log("[EMPTY REPLY FALLBACK USED]");
    clean = fallback;
  }
  clean = trimToSentenceOrWords(clean, maxWords).replace(/[,;:\-]+$/g, "").trim();
  const incompleteEnding = /\b(to|and|for|in|on|at|by|of|the|a|an)$/i;
  while (incompleteEnding.test(clean)) {
    const previous = clean;
    clean = clean.replace(/\s+\S+$/g, "").replace(/[,;:\-]+$/g, "").trim();
    if (clean === previous) break;
  }
  if (!clean) clean = fallback;
  clean = sanitizeOutboundReply(clean, fallback);
  if (/\bwith[.!?]?$/i.test(clean)) {
    clean = clean.replace(/\bwith[.!?]?$/i, "with you");
    console.log("[WITH_YOU_FIX_APPLIED]");
  }
  if (!/[.!?]$/.test(clean)) {
    console.log("[INCOMPLETE SENTENCE FIXED]", clean);
    clean += ".";
  }
  console.log("[FINAL CLEAN RESPONSE]", clean);
  return clean;
}

function compressReplyForLiveCall(value: string, maxWords = 16) {
  const original = String(value || "").replace(/\s+/g, " ").trim();
  let clean = original
    .replace(/\bSure,?\s+I can help with that\.\s*/i, "Sure. ")
    .replace(/\bWhat day and time works for you\?/i, "What time works for you?")
    .replace(/\bI don't have exact details right now, but our team can share that with you\.?/i, "Our team can share exact details.")
    .replace(/\bI don't have exact details right now, but our team can share them with you\.?/i, "Our team can share exact details.")
    .replace(/\bwould you like to\b/gi, "want to")
    .replace(/\s+/g, " ")
    .trim();

  clean = cleanFinalResponse(clean, "Sure. What would you like to know?", maxWords);
  if (clean !== original) console.log("[RESPONSE_COMPRESSED]", original, "->", clean);
  console.log("[TTS_OPTIMIZED]", clean.split(/\s+/).filter(Boolean).length);
  return clean;
}

function cleanDirectAnswer(value: string, maxWords = 18) {
  let clean = value.replace(/\s+/g, " ").trim();
  const withoutArtifacts = clean
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutArtifacts !== clean) {
    console.log("[KB ARTIFACT REMOVED]", clean, "->", withoutArtifacts);
    clean = withoutArtifacts;
  }

  let answer = trimToSentenceOrWords(clean, maxWords).trim();
  answer = answer.replace(/\s+/g, " ").replace(/[,;:\-]+$/g, "").trim();

  const incompleteEnding = /\b(and|or|for|to|of|the|a|an)$/i;
  while (incompleteEnding.test(answer)) {
    const previous = answer;
    answer = answer.replace(/\s+\S+$/g, "").replace(/[,;:\-]+$/g, "").trim();
    if (answer === previous) break;
  }

  const phraseBoundary = answer.match(/^(.{20,}?[.!?])/);
  if (phraseBoundary) answer = phraseBoundary[1].trim();
  if (!/[.!?]$/.test(answer)) answer += ".";

  answer = cleanFinalResponse(answer, "I can share those details from the knowledge base.", maxWords);
  console.log("[DIRECT ANSWER CLEANED]", answer);
  return answer;
}

function isWeakFillerInput(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
  const filler = new Set(["hello", "hi", "hey", "yeah", "yes", "okay", "ok", "hmm", "uh", "um", "go ahead", "continue", "awesome", "yeah hey", "hello first"]);
  if (filler.has(normalized)) return true;
  const meaningfulWords = normalized.split(" ").filter((word) => word && !["hello", "hi", "hey", "yeah", "yes", "okay", "ok", "hmm", "uh", "um", "please"].includes(word));
  return meaningfulWords.length > 0 && meaningfulWords.length < 3 && !/[?]/.test(text);
}

type IntentType = "pricing" | "location" | "amenities" | "configuration" | "offers" | "possession" | "investment" | "scheduling" | "language_request" | "general_question";

function detectIntentType(userInput: string): IntentType {
  const t = userInput.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (/\b(hindi|marathi|english|tamil|telugu|kannada|malayalam|gujarati|punjabi|bengali|language|speak|bolo|baat)\b/i.test(t)) return "language_request";
  if (/\b(schedule|book|visit|meeting|appointment|callback|call back|follow up|followup)\b/i.test(t)) return "scheduling";
  if (/\b(cost|price|pricing|rate|rates|fee|fees|charge|charges|amount|how much)\b/i.test(t)) return "pricing";
  if (/\b(where|location|located|address|place|area)\b/i.test(t)) return "location";
  if (/\b(amenity|amenities|facility|facilities|features|included|include)\b/i.test(t)) return "amenities";
  if (/\b(configuration|configurations|config|options|types|available|variant|variants)\b/i.test(t)) return "configuration";
  if (/\b(offer|offers|promotion|promotions|discount|deal|deals)\b/i.test(t)) return "offers";
  if (/\b(possession|handover|ready|completion|delivery|timeline)\b/i.test(t)) return "possession";
  if (/\b(investment|invest|roi|return|returns|rental|appreciation)\b/i.test(t)) return "investment";
  return "general_question";
}

const intentToKBMap: Partial<Record<IntentType, keyof ReturnType<typeof normalizeKbForAgent>>> = {
  pricing: "pricing",
  location: "location",
  amenities: "amenities",
  configuration: "configurations",
  offers: "offersPromotions",
  possession: "possession",
  investment: "investment",
};

const SPEAKABLE_CALL_GUIDANCE_KEYS = [
  "greeting",
  "availabilityCheck",
  "availabilityQuestion",
  "permissionLine",
  "permissionQuestion",
  "hook",
  "openingLine",
  "pitch",
  "mainPitch",
  "shortPitch",
  "qualificationQuestions",
  "closingLine",
];

function pickSpeakableFields(source: any, keys: string[]) {
  if (!source || typeof source !== "object") return {};
  const result: Record<string, any> = {};
  for (const key of keys) {
    const value = findKbSection(source, [key]);
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}

function getSpeakableKbContext(kbContext: ReturnType<typeof normalizeKbForAgent>) {
  const speakableKb = {
    businessProfile: kbContext.businessProfile,
    productsServices: kbContext.productsServices,
    uniqueSellingPoints: kbContext.uniqueSellingPoints,
    offersPromotions: kbContext.offersPromotions,
    pricing: (kbContext as any).pricing,
    location: (kbContext as any).location,
    amenities: (kbContext as any).amenities,
    configurations: (kbContext as any).configurations,
    possession: (kbContext as any).possession,
    investment: (kbContext as any).investment,
    callGuidance: pickSpeakableFields(kbContext.callGuidance, SPEAKABLE_CALL_GUIDANCE_KEYS),
    faqs: kbContext.faqs,
    objections: kbContext.objections,
    appointments: kbContext.appointments,
    answerBank: (kbContext as any).answerBank,
  };
  console.log("[SPEAKABLE_KB_KEYS]", Object.keys(speakableKb).filter((key) => collectKbText((speakableKb as any)[key]).trim()).join(","));
  console.log("[INTERNAL_KB_EXCLUDED]");
  return speakableKb;
}

function getKbDirectAnswer(userSpeech: string, kbContext: ReturnType<typeof normalizeKbForAgent>) {
  const intentType = detectIntentType(userSpeech);
  const speakableKb = getSpeakableKbContext(kbContext);
  console.log("[INTENT TYPE]", intentType);

  if (intentType === "pricing") {
    const pricingSources: Array<[string, any]> = [
      ["pricing", (speakableKb as any).pricing],
      ["faqs", speakableKb.faqs],
      ["offersPromotions", speakableKb.offersPromotions],
    ];
    for (const [sectionName, sectionValue] of pricingSources) {
      const sectionText = collectKbText(sectionValue);
      if (!sectionText.trim()) continue;
      if (sectionName !== "pricing" && !/\b(price|pricing|cost|rate|amount|fee|charge)\b/i.test(sectionText)) continue;
      console.log("[KB SECTION SELECTED]", sectionName);
      const answer = cleanDirectAnswer(sectionText, 16);
      console.log("[ANSWER SOURCE]", sectionName);
      console.log("[KB DIRECT ANSWER]", sectionName, answer);
      console.log("[GEMINI SKIPPED KB MATCH]");
      return answer;
    }
    console.log("[WRONG MATCH BLOCKED]", "missing pricing/faqs pricing/offers pricing");
    return "";
  }

  if (["location", "amenities", "configuration", "offers", "possession", "investment"].includes(intentType)) {
    const sectionName = intentToKBMap[intentType];
    const sectionValue = sectionName ? (speakableKb as any)[sectionName] : undefined;
    console.log("[KB SECTION SELECTED]", sectionName || intentType);
    const sectionText = collectKbText(sectionValue);
    if (sectionText.trim()) {
      const answer = cleanDirectAnswer(sectionText, 18);
      console.log("[ANSWER SOURCE]", sectionName);
      console.log("[KB DIRECT ANSWER]", sectionName, answer);
      console.log("[GEMINI SKIPPED KB MATCH]");
      return answer;
    }
    console.log("[WRONG MATCH BLOCKED]", `missing ${sectionName || intentType}`);
    return "";
  }

  const normalizeTokens = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) =>
        token.length > 2 &&
        !["the", "and", "for", "you", "your", "what", "which", "how", "why", "can", "could", "tell", "share", "explain", "details", "about"].includes(token)
      );

  const userTokens = new Set(normalizeTokens(userSpeech));
  if (userTokens.size === 0) return "";

  const entries = [
    ["faqs", speakableKb.faqs],
    ["pricing", (speakableKb as any).pricing],
    ["location", (speakableKb as any).location],
    ["amenities", (speakableKb as any).amenities],
    ["configurations", (speakableKb as any).configurations],
    ["possession", (speakableKb as any).possession],
    ["investment", (speakableKb as any).investment],
    ["productsServices", speakableKb.productsServices],
    ["uniqueSellingPoints", speakableKb.uniqueSellingPoints],
    ["offersPromotions", speakableKb.offersPromotions],
    ["businessProfile", speakableKb.businessProfile],
    ["objections", speakableKb.objections],
    ["appointments", speakableKb.appointments],
    ["callGuidance", speakableKb.callGuidance],
  ].map(([name, section]) => {
    const sectionText = collectKbText(section);
    const sectionTokens = new Set(normalizeTokens(sectionText));
    let score = 0;
    for (const token of userTokens) {
      if (sectionTokens.has(token)) score++;
    }
    return { name: String(name), sectionText, score };
  }).filter((entry) => entry.sectionText.trim());

  const best = entries.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score <= 0) {
    console.log("[WRONG MATCH BLOCKED]", "no reliable KB match");
    return "";
  }

  const answer = cleanDirectAnswer(best.sectionText, 18);
  console.log("[KB DIRECT ANSWER]", best.name, answer);
  console.log("[GEMINI SKIPPED KB MATCH]");
  return answer;
}

async function generateAiResponse(
  userSpeech: string,
  callData: any,
  kb: any,
  options: {
    conversationStage?: string;
    conversationHistory?: Array<{ role: string; text: string }>;
    detectedIntent?: string;
    preferredLanguage?: string;
    maxWords?: number;
  } = {}
) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log("[EMPTY REPLY FALLBACK USED]");
    return "I don't have exact details right now, but our team can share that with you.";
  }

  const kbContext = normalizeKbForAgent(kb);
  const conversationText = (options.conversationHistory || [])
    .slice(-8)
    .map((item) => `${item.role}: ${item.text}`)
    .join("\n");
  const lastCompleteSentenceWithinLimit = (value: string, maxWords: number) => trimToSentenceOrWords(value, maxWords);
  const kbUsedSection =
    options.detectedIntent === "scheduling" ? "appointments" :
    "best matching KB section";

  const prompt = `You are an AI calling assistant.

Rules:
- Answer ONLY based on relevant parts of the Knowledge Base
- Do NOT read the KB directly
- Pick only the most relevant section
- Keep replies short and conversational (max 15 words)
- Ask follow-up questions naturally
- Do NOT repeat pitch unless user asks
- Do NOT greet, introduce yourself, or say calling from; the greeting was already handled
- Detect the language from User said and reply in the same language
- If Preferred Language is set, continue in that language
- KB can be any language; do not translate KB literally
- If info not found in KB, say: 'I don't have exact details right now, but our team can share them with you.'

Knowledge Base:
${JSON.stringify(kbContext)}

Conversation:
${conversationText || "No previous turns."}

Conversation Stage:
${options.conversationStage || "opening"}

Intent:
${options.detectedIntent || "general"}

Preferred Language:
${options.preferredLanguage || "auto"}

User said:
${userSpeech}

Reply:`;

  try {
    console.log("[KB SECTIONS PASSED] businessProfile, productsServices, uniqueSellingPoints, offersPromotions, callGuidance, faqs, objections, appointments, tone");
    console.log("[KB DIAG] businessProfile=", collectKbText(kbContext.businessProfile).length > 0);
    console.log("[KB DIAG] productsServices=", collectKbText(kbContext.productsServices).length > 0);
    console.log("[KB DIAG] uniqueSellingPoints=", collectKbText(kbContext.uniqueSellingPoints).length > 0);
    console.log("[KB DIAG] offersPromotions=", collectKbText(kbContext.offersPromotions).length > 0);
    console.log("[KB DIAG] callGuidance=", collectKbText(kbContext.callGuidance).length > 0);
    console.log("[KB DIAG] faqsCount=", Array.isArray(kbContext.faqs) ? kbContext.faqs.length : 0);
    console.log("[KB DIAG] objectionsCount=", Array.isArray(kbContext.objections) ? kbContext.objections.length : 0);
    console.log("[KB DIAG] appointments=", Object.keys(kbContext.appointments || {}).length > 0);
    console.log("[KB DIAG] tone=", Object.keys(kbContext.tone || {}).length > 0);
    console.log("[KB USED SECTION]", kbUsedSection);
    const directAnswer = getKbDirectAnswer(userSpeech, kbContext);
    if (directAnswer) {
      console.log("[GEMINI FINAL REPLY]", directAnswer);
      return directAnswer;
    }
    if (isWeakFillerInput(userSpeech)) {
      console.log("[GEMINI SKIPPED FILLER]", userSpeech);
      return "";
    }
    console.log("[GEMINI PROMPT PREVIEW]", prompt.slice(0, 800));
    console.log("[GEMINI CALLED]");
    console.log("[GEMINI ROUTE] Gemini question handling", userSpeech);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    console.log("[GEMINI RAW]", JSON.stringify(data));
    if (!response.ok || data?.error) {
      console.error("[GEMINI ERROR]", JSON.stringify(data?.error || data));
      return "";
    }

    let reply = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    const maxWords = options.maxWords || 12;

    if (countWords(reply) > maxWords) {
      const sentenceCut = lastCompleteSentenceWithinLimit(reply, maxWords);
      if (sentenceCut) reply = sentenceCut;
    }

    reply = cleanFinalResponse(reply, "I don't have exact details right now, but our team can share that with you.", maxWords);
    console.log("[GEMINI FINAL REPLY]", reply);
    return reply;
  } catch (error) {
    console.error("[GEMINI ERROR]", error);
    console.log("[EMPTY REPLY FALLBACK USED]");
    return "I don't have exact details right now, but our team can share that with you.";
  }
}

async function generateGeminiReply({
  transcript,
  knowledgeBase,
  callContext,
  conversationStage,
  conversationHistory,
  detectedIntent,
  maxWords,
  preferredLanguage,
}: {
  transcript: string;
  knowledgeBase: any;
  callContext: any;
  conversationStage?: string;
  conversationHistory?: Array<{ role: string; text: string }>;
  detectedIntent?: string;
  preferredLanguage?: string;
  maxWords?: number;
}) {
  return generateAiResponse(transcript, callContext, knowledgeBase, {
    conversationStage,
    conversationHistory,
    detectedIntent,
    preferredLanguage,
    maxWords,
  });
}

// Sends mu-law 8kHz audio to Vobiz in precise 20 ms / 160-byte chunks.
// Vobiz requires framed delivery; sending the whole buffer at once causes
// packet rejection and silence on the caller side.
const VOBIZ_CHUNK_BYTES = 160;  // 8000 Hz * 1 byte/sample * 0.020 s = 160
const VOBIZ_CHUNK_MS    = 20;

async function sendVobizAudio(ws: any, audioBuffer: Buffer, shouldContinue?: () => boolean): Promise<void> {
  if (!audioBuffer || audioBuffer.length === 0) return;

  const totalChunks = Math.ceil(audioBuffer.length / VOBIZ_CHUNK_BYTES);
  console.log(`[Vobiz Outbound Audio] totalBytes=${audioBuffer.length} chunks=${totalChunks}`);

  for (let i = 0; i < totalChunks; i++) {
    // Guard: abort if the socket has closed or playback was interrupted.
    if (!ws || ws.readyState !== 1) {
      console.warn(`[Vobiz playAudio] WS closed at chunk ${i}/${totalChunks}, aborting`);
      break;
    }
    if (shouldContinue && !shouldContinue()) {
      console.log("[AUDIO INTERRUPTED]");
      console.log("[TTS_INTERRUPTED]");
      break;
    }

    const start = i * VOBIZ_CHUNK_BYTES;
    const end   = Math.min(start + VOBIZ_CHUNK_BYTES, audioBuffer.length);
    let   frame = audioBuffer.slice(start, end);

    // Pad the final (possibly short) frame to exactly 160 bytes with μ-law
    // silence (0xFF = encoded silence in G.711 μ-law) so Vobiz never receives
    // a partial frame.
    if (frame.length < VOBIZ_CHUNK_BYTES) {
      const padded = Buffer.alloc(VOBIZ_CHUNK_BYTES, 0xff);
      frame.copy(padded);
      frame = padded;
    }

    ws.send(JSON.stringify({
      event: "playAudio",
      media: {
        contentType: "audio/x-mulaw",
        sampleRate: 8000,
        payload: frame.toString("base64"),
      },
    }));

    console.log(`[Vobiz playAudio chunk] index=${i} bytes=${frame.length}`);

    // Pace delivery to match real-time playback — one frame every 20 ms
    await new Promise<void>((r) => setTimeout(r, VOBIZ_CHUNK_MS));
  }

  console.log(`[Vobiz Outbound Audio] done sending`);
}

/**
 * Pure-JS G.711 µ-law encoder.
 * Converts a 16-bit signed PCM sample to an 8-bit µ-law byte.
 */
function pcmSampleToMulaw(sample: number): number {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x1FFF;
  let sign = 0;
  if (sample < 0) { sign = 0x80; sample = -sample; }
  sample = Math.min(sample + MULAW_BIAS, 32767);
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}

/**
 * Converts a raw 16-bit little-endian PCM buffer to 8-bit µ-law.
 * No external dependencies — runs anywhere Node.js runs.
 */
function pcm16ToMulaw(pcmBuffer: Buffer): Buffer {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const mulawBuffer = Buffer.allocUnsafe(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulawBuffer[i] = pcmSampleToMulaw(sample);
  }
  return mulawBuffer;
}

/**
 * Fetches TTS audio for a given message + ownerId using the user's configured TTS provider.
 * Returns raw mulaw 8kHz mono bytes ready for Vobiz, or null on failure.
 * Requests mulaw/PCM directly from the provider — no ffmpeg needed.
 */
async function fetchTtsAudio(message: string, ownerId: string, fallbackAttempt = false): Promise<Buffer | null> {
  const safeMessage = sanitizeOutboundReply(message);
  try {
    const userDoc = await db.collection("users").doc(ownerId).get();
    const integrations = userDoc.data()?.integrations || {};
    // Default changed from "polly" to "elevenlabs" — Polly is not supported for Vobiz direct stream
    const provider: string = integrations.ttsProvider || "elevenlabs";

    console.log(`[Vobiz TTS] ownerId=${ownerId} provider=${provider}`);

    if (provider === "elevenlabs") {
      const apiKey = String(integrations.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || "").trim();
      const voiceId = integrations.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM";
      const keySource = integrations.elevenLabsApiKey ? "user" : process.env.ELEVENLABS_API_KEY ? "env" : "missing";
      console.log(`[Vobiz TTS] ElevenLabs keySource=${keySource} keyLen=${apiKey.length} keyPrefix=${apiKey.slice(0, 6)} voiceId=${voiceId}`);
      if (!apiKey) throw new Error("ElevenLabs API Key missing");

      // Request ulaw_8000 directly — ElevenLabs natively supports this output format
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({
          text: safeMessage,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Vobiz TTS] ElevenLabs failed status=${res.status} body=${errText}`);
        throw new Error(`ElevenLabs TTS error: ${res.status}`);
      }
      // Response is already 8kHz mulaw — send directly
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`[Vobiz TTS] returned bytes=${buf.length}`);
      if (buf.length === 0) {
        console.log("[TTS ZERO BYTES FALLBACK]");
        if (!fallbackAttempt) return fetchTtsAudio("Haan, main Hindi mein baat kar sakti hoon.", ownerId, true);
        return null;
      }
      return buf;
    }

    if (provider === "azure") {
      const key = integrations.azureApiKey;
      const region = integrations.azureRegion;
      const voice = integrations.azureVoiceName || "en-US-JennyNeural";
      console.log(`[Vobiz TTS] azure key found=${!!key} region=${region} voice=${voice}`);
      if (!key || !region) throw new Error("Azure credentials missing");

      const ssml = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' name='${voice}'>${escapeXml(safeMessage)}</voice></speak>`;
      // Request raw 8kHz 8-bit mono mulaw directly from Azure — no transcoding needed
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "raw-8khz-8bit-mono-mulaw",
          "User-Agent": "VoxLeadsAI"
        },
        body: ssml
      });
      if (!res.ok) throw new Error(`Azure TTS error: ${res.status}`);
      // Response is already 8kHz mulaw — send directly
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`[Vobiz TTS] returned bytes=${buf.length}`);
      if (buf.length === 0) {
        console.log("[TTS ZERO BYTES FALLBACK]");
        if (!fallbackAttempt) return fetchTtsAudio("Haan, main Hindi mein baat kar sakti hoon.", ownerId, true);
        return null;
      }
      return buf;
    }

    if (provider === "polly") {
      console.error(`[Vobiz TTS] Polly not supported for Vobiz direct stream. Set ttsProvider to elevenlabs or azure in user integrations.`);
      return null;
    }

    // Unknown provider
    console.error(`[Vobiz TTS] Unknown provider='${provider}' — not supported for Vobiz direct stream. Set ttsProvider to elevenlabs or azure.`);
    return null;

  } catch (err) {
    console.error(`[Vobiz TTS error]`, err);
    return null;
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

type TranscriptEntry = {
  role: "Lead" | "AI";
  text: string;
  timestamp: string;
};

const liveCallTranscriptBuffers = new Map<string, TranscriptEntry[]>();

function formatTranscriptEntries(entries: TranscriptEntry[]) {
  return entries
    .filter((entry) => entry.text && entry.text.trim())
    .map((entry) => {
      const label = entry.role === "Lead" ? "User" : "AI";
      return `[${entry.timestamp}] [${label}]: ${entry.text.trim()}`;
    })
    .join("\n");
}

function normalizeServerAnalysisResult(analysis: any) {
  const fallback = {
    summary: "Summary unavailable.",
    outcome: "Contacted",
    sentiment: "neutral",
    keyPoints: [] as string[],
    objectionsRaised: [] as string[],
    nextAction: "Follow up with lead.",
  };

  if (!analysis || typeof analysis !== "object") return fallback;

  const validSentiments = new Set(["positive", "neutral", "negative"]);
  const validOutcomes = new Set(["New", "Contacted", "Interested", "Not Interested", "Follow-up", "Booked"]);

  return {
    summary: typeof analysis.summary === "string" && analysis.summary.trim() ? analysis.summary.trim() : fallback.summary,
    outcome: validOutcomes.has(analysis.outcome) ? analysis.outcome : fallback.outcome,
    sentiment: validSentiments.has(analysis.sentiment) ? analysis.sentiment : fallback.sentiment,
    keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints.filter((item: any) => typeof item === "string") : fallback.keyPoints,
    objectionsRaised: Array.isArray(analysis.objectionsRaised) ? analysis.objectionsRaised.filter((item: any) => typeof item === "string") : fallback.objectionsRaised,
    nextAction: typeof analysis.nextAction === "string" && analysis.nextAction.trim() ? analysis.nextAction.trim() : fallback.nextAction,
  };
}

function buildServerSummaryPrompt(kb: any, transcriptText: string) {
  const businessName =
    kb?.businessProfile?.name ||
    kb?.businessProfile?.businessName ||
    kb?.profile?.name ||
    "our business";

  return `Analyze the following call transcript for ${businessName}.

TRANSCRIPT:
${transcriptText}

Return a JSON object with:
- summary: concise professional summary
- keyPoints: array of key discussion points
- objectionsRaised: array of objections raised by the lead
- sentiment: one of "positive", "neutral", "negative"
- outcome: one of "Interested", "Not Interested", "Follow-up", "Contacted", "Booked"
- nextAction: recommended next action

Return ONLY valid JSON.`;
}

async function generateServerCallSummary(transcriptText: string, kb: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = buildServerSummaryPrompt(kb, transcriptText);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  const data = await response.json();
  if (!response.ok || data?.error) {
    console.error("[SUMMARY ERROR]", JSON.stringify(data?.error || data));
    return null;
  }

  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[SUMMARY ERROR] JSON parse failed:", error);
    return null;
  }
}

async function finalizeCallSummaryFromTranscript(callId: string, transcriptTextFromMemory = "") {
  if (!callId) return;

  const callRef = db.collection("calls").doc(callId);
  const callSnap = await callRef.get();
  if (!callSnap.exists) return;

  const callData = callSnap.data() || {};
  const transcriptText = (
    transcriptTextFromMemory ||
    callData.transcriptText ||
    callData.transcript ||
    ""
  ).trim();

  console.log("[SUMMARY INPUT LENGTH]", transcriptText.length);
  console.log("[ANALYSIS INPUT LENGTH]", transcriptText.length);

  if (!transcriptText) {
    console.log("[SUMMARY SKIPPED EMPTY]");
    await callRef.update(sanitizeForFirestore({
      transcript: "",
      transcriptText: "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }));
    return;
  }

  await callRef.update(sanitizeForFirestore({
    transcript: transcriptText,
    transcriptText,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));
  console.log("[TRANSCRIPT SAVED]", callId);
  console.log("[TRANSCRIPT SAVE LENGTH]", callId, "bytes=", transcriptText.length);

  const existingSummary = String(callData.summary || "").trim();
  const hasUsableSummary =
    existingSummary &&
    existingSummary !== "Summary unavailable." &&
    !existingSummary.toLowerCase().includes("analysis could not be completed") &&
    !existingSummary.toLowerCase().includes("input transcript is empty") &&
    !existingSummary.toLowerCase().includes("valid transcript");
  const hasStructuredAnalysis =
    (Array.isArray(callData.keyDiscussionPoints) && callData.keyDiscussionPoints.length > 0) ||
    (Array.isArray(callData.keyPoints) && callData.keyPoints.length > 0);

  if (hasUsableSummary && hasStructuredAnalysis && callData.analysisStatus === "completed") return;

  const analysis = await generateServerCallSummary(transcriptText, callData.knowledgeBaseSnapshot || {});
  const result = normalizeServerAnalysisResult(analysis);
  console.log("[SUMMARY GENERATED]", result.summary);

  await callRef.update(sanitizeForFirestore({
    summary: result.summary,
    analysisSummary: result.summary,
    summaryText: result.summary,
    callSummary: result.summary,
    aiSummary: result.summary,
    transcriptSummary: result.summary,
    outcome: result.outcome,
    sentiment: result.sentiment,
    keyPoints: result.keyPoints,
    keyDiscussionPoints: result.keyPoints,
    objectionsRaised: result.objectionsRaised,
    nextAction: result.nextAction,
    detailedAnalysis: result.summary,
    analysisStatus: "completed",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));
  console.log("[SUMMARY SAVED]", callId);
  console.log("[ANALYSIS STRUCTURED SAVED]", callId);

  if (callData.leadId) {
    await db.collection("leads").doc(callData.leadId).update(sanitizeForFirestore({
      status: result.outcome,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })).catch((error) => console.error("[SUMMARY ERROR] Lead update failed:", error));
  }
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

type VobizConfig = {
  authId: string;
  authToken: string;
  phoneNumber: string;
};

async function startVobizRecording(callId: string, ownerId: string, callUuid: string, vobizConfig: VobizConfig) {
  const callbackUrl = `${APP_URL}/api/webhooks/vobiz/recording?callId=${encodeURIComponent(callId)}`;
  const response = await fetch(`https://api.vobiz.ai/api/v1/Account/${vobizConfig.authId}/Call/${callUuid}/Record/`, {
    method: "POST",
    headers: {
      "X-Auth-ID": vobizConfig.authId,
      "X-Auth-Token": vobizConfig.authToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      time_limit: 7200,
      file_format: "mp3",
      callback_url: callbackUrl,
      callback_method: "POST",
      record_channel_type: "mono",
    }),
  });

  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(data?.message || `Vobiz recording failed with status ${response.status}`);
  }

  await db.collection("calls").doc(callId).update(sanitizeForFirestore({
    recordingStatus: "processing",
    recordingSid: data?.recording_id,
    recordingUrl: data?.url,
    recordingProvider: "vobiz",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));

  console.log(`[Vobiz Recording] started callId=${callId} callUuid=${callUuid} recordingId=${data?.recording_id || "pending"}`);
  return data;
}

async function stopVobizRecording(callId: string, callUuid: string, vobizConfig: VobizConfig, recordingUrl?: string) {
  const response = await fetch(`https://api.vobiz.ai/api/v1/Account/${vobizConfig.authId}/Call/${callUuid}/Record/`, {
    method: "DELETE",
    headers: {
      "X-Auth-ID": vobizConfig.authId,
      "X-Auth-Token": vobizConfig.authToken,
      "Content-Type": "application/json",
    },
    body: recordingUrl ? JSON.stringify({ URL: recordingUrl }) : undefined,
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `Vobiz stop recording failed with status ${response.status}`);
  }

  await db.collection("calls").doc(callId).update(sanitizeForFirestore({
    recordingStatus: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }));

  console.log(`[Vobiz Recording] stopped callId=${callId} callUuid=${callUuid}`);
}

async function ensureVobizRecordingStarted(callId?: string | null, ownerId?: string | null) {
  if (!callId || !ownerId) return;

  try {
    const callRef = db.collection("calls").doc(callId);
    const callSnap = await callRef.get();
    const callData = callSnap.data() || {};

    if (callData.provider !== "vobiz") return;
    if (callData.recordingStatus !== "requested") return;
    if (!callData.callSid) {
      console.warn(`[Vobiz Recording] callSid missing for callId=${callId}`);
      return;
    }

    const vobizConfig = await getVobizConfig(ownerId);
    if (!vobizConfig) {
      console.warn(`[Vobiz Recording] config missing for ownerId=${ownerId}`);
      return;
    }

    await startVobizRecording(callId, ownerId, callData.callSid, vobizConfig);
  } catch (error) {
    console.error("[Vobiz Recording] start failed:", error);
    await db.collection("calls").doc(callId).update(sanitizeForFirestore({
      recordingStatus: "failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })).catch((updateError) => console.error("[Vobiz Recording] failed status update error:", updateError));
  }
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
  const server = createServer(app);

  // Manual noServer init — gives full control over upgrade routing and logging
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    console.log(`[WS Upgrade] Incoming upgrade request: ${url}`);

    if (url.startsWith("/ws/vobiz-stream")) {
      console.log(`[WS Upgrade] Routing to Vobiz stream handler`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log(`[WS Upgrade] Upgrade complete — emitting connection`);
        wss.emit("connection", ws, request);
      });
    } else {
      console.log(`[WS Upgrade] No handler for path: ${url} — destroying socket`);
      socket.destroy();
    }
  });

  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/debug/gemini-models", async (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: "Missing GEMINI_API_KEY" });
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await response.json() as any;

      if (!response.ok || data?.error) {
        console.error("[GEMINI ERROR]", JSON.stringify(data?.error || data));
        return res.status(response.status || 500).json({ success: false, error: data?.error || data });
      }

      const models = (data?.models || []).filter((model: any) =>
        Array.isArray(model.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes("generateContent")
      );
      const names = models.map((model: any) => model.name);
      console.log("[GEMINI AVAILABLE MODELS]", names);

      res.json({ success: true, models });
    } catch (error) {
      console.error("[GEMINI ERROR]", error);
      res.status(500).json({ success: false, message: "Failed to fetch Gemini models" });
    }
  });

  // Vobiz WebSocket connection handler
  wss.on("connection", (ws, request) => {
    console.log("[VOBIZ ACTIVE HANDLER HIT]");

    const urlParams = new URLSearchParams(request.url?.split("?")[1] || "");
    const callId = urlParams.get("callId");
    let ownerId = urlParams.get("ownerId");

    console.log(`[WS OPEN] callId=${callId} ownerId=${ownerId}`);
    void ensureVobizRecordingStarted(callId, ownerId);

    type CallState = "GREETING" | "SPEAKING" | "COOLDOWN" | "LISTENING" | "PROCESSING" | "ENDING" | "ENDED";

    let state: CallState = "GREETING";
    let mediaBuffers: Buffer[] = [];
    let lastTranscript = "";
    let lastAiReply = "";
    let heldTranscript = "";
    let turnInProgress = false;
    let callCompletedLogged = false;
    let greetingDelivered = false;
    let leadData: {
      nameConfirmed: boolean;
      answers: Record<number, string>;
      outcome?: string;
    } = {
      nameConfirmed: false,
      answers: {},
    };
    let currentQuestionIndex = 0;
    let nameConfirmed = false;
    let availabilityDelivered = false;
    let permissionDelivered = false;
    let hookDelivered = false;
    let pitchDelivered = false;
    let qualificationStarted = false;
    let appointmentPromptDelivered = false;
    type ConversationStage = "greeting" | "availability" | "permission" | "hook" | "pitch" | "qualification" | "post_qualification" | "appointment" | "closing" | "ended";
    let conversationStage: ConversationStage = "greeting";
    const conversationHistory: Array<{ role: string; text: string }> = [];
    const transcriptBuffer = callId ? (liveCallTranscriptBuffers.get(callId) || []) : [];
    if (callId) liveCallTranscriptBuffers.set(callId, transcriptBuffer);

    const appendTranscript = async (role: "Lead" | "AI", text: string) => {
      const cleanText = String(text || "").trim();
      if (!cleanText) return;

      transcriptBuffer.push({ role, text: cleanText, timestamp: new Date().toISOString() });
      const transcriptText = formatTranscriptEntries(transcriptBuffer);
      console.log(role === "Lead" ? "[TRANSCRIPT APPEND USER]" : "[TRANSCRIPT APPEND AI]", cleanText);

      if (callId) {
        await db.collection("calls").doc(callId).update(sanitizeForFirestore({
          transcript: transcriptText,
          transcriptText,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })).catch((error) => console.error("[TRANSCRIPT SAVE LENGTH] update failed:", error));
        console.log("[TRANSCRIPT SAVE LENGTH]", callId, "bytes=", transcriptText.length);
      }
    };
    const STT_WINDOW_FRAMES = 60; // 1.2 seconds at 20ms/frame
    const NON_ACTIONABLE = new Set([
      "hi", "hello", "hmm", "uh", "um", "okay", "ok", "yeah", "yes", "silence"
    ]);

    let savedCallbackTime = "";
    let preferredLanguage = "English";
    let lastQuestion = "";
    let lastAckReply = "";
    let pendingCompletedStage: ConversationStage | null = null;
    const completedStages = new Set<ConversationStage>();
    let playbackInterrupted = false;
    let disinterestTerminationPending = false;
    let bargeInBuffers: Buffer[] = [];
    let pendingBargeInAudio: Buffer | null = null;
    const BARGE_IN_WINDOW_FRAMES = 35;
    const appointmentData: {
      requested: boolean;
      type: string | null;
      date: string | null;
      time: string | null;
      confirmed: boolean;
    } = {
      requested: false,
      type: null,
      date: null,
      time: null,
      confirmed: false,
    };

    const normalizeTimeTranscript = (value: string) =>
      value
        .toLowerCase()
        .replace(/five\s+b\s*m/g, "5 PM")
        .replace(/five\s+p\s*m/g, "5 PM")
        .replace(/5\s+p\s*m/g, "5 PM")
        .replace(/\bfive\b/g, "5")
        .replace(/\bsix\b/g, "6")
        .replace(/\bseven\b/g, "7")
        .replace(/\beight\b/g, "8")
        .replace(/\bnine\b/g, "9")
        .replace(/\bten\b/g, "10")
        .replace(/\beleven\b/g, "11")
        .replace(/\btwelve\b/g, "12")
        .replace(/\s+/g, " ")
        .trim();

    const extractCallbackTime = (value: string) => {
      const normalized = normalizeTimeTranscript(value);
      const match = normalized.match(/\b(\d{1,2})(?::\d{2})?\s*(am|pm|a m|p m)\b/i);
      if (!match) {
        const period = normalized.match(/\b(morning|afternoon|evening)\b/i)?.[1];
        return period || "";
      }

      const hour = match[1];
      const suffix = (match[2] || "").replace(/\s+/g, "").toUpperCase();
      return `${hour} ${suffix}`;
    };

    const extractCallbackDate = (value: string) => {
      const t = normalizeTurnText(value);
      if (/\btomorrow\b/i.test(t)) return "tomorrow";
      if (/\btoday\b/i.test(t)) return "today";
      if (/\bnext week\b/i.test(t)) return "next week";
      const weekday = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
      if (weekday) return weekday;
      const explicitDate = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i);
      if (explicitDate) return explicitDate[0];
      return "";
    };

    const extractAppointmentType = (value: string) => {
      const t = normalizeTurnText(value);
      if (/\bfollow up|followup\b/i.test(t)) return "follow-up";
      if (/\bcall back|callback|call later\b/i.test(t)) return "callback";
      if (/\bappointment\b/i.test(t)) return "appointment";
      if (/\bmeeting\b/i.test(t)) return "meeting";
      if (/\bvisit\b/i.test(t)) return "visit";
      return null;
    };

    const updateAppointmentData = (text: string) => {
      const type = extractAppointmentType(text);
      const date = extractCallbackDate(text);
      const time = extractCallbackTime(text);

      if (type || date || time || isExplicitSchedulingRequest(text)) appointmentData.requested = true;
      if (type && !appointmentData.type) appointmentData.type = type;
      if (date) appointmentData.date = date;
      if (time) {
        appointmentData.time = time;
        savedCallbackTime = time;
      }

      console.log("[SCHEDULING DATA UPDATED]", JSON.stringify(appointmentData));
      console.log("[APPOINTMENT DATA UPDATED]", JSON.stringify(appointmentData));
      return { date, time, type };
    };

    const buildAppointmentMemoryConfirmation = () => {
      if (appointmentData.date && appointmentData.time) return `Got it. ${appointmentData.date} at ${appointmentData.time}.`;
      if (appointmentData.time) return `Got it. At ${appointmentData.time}.`;
      if (appointmentData.date) return `Got it. For ${appointmentData.date}.`;
      return "Got it.";
    };

    const buildAppointmentPromptForMissingInfo = () => {
      if (appointmentData.date && !appointmentData.time) return "What time works for you?";
      if (appointmentData.time && !appointmentData.date) return "Which day works for you?";
      return "Sure. What time works for you?";
    };

    const getMaxWordsForStage = () => 14;

    const trimReplyForStage = (reply: string, maxWords = getMaxWordsForStage()) => {
      const words = reply.split(/\s+/).filter(Boolean);
      if (words.length <= maxWords) {
        console.log("[REPLY WORD COUNT]", words.length);
        return reply;
      }

      const sentences = reply.match(/[^.!?]+[.!?]+/g) || [];
      let result = "";
      for (const sentence of sentences) {
        const candidate = `${result} ${sentence.trim()}`.trim();
        if (candidate.split(/\s+/).filter(Boolean).length > maxWords) break;
        result = candidate;
      }

      const trimmed = result || words.slice(0, maxWords).join(" ") + ".";
      console.log("[REPLY WORD COUNT]", trimmed.split(/\s+/).filter(Boolean).length);
      return trimmed;
    };

    const normalizeSttTranscript = (text: string) => {
      const normalized = normalizeTurnText(text);
      if (normalized === "yesterday sir" || normalized === "yesterday") return "yes sudesh here";
      if (normalized === "yes sir" || normalized === "yeah sir") return "yes";
      return text;
    };

    const isPositiveNameConfirmation = (text: string) => {
      const t = normalizeTurnText(text);
      return (
        t === "yes sudesh here" ||
        t === "yes sir" ||
        t === "yes" ||
        t === "yeah" ||
        t === "yep" ||
        t === "correct" ||
        t === "speaking" ||
        t.includes("this is") ||
        t.includes("speaking")
      );
    };

    const hasTimeExpression = (text: string) => Boolean(extractCallbackTime(text));

    const hasDateExpression = (text: string) => Boolean(extractCallbackDate(text));

    const isExplicitSchedulingRequest = (text: string) => {
      const t = normalizeTurnText(text);
      return (
        /\b(schedule|book|call later|follow up|followup|appointment|not now|busy|arrange callback|call me later|i am busy|im busy|callback|call back|meeting)\b/i.test(t) ||
        hasTimeExpression(text) ||
        hasDateExpression(text)
      );
    };

    const isLanguageRequest = (text: string) => {
      const t = normalizeTurnText(text);
      return (
        /\b(hindi|english|hinglish|marathi|tamil|telugu|kannada|malayalam|gujarati|punjabi|bengali|language)\b/i.test(t) &&
        /\b(talk|speak|baat|baat karo|baat kariye|bolo|boliye|bol|can you|could you|nahi aati|mein|me)\b/i.test(t)
      ) || /\b(hindi me|hindi mein|hindi bolo|hindi boliye|hindi baat|hindi mein baat karo|hindi me baat kariye|hinglish|english mein|english me|mujhe english nahi aati)\b/i.test(t);
    };

    const getRequestedLanguage = (text: string) => {
      const t = normalizeTurnText(text);
      if (/\bhindi\b/i.test(t)) return "Hindi";
      if (/\bhinglish\b/i.test(t)) return "Hinglish";
      if (/\bmarathi\b/i.test(t)) return "Marathi";
      if (/\benglish\b/i.test(t)) return "English";
      if (/\btamil\b/i.test(t)) return "Tamil";
      if (/\btelugu\b/i.test(t)) return "Telugu";
      if (/\bkannada\b/i.test(t)) return "Kannada";
      if (/\bmalayalam\b/i.test(t)) return "Malayalam";
      if (/\bgujarati\b/i.test(t)) return "Gujarati";
      if (/\bpunjabi\b/i.test(t)) return "Punjabi";
      if (/\bbengali\b/i.test(t)) return "Bengali";
      return preferredLanguage;
    };

    const isDisinterestIntent = (text: string) => {
      const t = normalizeTurnText(text);
      return /\b(not interested|no interest|i am not interested|im not interested|i'm not interested|totally not interested|dont call|don't call|stop|remove me|remove my number|not now|no thanks|cancel)\b/i.test(t);
    };

    const isObjectionIntent = (text: string) => {
      const t = normalizeTurnText(text);
      return isDisinterestIntent(text) || /\b(dont want|do not want|too expensive|already have|stop calling|no need)\b/i.test(t);
    };

    const isMetaComment = (text: string) => {
      const t = normalizeTurnText(text);
      const laterStage = ["qualification", "post_qualification", "appointment"].includes(conversationStage);
      return /\b(i am recording|im recording|recording this|i am testing|im testing|testing this|test call)\b/i.test(t) ||
        (laterStage && ["okay", "ok", "hello", "hi"].includes(t));
    };

    const isIdentityQuestion = (text: string) => {
      const t = normalizeTurnText(text);
      return /\b(who is this|who are you|who is it|who am i speaking to|where are you calling from|whos calling|who is calling|are you calling me|what was that)\b/i.test(t);
    };

    const isPurposeQuestion = (text: string) => {
      const t = normalizeTurnText(text);
      return /\b(why are you calling|why did you call|why calling|what is this about|what are you calling about|reason for calling)\b/i.test(t);
    };

    const isKbQuestionIntent = (text: string) => {
      const t = normalizeTurnText(text);
      return (
        isIdentityQuestion(text) ||
        isPurposeQuestion(text) ||
        text.trim().endsWith("?") ||
        /\b(who|what|which|when|where|how|why|details|detail|options|available|feature|features|explain|product|service|business|tell me|share|describe|can you|could you|i want to ask)\b/i.test(t)
      );
    };

    const isBargeInPhrase = (text: string) => {
      const t = normalizeTurnText(text);
      return /\b(no no|wait|stop|listen|one second|hello|can you|i want to ask)\b/i.test(t) || isKbQuestionIntent(text);
    };

    const isContinueInfoRequest = (text: string) => {
      const t = normalizeTurnText(text);
      return /\b(continue|tell me more|more details)\b/i.test(t);
    };

    const hasIntentConflict = (text: string) => isKbQuestionIntent(text) && isExplicitSchedulingRequest(text);

    const isAppointmentSuggestionIntent = (text: string) => {
      const t = normalizeTurnText(text);
      return /\b(ok|okay|sounds good|what next|interested|go ahead|next)\b/i.test(t);
    };

    type RoutedIntent =
      | "disinterest"
      | "language_request"
      | "direct_question"
      | "objection"
      | "scheduling_request"
      | "meta_comment"
      | "qualification_answer"
      | "unclear"
      | "scripted_next_step";

    const classifyUserIntent = (text: string): RoutedIntent => {
      if (isDisinterestIntent(text)) return "disinterest";
      const intentType = detectIntentType(text);
      if (intentType === "language_request" || isLanguageRequest(text)) return "language_request";
      if (intentType === "scheduling") return "scheduling_request";
      if (["pricing", "location", "amenities", "configuration", "offers", "possession", "investment"].includes(intentType)) return "direct_question";
      if (isContinuationIntent(text)) return "scripted_next_step";
      if (hasIntentConflict(text)) {
        console.log("[INTENT CONFLICT BLOCKED]", "direct_question priority over scheduling");
        return "direct_question";
      }
      if (isKbQuestionIntent(text)) return "direct_question";
      if (isObjectionIntent(text)) return "objection";
      if (isExplicitSchedulingRequest(text)) return "scheduling_request";
      if (isMetaComment(text)) return "meta_comment";
      if (conversationStage === "qualification" && text.trim().split(/\s+/).filter(Boolean).length > 0) return "qualification_answer";
      if (!text.trim()) return "unclear";
      return "scripted_next_step";
    };

    const detectIntent = (text: string) => {
      const t = text.toLowerCase();
      if (isExplicitSchedulingRequest(text)) return "scheduling";
      if (t.includes("yes") || t.includes("ok")) return "confirmation";
      return "general";
    };

    const isContinuationIntent = (text: string) => {
      const t = normalizeTurnText(text);
      return [
        "yes",
        "yes we can talk",
        "okay",
        "ok",
        "okay go ahead",
        "go ahead",
        "continue",
        "tell me",
        "yes explain",
        "explain",
        "sure",
        "speak",
        "proceed",
      ].includes(t) || /\b(yes|okay|ok|sure)\b.*\b(explain|continue|go ahead|tell me|speak|proceed)\b/i.test(t);
    };

    const isSemanticAvailabilityConfirmation = (text: string) => isContinuationIntent(text) || isPositiveNameConfirmation(text);
    const isPermissionPositive = (text: string) => isContinuationIntent(text) || isPositiveNameConfirmation(text);
    const isPermissionNegative = (text: string) => /\b(no|not interested)\b/i.test(text);
    const isBusyOrCallLater = (text: string) => isExplicitSchedulingRequest(text);
    const isIdentityConfirmed = (text: string) => isPositiveNameConfirmation(text) || /\b(right|it is|okay|ok|sure)\b/i.test(text);
    const isAvailabilityPositive = (text: string) => isSemanticAvailabilityConfirmation(text);
    const isAvailabilityNegative = (text: string) => /\b(no|not interested)\b/i.test(text) || isExplicitSchedulingRequest(text);
    const isPositiveResponse = (text: string) => isContinuationIntent(text) || /\b(interested|please)\b/i.test(text) || isPositiveNameConfirmation(text);

    const firstText = (...values: any[]) => {
      for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
        if (Array.isArray(value)) {
          const first = value.find((item) => typeof item === "string" && item.trim());
          if (first) return first.trim();
          const objectText = value.find((item) => item && typeof item === "object" && typeof (item.question || item.text || item.value) === "string");
          if (objectText) return String(objectText.question || objectText.text || objectText.value).trim();
        }
      }
      return "";
    };

    const getCallGuidance = (kb: any) => kb?.callGuidance || kb?.guidance || {};
    const prepareScriptField = (text: string) => {
      const words = text.split(/\s+/).filter(Boolean);
      console.log("[SCRIPT FULL FIELD USED]", words.length);
      if (words.length <= 60) {
        console.log("[TRIM SKIPPED SHORT SCRIPT]");
        return cleanFinalResponse(text, text, 60);
      }

      const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
      let trimmed = "";
      for (const sentence of sentences) {
        const candidate = `${trimmed} ${sentence.trim()}`.trim();
        if (candidate.split(/\s+/).filter(Boolean).length > 60) break;
        trimmed = candidate;
      }
      if (!trimmed) trimmed = sentences[0]?.trim() || text.trim();
      trimmed = cleanFinalResponse(trimmed, trimmed, 1000);
      console.log("[SCRIPT TRIMMED AT SENTENCE]", trimmed);
      return trimmed;
    };
    const getScriptField = (kb: any, field: string, fallback: string, aliases: string[] = []) => {
      const guidance = getCallGuidance(kb);
      for (const key of [field, ...aliases]) {
        const text = firstText(guidance?.[key]);
        if (text) {
          console.log("[KB SCRIPT FIELD USED]", key, "kb");
          return prepareScriptField(text);
        }
      }
      console.log("[KB SCRIPT FIELD MISSING]", field, aliases.length ? aliases.join(",") : "no-aliases");
      console.log("[KB SCRIPT FIELD USED]", field, "fallback");
      return prepareScriptField(fallback);
    };
    const getOpeningHook = (kb: any) =>
      getScriptField(kb, "hook", "May I take 30 seconds to explain?", ["openingLine"]);

    const getMainPitch = (kb: any) =>
      getScriptField(kb, "pitch", "I can share the key details briefly.", ["mainPitch"]);

    const getQualificationQuestions = (kb: any) => {
      const raw = getCallGuidance(kb)?.qualificationQuestions;
      const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return values
        .flatMap((item) => firstText(item)
          .split(/\r?\n+|(?<=[?])\s+(?=[A-Z0-9])/)
          .map((line) => line.trim())
          .filter(Boolean))
        .map((text, index) => ({ id: `q${index + 1}`, text }));
    };

    const getFirstQualificationQuestion = (kb: any) => {
      const questions = getQualificationQuestions(kb);
      if (questions[0]?.text) {
        console.log("[KB SCRIPT FIELD USED]", "qualificationQuestions", "kb");
        return questions[0].text;
      }
      return getScriptField(kb, "qualificationQuestions", "May I ask what you are looking for?");
    };

    const isIncompletePhrase = (text: string) => {
      const words = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const lastWord = words[words.length - 1] || "";
      return ["of", "your", "for", "to", "about", "need", "want"].includes(lastWord);
    };

    const isVaguePartialTranscript = (text: string) => {
      const normalized = normalizeTurnText(text);
      return [
        "but one",
        "yeah before can",
        "i would like to",
        "i need your",
        "before can",
      ].some((phrase) => normalized === phrase || normalized.endsWith(` ${phrase}`));
    };

    const isLowConfidenceAllowed = (text: string) => Boolean(extractCallbackTime(text));

    const buildAppointmentConfirmation = (kb: any, callbackTime: string) => {
      const appointments = kb?.appointments || {};
      const template =
        appointments.confirmationTemplate ||
        appointments.confirmationMessage ||
        appointments.callbackConfirmation;

      if (typeof template === "string" && template.trim()) {
        return template
          .replace(/\{\{\s*time\s*\}\}/gi, callbackTime)
          .replace(/\{\s*time\s*\}/gi, callbackTime);
      }

      return `Confirmed, I'll arrange a callback at ${callbackTime}.`;
    };

    const getKbBusinessName = (kb: any) =>
      kb?.businessProfile?.name ||
      kb?.businessProfile?.businessName ||
      kb?.businessProfile?.companyName ||
      kb?.profile?.name ||
      "the business";

    const isOpeningCheckIn = (text: string) => {
      if (!["availability", "permission", "hook"].includes(conversationStage)) return false;
      return (
        text === "hello" ||
        text.includes("is this") ||
        text.includes("are you there") ||
        text.includes("can you hear me") ||
        text.includes("who is this")
      );
    };

    const containsGreetingLikeText = (text: string) => /\b(hello|hi|good morning|good afternoon|this is|calling from)\b/i.test(text);

    const sanitizeAiReplyForStage = (reply: string, fallback: string) => {
      if (greetingDelivered && containsGreetingLikeText(reply)) {
        console.log("[GREETING GUARD] rejected repeated greeting");
        return fallback;
      }
      return reply;
    };

    const getLeadName = (callData: any) =>
      callData?.lead?.name ||
      callData?.lead?.fullName ||
      callData?.leadName ||
      callData?.name ||
      "";

    const getAgentName = (kb: any, callData: any) =>
      kb?.callGuidance?.agentName ||
      kb?.businessProfile?.agentName ||
      kb?.agentName ||
      callData?.agentName ||
      "AI assistant";

    const applyGreetingPlaceholders = (greeting: string, callData: any, kb: any) => {
      const leadName = String(getLeadName(callData) || "").trim();
      const leadValue = leadName && leadName.toLowerCase() !== "unknown lead" ? leadName : "you";
      const businessName = getKbBusinessName(kb);
      const agentName = getAgentName(kb, callData);

      return greeting
        .replace(/\[Lead Name\]|\{\{\s*leadName\s*\}\}|\{\s*leadName\s*\}/gi, leadValue)
        .replace(/\[Business Name\]|\{\{\s*businessName\s*\}\}|\{\s*businessName\s*\}/gi, businessName)
        .replace(/\[Agent Name\]|\{\{\s*agentName\s*\}\}|\{\s*agentName\s*\}/gi, agentName)
        .replace(/\bto\s+you\s*,/gi, "to you,")
        .replace(/\s+/g, " ")
        .trim();
    };

    const buildInitialGreeting = (callData: any, kb: any) => {
      const greeting = getScriptField(kb, "greeting", "Hello, am I speaking to [Lead Name]?");
      return applyGreetingPlaceholders(greeting, callData, kb);
    };

    const buildAvailabilityQuestion = (callData: any, kb: any) =>
      applyGreetingPlaceholders(getScriptField(kb, "availabilityCheck", "Is this a good time for a quick call?", ["availabilityQuestion"]), callData, kb);

    const buildPermissionQuestion = (callData: any, kb: any) =>
      applyGreetingPlaceholders(getScriptField(kb, "permissionLine", "May I quickly explain?", ["permissionQuestion"]), callData, kb);

    const buildSchedulingQuestion = (callData: any, kb: any) => {
      const guidance = getCallGuidance(kb);
      const appointments = kb?.appointments || {};
      const text = firstText(
        appointments.betterTimeQuestion,
        appointments.schedulingQuestion,
        appointments.callbackQuestion,
        appointments.rescheduleQuestion,
        appointments.callLaterQuestion,
        guidance.appointmentPrompt,
        guidance.schedulingQuestion,
        guidance.callbackQuestion
      );
      console.log("[KB SCRIPT FIELD USED]", text ? "appointmentPrompt" : "appointmentPrompt fallback", text ? "kb" : "fallback");
      if (!text) console.log("[KB SCRIPT FIELD MISSING]", "appointmentPrompt", "appointments/callGuidance fallback");
      return applyGreetingPlaceholders(text || "Would you like to continue further or schedule a follow-up?", callData, kb);
    };

    const buildClosingLine = (callData: any, kb: any) =>
      applyGreetingPlaceholders(getScriptField(kb, "closingLine", "Thanks for your time. We'll follow up shortly."), callData, kb);

    const buildIdentityResponse = (kb: any, leadContext: any) => {
      const guidance = getCallGuidance(kb);
      const profile = kb?.businessProfile || kb?.profile || {};
      const agentName = firstText(guidance.agentName, kb?.agentName, profile.agentName, leadContext?.agentName);
      const businessName = firstText(
        profile.businessName,
        profile.name,
        profile.companyName,
        kb?.businessName,
        kb?.companyName,
        leadContext?.businessName
      );
      const teamName = firstText(guidance.teamName, guidance.role, profile.teamName, profile.role, kb?.teamName, kb?.role);

      console.log("[DYNAMIC_IDENTITY_USED]");
      if (agentName && teamName && businessName) return `This is ${agentName} from ${teamName} at ${businessName}.`;
      if (agentName && businessName) return `This is ${agentName} from ${businessName}.`;
      if (teamName && businessName) return `This is ${teamName} from ${businessName}.`;
      if (businessName) return `This is our team from ${businessName}.`;
      return "This is our team calling regarding your inquiry.";
    };

    const buildIdentityReply = (callData: any, kb: any) => {
      console.log("[META_QUESTION_HANDLED]");
      return buildIdentityResponse(kb, callData);
    };

    const buildPurposeReply = (callData: any, kb: any) => {
      const guidance = getCallGuidance(kb);
      const purpose = firstText(guidance.purpose, guidance.callPurpose, guidance.openingLine, guidance.hook);
      console.log("[META_QUESTION_HANDLED]");
      return applyGreetingPlaceholders(
        purpose || "I'm calling regarding your inquiry and wanted to briefly share some details.",
        callData,
        kb
      );
    };

    const buildLanguageReply = () => {
      console.log("[ANSWER SOURCE]", "language handler");
      if (preferredLanguage === "Hindi" || preferredLanguage === "Hinglish") return "Ji, boliye.";
      return "Please go ahead.";
    };

    const renderForConversationLanguage = (text: string) => {
      if (!text) return text;
      if (preferredLanguage !== "Hindi" && preferredLanguage !== "Hinglish") return text;
      const normalized = normalizeTurnText(text);
      if (normalized.includes("self use") && normalized.includes("investment")) return "Self use ke liye ya investment?";
      if (normalized.includes("configuration")) return "Aapko kaunsa configuration chahiye?";
      if (normalized.includes("location") || normalized.includes("where")) return "Aapki preferred location kya hai?";
      if (normalized.includes("time") || normalized.includes("day")) return "Kaunsa time theek rahega?";
      if (normalized.includes("good time") || normalized.includes("quick call")) return "Kya abhi baat kar sakte hain?";
      if (normalized.includes("explain")) return "Main short mein explain karun?";
      return text;
    };

    const getCurrentPendingPrompt = (callData: any, kb: any) => {
      if (conversationStage === "availability") return buildAvailabilityQuestion(callData, kb);
      if (conversationStage === "permission") return buildPermissionQuestion(callData, kb);
      if (conversationStage === "hook") return applyGreetingPlaceholders(getOpeningHook(kb), callData, kb);
      if (conversationStage === "pitch") return applyGreetingPlaceholders(getMainPitch(kb), callData, kb);
      if (conversationStage === "qualification") {
        const questions = getQualificationQuestions(kb);
        return questions[currentQuestionIndex]?.text
          ? renderForConversationLanguage(applyGreetingPlaceholders(questions[currentQuestionIndex].text, callData, kb))
          : "";
      }
      if (conversationStage === "appointment" && !appointmentPromptDelivered) return buildSchedulingQuestion(callData, kb);
      return "";
    };

    const preQualificationStagesDelivered = () =>
      availabilityDelivered && permissionDelivered && hookDelivered && pitchDelivered;

    const deliverAppointmentPrompt = (callData: any, kb: any) => {
      appointmentPromptDelivered = true;
      console.log("[APPOINTMENT PROMPT DELIVERED]");
      return buildSchedulingQuestion(callData, kb);
    };

    const askNextQualificationQuestion = (callData: any, kb: any) => {
      const questions = getQualificationQuestions(kb);

      while (leadData.answers[currentQuestionIndex]) {
        console.log("[QUALIFICATION QUESTION SKIPPED]", currentQuestionIndex);
        console.log("[QUESTION SKIPPED]", currentQuestionIndex, questions[currentQuestionIndex]?.id || "unknown");
        currentQuestionIndex += 1;
      }

      const question = questions[currentQuestionIndex];
      if (!question) {
        moveStage("post_qualification");
        console.log("[APPOINTMENT DEFERRED]");
        console.log("[STAGE FLOW]", conversationStage);
        return "Thanks, I have noted that.";
      }

      qualificationStarted = true;
      console.log("[QUESTION ASKED]", currentQuestionIndex, question.id, question.text);
      return renderForConversationLanguage(applyGreetingPlaceholders(question.text, callData, kb));
    };

    function normalizeUserInput(text: string) {
      const t = text.toLowerCase();

      if (t.includes("selfie")) return "self-use";
      if (/\bself\s*use\b/i.test(t)) return "self_use";
      if (/\b3\s*bhk|three\s*bhk|c\s*bhk|cbhk|free\s*bhk\b/i.test(t)) return "3bhk";
      if (t.includes("investment")) return "investment";

      return text;
    }

    const storeQualificationAnswer = (transcript: string) => {
      if (!qualificationStarted) return;
      const clean = normalizeUserInput(transcript);
      const normalizedAnswer = normalizeTurnText(clean);
      if (!normalizedAnswer) return;

      const duplicateIndex = Object.entries(leadData.answers)
        .find(([, answer]) => normalizeTurnText(String(answer)) === normalizedAnswer)?.[0];
      if (duplicateIndex !== undefined) {
        console.log("[QUALIFICATION DUPLICATE BLOCKED]", duplicateIndex, clean);
        if (leadData.answers[currentQuestionIndex]) {
          console.log("[QUALIFICATION QUESTION SKIPPED]", currentQuestionIndex);
          currentQuestionIndex += 1;
        }
        return;
      }

      if (leadData.answers[currentQuestionIndex]) {
        console.log("[QUALIFICATION QUESTION SKIPPED]", currentQuestionIndex);
        console.log("[QUESTION SKIPPED]", currentQuestionIndex, "already answered");
        currentQuestionIndex += 1;
      }
      leadData.answers[currentQuestionIndex] = clean;
      console.log("[ANSWER STORED]", currentQuestionIndex, clean);
      console.log("[LEAD MEMORY UPDATED]", currentQuestionIndex, "->", clean);
      currentQuestionIndex += 1;
    };

    const stageOrder: ConversationStage[] = ["greeting", "availability", "permission", "hook", "pitch", "qualification", "post_qualification", "appointment", "closing", "ended"];
    const scriptedStageOrder: ConversationStage[] = ["greeting", "availability", "permission", "hook", "pitch", "qualification", "appointment", "closing", "ended"];
    const stageAfter = (stage: ConversationStage): ConversationStage => {
      const index = scriptedStageOrder.indexOf(stage);
      if (index < 0) return stage;
      if (stage === "ended") return "ended";
      return scriptedStageOrder[Math.min(index + 1, scriptedStageOrder.length - 1)] || stage;
    };
    const markCompletedStage = (stage: ConversationStage | null) => {
      if (!stage || stage === "post_qualification" || stage === "ended") return;
      completedStages.add(stage);
    };
    const skipCompletedStage = (stage: ConversationStage) => {
      if (!completedStages.has(stage)) return stage;
      console.log("[STAGE_LOCKED]", stage);
      console.log("[STAGE_REPLAY_BLOCKED]", stage);
      console.log("[STAGE_ALREADY_COMPLETED]", stage);
      const next = stageAfter(stage);
      console.log("[ADVANCING_TO_NEXT_STAGE]", next);
      moveStage(next);
      return conversationStage;
    };

    const moveStage = (nextStage: ConversationStage) => {
      if (stageOrder.indexOf(nextStage) < stageOrder.indexOf(conversationStage)) {
        console.log("[BLOCKED BACKWARD TRANSITION]", conversationStage, "->", nextStage);
        return conversationStage;
      }
      conversationStage = nextStage;
      return conversationStage;
    };

    const getStageReply = (stage: ConversationStage, callData: any, kb: any) => {
      if (stage === "ended") return { reply: "", nextStage: "ended" as ConversationStage };
      const activeStage = skipCompletedStage(stage);
      if (activeStage === "ended") return { reply: "", nextStage: "ended" as ConversationStage };
      if (activeStage !== stage) return getStageReply(activeStage, callData, kb);
      if (activeStage === "availability") return { reply: buildAvailabilityQuestion(callData, kb), nextStage: "permission" as ConversationStage };
      if (activeStage === "permission") return { reply: buildPermissionQuestion(callData, kb), nextStage: "hook" as ConversationStage };
      if (activeStage === "hook") return { reply: applyGreetingPlaceholders(getOpeningHook(kb), callData, kb), nextStage: "pitch" as ConversationStage };
      if (activeStage === "pitch") return { reply: applyGreetingPlaceholders(getMainPitch(kb), callData, kb), nextStage: "qualification" as ConversationStage };
      if (activeStage === "qualification") return { reply: askNextQualificationQuestion(callData, kb), nextStage: "qualification" as ConversationStage };
      if (activeStage === "appointment") return { reply: buildAppointmentPromptForMissingInfo(), nextStage: "appointment" as ConversationStage };
      if (activeStage === "closing") return { reply: buildClosingLine(callData, kb), nextStage: "ended" as ConversationStage };
      return { reply: "", nextStage: activeStage };
    };

    const getNextUnfinishedStageReply = (callData: any, kb: any) => {
      let stage = conversationStage;
      while (completedStages.has(stage) && stage !== "ended") {
        console.log("[STAGE_LOCKED]", stage);
        console.log("[STAGE_REPLAY_BLOCKED]", stage);
        console.log("[STAGE_ALREADY_COMPLETED]", stage);
        stage = stageAfter(stage);
        console.log("[ADVANCING_TO_NEXT_STAGE]", stage);
      }
      moveStage(stage);
      return getStageReply(stage, callData, kb);
    };

    const missingKbAnswerFallback = "Our team can share exact details.";
    const pricingFallback = "Pricing depends on configuration and availability, but our team can share exact details.";

    type NextAction = "answer_from_kb" | "ask_next_question" | "clarify" | "fallback" | "end_call";

    const isEchoReply = (reply: string, userInput: string) => {
      const replyText = normalizeTurnText(reply);
      const userText = normalizeTurnText(userInput);
      if (!replyText || !userText) return false;
      return replyText === userText || replyText.startsWith(userText) || userText.startsWith(replyText);
    };

    const findKbAnswerForTurn = (userInput: string, kb: any) => {
      const answer = getKbDirectAnswer(userInput, normalizeKbForAgent(kb));
      if (answer && isEchoReply(answer, userInput)) {
        console.log("[ECHO BLOCKED]", userInput);
        return "";
      }
      return answer;
    };

    const decideNextAction = (userInput: string, state: any): NextAction => {
      const routed = classifyUserIntent(userInput);
      if (state?.stage === "ended" || conversationStage === "ended") return "end_call";
      if (routed === "disinterest") return "end_call";
      if (routed === "objection" || isPermissionNegative(userInput)) return "end_call";
      if (routed === "direct_question") return "answer_from_kb";
      if (routed === "scheduling_request") return "ask_next_question";
      if (routed === "unclear" || isWeakFillerInput(userInput)) return "clarify";
      if (routed === "qualification_answer" || routed === "scripted_next_step") return "ask_next_question";
      return "clarify";
    };

    const buildCallState = (callData: any, callContext: any, detectedIntent: string, lowConfidenceWithoutTime: boolean) => ({
      stage: conversationStage,
      callData,
      callContext,
      detectedIntent,
      lowConfidenceWithoutTime,
    });

    const timedStep = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      const start = Date.now();
      const timingLabel = label === "getNextReply" ? "intent routing" : label;
      console.log(`[TIMING] ${timingLabel} start`);
      try {
        return await fn();
      } finally {
        const duration = Date.now() - start;
        console.log(`[TIMING] ${timingLabel} end duration=${duration}ms`);
      }
    };

    const deliverMissingPreQualificationStage = (_callData: any, _kb: any) => {
      console.log("[STAGE_PRESERVED]", conversationStage);
      return "";
    };

    const getNextReply = async (transcript: string, callState: any, kb: any) => {
      const callData = callState.callData;
      const callContext = callState.callContext;
      if (conversationStage === "ended") {
        console.log("[CALL_ENDED_DISINTEREST]", "already ended");
        return { reply: "", needsGemini: false, maxWords: 0, completedStage: null };
      }
      const routedIntent = classifyUserIntent(transcript);
      const turnIntent =
        routedIntent === "disinterest" ? "frustration" :
        routedIntent === "direct_question" ? "direct_question" :
        routedIntent === "scheduling_request" ? "scheduling_request" :
        routedIntent === "objection" ? "frustration" :
        isPermissionNegative(transcript) ? "frustration" :
        routedIntent === "qualification_answer" ? "answer" :
        routedIntent === "meta_comment" ? "unrelated" :
        isPositiveResponse(transcript) ? "answer" :
        callState.detectedIntent || "unrelated";
      const intent =
        turnIntent === "scheduling_request" ? "appointment" :
        turnIntent === "frustration" ? "negative" :
        turnIntent === "answer" ? "positive" :
        turnIntent;

      console.log("[STATE BEFORE]", conversationStage);
      console.log("[INTENT ROUTER]", routedIntent);
      console.log("[INTENT PRIORITY]", "language_request > direct_question > scheduling_request > general_response > scripted_flow");
      console.log("[INTENT DETECTED]", routedIntent);
      console.log("[INTENT]", intent);
      console.log("[TURN INTENT]", turnIntent);
      console.log("[QUESTION INDEX]", currentQuestionIndex);

      if (routedIntent === "disinterest") {
        console.log("[DISINTEREST_DETECTED]", transcript);
        console.log("[CALL_TERMINATION_INTENT]");
        if (conversationStage === "qualification") console.log("[QUALIFICATION_BLOCKED_DISINTEREST]");
        playbackInterrupted = true;
        leadData.outcome = "not_interested";
        disinterestTerminationPending = true;
        console.log("[GEMINI SKIPPED]");
        return decision("Understood. Thanks for your time.", "closing", false, 6);
      }

      const repeatComplaintReply = (text: string) => {
        const t = text.toLowerCase();
        if (t.includes("already told") || t.includes("you said") || t.includes("again")) {
          console.log("[REPEATED_QUESTION_BLOCKED]");
          if (conversationStage === "qualification") {
            currentQuestionIndex += 1;
            const nextQuestion = askNextQualificationQuestion(callData, kb);
            return nextQuestion || "Sure.";
          }
          return "Sure.";
        }
        return "";
      };

      const meaningfulWordCount = (value: string) =>
        normalizeTurnText(value)
          .split(" ")
          .filter((word) => word && !["hello", "hi", "hey", "yeah", "yes", "okay", "ok", "go", "ahead", "please"].includes(word)).length;

      const isContextualShortAnswer = (value: string) => {
        const t = normalizeTurnText(value);
        if (!t) return false;
        if (conversationStage === "appointment" && (hasDateExpression(value) || hasTimeExpression(value))) {
          console.log("[QUESTION_CONTEXT_MATCH]", "appointment");
          return true;
        }
        if (conversationStage !== "qualification") return false;
        const words = t.split(" ").filter(Boolean);
        if (words.length > 4) return false;
        const context = normalizeTurnText(`${lastQuestion} ${lastAiReply} ${getCurrentPendingPrompt(callData, kb)}`);
        if (!context) return false;
        if ((context.includes("self use") || context.includes("investment")) && /\b(self use|self|investment|invest)\b/i.test(t)) {
          console.log("[QUESTION_CONTEXT_MATCH]", "self_use_or_investment");
          return true;
        }
        if ((context.includes("configuration") || context.includes("config")) && /\b(\d+\s*bhk|bhk|cbhk|c bhk|three bhk|one|two|three|four)\b/i.test(t)) {
          console.log("[QUESTION_CONTEXT_MATCH]", "configuration");
          return true;
        }
        if ((context.includes("location") || context.includes("where")) && /^[a-z ]{2,30}$/i.test(t)) {
          console.log("[QUESTION_CONTEXT_MATCH]", "location");
          return true;
        }
        if (currentQuestionIndex >= 0 && words.length > 0) {
          console.log("[QUESTION_CONTEXT_MATCH]", "qualification");
          return true;
        }
        return false;
      };

      const isIncompleteUserInput = (value: string) => {
        const t = normalizeTurnText(value);
        if (isContextualShortAnswer(value)) return false;
        if (["what", "why", "how", "where", "who", "are you", "why do", "what was", "what is", "can you"].includes(t)) return true;
        return meaningfulWordCount(value) > 0 && meaningfulWordCount(value) < 3 && detectIntentType(value) === "general_question";
      };

      const isGenericGreetingInput = (value: string) => ["hello", "hello?", "hi", "hi?"].includes(value.trim().toLowerCase());
      const isGenericContinueInput = (value: string) => isContinuationIntent(value);
      const hasClearBusinessIntent = (value: string) => {
        const intentType = detectIntentType(value);
        if (["pricing", "location", "amenities", "configuration", "offers", "possession", "investment", "scheduling", "language_request"].includes(intentType)) return true;
        const t = normalizeTurnText(value);
        return /\b(product|service|business|details|detail|available|feature|features|not interested|expensive|busy)\b/i.test(t);
      };

      const handleContextualInput = async () => {
        if (isGenericGreetingInput(transcript)) {
          console.log("[KB_SEARCH_SKIPPED_LOW_CONFIDENCE]");
          console.log("[GENERIC_INPUT_HANDLED]");
          console.log("[CONTEXTUAL_REPLY_USED]");
          console.log("[STAGE_PRESERVED]", conversationStage);
          return decision("Yes, I'm here.", conversationStage, false, 8);
        }

        if (isIncompleteUserInput(transcript)) {
          console.log("[INTENT_CONFIDENCE_LOW]");
          console.log("[KB_SEARCH_BLOCKED]");
          console.log("[KB_SEARCH_SKIPPED_LOW_CONFIDENCE]");
          console.log("[INCOMPLETE_INPUT_CLARIFIED]", transcript);
          console.log("[STAGE_PRESERVED]", conversationStage);
          return decision(preferredLanguage === "Hindi" || preferredLanguage === "Hinglish" ? "Samajh nahi aaya." : "Please repeat.", conversationStage, false, 6);
        }

        if (isGenericContinueInput(transcript)) {
          console.log("[KB_SEARCH_SKIPPED_LOW_CONFIDENCE]");
          console.log("[GENERIC_INPUT_HANDLED]");
          console.log("[CONTEXTUAL_REPLY_USED]");
          const nextStageReply = getNextUnfinishedStageReply(callData, kb);
          if (nextStageReply.reply) {
            return decision(nextStageReply.reply, nextStageReply.nextStage, false, 14);
          }
        }

        return null;
      };

      const answerFromKB = async () => {
        if (!hasClearBusinessIntent(transcript) && !isIdentityQuestion(transcript) && !isPurposeQuestion(transcript)) {
          console.log("[INTENT_CONFIDENCE_LOW]");
          console.log("[KB_SEARCH_BLOCKED]");
          console.log("[STAGE_PRESERVED]", conversationStage);
          return decision(preferredLanguage === "Hindi" || preferredLanguage === "Hinglish" ? "Samajh nahi aaya." : "Please repeat.", conversationStage, false, 6);
        }
        console.log("[KB_SEARCH_ALLOWED]");
        if (conversationStage === "appointment") {
          console.log("[USER QUESTION OVERRIDES APPOINTMENT]");
        } else {
          console.log("[INTENT OVERRIDE] user question detected, skipping appointment");
        }
        if (isPurposeQuestion(transcript)) {
          console.log("[DECISION: ANSWER]");
          console.log("[DIRECT QUESTION HANDLED]");
          console.log("[RETURNING TO STAGE]", conversationStage);
          return decision(buildPurposeReply(callData, kb), conversationStage, false, 18);
        }
        if (isIdentityQuestion(transcript)) {
          console.log("[DECISION: ANSWER]");
          console.log("[DIRECT QUESTION HANDLED]");
          console.log("[RETURNING TO STAGE]", conversationStage);
          return decision(buildIdentityReply(callData, kb), conversationStage, false, 14);
        }
        const answer = findKbAnswerForTurn(transcript, kb);
        if (answer) {
          console.log("[DECISION: ANSWER]");
          console.log("[DIRECT QUESTION HANDLED]");
          console.log("[FAQ ANSWERED]");
          console.log("[RETURNING TO STAGE]", conversationStage);
          return decision(sanitizeAiReplyForStage(answer, missingKbAnswerFallback), conversationStage, false, 14);
        }
        console.log("[DECISION: FALLBACK]");
        console.log("[DIRECT QUESTION HANDLED]");
        console.log("[RETURNING TO STAGE]", conversationStage);
        return decision(detectIntentType(transcript) === "pricing" ? pricingFallback : missingKbAnswerFallback, conversationStage, false, 14);
      };

      const decision = async (reply: string, nextStage: ConversationStage, needsGemini = false, maxWords = 10) => {
        let finalReply = reply;
        const currentQuestion = finalReply.trim();
        const previousStage = conversationStage;
        const stageWasCompleted = completedStages.has(previousStage);
        if (nextStage === previousStage && stageWasCompleted) {
          console.log("[RECURSIVE_STAGE_BLOCKED]", previousStage);
          const advancedStage = stageAfter(previousStage);
          console.log("[ADVANCING_TO_NEXT_STAGE]", advancedStage);
          const advancedReply = getStageReply(advancedStage, callData, kb);
          finalReply = advancedReply.reply || "Sure.";
          nextStage = advancedReply.nextStage;
        }
        if (currentQuestion.endsWith("?")) {
          if (lastQuestion === currentQuestion) {
            console.log("[LOOP BLOCKED] same question detected");
            finalReply = "Sure.";
          } else {
            lastQuestion = currentQuestion;
          }
        }
        if (["Sure."].includes(finalReply) && lastAckReply === finalReply) {
          console.log("[ACK_REPEAT_BLOCKED]");
          const nextStageReply = getNextUnfinishedStageReply(callData, kb);
          finalReply = nextStageReply.reply || "Please continue.";
          nextStage = nextStageReply.nextStage;
        }
        lastAckReply = finalReply;
        pendingCompletedStage = !needsGemini && nextStage !== previousStage ? previousStage : null;
        if (nextStage !== conversationStage) moveStage(nextStage);
        if (conversationStage !== previousStage) console.log("[STAGE_ADVANCED]", previousStage, "->", conversationStage);
        else console.log("[STAGE_PRESERVED]", conversationStage);
        console.log("[REPLY DECISION]", finalReply, "nextStage=", conversationStage, "gemini=", needsGemini);
        console.log("[STATE AFTER]", conversationStage);
        return { reply: finalReply, needsGemini, maxWords, completedStage: pendingCompletedStage };
      };

      const detectLanguageRequest = (userText: string) =>
        detectIntentType(userText) === "language_request" || isLanguageRequest(userText);

      const handleLanguageSwitch = (userText: string) => {
        console.log("[LANGUAGE REQUEST DETECTED]", userText);
        preferredLanguage = getRequestedLanguage(userText);
        console.log("[CONVERSATION LANGUAGE]", preferredLanguage);
        console.log("[PREFERRED LANGUAGE SET]", preferredLanguage);
        console.log("[LANGUAGE SWITCH]", preferredLanguage);
        console.log("[GEMINI SKIPPED]");
        console.log("[RETURNING TO STAGE]", conversationStage);
        return decision(buildLanguageReply(), conversationStage, false, 14);
      };

      if (detectLanguageRequest(transcript)) {
        return handleLanguageSwitch(transcript);
      }

      const advanceScriptAfterConfirmation = () => {
        if (conversationStage === "availability" && isSemanticAvailabilityConfirmation(transcript)) {
          console.log("[SEMANTIC_CONFIRMATION_DETECTED]", transcript);
          availabilityDelivered = true;
          markCompletedStage("availability");
          console.log("[AVAILABILITY_COMPLETED]");
          console.log("[STAGE_REPLAY_BLOCKED]", "availability");
          const nextStageReply = getStageReply("permission", callData, kb);
          return decision(nextStageReply.reply, nextStageReply.nextStage, false, 14);
        }
        if (conversationStage === "permission" && isContinuationIntent(transcript)) {
          console.log("[SEMANTIC_CONFIRMATION_DETECTED]", transcript);
          permissionDelivered = true;
          markCompletedStage("permission");
          const nextStageReply = getStageReply("hook", callData, kb);
          return decision(nextStageReply.reply, nextStageReply.nextStage, false, 60);
        }
        if (conversationStage === "hook" && isContinuationIntent(transcript)) {
          console.log("[SEMANTIC_CONFIRMATION_DETECTED]", transcript);
          hookDelivered = true;
          markCompletedStage("hook");
          const nextStageReply = getStageReply("pitch", callData, kb);
          return decision(nextStageReply.reply, nextStageReply.nextStage, false, 60);
        }
        if (conversationStage === "pitch" && isContinuationIntent(transcript)) {
          console.log("[SEMANTIC_CONFIRMATION_DETECTED]", transcript);
          pitchDelivered = true;
          markCompletedStage("pitch");
          const nextStageReply = getStageReply("qualification", callData, kb);
          return decision(nextStageReply.reply, nextStageReply.nextStage, false, 18);
        }
        return null;
      };

      const stageConfirmationDecision = advanceScriptAfterConfirmation();
      if (stageConfirmationDecision) return stageConfirmationDecision;

      if (conversationStage === "qualification" && isContextualShortAnswer(transcript)) {
        console.log("[CONTEXTUAL_SHORT_ANSWER_ACCEPTED]", transcript);
        storeQualificationAnswer(transcript);
        const nextQuestionReply = askNextQualificationQuestion(callData, kb);
        return decision(nextQuestionReply, conversationStage, false, 8);
      }

      if (conversationStage === "appointment" && (hasDateExpression(transcript) || hasTimeExpression(transcript))) {
        console.log("[APPOINTMENT_CONTEXT_MATCH]", transcript);
        updateAppointmentData(transcript);
        console.log("[SCHEDULING_DATA_CAPTURED]", JSON.stringify(appointmentData));
        if (appointmentData.date && appointmentData.time) {
          appointmentData.confirmed = true;
          console.log("[SCHEDULING CONFIRMED]", JSON.stringify(appointmentData));
          return decision(buildAppointmentMemoryConfirmation(), "post_qualification", false, 10);
        }
        return decision(buildAppointmentPromptForMissingInfo(), "appointment", false, 8);
      }

      const contextualDecision = await handleContextualInput();
      if (contextualDecision) return contextualDecision;

      const nextAction = decideNextAction(transcript, callState);
      console.log("[DECISION ACTION]", nextAction);
      console.log("[INTENT TYPE]", detectIntentType(transcript));
      if (nextAction === "ask_next_question") console.log("[DECISION: ASK_NEXT]");
      if (nextAction === "clarify") console.log("[DECISION: CLARIFY]");
      if (nextAction === "fallback") console.log("[DECISION: FALLBACK]");

      if (nextAction === "end_call") {
        console.log("[DECISION: END_CALL]");
        if (isDisinterestIntent(transcript)) {
          console.log("[DISINTEREST_DETECTED]", transcript);
          console.log("[CALL_TERMINATION_INTENT]");
          if (conversationStage === "qualification") console.log("[QUALIFICATION_BLOCKED_DISINTEREST]");
          playbackInterrupted = true;
          leadData.outcome = "not_interested";
          disinterestTerminationPending = true;
          return decision("Understood. Thanks for your time.", "closing", false, 6);
        }
        return decision(buildClosingLine(callData, kb), "closing", false, 14);
      }

      const repeatReply = repeatComplaintReply(transcript);
      if (repeatReply) return decision(repeatReply, conversationStage, false, 10);

      if (conversationStage === "ended") return decision("", "ended", false);

      if (["post_qualification", "appointment"].includes(conversationStage) && routedIntent !== "direct_question" && routedIntent !== "scheduling_request" && isWeakFillerInput(transcript)) {
        console.log("[GEMINI SKIPPED FILLER]", transcript);
        const pendingPrompt = getCurrentPendingPrompt(callData, kb);
        return decision(pendingPrompt || "Sure, what would you like to know?", conversationStage, false, 14);
      }

      if (routedIntent === "language_request") {
        console.log("[LANGUAGE REQUEST DETECTED]", transcript);
        preferredLanguage = getRequestedLanguage(transcript);
        console.log("[CONVERSATION LANGUAGE]", preferredLanguage);
        console.log("[PREFERRED LANGUAGE SET]", preferredLanguage);
        console.log("[LANGUAGE SWITCH]", preferredLanguage);
        console.log("[GEMINI SKIPPED]");
        console.log("[RETURNING TO STAGE]", conversationStage);
        return decision(buildLanguageReply(), conversationStage, false, 14);
      }

      if (routedIntent === "meta_comment") {
        console.log("[META COMMENT HANDLED]", transcript);
        console.log("[RETURNING TO STAGE]", conversationStage);
        const pendingPrompt = getCurrentPendingPrompt(callData, kb);
        return decision(pendingPrompt, conversationStage, false, 14);
      }

      if (intent === "direct_question") {
        return answerFromKB();
      }

      if (nextAction === "answer_from_kb") {
        return answerFromKB();
      }

      if (routedIntent === "objection") {
        console.log("[GEMINI SKIPPED]");
        return decision(buildClosingLine(callData, kb), "closing", false, 14);
      }

      if (conversationStage === "post_qualification") {
        if (routedIntent === "scheduling_request") {
          updateAppointmentData(transcript);
          console.log("[DECISION: ASK_NEXT]");
          console.log("[APPOINTMENT TRIGGERED]");
          console.log("[GEMINI SKIPPED]");
          return decision(buildAppointmentPromptForMissingInfo(), "appointment", false, 10);
        }
        if (isContinueInfoRequest(transcript)) {
          console.log("[DECISION: CLARIFY]");
          console.log("[CONTINUE HANDLED AS INFO REQUEST]");
          return decision("Sure, what would you like to know?", "post_qualification", false, 14);
        }
        if (isAppointmentSuggestionIntent(transcript)) {
          console.log("[DECISION: ASK_NEXT]");
          console.log("[APPOINTMENT TRIGGERED]");
          console.log("[GEMINI SKIPPED]");
          return decision(buildAppointmentPromptForMissingInfo(), "appointment", false, 10);
        }
        console.log("[DECISION: CLARIFY]");
        console.log("[APPOINTMENT DEFERRED]");
        return decision("Sure, what would you like to know?", "post_qualification", false, 14);
      }

      if (conversationStage === "appointment") {
        updateAppointmentData(transcript);
        if (appointmentData.date && appointmentData.time) {
          appointmentData.confirmed = true;
          console.log("[APPOINTMENT TIME ALREADY KNOWN]");
          console.log("[SCHEDULING CONFIRMED]", JSON.stringify(appointmentData));
          console.log("[APPOINTMENT CONFIRMED]", JSON.stringify(appointmentData));
          console.log("[GEMINI SKIPPED]");
          return decision(buildAppointmentMemoryConfirmation(), "post_qualification", false, 12);
        }
        if (appointmentData.time || appointmentData.date) {
          console.log("[APPOINTMENT DATA UPDATED]", JSON.stringify(appointmentData));
        }
        if (isContinueInfoRequest(transcript)) {
          console.log("[CONTINUE HANDLED AS INFO REQUEST]");
          return decision("Sure, what would you like to know?", "appointment", false, 14);
        }
        if (appointmentPromptDelivered) {
          console.log("[APPOINTMENT LOOP BLOCKED]");
          return decision("Sure, what would you like to know?", "appointment", false, 14);
        }
        console.log("[GEMINI SKIPPED]");
        return decision(buildAppointmentPromptForMissingInfo(), "appointment", false, 10);
      }

      if (intent === "appointment") {
        updateAppointmentData(transcript);
        if (appointmentData.date && appointmentData.time) {
          appointmentData.confirmed = true;
          console.log("[APPOINTMENT TIME ALREADY KNOWN]");
          console.log("[SCHEDULING CONFIRMED]", JSON.stringify(appointmentData));
          console.log("[APPOINTMENT CONFIRMED]", JSON.stringify(appointmentData));
          return decision(buildAppointmentMemoryConfirmation(), "post_qualification", false, 12);
        }
        console.log("[GEMINI SKIPPED]");
        return decision(buildAppointmentPromptForMissingInfo(), "appointment", false, 10);
      }

      if (conversationStage === "availability") {
        if (!availabilityDelivered) {
          leadData.nameConfirmed = leadData.nameConfirmed || isIdentityConfirmed(transcript);
          if (leadData.nameConfirmed) console.log("[NAME CONFIRMATION] accepted");
          availabilityDelivered = true;
          console.log("[GEMINI SKIPPED]");
          return decision(buildAvailabilityQuestion(callData, kb), "permission", false);
        }
        console.log("[GEMINI SKIPPED]");
        return decision(buildPermissionQuestion(callData, kb), "hook", false);
      }

      if (conversationStage === "permission") {
        if (intent === "negative") return decision(buildClosingLine(callData, kb), "closing", false, 30);
        if (!permissionDelivered) {
          permissionDelivered = true;
          console.log("[GEMINI SKIPPED]");
          return decision(buildPermissionQuestion(callData, kb), "hook", false);
        }
        console.log("[GEMINI SKIPPED]");
        return decision(applyGreetingPlaceholders(getOpeningHook(kb), callData, kb), "pitch", false, 60);
      }

      if (conversationStage === "hook") {
        if (intent === "negative") return decision(buildClosingLine(callData, kb), "closing", false, 30);
        if (!hookDelivered) {
          hookDelivered = true;
          console.log("[GEMINI SKIPPED]");
          return decision(applyGreetingPlaceholders(getOpeningHook(kb), callData, kb), "pitch", false, 60);
        }
        console.log("[GEMINI SKIPPED]");
        return decision(applyGreetingPlaceholders(getMainPitch(kb), callData, kb), "qualification", false, 60);
      }

      if (conversationStage === "pitch") {
        if (!pitchDelivered) {
          pitchDelivered = true;
          console.log("[GEMINI SKIPPED]");
          return decision(applyGreetingPlaceholders(getMainPitch(kb), callData, kb), "qualification", false, 60);
        }
        console.log("[GEMINI SKIPPED]");
        return decision(askNextQualificationQuestion(callData, kb), "qualification", false, 18);
      }

      if (conversationStage === "qualification") {
        if (callState.lowConfidenceWithoutTime) {
          console.log("[TURN HELD] low confidence", transcript);
          return decision("Sure, what would you like to know?", conversationStage, false, 14);
        }
        if (qualificationStarted) storeQualificationAnswer(transcript);
        const nextQuestionReply = askNextQualificationQuestion(callData, kb);
        return decision(nextQuestionReply, conversationStage, false);
      }

      if (conversationStage === "closing") return decision(buildClosingLine(callData, kb), "ended", false, 30);

      console.log("[GEMINI CALLED]");
      const answer = await timedStep("Gemini", () => generateGeminiReply({
        transcript,
        knowledgeBase: kb,
        callContext,
        conversationStage,
        conversationHistory,
        detectedIntent: callState.detectedIntent,
        preferredLanguage,
        maxWords: 14,
      }));
      return decision(sanitizeAiReplyForStage(answer, buildAvailabilityQuestion(callData, kb)), conversationStage, true, 14);
    };

    console.log("[Vobiz State] GREETING");

    const isEnded = () => state === "ENDED";
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const normalizeTurnText = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ");

    function getVadScore(audioBuffer: Buffer) {
      let sum = 0;
      for (let i = 0; i < audioBuffer.length; i++) {
        sum += Math.abs(audioBuffer[i] - 128);
      }
      return sum / audioBuffer.length;
    }

    function analyzeMulawWindow(audioBuffer: Buffer) {
      const counts = new Map<number, number>();
      let sum = 0;
      for (const byte of audioBuffer) {
        counts.set(byte, (counts.get(byte) || 0) + 1);
        sum += byte;
      }

      const mean = audioBuffer.length ? sum / audioBuffer.length : 0;
      let varianceSum = 0;
      for (const byte of audioBuffer) {
        const delta = byte - mean;
        varianceSum += delta * delta;
      }

      const unique = counts.size;
      const maxByteCount = Math.max(0, ...counts.values());
      const mostCommonRatio = audioBuffer.length ? maxByteCount / audioBuffer.length : 1;
      const averageEnergy = audioBuffer.length ? Math.sqrt(varianceSum / audioBuffer.length) : 0;
      const likelyConstantSilence = unique < 8 || mostCommonRatio > 0.85;
      const lowVariationNoise = unique < 12 && averageEnergy < 10;

      return {
        unique,
        maxByteCount,
        mostCommonRatio,
        averageEnergy,
        isSilent: likelyConstantSilence || lowVariationNoise,
      };
    }

    function isValidTranscript(text: string) {
      if (!text) return false;
      const t = text.trim().toLowerCase();
      if (t.length < 4) return false;
      if (t === lastTranscript) return false;
      return true;
    }

    const resemblesLastAiReply = (transcript: string) => {
      const normalizedTranscript = normalizeTurnText(transcript);
      const normalizedReply = normalizeTurnText(lastAiReply);
      if (!normalizedTranscript || !normalizedReply) return false;
      if (normalizedTranscript.includes(normalizedReply) || normalizedReply.includes(normalizedTranscript)) return true;

      const transcriptWords = new Set(normalizedTranscript.split(" ").filter(Boolean));
      const replyWords = normalizedReply.split(" ").filter(Boolean);
      if (replyWords.length === 0) return false;

      const overlapCount = replyWords.filter((word) => transcriptWords.has(word)).length;
      return overlapCount / replyWords.length >= 0.6;
    };

    const enterCooldownThenListen = async () => {
      if (isEnded()) return;
      console.log("[Vobiz State] COOLDOWN");
      state = "COOLDOWN";
      mediaBuffers = [];
      await wait(800);
      if (isEnded()) return;
      state = "LISTENING";
      console.log("[Vobiz State] LISTENING");
    };

    const returnToListening = () => {
      if (isEnded()) return;
      state = "LISTENING";
      console.log("[Vobiz State] LISTENING");
    };

    const loadCallContext = async () => {
      let callData: any = {};
      let kb: any = {};
      if (!callId) return { callData, kb };

      try {
        const callDoc = await db.collection("calls").doc(callId).get();
        callData = callDoc.data() || {};
        kb = callData.knowledgeBaseSnapshot || {};
      } catch (e) {
        console.error(`[Vobiz WS] Failed to fetch call context:`, e);
      }

      return { callData, kb };
    };

    const handleGreeting = async () => {
      if (state !== "GREETING") return;

      state = "SPEAKING";
      console.log("[Vobiz State] SPEAKING greeting");

      if (!ownerId) {
        console.error("[Vobiz Greeting] ownerId missing");
        await enterCooldownThenListen();
        return;
      }

      const { callData, kb } = await loadCallContext();
      const greetingText = sanitizeOutboundReply(buildInitialGreeting(callData, kb));
      console.log("[GREETING SOURCE]", getCallGuidance(kb)?.greeting ? "kb" : "fallback");
      console.log("[GREETING FINAL]", greetingText);
      conversationStage = "greeting";
      console.log("[STAGE FLOW]", conversationStage);
      const optimizedGreetingText = compressReplyForLiveCall(greetingText, 16);
      const greetingAudio = await timedStep("TTS", () => fetchTtsAudio(optimizedGreetingText, ownerId));
      if (isEnded()) return;

      if (greetingAudio) {
        playbackInterrupted = false;
        await timedStep("audio send", () => sendVobizAudio(ws, greetingAudio, () => !playbackInterrupted));
        await appendTranscript("AI", optimizedGreetingText);
        greetingDelivered = true;
        markCompletedStage("greeting");
        conversationStage = "availability";
        console.log("[STAGE FLOW]", conversationStage);
      } else {
        console.error("[Vobiz Greeting] TTS failed");
      }

      mediaBuffers = [];
      await enterCooldownThenListen();
    };

    const transcribeBuffer = async (audioBuffer: Buffer) => {
      try {
        const dgUrl = new URL("https://api.deepgram.com/v1/listen");
        dgUrl.searchParams.set("model",        "nova-2");
        dgUrl.searchParams.set("encoding",     "mulaw");
        dgUrl.searchParams.set("sample_rate",  "8000");
        dgUrl.searchParams.set("channels",     "1");
        dgUrl.searchParams.set("language",     "en-IN");
        dgUrl.searchParams.set("smart_format", "true");

        const response = await fetch(dgUrl.toString(), {
          method: "POST",
          headers: {
            Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
            "Content-Type": "audio/mulaw",
          },
          body: audioBuffer,
        });
        const result = await response.json() as any;
        const alternative = result?.results?.channels?.[0]?.alternatives?.[0] || {};
        return {
          transcript: (alternative.transcript || "").trim(),
          confidence: alternative.confidence,
          words: alternative.words || [],
        };
      } catch (err) {
        console.error(`[Deepgram STT] Error:`, err);
        return { transcript: "", confidence: undefined, words: [] };
      }
    };

    const processBargeInAudio = async (audioBuffer: Buffer) => {
      const vadWindow = analyzeMulawWindow(audioBuffer);
      if (vadWindow.isSilent) return;
      const stt = await timedStep("STT", () => transcribeBuffer(audioBuffer));
      const transcript = normalizeSttTranscript(stt.transcript || "");
      if (!transcript || !isBargeInPhrase(transcript)) return;
      console.log("[BARGE IN DETECTED]", transcript);
      console.log("[USER_INTERRUPT_DETECTED]", transcript);
      console.log("[USER_BARGE_IN]", transcript);
      playbackInterrupted = true;
      pendingBargeInAudio = audioBuffer;
      state = "LISTENING";
      console.log("[INTERRUPTION HANDLED]", transcript);
    };

    const processListeningAudio = async (audioBuffer: Buffer) => {
      if (conversationStage === "ended") {
        if (!callCompletedLogged) {
          console.log("[CALL COMPLETED] no further processing");
          callCompletedLogged = true;
        }
        return;
      }
      if (state !== "LISTENING" || isEnded()) return;

      const vadScore = getVadScore(audioBuffer);
      const vadWindow = analyzeMulawWindow(audioBuffer);
      console.log("[Vobiz VAD] score=", vadScore);
      console.log("[Vobiz VAD] unique=", vadWindow.unique, "mostCommonRatio=", vadWindow.mostCommonRatio, "averageEnergy=", vadWindow.averageEnergy);

      if (vadWindow.isSilent) {
        console.log("[Vobiz VAD] true silence/constant noise, skipping Deepgram");
        return;
      }

      if (turnInProgress) {
        console.log("[TURN BLOCKED] already in progress");
        return;
      }

      turnInProgress = true;
      console.log("[TURN LOCK] acquired");

      const totalTurnStart = Date.now();

      try {
        const stt = await timedStep("STT", () => transcribeBuffer(audioBuffer));
        let transcript = stt.transcript;
        const originalTranscript = transcript;
        transcript = normalizeSttTranscript(transcript);
        if (originalTranscript !== transcript) {
          console.log("[STT NORMALIZED]", originalTranscript, "->", transcript);
        }
        console.log("[Deepgram STT] transcript=", transcript);
        console.log("[Deepgram STT] confidence=", stt.confidence);
        console.log("[Deepgram STT] words=", stt.words);
        console.log("[Deepgram STT] audioBufferLength=", audioBuffer.length);

        if (!transcript) {
          console.log("[TURN BLOCKED] empty transcript");
          state = "LISTENING";
          return;
        }

        const confidence = typeof stt.confidence === "number" ? stt.confidence : 0;
        const lowConfidenceWithoutTime = confidence < 0.65 && !isLowConfidenceAllowed(transcript);

        if (isVaguePartialTranscript(transcript)) {
          console.log("[TURN HELD] incomplete phrase");
          state = "LISTENING";
          return;
        }

        if (heldTranscript) {
          transcript = `${heldTranscript} ${transcript}`.trim();
          heldTranscript = "";
        }

        const normalizedTranscript = normalizeTurnText(transcript);
        if (isIncompletePhrase(normalizedTranscript)) {
          heldTranscript = transcript;
          console.log("[TURN HELD] incomplete phrase");
          state = "LISTENING";
          return;
        }

        const wordCount = normalizeTurnText(transcript).split(" ").filter(Boolean).length;
        const detectedIntent = detectIntent(transcript);
        const isOpeningHello =
          (conversationStage === "availability" || conversationStage === "permission" || conversationStage === "hook") &&
          normalizeTurnText(transcript) === "hello";
        console.log("[CONVERSATION STAGE]", conversationStage);
        console.log("[INTENT DETECTED]", detectedIntent);

        if (wordCount < 2 && ["hmm", "uh", "um"].includes(normalizeTurnText(transcript))) {
          console.log("[TURN BLOCKED]", transcript);
          state = "LISTENING";
          return;
        }

        console.log("[TURN ACCEPTED]", transcript);
        await appendTranscript("Lead", transcript);
        state = "PROCESSING";
        console.log("[Vobiz State] PROCESSING");

        const { callData, kb } = await loadCallContext();
        if (isEnded()) return;

        const transcriptTextForContext = formatTranscriptEntries(transcriptBuffer);
        const callContext = { ...callData, transcript: transcriptTextForContext, transcriptText: transcriptTextForContext };
        let reply = "";
        let shouldTrimReply = true;
        let replyMaxWords = 10;

        const decision = await timedStep("getNextReply", () => getNextReply(
          transcript,
          buildCallState(callData, callContext, detectedIntent, lowConfidenceWithoutTime),
          kb
        ));
        reply = decision.reply;
        replyMaxWords = decision.maxWords;
        shouldTrimReply = decision.maxWords <= 14;

        if (!reply || reply.trim().length === 0) {
          console.log("[GEMINI OUTPUT]", "");
          console.log("[EMPTY REPLY FALLBACK USED]");
          reply = "Sure, what would you like to know?";
        }

        if (shouldTrimReply) {
          reply = trimReplyForStage(reply, replyMaxWords);
        } else {
          console.log("[REPLY WORD COUNT]", reply.split(/\s+/).filter(Boolean).length);
        }
        reply = cleanFinalResponse(reply, "Sure, what would you like to know?", shouldTrimReply ? replyMaxWords : 60);
        reply = compressReplyForLiveCall(reply, Math.min(16, Math.max(8, replyMaxWords || 10)));

        console.log("[GEMINI OUTPUT]", reply);
        console.log("[GEMINI FINAL REPLY]", reply);
        console.log("[TTS TEXT]", reply);
        console.log("[CONVERSATION STAGE]", conversationStage);
        if (isEnded()) return;

        const aiReply = sanitizeOutboundReply(compressReplyForLiveCall(reply, 16));
        conversationHistory.push({ role: "user", text: transcript });
        conversationHistory.push({ role: "assistant", text: aiReply });
        lastTranscript = transcript.trim().toLowerCase();
        lastAiReply = aiReply.trim();

        if (callId) {
          await db.collection("calls").doc(callId).update(sanitizeForFirestore({
            leadData,
            appointmentData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }));
        }

        if (!ownerId) {
          console.error("[Vobiz Reply] ownerId missing");
          returnToListening();
          return;
        }

        playbackInterrupted = false;
        const replyAudio = await timedStep("TTS", () => fetchTtsAudio(aiReply, ownerId));
        if (isEnded()) return;

        if (!replyAudio) {
          console.error("[Vobiz Reply] TTS failed");
          returnToListening();
          return;
        }

        state = "SPEAKING";
        console.log("[Vobiz State] SPEAKING reply");
        await timedStep("audio send", () => sendVobizAudio(ws, replyAudio, () => !playbackInterrupted));
        if (playbackInterrupted) {
          console.log("[INTERRUPTION HANDLED]", "reply playback stopped");
          returnToListening();
          return;
        }
        await appendTranscript("AI", aiReply);
        if (decision.completedStage) {
          markCompletedStage(decision.completedStage);
        }
        pendingCompletedStage = null;
        mediaBuffers = [];
        if (conversationStage === "closing" || conversationStage === "ended") {
          console.log("[CALL ENDING AFTER COMPLETION]");
          if (disinterestTerminationPending) console.log("[CALL_ENDED_DISINTEREST]");
          moveStage("ended");
          console.log("[STAGE FLOW]", conversationStage);
          state = "ENDING";
          if (ws.readyState === 1) ws.close();
          endCall();
          return;
        }
        await enterCooldownThenListen();
      } catch (err) {
        console.error("[Vobiz Turn] Error:", err);
        if (!isEnded()) state = "LISTENING";
      } finally {
        console.log("[TIMING TOTAL TURN]", Date.now() - totalTurnStart, "ms");
        if (turnInProgress) {
          turnInProgress = false;
          console.log("[TURN LOCK] released");
        }
        if (pendingBargeInAudio && state === "LISTENING" && !turnInProgress) {
          const pending = pendingBargeInAudio;
          pendingBargeInAudio = null;
          void processListeningAudio(pending);
        }
      }
    };

    const endCall = () => {
      console.log("[CALL END START]", callId);
      console.log("[TRANSCRIPT BUFFER LENGTH]", transcriptBuffer.length);
      if (isEnded()) return;
      state = "ENDED";
      console.log("[Vobiz State] ENDED");
      if (turnInProgress) {
        turnInProgress = false;
        console.log("[TURN LOCK] released");
      }
      mediaBuffers = [];
      const transcriptText = formatTranscriptEntries(transcriptBuffer);
      void finalizeCallSummaryFromTranscript(callId || "", transcriptText)
        .finally(() => {
          if (callId) liveCallTranscriptBuffers.delete(callId);
        });
    };

    ws.on("message", async (message: any) => {
      let decoded: Buffer | null = null;
      let eventType = "(unknown)";

      try {
        const raw = Buffer.isBuffer(message) ? message.toString("utf8") : String(message);

        if (raw.trimStart().startsWith("{")) {
          const json = JSON.parse(raw) as Record<string, any>;
          eventType = json.event ?? "(no event)";

          if (eventType === "connected") return;

          if (eventType === "start") {
            const streamId = json.streamId || json.start?.streamId || json.start?.stream_id;
            const resolvedCallId = json.callId || json.start?.callId || json.start?.call_id;
            console.log(`[Vobiz Start] callId=${resolvedCallId} streamId=${streamId}`);
            return;
          }

          if (eventType === "stop") {
            endCall();
            return;
          }

          if (eventType === "dtmf") {
            console.log(`[Vobiz WS] dtmf digit=${json.dtmf?.digit ?? json.digit ?? "?"}`);
            return;
          }

          if (eventType === "playedStream" || eventType === "clearedAudio") return;

          if (eventType !== "media") {
            console.log(`[Vobiz Stream] Unknown event=${eventType}`);
            return;
          }

          let b64: string | null = null;
          if (json.media?.payload && typeof json.media.payload === "string") {
            b64 = json.media.payload;
          } else if (typeof json.payload === "string") {
            b64 = json.payload;
          } else if (typeof json.audio === "string") {
            b64 = json.audio;
          }

          if (!b64) {
            console.warn(`[Vobiz WS] event="${eventType}" has no base64 audio field`);
            return;
          }

          decoded = Buffer.from(b64, "base64");
        } else {
          decoded = Buffer.isBuffer(message)
            ? (message as Buffer)
            : Buffer.from(message as ArrayBuffer);
        }
      } catch (parseErr) {
        console.error(`[Vobiz WS] message parse error:`, parseErr);
        return;
      }

      if (!decoded || decoded.length === 0) return;

      if (state === "GREETING") {
        await handleGreeting();
        return;
      }

      if (conversationStage === "ended" || conversationStage === "closing" || state === "ENDING") {
        if (!callCompletedLogged) {
          console.log("[CALL COMPLETED] no further processing");
          callCompletedLogged = true;
        }
        return;
      }

      if (state === "SPEAKING") {
        bargeInBuffers.push(decoded);
        if (bargeInBuffers.length >= BARGE_IN_WINDOW_FRAMES) {
          const combined = Buffer.concat(bargeInBuffers);
          bargeInBuffers = [];
          void processBargeInAudio(combined);
        }
        return;
      }

      if (state === "PROCESSING" || state === "COOLDOWN" || isEnded()) {
        return;
      }

      mediaBuffers.push(decoded);

      if (mediaBuffers.length >= STT_WINDOW_FRAMES) {
        const combined = Buffer.concat(mediaBuffers);
        mediaBuffers = [];
        void processListeningAudio(combined);
      }
    });

    ws.on("error", (err) => {
      console.error(`[WS ERROR] callId=${callId} error=${err.message}`);
    });

    ws.on("close", (code, reason) => {
      console.log(`[WS CLOSE] callId=${callId} code=${code} reason=${reason?.toString() || "none"}`);
      endCall();
    });
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
            answer_url: `${APP_URL}/api/voice/vobiz-streamxml?callId=${callId}&ownerId=${uid}`,
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

          await db.collection('calls').doc(callId).update(sanitizeForFirestore({
            callSid: vobizCallId,
            provider: 'vobiz',
            status: 'initiated',
            recordingStatus: recordingEnabled ? 'requested' : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }));

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

    if (!SpeechResult || SpeechResult.trim().length < 4) {
      console.log("[TURN BLOCKED] invalid transcript:", SpeechResult || "");
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

      if (!SpeechResult || SpeechResult.trim().length < 4) {
        console.log("[TURN BLOCKED] invalid transcript:", SpeechResult || "");
        res.type('text/xml');
        return res.send(response.toString());
      }

      console.log("[TURN ACCEPTED]", SpeechResult);
      if (!SpeechResult || SpeechResult.trim().length === 0) {
        console.log("[SAFEGUARD BLOCKED] Empty transcript");
        res.type('text/xml');
        return res.send(response.toString());
      }
      console.log("[GEMINI INPUT]", SpeechResult);
      const aiReply = await generateGeminiReply({
        transcript: SpeechResult,
        knowledgeBase: callData?.knowledgeBaseSnapshot,
        callContext: { ...callData, transcript: newTranscript },
      });
      console.log("[GEMINI OUTPUT]", aiReply);

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

  // Vobiz Stream XML Route — opens WebSocket audio stream
  app.post("/api/voice/vobiz-streamxml", async (req, res) => {
    const { callId, ownerId } = req.query;

    const wsUrl = APP_URL.replace(/^https?:\/\//, 'wss://');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true" audioTrack="inbound" streamTimeout="7200" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" statusCallbackUrl="${APP_URL}/api/vobiz/stream-status" statusCallbackMethod="POST">
    ${wsUrl}/ws/vobiz-stream?callId=${callId}&amp;ownerId=${ownerId}
  </Stream>
</Response>`;

    res.type("text/xml");
    res.send(xml);
  });

  app.post("/api/vobiz/stream-status", (req, res) => {
    console.log("[Vobiz Stream Callback] Event=" + req.body?.Event + " StreamID=" + req.body?.StreamID + " CallUUID=" + req.body?.CallUUID);
    console.log("[Vobiz Stream Callback] Full body:", JSON.stringify(req.body));
    res.json({ ok: true });
  });

  app.post("/api/webhooks/vobiz/recording", async (req, res) => {
    const { callId } = req.query;
    const body = req.body || {};

    console.log("[RECORDING WEBHOOK RECEIVED]", `callId=${callId} body=${JSON.stringify(body)}`);
    console.log("[RECORDING PAYLOAD]", JSON.stringify(body));
    console.log(`[Vobiz Recording Webhook] callId=${callId} body=${JSON.stringify(body)}`);

    if (!callId) {
      return res.status(400).json({ success: false, message: "Missing callId" });
    }

    try {
      console.log("[Vobiz Recording Webhook] Full body:", JSON.stringify(body));
      const recordingUrl = body.RecordUrl || body.RecordFile || body.RecordingURL || body.recording_url || body.record_url || body.url || body.URL || body.file || body.file_url || body.download_url;
      const recordingSid = body.RecordingID || body.recording_id || body.recordingId || body.RecordID || body.id;
      const recordingStatus = recordingUrl ? "available" : (recordingSid ? "processing" : "failed");
      if (recordingUrl) {
        console.log("[RECORDING URL SAVED]", recordingUrl);
      } else {
        console.log("[RECORDING PAYLOAD MISSING URL]", JSON.stringify(body));
        console.log("[RECORDING FAILED REASON]", recordingSid ? "recording id present but URL missing" : "recording URL and provider id missing");
      }
      console.log("[RECORDING STATUS UPDATED]", recordingStatus);

      await db.collection("calls").doc(callId as string).update(sanitizeForFirestore({
        recordingUrl,
        recordingSid,
        recordingProviderId: recordingSid,
        recordingProvider: "vobiz",
        recordingStatus,
        recordingDuration: body.recording_duration ? parseInt(String(body.recording_duration), 10) : undefined,
        recordingDurationMs: body.recording_duration_ms ? parseInt(String(body.recording_duration_ms), 10) : undefined,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }));
    } catch (error) {
      console.error("[Vobiz Recording Webhook] Update failed:", error);
      console.log("[RECORDING FAILED REASON]", error instanceof Error ? error.message : String(error));
    }

    res.json({ ok: true });
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

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather inputType="speech" action="${APP_URL}/api/voice/vobizxml/respond?callId=${callId}&amp;ownerId=${ownerId}">
    <Speak>${escapeXml(message)}</Speak>
  </Gather>
</Response>`;

    res.type("text/xml");
    res.send(xml);
  });

  // Vobiz Conversational Respond Route
  app.post("/api/voice/vobizxml/respond", async (req, res) => {
    const { callId, ownerId } = req.query;
    const userSpeech = req.body?.Speech || req.body?.speech || req.query?.Speech || "";

    console.log(`[Vobiz Respond] callId=${callId} Speech="${userSpeech}"`);

    let aiReply = "";

    try {
      const callRef = db.collection("calls").doc(callId as string);
      const callDoc = await callRef.get();

      if (callDoc.exists) {
        const callData = callDoc.data();
        const transcript = callData?.transcript || "";

        if (userSpeech && userSpeech.trim().length >= 4) {
          const newTranscript = `${transcript}\nLead: ${userSpeech}`;

          console.log("[TURN ACCEPTED]", userSpeech);
          if (!userSpeech || userSpeech.trim().length === 0) {
            console.log("[SAFEGUARD BLOCKED] Empty transcript");
            return;
          }
          console.log("[GEMINI INPUT]", userSpeech);
          aiReply = await generateGeminiReply({
            transcript: userSpeech,
            knowledgeBase: callData?.knowledgeBaseSnapshot,
            callContext: { ...callData, transcript: newTranscript },
          });
          console.log("[GEMINI OUTPUT]", aiReply);

          await callRef.update({
            transcript: `${newTranscript}\nAI: ${aiReply}`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          console.log("[TURN BLOCKED] invalid transcript:", userSpeech || "");
        }
      }
    } catch (err) {
      console.error("[Vobiz Respond] Error:", err);
      aiReply = "";
    }

    const speakXml = aiReply ? `    <Speak>${escapeXml(aiReply)}</Speak>\n` : "";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather inputType="speech" action="${APP_URL}/api/voice/vobizxml/respond?callId=${callId}&amp;ownerId=${ownerId}">
${speakXml}  </Gather>
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

      if (isFinalStatus) {
        const bufferEntries = liveCallTranscriptBuffers.get(callId as string) || [];
        console.log("[CALL END START]", callId);
        console.log("[TRANSCRIPT BUFFER LENGTH]", bufferEntries.length);
        const memoryTranscript = liveCallTranscriptBuffers.has(callId as string)
          ? formatTranscriptEntries(bufferEntries)
          : "";
        await finalizeCallSummaryFromTranscript(callId as string, memoryTranscript);
        liveCallTranscriptBuffers.delete(callId as string);
      }
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

      const callRef = db.collection("calls").doc(callId);
      const callSnap = await callRef.get();
      const callData = callSnap.data() || {};

      if (callData.ownerId && callData.ownerId !== uid) {
        return res.status(403).json({ success: false, message: "Not allowed" });
      }

      if (enabled) {
        await callRef.update(sanitizeForFirestore({
          recordingStatus: "requested",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }));

        if (callData.provider === "vobiz" && callData.callSid) {
          const vobizConfig = await getVobizConfig(uid);
          if (!vobizConfig) throw new Error("Vobiz config missing");
          await startVobizRecording(callId, uid, callData.callSid, vobizConfig);
        }
      } else {
        if (callData.provider === "vobiz" && callData.callSid) {
          const vobizConfig = await getVobizConfig(uid);
          if (!vobizConfig) throw new Error("Vobiz config missing");
          await stopVobizRecording(callId, callData.callSid, vobizConfig, callData.recordingUrl);
        } else {
          await callRef.update(sanitizeForFirestore({
            recordingStatus: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }));
        }
      }

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