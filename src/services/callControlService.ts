import { firebase } from '../firebase/config';
import { CallRecord, CallEvent } from '../types';
import { sanitizeForFirestore } from '../lib/utils';

export const callControlService = {
  async updateControlState(callId: string, uid: string, state: CallRecord['controlState'], agentId?: string, agentName?: string) {
    try {
      // 1. Update call record
      await firebase.updateDoc(firebase.doc(firebase.db, 'calls', callId), sanitizeForFirestore({
        controlState: state,
        assignedAgentId: agentId || null,
        updatedAt: firebase.serverTimestamp()
      }));

      // 2. Log event
      const event: Omit<CallEvent, 'id'> = {
        callId,
        ownerId: uid,
        type: state as any, // Mapping state to event type
        timestamp: firebase.serverTimestamp(),
        agentId: agentId || null,
        agentName: agentName || null
      };

      await firebase.addDoc(firebase.collection(firebase.db, 'callEvents'), sanitizeForFirestore(event));

      // 3. Notify backend (for real telephony handoff)
      const user = firebase.auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        await fetch('/api/voice/control', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ callId, state, agentId })
        });
      }

      return true;
    } catch (error) {
      console.error('[CallControlService] Error updating control state:', error);
      return false;
    }
  },

  async addNote(callId: string, uid: string, note: string, agentName: string) {
    const event: Omit<CallEvent, 'id'> = {
      callId,
      ownerId: uid,
      type: 'note',
      timestamp: firebase.serverTimestamp(),
      agentName,
      note
    };
    await firebase.addDoc(firebase.collection(firebase.db, 'callEvents'), sanitizeForFirestore(event));
  },

  subscribeToEvents(callId: string, callback: (events: CallEvent[]) => void) {
    const q = firebase.query(
      firebase.collection(firebase.db, 'callEvents'),
      firebase.where('callId', '==', callId),
      firebase.orderBy('timestamp', 'asc')
    );

    return firebase.onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      })) as CallEvent[];
      callback(events);
    });
  }
};
