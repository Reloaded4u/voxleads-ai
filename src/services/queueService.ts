import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  serverTimestamp, 
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { QueueItem } from '../types';
import { sanitizeForFirestore } from '../lib/utils';

export const queueService = {
  async enqueueLead(ownerId: string, leadId: string, phone: string, scheduledTime?: Date, maxAttempts: number = 3) {
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const queueItem: Partial<QueueItem> = {
      ownerId,
      leadId,
      phone,
      normalizedPhone,
      status: 'pending',
      scheduledTime: scheduledTime ? Timestamp.fromDate(scheduledTime) : serverTimestamp(),
      attempts: 0,
      maxAttempts,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Check for existing pending/processing items
    const q = query(
      collection(db, 'callQueue'),
      where('ownerId', '==', ownerId),
      where('leadId', '==', leadId),
      where('status', 'in', ['pending', 'processing', 'scheduled'])
    );
    const existing = await getDocs(q);
    if (!existing.empty) {
      console.log(`Lead ${leadId} already in queue`);
      return null;
    }

    return await addDoc(collection(db, 'callQueue'), sanitizeForFirestore(queueItem));
  },

  async enqueueMultipleLeads(ownerId: string, leads: { id: string, phone: string }[]) {
    const promises = leads.map(lead => this.enqueueLead(ownerId, lead.id, lead.phone));
    return await Promise.all(promises);
  },

  subscribeToQueue(ownerId: string, callback: (items: QueueItem[]) => void) {
    const q = query(
      collection(db, 'callQueue'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as QueueItem[];
      callback(items);
    });
  },

  async removeFromQueue(itemId: string) {
    await deleteDoc(doc(db, 'callQueue', itemId));
  },

  async retryItem(itemId: string) {
    await updateDoc(doc(db, 'callQueue', itemId), sanitizeForFirestore({
      status: 'pending',
      attempts: 0,
      scheduledTime: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  },

  async cancelItem(itemId: string) {
    await updateDoc(doc(db, 'callQueue', itemId), sanitizeForFirestore({
      status: 'cancelled',
      updatedAt: serverTimestamp()
    }));
  },

  async processQueueNow() {
    const user = (await import('../firebase/config')).auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    
    const token = await user.getIdToken();
    const response = await fetch('/api/queue/process', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to trigger queue processing');
    }

    return await response.json();
  }
};
