import { firebase } from '../firebase/config';
import { NotificationSettings, SecuritySettings } from '../types';
import { errorHandler } from '../utils/errorHandler';

export const settingsService = {
  async updateNotifications(uid: string, notifications: NotificationSettings) {
    try {
      const userRef = firebase.doc(firebase.db, 'users', uid);
      await firebase.updateDoc(userRef, {
        notifications,
        updatedAt: firebase.serverTimestamp()
      });
    } catch (error) {
      errorHandler.handleGeneralError(error, 'SettingsService.updateNotifications');
      throw error;
    }
  },

  async updateSecurity(uid: string, security: SecuritySettings) {
    try {
      const userRef = firebase.doc(firebase.db, 'users', uid);
      await firebase.updateDoc(userRef, {
        security,
        updatedAt: firebase.serverTimestamp()
      });
    } catch (error) {
      errorHandler.handleGeneralError(error, 'SettingsService.updateSecurity');
      throw error;
    }
  }
};
