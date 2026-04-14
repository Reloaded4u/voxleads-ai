import { firebase } from '../firebase/config';
import { SMSLog } from '../types';
import { errorHandler, OperationType } from '../utils/errorHandler';

export const smsService = {
  async sendSms(uid: string, recipient: string, body: string, eventType: SMSLog['eventType']) {
    try {
      // 1. Log the attempt in Firestore
      const logData: Omit<SMSLog, 'id'> = {
        ownerId: uid,
        recipient,
        body,
        eventType,
        status: 'queued',
        createdAt: firebase.serverTimestamp()
      };

      const docRef = await firebase.addDoc(firebase.collection(firebase.db, 'smsLogs'), logData);
      const logId = docRef.id;

      // 2. Call backend to send SMS
      const user = firebase.auth.currentUser;
      if (!user) throw new Error('User not authenticated');
      
      const token = await user.getIdToken();
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recipient, body, logId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send SMS');
      }

      return { success: true, logId };
    } catch (error) {
      console.error('[SMSService] Error sending SMS:', error);
      // We don't throw here to avoid breaking the main flow (e.g. appointment creation)
      // but we should log it if we have a logId
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getSmsLogs(uid: string) {
    try {
      const q = firebase.query(
        firebase.collection(firebase.db, 'smsLogs'),
        firebase.where('ownerId', '==', uid),
        firebase.orderBy('createdAt', 'desc'),
        firebase.limit(50)
      );
      const snapshot = await firebase.getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SMSLog[];
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.LIST, 'smsLogs');
      return [];
    }
  }
};
