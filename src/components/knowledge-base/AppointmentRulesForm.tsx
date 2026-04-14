import React from 'react';
import { AppointmentRules } from '../../types';

interface Props {
  data: AppointmentRules;
  onChange: (updates: Partial<AppointmentRules>) => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function AppointmentRulesForm({ data, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onChange({ [name]: value });
  };

  const toggleDay = (day: string) => {
    const current = data.availableDays || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day];
    onChange({ availableDays: updated });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-4">
        <label className="text-sm font-bold text-zinc-700">Available Days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                (data.availableDays || []).includes(day)
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Available Time Slots</label>
          <input
            type="text"
            name="timeSlots"
            value={data.timeSlots || ''}
            onChange={handleChange}
            placeholder="e.g. 9:00 AM - 5:00 PM"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Buffer Time (minutes)</label>
          <input
            type="number"
            name="bufferTime"
            value={data.bufferTime || 0}
            onChange={(e) => onChange({ bufferTime: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Blackout Dates / Holidays</label>
        <textarea
          name="blackoutDates"
          value={data.blackoutDates || ''}
          onChange={handleChange}
          rows={2}
          placeholder="e.g. Dec 25, Jan 1, Public Holidays..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Reschedule Rules</label>
          <textarea
            name="rescheduleRules"
            value={data.rescheduleRules || ''}
            onChange={handleChange}
            rows={2}
            placeholder="e.g. 24h notice required..."
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Booking Notes for Agent</label>
          <textarea
            name="bookingNotes"
            value={data.bookingNotes || ''}
            onChange={handleChange}
            rows={2}
            placeholder="Any specific instructions for the agent when booking?"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>
      </div>
    </div>
  );
}
