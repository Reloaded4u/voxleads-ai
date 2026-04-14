import { firebase } from '../firebase/config';
import { smsService } from './smsService';

export const summaryService = {
  async generateDailySummary(uid: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // 1. Fetch stats for today
      const leadsQuery = firebase.query(
        firebase.collection(firebase.db, 'leads'),
        firebase.where('ownerId', '==', uid),
        firebase.where('createdAt', '>=', today),
        firebase.where('createdAt', '<', tomorrow)
      );
      const leadsSnap = await firebase.getDocs(leadsQuery);

      const callsQuery = firebase.query(
        firebase.collection(firebase.db, 'calls'),
        firebase.where('ownerId', '==', uid),
        firebase.where('createdAt', '>=', today),
        firebase.where('createdAt', '<', tomorrow)
      );
      const callsSnap = await firebase.getDocs(callsQuery);

      const appointmentsQuery = firebase.query(
        firebase.collection(firebase.db, 'appointments'),
        firebase.where('ownerId', '==', uid),
        firebase.where('createdAt', '>=', today),
        firebase.where('createdAt', '<', tomorrow)
      );
      const appointmentsSnap = await firebase.getDocs(appointmentsQuery);

      const stats = {
        newLeads: leadsSnap.size,
        totalCalls: callsSnap.size,
        appointmentsBooked: appointmentsSnap.size,
        missedCalls: callsSnap.docs.filter(d => d.data().status === 'missed' || d.data().status === 'failed').length
      };

      // 2. Build message
      const message = `Daily Summary for ${today.toLocaleDateString()}:
- New Leads: ${stats.newLeads}
- Calls Made: ${stats.totalCalls}
- Appointments: ${stats.appointmentsBooked}
- Missed/Failed: ${stats.missedCalls}
Keep up the great work!`;

      return { stats, message };
    } catch (error) {
      console.error('[SummaryService] Error generating summary:', error);
      throw error;
    }
  },

  async sendManualSummary(uid: string, recipient: string) {
    const { message } = await this.generateDailySummary(uid);
    return await smsService.sendSms(uid, recipient, message, 'daily_summary');
  }
};
