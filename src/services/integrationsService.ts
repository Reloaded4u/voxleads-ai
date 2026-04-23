import { firebase } from '../firebase/config';
import { IntegrationSettings } from '../types';
import { errorHandler } from '../utils/errorHandler';

export const integrationsService = {
  async updateIntegrations(uid: string, integrations: IntegrationSettings) {
    try {
      const userRef = firebase.doc(firebase.db, 'users', uid);
      await firebase.updateDoc(userRef, {
        integrations,
        updatedAt: firebase.serverTimestamp()
      });
    } catch (error) {
      errorHandler.handleGeneralError(error, 'IntegrationsService.updateIntegrations');
      throw error;
    }
  },

  async getGoogleAuthUrl() {
    const user = firebase.auth.currentUser;
    const idToken = await user!.getIdToken();
    const response = await fetch('/api/auth/google/url', {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    return await response.json();
  },

  async disconnectGoogle() {
    const user = firebase.auth.currentUser;
    const idToken = await user!.getIdToken();
    await fetch('/api/integrations/google/disconnect', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
  },

  async exportLeadsToSheets() {
    const user = firebase.auth.currentUser;
    const idToken = await user!.getIdToken();
    const response = await fetch('/api/integrations/sheets/export', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    return await response.json();
  }
};
