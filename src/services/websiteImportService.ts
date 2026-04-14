import { auth } from '../firebase/config';

export const websiteImportService = {
  async importFromUrl(url: string) {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const idToken = await user.getIdToken();

    const response = await fetch('/api/knowledge-base/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ url })
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to import website');
    }

    return result.data;
  }
};
