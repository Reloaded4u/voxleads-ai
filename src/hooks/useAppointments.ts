import { useState, useEffect } from 'react';
import { Appointment } from '../types';
import { appointmentsService } from '../services/appointmentsService';
import { useAuth } from './useAuth';

export function useAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setAppointments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = appointmentsService.subscribeToAppointments(user.uid, (data) => {
      setAppointments(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const createAppointment = async (appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      return await appointmentsService.createAppointment(appointment);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
    try {
      await appointmentsService.updateAppointment(id, updates);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const cancelAppointment = async (id: string) => {
    try {
      await appointmentsService.cancelAppointment(id);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  return {
    appointments,
    loading,
    error,
    createAppointment,
    updateAppointment,
    cancelAppointment
  };
}
