import { firebase } from '../firebase/config';
import { 
  KnowledgeBase, 
  BusinessProfile, 
  CallGuidance, 
  FAQ, 
  Objection, 
  AppointmentRules, 
  ToneSettings,
  WebsiteImport 
} from '../types';

const COLLECTION_NAME = 'knowledgeBase';

export const knowledgeBaseService = {
  async getKnowledgeBase(uid: string): Promise<Partial<KnowledgeBase>> {
    const kbRef = firebase.doc(firebase.db, 'users', uid);
    const sections = ['profile', 'guidance', 'faqs', 'objections', 'appointments', 'tone', 'import'];
    
    const results: any = {};
    
    for (const section of sections) {
      const sectionRef = firebase.doc(firebase.db, `users/${uid}/${COLLECTION_NAME}`, section);
      const snap = await firebase.getDoc(sectionRef);
      if (snap.exists()) {
        results[section] = snap.data();
      }
    }
    
    return results as Partial<KnowledgeBase>;
  },

  async saveSection(uid: string, section: keyof KnowledgeBase, data: any) {
    const sectionRef = firebase.doc(firebase.db, `users/${uid}/${COLLECTION_NAME}`, section);
    
    // Wrap arrays in items object for Firestore documents
    let finalData = data;
    if (section === 'faqs' || section === 'objections') {
      finalData = { items: data };
    }

    await firebase.setDoc(sectionRef, {
      ...finalData,
      ownerId: uid,
      updatedAt: firebase.serverTimestamp()
    }, { merge: true });
  },

  async saveFullKnowledgeBase(uid: string, kb: Partial<KnowledgeBase>) {
    const promises = Object.entries(kb).map(([section, data]) => {
      if (section === 'updatedAt') return Promise.resolve();
      return this.saveSection(uid, section as keyof KnowledgeBase, data);
    });
    await Promise.all(promises);
  },

  // Helper for FAQs and Objections which are arrays in the type but stored as objects or arrays in doc
  async updateFaqs(uid: string, faqs: FAQ[]) {
    await this.saveSection(uid, 'faqs', { items: faqs });
  },

  async updateObjections(uid: string, objections: Objection[]) {
    await this.saveSection(uid, 'objections', { items: objections });
  }
};
