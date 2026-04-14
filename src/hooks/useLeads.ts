import { useState, useEffect } from 'react';
import { Lead } from '../types';
import { leadsService } from '../services/leadsService';
import { useAuth } from './useAuth';

export function useLeads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = leadsService.subscribeToLeads(user.uid, (data) => {
      setLeads(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const createLead = async (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await leadsService.createLead(lead);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    try {
      await leadsService.updateLead(id, updates);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await leadsService.deleteLead(id);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  return {
    leads,
    loading,
    error,
    createLead,
    updateLead,
    deleteLead
  };
}
