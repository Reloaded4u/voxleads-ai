import React, { useState, useRef, useEffect } from 'react';
import { 
  PhoneCall, 
  Play, 
  Pause, 
  Clock, 
  Calendar,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Loader2,
  Inbox,
  ChevronDown,
  MessageSquare,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useCalls } from '../hooks/useCalls';
import { toast } from 'sonner';
import { CallRecord } from '../types';

export default function Calls() {
  const { calls, loading } = useCalls();
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const filteredCalls = calls.filter(call =>
    call.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
    call.leadId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (call.leadName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (call.leadPhone || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const togglePlayback = (call: CallRecord) => {
    if (!audioRef.current) return;

    if (playingCallId === call.id) {
      audioRef.current.pause();
      setPlayingCallId(null);
    } else {
      if (!call.recordingUrl) {
        toast.error('Recording URL is missing');
        return;
      }

      // If switching calls, stop current and load new
      audioRef.current.src = call.recordingUrl;
      audioRef.current.play().catch(err => {
        console.error('Playback failed:', err);
        toast.error('Failed to play recording. The link might be expired or invalid.');
        setPlayingCallId(null);
      });
      setPlayingCallId(call.id);
    }
  };

  return (
    <div className="space-y-6">
      <audio 
        ref={audioRef} 
        onEnded={() => setPlayingCallId(null)}
        onError={() => {
          toast.error('Audio playback error');
          setPlayingCallId(null);
        }}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Call Logs & Recordings</h1>
          <p className="text-zinc-500 mt-1">Review AI-driven conversations and outcomes.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
            <Filter size={18} />
            Filter Logs
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, phone, or summary..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
            />
          </div>
        </div>

        <div className="divide-y divide-zinc-200">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-4">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-sm font-medium">Loading call logs...</p>
            </div>
          ) : filteredCalls.length > 0 ? (
            filteredCalls.map((call) => (
              <div key={call.id} className="p-6 hover:bg-zinc-50/50 transition-all group">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                      call.status === 'completed' ? "bg-green-50 text-green-600" : 
                      call.status === 'in-progress' ? "bg-orange-50 text-orange-600" :
                      "bg-red-50 text-red-600"
                    )}>
                      {call.status === 'completed' ? <PhoneCall size={24} /> : 
                       call.status === 'in-progress' ? <Loader2 size={24} className="animate-spin" /> :
                       <XCircle size={24} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-zinc-900 truncate">
                          {call.leadName || call.leadPhone || `Lead ID: ${call.leadId}`}
                        </h4>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                          call.status === 'completed' ? "bg-green-50 text-green-600 border-green-100" : 
                          ['in-progress', 'ringing', 'initiated'].includes(call.status) ? "bg-orange-50 text-orange-600 border-orange-100" :
                          "bg-red-50 text-red-600 border-red-100"
                        )}>
                          {call.status.replace('-', ' ')}
                        </span>

                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {call.leadPhone && call.leadName && (
                          <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                            {call.leadPhone}
                          </span>
                        )}

                        <span className="text-[10px] text-zinc-400 font-mono">
                          ID: {call.leadId}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-600 mt-2 line-clamp-2 leading-relaxed">
                        {call.summary || (call.status === 'in-progress' ? 'Call is currently active...' : 'No summary available.')}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Calendar size={14} />
                          {call.createdAt.toLocaleDateString()} {call.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-1.5 font-medium">
                          <Clock size={14} />
                          {Math.floor(call.duration / 60)}m {call.duration % 60}s
                        </div>
                        <div className="flex items-center gap-1.5 font-medium">
                          <CheckCircle2 size={14} className="text-green-500" />
                          Outcome: {call.outcome}
                        </div>
                        {call.recordingStatus && (
                          <div className={cn(
                            "flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider",
                            call.recordingStatus === 'completed' ? "bg-green-100 text-green-700" :
                            call.recordingStatus === 'processing' ? "bg-blue-100 text-blue-700" :
                            "bg-zinc-100 text-zinc-700"
                          )}>
                            Recording: {call.recordingStatus}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 lg:pl-6 lg:border-l lg:border-zinc-200">
                    <button 
                      onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                      className={cn(
                        "p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all",
                        expandedCallId === call.id && "bg-zinc-100 text-zinc-900"
                      )}
                      title="View AI Insights"
                    >
                      <ChevronDown size={20} className={cn("transition-transform duration-200", expandedCallId === call.id && "rotate-180")} />
                    </button>
                    {call.status === 'completed' && (
                      <button 
                        onClick={() => togglePlayback(call)}
                        disabled={call.recordingStatus === 'requested' || call.recordingStatus === 'processing'}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50",
                          playingCallId === call.id 
                            ? "bg-orange-500 text-white hover:bg-orange-600" 
                            : "bg-zinc-900 text-white hover:bg-zinc-800"
                        )}
                      >
                        {playingCallId === call.id ? <Pause size={16} /> : <Play size={16} />}
                        {playingCallId === call.id ? 'Pause' : 'Listen'}
                      </button>
                    )}
                    <button className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all">
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedCallId === call.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 pt-6 border-t border-zinc-100 space-y-6">
                        {/* AI Summary */}
                        <div className="bg-orange-50/30 p-4 rounded-xl border border-orange-100/50">
                          <h5 className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <MessageSquare size={12} />
                            AI Analysis Summary
                          </h5>
                          <p className="text-sm text-zinc-700 leading-relaxed font-medium">
                            {call.summary || 'No summary available.'}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Key Points */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                              <TrendingUp size={12} className="text-green-500" />
                              Key Discussion Points
                            </h5>
                            <ul className="space-y-2">
                              {call.keyPoints?.map((point, i) => (
                                <li key={i} className="text-sm text-zinc-600 flex items-start gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                                  {point}
                                </li>
                              )) || <li className="text-sm text-zinc-400 italic">No key points extracted.</li>}
                            </ul>
                          </div>

                          {/* Objections */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertCircle size={12} className="text-red-500" />
                              Objections Raised
                            </h5>
                            <ul className="space-y-2">
                              {call.objectionsRaised?.map((obj, i) => (
                                <li key={i} className="text-sm text-zinc-600 flex items-start gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                                  {obj}
                                </li>
                              ))}
                              {(!call.objectionsRaised || call.objectionsRaised.length === 0) && (
                                <li className="text-sm text-zinc-400 italic">No objections raised during this call.</li>
                              )}
                            </ul>
                          </div>
                        </div>

                        {/* Next Action & Sentiment */}
                        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sentiment</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                                call.sentiment === 'positive' ? "bg-green-50 text-green-700 border-green-100" :
                                call.sentiment === 'negative' ? "bg-red-50 text-red-700 border-red-100" :
                                "bg-zinc-100 text-zinc-700 border-zinc-200"
                              )}>
                                {call.sentiment || 'Neutral'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Next Action</span>
                              <span className="text-sm font-bold text-zinc-900">
                                {call.nextAction || 'Follow up with lead'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-4">
              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center">
                <Inbox size={32} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-zinc-900">No call logs found</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {searchTerm ? "Try adjusting your search terms." : "Calls will appear here once they are initiated."}
                </p>
              </div>
            </div>
          )}
        </div>

        {filteredCalls.length > 0 && (
          <div className="p-6 bg-zinc-50/50 border-t border-zinc-200 flex items-center justify-center">
            <button className="text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors">
              Load More Calls
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
