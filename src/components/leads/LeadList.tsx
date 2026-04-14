import React from 'react';
import { Loader2, Inbox } from 'lucide-react';
import { Lead } from '../../types';
import { LeadRow } from './LeadRow';

interface LeadListProps {
  leads: Lead[];
  loading: boolean;
  searchTerm: string;
  onCall: (lead: Lead) => void;
  onSchedule: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onEnqueue: (lead: Lead) => void;
  onOpenUpload: () => void;
}

export function LeadList({ leads, loading, searchTerm, onCall, onSchedule, onEdit, onEnqueue, onOpenUpload }: LeadListProps) {
  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-4">
        <Loader2 className="animate-spin" size={32} />
        <p className="text-sm font-medium">Loading leads...</p>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-4">
        <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center">
          <Inbox size={32} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-zinc-900">No leads found</p>
          <p className="text-xs text-zinc-500 mt-1">
            {searchTerm ? "Try adjusting your search terms." : "Start by importing leads or adding them manually."}
          </p>
        </div>
        {!searchTerm && (
          <button 
            onClick={onOpenUpload}
            className="mt-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all"
          >
            Import Leads
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-zinc-50/50 border-b border-zinc-200">
            <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Lead Info</th>
            <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Contact</th>
            <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Tags</th>
            <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Source</th>
            <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {leads.map((lead) => (
            <LeadRow 
              key={lead.id} 
              lead={lead} 
              onCall={onCall} 
              onSchedule={onSchedule} 
              onEdit={onEdit}
              onEnqueue={onEnqueue}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
