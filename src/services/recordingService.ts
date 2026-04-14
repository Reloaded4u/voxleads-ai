import { firebase } from '../firebase/config';
import { CallRecord } from '../types';
import { sanitizeForFirestore } from '../lib/utils';

export const recordingService = {
  async toggleRecording(callId: string, enabled: boolean) {
    try {
      // 1. Update call record
      await firebase.updateDoc(firebase.doc(firebase.db, 'calls', callId), sanitizeForFirestore({
        recordingStatus: enabled ? 'requested' : null,
        updatedAt: firebase.serverTimestamp()
      }));

      // 2. Notify backend
      const user = firebase.auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        await fetch('/api/voice/recording', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ callId, enabled })
        });
      }

      return true;
    } catch (error) {
      console.error('[RecordingService] Error toggling recording:', error);
      return false;
    }
  },

  async getRecordingUrl(callId: string) {
    // In a real app, this might fetch a signed URL from the backend
    const callSnap = await firebase.getDoc(firebase.doc(firebase.db, 'calls', callId));
    const data = callSnap.data() as CallRecord;
    return data?.recordingUrl || null;
  }
};
