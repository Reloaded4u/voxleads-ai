import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { PhoneOff, Mic, MicOff, MessageSquare, User, X, Settings, Loader2, Clock } from 'lucide-react';
import { db } from '../firebase/config';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Lead, KnowledgeBase, CallEvent } from '../types';
import { useCalls } from '../hooks/useCalls';
import { useAuth } from '../hooks/useAuth';
import { callSimulationService } from '../services/callSimulationService';
import { callControlService } from '../services/callControlService';
import { toast } from '../lib/toast';

interface CallInterfaceProps {
  lead: Lead;
  onClose: () => void;
}

export default function CallInterface({ lead, onClose }: CallInterfaceProps) {
  const { user, profile } = useAuth();
  const { initiateCall, finalizeCall } = useCalls();
  const [status, setStatus] = useState<'connecting' | 'active' | 'ended'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'ai' | 'lead', text: string }[]>([]);
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [duration, setDuration] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [kb, setKb] = useState<Partial<KnowledgeBase> | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [controlState, setControlState] = useState<string>('ai_active');
  
  const transcriptRef = useRef(transcript);
  const durationRef = useRef(duration);
  const hasStarted = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (callId) {
      const unsubscribe = callControlService.subscribeToEvents(callId, (newEvents) => {
        setEvents(newEvents);
        const lastStateEvent = [...newEvents].reverse().find(e => 
          ['ai_active', 'agent_join_requested', 'agent_joined', 'handoff_completed', 'call_ended'].includes(e.type)
        );
        if (lastStateEvent) {
          setControlState(lastStateEvent.type);

          if (lastStateEvent.type === 'call_ended' && status !== 'ended' && !isFinalizing) {
            handleEndCall();
          }
        }
      });
      return () => unsubscribe();
    }
  }, [callId, status, isFinalizing]);

  useEffect(() => {
    if (!callId || status === 'ended' || isFinalizing) return;

    const unsubscribe = onSnapshot(doc(db, 'calls', callId), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      const externallyEnded =
        data.status === 'completed' ||
        data.status === 'failed' ||
        data.status === 'busy' ||
        data.status === 'no-answer' ||
        data.controlState === 'call_ended';

      if (externallyEnded && status === 'active') {
        console.info(`[CallInterface] Auto-ending UI: call marked ${data.status || data.controlState} in Firestore`);
        handleEndCall();
      }
    });

    return () => unsubscribe();
  }, [callId, status, isFinalizing]);

  useEffect(() => {
    let timer: any;
    if (status === 'active') {
      timer = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const startCall = async () => {
      if (hasStarted.current) return;
      hasStarted.current = true;

      try {
        const result = await initiateCall(lead.id, lead.phone);
        setCallId(result.callId);
        setKb(result.kb);
        
        if (result.mode === 'test') {
          runSimulation(result.kb);
        } else if (result.mode === 'live') {
          setStatus('active');
        } else if (result.mode === 'queued') {
          // Mode 'queued' is handled by toast in callsService
          onClose();
        }
      } catch (error) {
        console.error('Failed to initiate call:', error);
        const message = error instanceof Error ? error.message : 'Failed to connect call';
        toast.error(message);
        onClose();
      }
    };

    startCall();
  }, [lead, onClose, initiateCall]);

  const runSimulation = async (knowledgeBase: Partial<KnowledgeBase>) => {
    setIsSimulating(true);
    setStatus('active');
    
    // Initial AI Greeting
    const greeting = knowledgeBase.guidance?.greeting || `Hello ${lead.name}, this is Alex. How are you today?`;
    const initialMsg = { role: 'ai' as const, text: greeting };
    setTranscript([initialMsg]);

    // Run 3-4 rounds of conversation
    for (let i = 0; i < 3; i++) {
      if (status === 'ended') break;

      // 1. Lead Responds
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
      const leadText = await callSimulationService.generateLeadResponse(transcriptRef.current, knowledgeBase, lead);
      setTranscript(prev => [...prev, { role: 'lead', text: leadText }]);

      // 2. AI Responds
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
      const aiText = await callSimulationService.generateAIReponse(transcriptRef.current, knowledgeBase, lead);
      setTranscript(prev => [...prev, { role: 'ai', text: aiText }]);
    }
    
    setIsSimulating(false);
  };

  const handleEndCall = async () => {
    if (!callId) {
      onClose();
      return;
    }

    setIsFinalizing(true);
    setStatus('ended');
    
    if (user) {
      await callControlService.updateControlState(callId, user.uid, 'call_ended', user.uid, user.displayName);
    }

    try {
      const fullTranscript = transcriptRef.current
        .map(m => `${m.role === 'ai' ? 'AI' : 'Lead'}: ${m.text}`)
        .join('\n');
      
      await finalizeCall(callId, lead.id, fullTranscript, durationRef.current);
      toast.success('Call completed and summarized');
      onClose();
    } catch (error) {
      console.error('Error finalizing call:', error);
      toast.error('Error saving call details');
      onClose();
    } finally {
      setIsFinalizing(false);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleControlAction = async (action: 'agent_join_requested' | 'agent_joined' | 'handoff_completed') => {
    if (!callId || !user) return;
    const success = await callControlService.updateControlState(callId, user.uid, action, user.uid, user.displayName);
    if (success) {
      toast.success(`Action successful: ${action.replace(/_/g, ' ')}`);
    } else {
      toast.error('Failed to perform action');
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950 z-[60] flex flex-col items-center justify-center p-8">
      {!isFinalizing && (
        <button 
          onClick={handleEndCall}
          className="absolute top-8 right-8 p-2 text-zinc-500 hover:text-white transition-colors"
        >
          <X size={32} />
        </button>
      )}

      <div className="w-full max-w-4xl flex flex-col items-center gap-12">
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <div className="w-32 h-32 bg-zinc-900 rounded-full flex items-center justify-center border-2 border-zinc-800 overflow-hidden">
              <User size={64} className="text-zinc-600" />
            </div>
            {status === 'active' && (
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 border-4 border-orange-500 rounded-full"
              />
            )}
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white">{lead.name}</h2>
            <p className="text-zinc-500 font-mono mt-2">
              {isFinalizing ? 'Finalizing...' : status === 'connecting' ? 'Connecting...' : formatDuration(duration)}
            </p>
          </div>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8 h-[500px]">
          <div className="lg:col-span-2 bg-zinc-900/50 rounded-3xl border border-zinc-800 p-8 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                <MessageSquare size={14} />
                Live Transcript
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
                  controlState === 'ai_active' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                  controlState === 'agent_joined' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                  "bg-orange-500/10 text-orange-500 border-orange-500/20"
                )}>
                  {controlState.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
              {isFinalizing ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
                  <Loader2 className="animate-spin" size={32} />
                  <p className="text-sm font-medium">AI is summarizing the conversation...</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {transcript.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col max-w-[80%]",
                        msg.role === 'ai' ? "self-start" : "self-end items-end"
                      )}
                    >
                      <span className="text-[10px] font-bold text-zinc-500 uppercase mb-1">
                        {msg.role === 'ai' ? 'AI Agent' : 'Lead'}
                      </span>
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'ai' ? "bg-zinc-800 text-white" : "bg-orange-500 text-white"
                      )}>
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          <div className="bg-zinc-900/50 rounded-3xl border border-zinc-800 p-8 flex flex-col">
            <div className="flex items-center gap-2 mb-6 text-zinc-400 text-xs font-bold uppercase tracking-widest">
              <Clock size={14} />
              Call Timeline
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {events.map((event, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-px bg-zinc-800 relative">
                    <div className="absolute top-2 -left-1 w-2 h-2 rounded-full bg-zinc-700 border border-zinc-900" />
                  </div>
                  <div className="pb-4">
                    <p className="text-[10px] text-zinc-500 font-mono">
                      {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                    <p className="text-xs text-zinc-300 mt-1">
                      <span className="font-bold text-white">
                        {event.type === 'ai_start' ? 'AI started call' :
                         event.type === 'agent_join_requested' ? 'Agent join requested' :
                         event.type === 'agent_joined' ? `${event.agentName} joined` :
                         event.type === 'handoff_completed' ? 'Handoff completed' :
                         event.type === 'call_ended' ? 'Call ended' : 'Note added'}
                      </span>
                      {event.note && <span className="block mt-1 text-zinc-400 italic">"{event.note}"</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {profile?.communication?.agentTakeoverEnabled && status === 'active' && (
              <div className="mt-6 pt-6 border-t border-zinc-800 grid grid-cols-1 gap-2">
                {controlState === 'ai_active' && (
                  <button 
                    onClick={() => handleControlAction('agent_join_requested')}
                    className="w-full py-2 bg-zinc-800 text-white rounded-lg text-xs font-bold hover:bg-zinc-700 transition-all"
                  >
                    Request Agent Join
                  </button>
                )}
                {(controlState === 'ai_active' || controlState === 'agent_join_requested') && (
                  <button 
                    onClick={() => handleControlAction('agent_joined')}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all"
                  >
                    Join Call
                  </button>
                )}
                {controlState === 'agent_joined' && (
                  <button 
                    onClick={() => handleControlAction('handoff_completed')}
                    className="w-full py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-all"
                  >
                    Take Over Call
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-8">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            disabled={isFinalizing}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-all border-2",
              isMuted ? "bg-red-500/10 border-red-500 text-red-500" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white",
              isFinalizing && "opacity-50 cursor-not-allowed"
            )}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          
          <button 
            onClick={handleEndCall}
            disabled={isFinalizing}
            className={cn(
              "w-20 h-20 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-xl shadow-red-500/20",
              isFinalizing && "opacity-50 cursor-not-allowed"
            )}
          >
            {isFinalizing ? <Loader2 className="animate-spin" size={32} /> : <PhoneOff size={32} />}
          </button>

          <button 
            disabled={isFinalizing}
            className={cn(
              "w-16 h-16 bg-zinc-900 border-2 border-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all",
              isFinalizing && "opacity-50 cursor-not-allowed"
            )}
          >
            <Settings size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
