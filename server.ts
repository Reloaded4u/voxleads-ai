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

// Initialize Firebase Admin from Render environment variables
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// Initialize Twilio
const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_URL = process.env.APP_URL || "";