import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import validator from "validator";
import dns from "dns";
import { promisify } from "util";
import * as cheerio from "cheerio";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import twilio from "twilio";

const resolve4 = promisify(dns.resolve4);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin from Render JSON environment variable
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

  console.log("[Startup] Firebase Admin initialized successfully");
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