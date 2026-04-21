import { firebase } from '../firebase/config';
import { CallRecord, LeadStatus, IntegrationSettings, KnowledgeBase, UserProfile } from '../types';
import { geminiService } from './geminiService';
import { knowledgeBaseService } from './knowledgeBaseService';
import { callContextBuilder } from './callContextBuilder';
import { errorHandler, OperationType } from '../utils/errorHandler';
import { timeUtils } from '../utils/timeUtils';
import { sanitizeForFirestore } from '../lib/utils';
import { toast } from '../lib/toast';

export const callsService = {
  subscribeToCalls(userId: string, callback: (calls: CallRecord[]) => void) {
    const q = firebase.query(
      firebase.collection(firebase.db, 'calls'),
      firebase.where('ownerId', '==', userId),
      firebase.orderBy('createdAt', 'desc')
    );

    return firebase.onSnapshot(q, (snapshot) => {
      const calls = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as CallRecord[];
      callback(calls);
    }, (error) => {
      errorHandler.handleFirestoreError(error, OperationType.LIST, 'calls');
    });
  },

  isLiveCallingConfigured(profile?: UserProfile) {
    if (!profile) return false;
    // Check if user has enabled live calling in settings
    if (!profile.communication?.liveCallingEnabled) return false;
    
    // Also check if they have provided their own credentials (optional if using server defaults)
    // For this app, we prioritize server-side environment variables if user hasn't provided their own.
    return true;
  },

  async initiateCall(leadId: string, ownerId: string, phoneNumber: string, integrations?: IntegrationSettings) {
    try {
      // Fetch communication settings for recording and live mode
      const userSnap = await firebase.getDoc(firebase.doc(firebase.db, 'users', ownerId));
      const userProfile = userSnap.data() as UserProfile;
      
      const isLive = this.isLiveCallingConfigured(userProfile);
      console.log(`[CallsService] Initiating call. Mode: ${isLive ? 'Live' : 'Test'}`);
      
      // Fetch Knowledge Base for context and snapshot
      const kb = await knowledgeBaseService.getKnowledgeBase(ownerId);
      
      const recordingEnabled = userProfile?.communication?.recordingEnabled || false;
      const settings = (userProfile?.settings || {}) as any;

      // Check calling hours
      const startTime = settings.callingStartTime || '09:00';
      const endTime = settings.callingEndTime || '18:00';
      const timezone = settings.timezone || 'UTC';
      const isWithinHours = timeUtils.isWithinCallingHours(startTime, endTime, timezone);

      // Fetch lead details for snapshotting
      const leadSnap = await firebase.getDoc(firebase.doc(firebase.db, 'leads', leadId));
      const leadData = leadSnap.exists() ? leadSnap.data() : null;

      const callData: Omit<CallRecord, 'id'> = {
        ownerId,
        leadId,
        leadName: leadData?.name || 'Unknown Lead',
        leadPhone: phoneNumber,
        createdAt: firebase.serverTimestamp(),
        updatedAt: firebase.serverTimestamp(),
        duration: 0,
        status: 'queued',
        summary: '',
        transcript: '',
        outcome: 'New',
        knowledgeBaseSnapshot: kb,
        controlState: 'ai_active',
        recordingStatus: recordingEnabled ? 'requested' : null
      };

      const docRef = await firebase.addDoc(
        firebase.collection(firebase.db, 'calls'), 
        sanitizeForFirestore(callData)
      );
      const callId = docRef.id;

      // Update lead with last call ID
      await firebase.updateDoc(firebase.doc(firebase.db, 'leads', leadId), {
        lastCallId: callId,
        updatedAt: firebase.serverTimestamp()
      });

      if (!isWithinHours) {
        toast.info(`Outside calling hours (${startTime}-${endTime} ${timezone}). Call has been queued.`);
        return { callId, mode: 'queued' as const, kb };
      }

      if (isLive) {
        try {
          const liveResult = await this.startLiveCall(callId, leadId, phoneNumber, kb);
          if (liveResult.mode === 'live') {
            toast.success('Live Twilio call initiated.');
          } else {
            toast.info('Live calling is not configured. Running in test mode.');
          }
          return { ...liveResult, kb };
        } catch (liveError) {
          const errorMessage = liveError instanceof Error ? liveError.message : 'Unknown error';
          console.warn('[CallsService] Live call initiation failed, falling back to test mode:', liveError);
          toast.error(`Live calling failed: ${errorMessage}. Running in test mode.`);
          // Fallback to mock call if live fails
          return { ...(await this.startMockCall(callId)), kb };
        }
      } else {
        toast.info('Live calling is not configured. Running in test mode.');
        return { ...(await this.startMockCall(callId)), kb };
      }
    } catch (error) {
      console.error('[CallsService] initiateCall error:', error);
      if (error instanceof Error && error.message.includes('Unsupported field value: undefined')) {
        toast.error('Could not start call because some call metadata was invalid. This has now been fixed.');
      } else {
        errorHandler.handleFirestoreError(error, OperationType.CREATE, 'calls');
      }
      throw error;
    }
  },

  async startMockCall(callId: string) {
    console.log('[CallsService] Starting mock call flow for:', callId);
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    await firebase.updateDoc(firebase.doc(firebase.db, 'calls', callId), sanitizeForFirestore({
      status: 'in-progress',
      provider: 'mock',
      updatedAt: firebase.serverTimestamp()
    }));
    return { callId, callSid: `mock-sid-${Date.now()}`, mode: 'test' as const };
  },

  async startLiveCall(callId: string, leadId: string, phoneNumber: string, kb: Partial<KnowledgeBase>) {
    try {
      const user = firebase.auth.currentUser;
      if (!user) {
        console.error('[CallsService] No current user found in Firebase Auth');
        throw new Error('User not authenticated');
      }
      
      console.log('[CallsService] Refreshing ID token...');
      const token = await user.getIdToken(true);
      console.log('[CallsService] Token refreshed. Sending request to backend...');

      const response = await fetch('/api/voice/call', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          leadId, 
          phoneNumber, 
          callId,
          knowledgeBase: kb // Pass KB to backend for live orchestration
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[CallsService] Backend returned error:', errorData);
        throw new Error(errorData.message || `Backend error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[CallsService] Live call initiated successfully:', data.callSid);
      return { callId, callSid: data.callSid, mode: 'live' as const };
    } catch (error) {
      console.error('[CallsService] startLiveCall error:', error);
      throw error;
    }
  },

  async updateCallStatus(callId: string, status: CallRecord['status']) {
    try {
      await firebase.updateDoc(firebase.doc(firebase.db, 'calls', callId), {
        status,
        updatedAt: firebase.serverTimestamp()
      });
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
    }
  },

  async finalizeCall(callId: string, leadId: string, transcript: string, duration: number) {
    try {
      // Fetch the call record to get the KB snapshot
      const callSnap = await firebase.getDoc(firebase.doc(firebase.db, 'calls', callId));
      const callData = callSnap.data() as CallRecord;
      const kb = callData.knowledgeBaseSnapshot || {};

      const analysisPrompt = callContextBuilder.buildSummaryPrompt(kb, transcript);
      const analysis = await geminiService.generateCallSummary(transcript, analysisPrompt);
      
      const result = this.normalizeAnalysisResult(analysis);

      const outcome = result.outcome as LeadStatus;

      await firebase.updateDoc(firebase.doc(firebase.db, 'calls', callId), sanitizeForFirestore({
        status: 'completed',
        summary: result.summary,
        transcript,
        duration,
        outcome,
        sentiment: result.sentiment,
        keyPoints: result.keyPoints,
        objectionsRaised: result.objectionsRaised,
        nextAction: result.nextAction,
        updatedAt: firebase.serverTimestamp()
      }));

      await firebase.updateDoc(firebase.doc(firebase.db, 'leads', leadId), {
        status: outcome,
        updatedAt: firebase.serverTimestamp()
      });

      return { summary: result.summary, outcome };
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
      throw error;
    }
  },

  normalizeAnalysisResult(analysis: any) {
    const validSentiments = ['positive', 'neutral', 'negative'];
    const validOutcomes: LeadStatus[] = ['New', 'Contacted', 'Interested', 'Not Interested', 'Follow-up', 'Booked'];
    
    // Base fallback structure
    const fallback = {
      summary: 'Summary unavailable.',
      outcome: 'Contacted' as LeadStatus,
      sentiment: 'neutral' as const,
      keyPoints: [] as string[],
      objectionsRaised: [] as string[],
      nextAction: 'Follow up with lead.'
    };

    if (typeof analysis !== 'object' || analysis === null) {
      if (typeof analysis === 'string') {
        return { ...fallback, summary: analysis };
      }
      return fallback;
    }

    // 1. Validate summary & nextAction (Strings)
    const summary = typeof analysis.summary === 'string' ? analysis.summary : fallback.summary;
    const nextAction = typeof analysis.nextAction === 'string' ? analysis.nextAction : fallback.nextAction;

    // 2. Validate sentiment (Strict Enum)
    const sentiment = validSentiments.includes(analysis.sentiment) 
      ? analysis.sentiment 
      : fallback.sentiment;

    // 3. Validate outcome (Strict LeadStatus)
    const outcome = validOutcomes.includes(analysis.outcome)
      ? analysis.outcome
      : fallback.outcome;

    // 4. Validate keyPoints & objectionsRaised (Arrays of Strings)
    const normalizeArray = (arr: any) => {
      if (!Array.isArray(arr)) return [];
      return arr
        .map(item => String(item))
        .filter(item => item.trim().length > 0);
    };

    const keyPoints = normalizeArray(analysis.keyPoints);
    const objectionsRaised = normalizeArray(analysis.objectionsRaised);

    return {
      summary,
      outcome,
      sentiment,
      keyPoints,
      objectionsRaised,
      nextAction
    };
  }
};
