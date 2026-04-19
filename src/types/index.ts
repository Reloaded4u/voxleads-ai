export type LeadStatus = 'New' | 'Contacted' | 'Interested' | 'Not Interested' | 'Follow-up' | 'Booked';

export interface Lead {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  notes: string;
  status: LeadStatus;
  source: string;
  createdAt: any;
  updatedAt: any;
  tags: string[];
  lastCallId?: string;
}

export interface CallRecord {
  id: string;
  ownerId: string;
  leadId: string;
  createdAt: any;
  updatedAt: any;
  duration: number;
  status: 'queued' | 'in-progress' | 'completed' | 'missed' | 'failed' | 'ringing' | 'no-answer' | 'busy' | 'initiated';
  provider?: 'twilio' | 'mock';
  callSid?: string;
  startedAt?: any;
  endedAt?: any;
  cost?: number;
  summary: string;
  transcript: string;
  recordingUrl?: string;
  recordingSid?: string;
  recordingStatus?: 'requested' | 'processing' | 'completed' | 'failed';
  outcome: LeadStatus;
  sentiment?: 'positive' | 'neutral' | 'negative';
  keyPoints?: string[];
  objectionsRaised?: string[];
  nextAction?: string;
  knowledgeBaseSnapshot?: Partial<KnowledgeBase>;
  controlState?: 'ai_active' | 'agent_join_requested' | 'agent_joined' | 'handoff_completed' | 'call_ended';
  assignedAgentId?: string;
}

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
export type AppointmentType = 'Site Visit' | 'Follow-up' | 'Consultation' | 'Contract Signing';

export interface Appointment {
  id: string;
  ownerId: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  type: AppointmentType;
  status: AppointmentStatus;
  scheduledAt: any;
  duration: number; // in minutes
  location: string;
  notes: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  appointmentReminders: boolean;
  missedCallAlerts: boolean;
  followUpReminders: boolean;
  weeklySummary: boolean;
}

export interface SecuritySettings {
  allowAnalytics: boolean;
  allowActivityTracking: boolean;
}

export interface IntegrationSettings {
  twilioSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;

  ttsProvider: 'elevenlabs' | 'azure' | 'google' | 'polly' | 'custom';

  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;

  azureApiKey?: string;
  azureRegion?: string;
  azureVoiceName?: string;

  googleApiKey?: string;
  googleVoiceName?: string;
  googleLanguageCode?: string;

  pollyVoiceId?: string;
  pollyEngine?: 'standard' | 'neural';

  customTtsUrl?: string;

  googleCalendarConnected: boolean;
  googleSheetsConnected: boolean;
}

export interface WebhookSettings {
  url: string;
  enabled: boolean;
  events: {
    leadCreated: boolean;
    leadUpdated: boolean;
    appointmentCreated: boolean;
    appointmentUpdated: boolean;
    callCompleted: boolean;
  };
}

export interface UserSettings {
  voiceId: string;
  agentPersonality: string;
  notificationsEnabled: boolean;
  callingStartTime: string; // HH:mm
  callingEndTime: string; // HH:mm
  timezone: string;
  autoCallingEnabled: boolean;
  maxCallsPerMinute: number;
  maxRetryAttempts: number;
  retryDelayMinutes: number;
  autoQueueOnImport: boolean;
}

export interface CommunicationSettings {
  smsAlertsEnabled: boolean;
  meetingSmsRecipients: string[]; // List of phone numbers
  sendLeadConfirmationSms: boolean;
  dailySummaryEnabled: boolean;
  dailySummaryTime: string; // HH:mm
  dailySummaryTimezone: string;
  dailySummaryRecipient: string;
  recordingEnabled: boolean;
  agentTakeoverEnabled: boolean;
  liveCallingEnabled: boolean;
}

export interface QueueItem {
  id: string;
  ownerId: string;
  leadId: string;
  phone: string;
  normalizedPhone: string;
  status: 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'no_answer' | 'busy' | 'cancelled';
  scheduledTime: any;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: any;
  nextRetryAt?: any;
  retryReason?: string;
  lastError?: string;
  activeCallId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  phoneNumber?: string;
  displayName: string;
  role: 'admin' | 'agent';
  photoURL?: string;
  createdAt?: any;
  updatedAt?: any;
  settings?: UserSettings;
  notifications?: NotificationSettings;
  security?: SecuritySettings;
  integrations?: IntegrationSettings;
  webhooks?: WebhookSettings;
  communication?: CommunicationSettings;
}

export interface SMSLog {
  id: string;
  ownerId: string;
  recipient: string;
  body: string;
  eventType: 'appointment_scheduled' | 'daily_summary' | 'manual';
  status: 'queued' | 'sent' | 'failed' | 'delivered';
  providerMessageId?: string;
  error?: string;
  createdAt: any;
}

export interface CallEvent {
  id: string;
  callId: string;
  ownerId: string;
  type: 'ai_start' | 'agent_join_requested' | 'agent_joined' | 'handoff_completed' | 'call_ended' | 'note';
  timestamp: any;
  agentId?: string;
  agentName?: string;
  note?: string;
}

// Knowledge Base Types
export interface BusinessProfile {
  name: string;
  industry: string;
  description: string;
  locations: string;
  products: string;
  usp: string;
  offers: string;
  contactInfo: string;
}

export interface CallGuidance {
  greeting: string;
  openingLine: string;
  mainPitch: string;
  qualificationQuestions: string;
  bookingPrompt: string;
  closingLine: string;
  followUpInstructions: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
}

export interface Objection {
  id: string;
  objection: string;
  response: string;
}

export interface AppointmentRules {
  availableDays: string[];
  timeSlots: string;
  bufferTime: number;
  blackoutDates: string;
  rescheduleRules: string;
  bookingNotes: string;
}

export interface ToneSettings {
  tone: 'Formal' | 'Friendly' | 'Consultative' | 'Sales-focused';
  language: string;
  verbosity: 'Concise' | 'Detailed' | 'Balanced';
  safetyStyle: string;
  escalationRules: string;
}

export interface WebsiteImport {
  url: string;
  lastImported: any;
  pagesSummary: string[];
  rawContentPreview: string;
  structuredKnowledge: any;
}

export interface KnowledgeBase {
  profile: BusinessProfile;
  guidance: CallGuidance;
  faqs: FAQ[];
  objections: Objection[];
  appointments: AppointmentRules;
  tone: ToneSettings;
  import?: WebsiteImport;
  updatedAt: any;
}
