import { useState, useEffect } from 'react';
import { CallRecord } from '../types';
import { callsService } from '../services/callsService';
import { useAuth } from './useAuth';

export function useCalls() {
  const { user, profile } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setCalls([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = callsService.subscribeToCalls(user.uid, (data) => {
      setCalls(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const initiateCall = async (leadId: string, phoneNumber: string) => {
    if (!user) {
      console.error('[useCalls] initiateCall failed: User not authenticated');
      throw new Error('User not authenticated');
    }
    try {
      console.log(`[useCalls] Initiating call for lead ${leadId}...`);
      const result = await callsService.initiateCall(leadId, user.uid, phoneNumber, profile?.integrations);
      console.log(`[useCalls] Call initiated successfully. Mode: ${result.mode}`);
      return result;
    } catch (err) {
      console.error('[useCalls] initiateCall error:', err);
      setError(err as Error);
      throw err;
    }
  };

  const finalizeCall = async (callId: string, leadId: string, transcript: string, duration: number) => {
    try {
      return await callsService.finalizeCall(callId, leadId, transcript, duration);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  return {
    calls,
    loading,
    error,
    initiateCall,
    finalizeCall
  };
}
