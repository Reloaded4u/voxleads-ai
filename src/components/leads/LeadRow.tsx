import React from 'react';
import { MapPin, Phone, Mail, Tag, Calendar, MoreVertical, Clock } from 'lucide-react';
import { cn, formatPhoneNumber } from '../../lib/utils';
import { Lead, LeadStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';

interface LeadRowProps {
  key?: string;
  lead: Lead;
  onCall: (lead: Lead) => void;
  onSchedule: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onEnqueue: (lead: Lead) => void;
}

const statusColors: Record<LeadStatus, string> = {
  'New': 'bg-blue-50 text-blue-600 border-blue-100',
  'Contacted': 'bg-purple-50 text-purple-600 border-purple-100',
  'Interested': 'bg-green-50 text-green-600 border-green-100',
  'Not Interested': 'bg-zinc-50 text-zinc-600 border-zinc-100',
  'Follow-up': 'bg-orange-50 text-orange-600 border-orange-100',
  'Booked': 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

export function LeadRow({ lead, onCall, onSchedule, onEdit, onEnqueue }: LeadRowProps) {
  const { isAuthReady } = useAuth();
  
  return (
    <tr className="hover:bg-zinc-50/50 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-zinc-900">{lead.name}</span>
          <div className="flex items-center gap-1 text-xs text-zinc-500 mt-1">
            <MapPin size={12} />
            {lead.location}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Phone size={14} className="text-zinc-400" />
            {formatPhoneNumber(lead.phone)}
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Mail size={14} className="text-zinc-400" />
            {lead.email}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
          statusColors[lead.status]
        )}>
          {lead.status}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {lead.tags?.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[10px] font-bold uppercase tracking-wide">
              <Tag size={10} />
              {tag}
            </span>
          ))}
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-zinc-500">
        {lead.source}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onEnqueue(lead)}
            className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
            title="Add to Calling Queue"
          >
            <Clock size={18} />
          </button>
          <button 
            onClick={() => onSchedule(lead)}
            className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
            title="Schedule Appointment"
          >
            <Calendar size={18} />
          </button>
          <button 
            onClick={() => onCall(lead)}
            disabled={!isAuthReady}
            className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title={isAuthReady ? "Call Lead" : "Initializing..."}
          >
            <Phone size={18} />
          </button>
          <button 
            onClick={() => onEdit(lead)}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}
