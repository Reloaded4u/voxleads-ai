import { firebase } from '../firebase/config';
import { UserProfile } from '../types';
import { errorHandler } from '../utils/errorHandler';
import { emailAuthService } from './emailAuthService';
import { phoneAuthService } from './phoneAuthService';

export const authService = {
  ...emailAuthService,
  ...phoneAuthService,

  async signInWithGoogle() {
    try {
      const result = await firebase.signInWithGoogle();
      return result.user;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.signInWithGoogle');
      throw error;
    }
  },

  async signOut() {
    try {
      await firebase.signOut();
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.signOut');
      throw error;
    }
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userRef = firebase.doc(firebase.db, 'users', uid);
      const userSnap = await firebase.getDoc(userRef);
      
      if (!userSnap.exists()) return null;
      return userSnap.data() as UserProfile;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.getUserProfile');
      return null;
    }
  },

  subscribeToProfile(uid: string, callback: (profile: UserProfile) => void) {
    const userRef = firebase.doc(firebase.db, 'users', uid);
    return firebase.onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data() as UserProfile);
      }
    }, (error) => {
      console.error('Error subscribing to profile:', error);
    });
  },

  async ensureUserProfile(user: any): Promise<UserProfile> {
    try {
      const existingProfile = await this.getUserProfile(user.uid);
      if (existingProfile) return existingProfile;

      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        displayName: user.displayName || (user.phoneNumber ? `User ${user.phoneNumber.slice(-4)}` : 'User'),
        photoURL: user.photoURL || '',
        role: 'agent',
      };

      await this.createUserProfile(newProfile);
      return newProfile;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.ensureUserProfile');
      throw error;
    }
  },

  async createUserProfile(profile: UserProfile) {
    try {
      const userRef = firebase.doc(firebase.db, 'users', profile.uid);
      await firebase.setDoc(userRef, {
        ...profile,
        createdAt: firebase.serverTimestamp(),
        settings: {
          voiceId: 'ElevenLabs - Josh (Natural, Professional)',
          agentPersonality: 'You are a professional and friendly sales assistant. Your goal is to schedule site visits for luxury apartments. Be polite, handle objections gracefully, and always try to find a convenient time for the lead.',
          notificationsEnabled: true
        }
      });
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.createUserProfile');
      throw error;
    }
  },

  async updateUserProfile(uid: string, updates: Partial<UserProfile>) {
    try {
      const userRef = firebase.doc(firebase.db, 'users', uid);
      
      // Update Firestore
      await firebase.updateDoc(userRef, {
        ...updates,
        updatedAt: firebase.serverTimestamp()
      });

      // Update Firebase Auth profile if displayName or photoURL changed
      if (firebase.auth.currentUser && (updates.displayName || updates.photoURL)) {
        await firebase.updateProfile(firebase.auth.currentUser, {
          displayName: updates.displayName || firebase.auth.currentUser.displayName,
          photoURL: updates.photoURL || firebase.auth.currentUser.photoURL
        });
      }
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.updateUserProfile');
      throw error;
    }
  },

  async uploadAvatar(uid: string, file: File): Promise<string> {
    try {
      const storageRef = firebase.ref(firebase.storage, `avatars/${uid}`);
      await firebase.uploadBytes(storageRef, file);
      const downloadURL = await firebase.getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'AuthService.uploadAvatar');
      throw error;
    }
  }
};
