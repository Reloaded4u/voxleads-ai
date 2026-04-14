import { firebase } from '../firebase/config';
import { Appointment, AppointmentStatus, AppointmentType, UserProfile } from '../types';
import { smsService } from './smsService';
import { errorHandler, OperationType } from '../utils/errorHandler';

export const appointmentsService = {
  async createAppointment(appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const docRef = await firebase.addDoc(firebase.collection(firebase.db, 'appointments'), {
        ...appointment,
        createdAt: firebase.serverTimestamp(),
        updatedAt: firebase.serverTimestamp()
      });
      
      await firebase.updateDoc(firebase.doc(firebase.db, 'leads', appointment.leadId), {
        status: 'Booked',
        updatedAt: firebase.serverTimestamp()
      });

      // Trigger SMS Alerts
      this.triggerSmsAlerts(appointment, docRef.id);

      return docRef.id;
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.CREATE, 'appointments');
      throw error;
    }
  },

  async triggerSmsAlerts(appointment: any, appointmentId: string) {
    try {
      const userSnap = await firebase.getDoc(firebase.doc(firebase.db, 'users', appointment.ownerId));
      const userProfile = userSnap.data() as UserProfile;
      const settings = userProfile?.communication;

      if (!settings?.smsAlertsEnabled) return;

      const dateStr = appointment.scheduledAt instanceof Date 
        ? appointment.scheduledAt.toLocaleString() 
        : new Date(appointment.scheduledAt.seconds * 1000).toLocaleString();

      const body = `New Appointment Scheduled!
Lead: ${appointment.leadName}
Phone: ${appointment.leadPhone}
Type: ${appointment.type}
Time: ${dateStr}
Location: ${appointment.location || 'N/A'}
Notes: ${appointment.notes || 'N/A'}`;

      // 1. Send to business owner(s)
      for (const recipient of settings.meetingSmsRecipients) {
        await smsService.sendSms(appointment.ownerId, recipient, body, 'appointment_scheduled');
      }

      // 2. Send confirmation to lead
      if (settings.sendLeadConfirmationSms && appointment.leadPhone) {
        const leadBody = `Hi ${appointment.leadName}, your ${appointment.type} is confirmed for ${dateStr}. We look forward to seeing you!`;
        await smsService.sendSms(appointment.ownerId, appointment.leadPhone, leadBody, 'appointment_scheduled');
      }

      await firebase.updateDoc(firebase.doc(firebase.db, 'appointments', appointmentId), {
        smsAlertSent: true
      });
    } catch (error) {
      console.error('[AppointmentsService] Error triggering SMS alerts:', error);
    }
  },

  async updateAppointment(id: string, updates: Partial<Appointment>) {
    try {
      await firebase.updateDoc(firebase.doc(firebase.db, 'appointments', id), {
        ...updates,
        updatedAt: firebase.serverTimestamp()
      });
    } catch (error) {
      errorHandler.handleFirestoreError(error, OperationType.UPDATE, `appointments/${id}`);
      throw error;
    }
  },

  async cancelAppointment(id: string) {
    return this.updateAppointment(id, { status: 'Cancelled' });
  },

  subscribeToAppointments(userId: string, callback: (appointments: Appointment[]) => void) {
    const q = firebase.query(
      firebase.collection(firebase.db, 'appointments'),
      firebase.where('ownerId', '==', userId),
      firebase.orderBy('scheduledAt', 'asc')
    );

    return firebase.onSnapshot(q, (snapshot) => {
      const appointments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        scheduledAt: doc.data().scheduledAt?.toDate(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as Appointment[];
      callback(appointments);
    }, (error) => {
      errorHandler.handleFirestoreError(error, OperationType.LIST, 'appointments');
    });
  }
};
