import { firebase } from '../firebase/config';
import { Lead, LeadStatus } from '../types';
import { errorHandler, OperationType } from '../utils/errorHandler';
import { sanitizeForFirestore } from '../lib/utils';

export const leadsService = {
  subscribeToLeads(userId: string, callback: (leads: Lead[]) => void) {
    const q = firebase.query(
      firebase.collection(firebase.db, 'leads'),
      firebase.where('ownerId', '==', userId)
      // Temporarily removing orderBy to check if it's a missing index issue
      // firebase.orderBy('createdAt', 'desc')
    );

    return firebase.onSnapshot(q, (snapshot) => {
      const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Lead[];
      
      // Sort manually if needed
      leads.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return dateB - dateA;
      });

      callback(leads);
    }, (error) => {
      console.error("Error subscribing to leads:", error);
      errorHandler.handleFirestoreError(error, OperationType.LIST, 'leads');
    });
  },

  async createLead(lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const docRef = await firebase.addDoc(firebase.collection(firebase.db, 'leads'), sanitizeForFirestore({
        ...lead,
        createdAt: firebase.serverTimestamp(),
        updatedAt: firebase.serverTimestamp()
      }));
      return docRef.id;
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.CREATE, 'leads');
      throw error;
    }
  },

  async updateLead(id: string, updates: Partial<Lead>) {
    try {
      const leadRef = firebase.doc(firebase.db, 'leads', id);
      await firebase.updateDoc(leadRef, sanitizeForFirestore({
        ...updates,
        updatedAt: firebase.serverTimestamp()
      }));
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.UPDATE, `leads/${id}`);
      throw error;
    }
  },

  async deleteLead(id: string) {
    try {
      const leadRef = firebase.doc(firebase.db, 'leads', id);
      await firebase.deleteDoc(leadRef);
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.DELETE, `leads/${id}`);
      throw error;
    }
  },

  async checkLeadExists(userId: string, phone: string): Promise<boolean> {
    try {
      const q = firebase.query(
        firebase.collection(firebase.db, 'leads'),
        firebase.where('ownerId', '==', userId),
        firebase.where('phone', '==', phone)
      );
      const snapshot = await firebase.getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.GET, 'leads');
      return false;
    }
  }
};
