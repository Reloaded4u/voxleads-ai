import React, { useState } from 'react';
import { X, Calendar, Clock, MapPin, FileText, Loader2 } from 'lucide-react';
import { Lead, Appointment, AppointmentType } from '../types';
import { useAppointments } from '../hooks/useAppointments';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface AppointmentModalProps {
  lead?: Lead;
  appointment?: Appointment;
  onClose: () => void;
}

const APPOINTMENT_TYPES: AppointmentType[] = ['Site Visit', 'Follow-up', 'Consultation', 'Contract Signing'];

export default function AppointmentModal({ lead, appointment, onClose }: AppointmentModalProps) {
  const { user } = useAuth();
  const { createAppointment, updateAppointment } = useAppointments();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: (appointment?.type || 'Site Visit') as AppointmentType,
    scheduledAt: appointment?.scheduledAt ? format(appointment.scheduledAt, "yyyy-MM-dd'T'HH:mm") : '',
    duration: appointment?.duration || 60,
    location: appointment?.location || '',
    notes: appointment?.notes || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.scheduledAt) {
      toast.error('Please select a date and time');
      return;
    }

    const scheduledDate = new Date(formData.scheduledAt);
    if (scheduledDate < new Date() && !appointment) {
      toast.error('Cannot schedule appointments in the past');
      return;
    }

    setLoading(true);
    try {
      if (appointment) {
        await updateAppointment(appointment.id, {
          ...formData,
          scheduledAt: scheduledDate,
        });
        toast.success('Appointment updated successfully');
      } else if (lead) {
        await createAppointment({
          ownerId: user.uid,
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          type: formData.type,
          status: 'Scheduled',
          scheduledAt: scheduledDate,
          duration: formData.duration,
          location: formData.location,
          notes: formData.notes,
          createdBy: user.displayName || user.email || 'Unknown',
        });
        toast.success('Appointment scheduled successfully');
      }
      onClose();
    } catch (error) {
      console.error('Error saving appointment:', error);
      toast.error('Failed to save appointment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-zinc-900">
            {appointment ? 'Edit Appointment' : 'Schedule Appointment'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {lead && (
            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 mb-4">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Lead Info</p>
              <p className="text-sm font-bold text-zinc-900">{lead.name}</p>
              <p className="text-xs text-zinc-500">{lead.phone}</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-bold text-zinc-700">Appointment Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as AppointmentType })}
              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:bg-white focus:border-orange-500 transition-all outline-none"
            >
              {APPOINTMENT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-zinc-700">Date & Time</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:bg-white focus:border-orange-500 transition-all outline-none"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-zinc-700">Duration (min)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="number"
                  min="1"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:bg-white focus:border-orange-500 transition-all outline-none"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-zinc-700">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="text"
                placeholder="Office, Site Address, or Remote"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:bg-white focus:border-orange-500 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-zinc-700">Notes</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-zinc-400" size={16} />
              <textarea
                placeholder="Add any specific details or requirements..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:bg-white focus:border-orange-500 transition-all outline-none min-h-[100px] resize-none"
              />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-600 hover:bg-zinc-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : (appointment ? 'Save Changes' : 'Schedule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
