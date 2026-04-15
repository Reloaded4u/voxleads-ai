import React, { useState } from 'react';
import { 
  Plus, 
  Upload, 
  Search, 
  Filter,
  Clock
} from 'lucide-react';
import { Lead } from '../types';
import LeadUpload from '../components/LeadUpload';
import LeadModal from '../components/leads/LeadModal';
import CallInterface from '../components/CallInterface';
import AppointmentModal from '../components/AppointmentModal';
import { LeadList } from '../components/leads/LeadList';
import { useLeads } from '../hooks/useLeads';
import { useAuth } from '../hooks/useAuth';
import { leadsService } from '../services/leadsService';
import { queueService } from '../services/queueService';
import { toast } from '../lib/toast';
import { mapHeaders, validateRow, normalizePhone } from '../utils/leadImport';

export default function Leads() {
  const { user, profile } = useAuth();
  const { leads, loading } = useLeads();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeCallLead, setActiveCallLead] = useState<Lead | null>(null);
  const [activeAppointmentLead, setActiveAppointmentLead] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleEnqueue = async (lead: Lead) => {
    if (!user) return;
    try {
      await queueService.enqueueLead(user.uid, lead.id, lead.phone);
      toast.success(`Added ${lead.name} to calling queue`);
    } catch (error) {
      toast.error('Failed to add lead to queue');
    }
  };

  const handleBulkEnqueue = async () => {
    if (!user || filteredLeads.length === 0) return;
    
    const confirmMsg = `Are you sure you want to add all ${filteredLeads.length} filtered leads to the calling queue?`;
    if (!confirm(confirmMsg)) return;

    const processBulk = async () => {
      await queueService.enqueueMultipleLeads(
        user.uid, 
        filteredLeads.map(l => ({ id: l.id, phone: l.phone }))
      );
      return filteredLeads.length;
    };

    toast.promise(processBulk(), {
      loading: 'Adding leads to queue...',
      success: (count) => `Successfully added ${count} leads to queue`,
      error: 'Failed to add leads to queue'
    });
  };

  const handleUpload = async (newLeads: any[], autoEnqueue: boolean) => {
    if (!user) {
      toast.error('Please sign in to upload leads');
      return;
    }

    const processUpload = async () => {
      let successCount = 0;
      let failCount = 0;
      let duplicateCount = 0;
      const errors: string[] = [];
      const leadsToEnqueue: { id: string, phone: string }[] = [];

      const existingPhones = new Set<string>(leads.map(l => normalizePhone(l.phone)));
      
      console.log("Starting upload of leads:", newLeads.length);

      for (let i = 0; i < newLeads.length; i++) {
        const row = newLeads[i];
        if (!row || Object.keys(row).length === 0) continue;
        
        const mappedLead = mapHeaders(row);
        const validation = validateRow(mappedLead, existingPhones);

        if (!validation.isValid) {
          if (validation.reason === 'Duplicate Phone') {
            duplicateCount++;
          } else {
            failCount++;
            errors.push(`Row ${i + 2}: ${validation.reason}`);
          }
          continue;
        }

        try {
          const leadId = await leadsService.createLead({
            ownerId: user.uid,
            name: mappedLead.name!,
            phone: normalizePhone(mappedLead.phone!),
            email: mappedLead.email || '',
            location: mappedLead.location || '',
            notes: mappedLead.notes || '',
            status: 'New',
            source: 'Import',
            tags: []
          });
          
          if (autoEnqueue) {
            leadsToEnqueue.push({ id: leadId, phone: normalizePhone(mappedLead.phone!) });
          }

          existingPhones.add(normalizePhone(mappedLead.phone!));
          successCount++;
        } catch (error) {
          console.error("Failed to create lead during import:", error, mappedLead);
          failCount++;
          errors.push(`Row ${i + 2}: Database error`);
        }
      }

      if (autoEnqueue && leadsToEnqueue.length > 0) {
        try {
          await queueService.enqueueMultipleLeads(user.uid, leadsToEnqueue);
        } catch (queueError) {
          console.error("Failed to enqueue leads after import:", queueError);
          errors.push("Failed to add leads to calling queue");
        }
      }

      if (errors.length > 0) {
        console.group('Import Errors');
        errors.forEach(err => console.error(err));
        console.groupEnd();
      }

      return { 
        total: newLeads.length, 
        successCount, 
        failCount, 
        duplicateCount,
        hasErrors: errors.length > 0
      };
    };

    toast.promise(processUpload(), {
      loading: 'Processing leads...',
      success: (data) => {
        let msg = `Import complete: ${data.successCount} success`;
        if (data.duplicateCount > 0) msg += `, ${data.duplicateCount} duplicates skipped`;
        if (data.failCount > 0) msg += `, ${data.failCount} failed`;
        if (data.hasErrors) msg += '. Check console for details.';
        return msg;
      },
      error: 'An error occurred during import'
    });
  };

  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {activeCallLead && (
        <CallInterface lead={activeCallLead} onClose={() => setActiveCallLead(null)} />
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Leads Management</h1>
          <p className="text-zinc-500 mt-1">Manage and track your sales leads efficiently.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <Upload size={18} />
            Import Leads
          </button>
          <button 
            onClick={() => setIsLeadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 rounded-xl text-sm font-semibold text-white hover:bg-orange-600 transition-colors shadow-sm shadow-orange-200"
          >
            <Plus size={18} />
            Add Lead
          </button>
        </div>
      </div>

      {isLeadModalOpen && (
        <LeadModal 
          lead={selectedLead || undefined} 
          onClose={() => {
            setIsLeadModalOpen(false);
            setSelectedLead(null);
          }} 
        />
      )}

      {isUploadOpen && (
        <LeadUpload 
          onUpload={handleUpload} 
          onClose={() => setIsUploadOpen(false)} 
          initialAutoEnqueue={profile?.settings?.autoQueueOnImport}
        />
      )}

      {activeAppointmentLead && (
        <AppointmentModal 
          lead={activeAppointmentLead} 
          onClose={() => setActiveAppointmentLead(null)} 
        />
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, email, or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            {filteredLeads.length > 0 && (
              <button 
                onClick={handleBulkEnqueue}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              >
                <Clock size={18} />
                Add All to Queue
              </button>
            )}
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors">
              <Filter size={18} />
              Filter
            </button>
          </div>
        </div>

        <LeadList 
          leads={filteredLeads}
          loading={loading}
          searchTerm={searchTerm}
          onCall={setActiveCallLead}
          onSchedule={setActiveAppointmentLead}
          onEnqueue={handleEnqueue}
          onEdit={(lead) => {
            setSelectedLead(lead);
            setIsLeadModalOpen(true);
          }}
          onOpenUpload={() => setIsUploadOpen(true)}
        />

        {filteredLeads.length > 0 && (
          <div className="p-4 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
            <p className="text-xs text-zinc-500">Showing {filteredLeads.length} leads</p>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 text-xs font-bold text-zinc-500 hover:text-zinc-700 disabled:opacity-50" disabled>Previous</button>
              <button className="px-3 py-1 text-xs font-bold text-zinc-500 hover:text-zinc-700">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
