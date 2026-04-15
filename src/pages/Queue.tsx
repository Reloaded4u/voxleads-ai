import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  Search,
  Filter,
  Calendar as CalendarIcon,
  Phone,
  User,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { queueService } from '../services/queueService';
import { QueueItem } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from '../lib/toast';

export default function Queue() {
  const { user } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;

    const unsubscribe = queueService.subscribeToQueue(user.uid, (data) => {
      setItems(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredItems = items.filter(item => {
    const matchesFilter = filter === 'all' || item.status === filter || (filter === 'pending' && item.status === 'scheduled');
    const matchesSearch = item.phone.toLowerCase().includes(search.toLowerCase()) || 
                         item.leadId.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'scheduled':
        return <Clock className="text-zinc-400" size={18} />;
      case 'processing':
        return <RefreshCw className="text-blue-500 animate-spin" size={18} />;
      case 'completed':
        return <CheckCircle2 className="text-green-500" size={18} />;
      case 'failed':
      case 'no_answer':
      case 'busy':
        return <XCircle className="text-red-500" size={18} />;
      default:
        return <AlertCircle className="text-zinc-400" size={18} />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider";
    switch (status) {
      case 'pending':
      case 'scheduled':
        return <span className={cn(baseClasses, "bg-zinc-100 text-zinc-600")}>Queued</span>;
      case 'processing':
        return <span className={cn(baseClasses, "bg-blue-100 text-blue-600")}>Calling</span>;
      case 'completed':
        return <span className={cn(baseClasses, "bg-green-100 text-green-600")}>Completed</span>;
      case 'failed':
      case 'no_answer':
      case 'busy':
        return <span className={cn(baseClasses, "bg-red-100 text-red-600")}>{status.replace('_', ' ')}</span>;
      default:
        return <span className={cn(baseClasses, "bg-zinc-100 text-zinc-600")}>{status}</span>;
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await queueService.retryItem(id);
      toast.success('Item moved back to pending');
    } catch (error) {
      toast.error('Failed to retry item');
    }
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this item from the queue?')) return;
    try {
      await queueService.removeFromQueue(id);
      toast.success('Item removed from queue');
    } catch (error) {
      toast.error('Failed to remove item');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await queueService.cancelItem(id);
      toast.success('Call cancelled');
    } catch (error) {
      toast.error('Failed to cancel call');
    }
  };

  const handleProcessNow = async () => {
    setProcessing(true);
    try {
      await queueService.processQueueNow();
      toast.success('Queue processing triggered');
    } catch (error) {
      toast.error('Failed to trigger processing');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Calling Queue</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage automated outbound calls and retries.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-zinc-200 shadow-sm">
          {(['all', 'pending', 'processing', 'completed', 'failed', 'cancelled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                filter === f 
                  ? "bg-orange-500 text-white shadow-sm" 
                  : "text-zinc-500 hover:bg-zinc-50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="text"
                placeholder="Search by phone or lead ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none shadow-sm"
              />
            </div>
            <button
              onClick={handleProcessNow}
              disabled={processing || items.filter(i => i.status === 'pending' || i.status === 'scheduled').length === 0}
              className="px-6 py-3 bg-zinc-900 text-white rounded-2xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
            >
              {processing ? <RefreshCw className="animate-spin" size={18} /> : <Play size={18} />}
              Process Now
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Lead / Phone</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Scheduled</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-center">Attempts</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <RefreshCw className="animate-spin text-orange-500 mx-auto mb-2" size={24} />
                        <p className="text-sm text-zinc-500">Loading queue...</p>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Clock className="text-zinc-300" size={24} />
                        </div>
                        <p className="text-sm font-medium text-zinc-900">No items found</p>
                        <p className="text-xs text-zinc-500 mt-1">Your calling queue is currently empty.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(item.status)}
                            {getStatusBadge(item.status)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                              <User size={14} className="text-zinc-400" />
                              {item.leadId}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <Phone size={14} className="text-zinc-400" />
                              {item.phone}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                              <CalendarIcon size={14} className="text-zinc-400" />
                              {item.scheduledTime?.toDate ? format(item.scheduledTime.toDate(), 'MMM d, HH:mm') : 'Immediate'}
                            </div>
                            {item.nextRetryAt && item.status === 'scheduled' && (
                              <div className="text-[10px] text-orange-600 font-medium">
                                Next retry: {format(item.nextRetryAt.toDate(), 'HH:mm')}
                              </div>
                            )}
                            {(item.retryReason || item.lastError) && (
                              <div className="text-[10px] text-red-500 max-w-[150px] truncate" title={item.lastError || item.retryReason}>
                                {item.lastError || item.retryReason}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-medium text-zinc-900">
                            {item.attempts} / {item.maxAttempts}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(item.status === 'pending' || item.status === 'scheduled') && (
                              <button 
                                onClick={() => handleCancel(item.id)}
                                className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                                title="Cancel call"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                            {(item.status === 'failed' || item.status === 'no_answer' || item.status === 'busy' || item.status === 'cancelled') && (
                              <button 
                                onClick={() => handleRetry(item.id)}
                                className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                                title="Retry now"
                              >
                                <RefreshCw size={16} />
                              </button>
                            )}
                            <button 
                              onClick={() => handleRemove(item.id)}
                              className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Remove"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-2xl p-6 text-white shadow-xl shadow-zinc-200">
            <h3 className="text-lg font-bold mb-4">Queue Summary</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <Clock className="text-zinc-400" size={20} />
                  <span className="text-sm font-medium">Pending</span>
                </div>
                <span className="text-lg font-bold">
                  {items.filter(i => i.status === 'pending' || i.status === 'scheduled').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <RefreshCw className="text-blue-400" size={20} />
                  <span className="text-sm font-medium">Active</span>
                </div>
                <span className="text-lg font-bold">
                  {items.filter(i => i.status === 'processing').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3 text-green-400">
                  <CheckCircle2 size={20} />
                  <span className="text-sm font-medium text-white">Completed</span>
                </div>
                <span className="text-lg font-bold">
                  {items.filter(i => i.status === 'completed').length}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3 text-red-400">
                  <XCircle size={20} />
                  <span className="text-sm font-medium text-white">Failed</span>
                </div>
                <span className="text-lg font-bold">
                  {items.filter(i => i.status === 'failed' || i.status === 'no_answer' || i.status === 'busy').length}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <AlertCircle size={16} className="text-orange-500" />
              Worker Status
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Engine Status</span>
                <span className="flex items-center gap-1.5 text-green-600 font-bold">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Last Scan</span>
                <span className="text-zinc-900 font-medium">Just now</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Rate Limit</span>
                <span className="text-zinc-900 font-medium">5 calls / min</span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-zinc-100">
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                The automated engine respects your calling hours and timezone settings. Calls outside these hours will be automatically rescheduled.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}