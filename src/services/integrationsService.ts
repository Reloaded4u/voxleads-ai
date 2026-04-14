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
  }
};
