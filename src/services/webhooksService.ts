import { firebase } from '../firebase/config';
import { WebhookSettings } from '../types';
import { errorHandler } from '../utils/errorHandler';

export const webhooksService = {
  async updateWebhooks(uid: string, webhooks: WebhookSettings) {
    try {
      const userRef = firebase.doc(firebase.db, 'users', uid);
      await firebase.updateDoc(userRef, {
        webhooks,
        updatedAt: firebase.serverTimestamp()
      });
    } catch (error) {
      errorHandler.handleGeneralError(error, 'WebhooksService.updateWebhooks');
      throw error;
    }
  },

  async testWebhook(url: string) {
    try {
      const user = firebase.auth.currentUser;
      if (!user) throw new Error('User not authenticated');
      
      const token = await user.getIdToken();

      const response = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to test webhook');
      }
      
      return await response.json();
    } catch (error) {
      errorHandler.handleGeneralError(error, 'WebhooksService.testWebhook');
      throw error;
    }
  }
};
