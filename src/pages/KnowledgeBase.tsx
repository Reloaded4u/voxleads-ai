import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Save, 
  Globe, 
  User, 
  MessageSquare, 
  HelpCircle, 
  ShieldAlert, 
  Calendar, 
  Settings2,
  Loader2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { knowledgeBaseService } from '../services/knowledgeBaseService';
import { KnowledgeBase as KBType } from '../types';
import { toast } from 'sonner';

// Components
import BusinessProfileForm from '../components/knowledge-base/BusinessProfileForm';
import CallGuidanceForm from '../components/knowledge-base/CallGuidanceForm';
import FAQManager from '../components/knowledge-base/FAQManager';
import ObjectionManager from '../components/knowledge-base/ObjectionManager';
import AppointmentRulesForm from '../components/knowledge-base/AppointmentRulesForm';
import ToneSettingsForm from '../components/knowledge-base/ToneSettingsForm';
import WebsiteImportPanel from '../components/knowledge-base/WebsiteImportPanel';

type TabType = 'profile' | 'guidance' | 'faqs' | 'objections' | 'appointments' | 'tone';

const INITIAL_DATA: KBType = {
  profile: {
    name: '',
    industry: '',
    description: '',
    locations: '',
    products: '',
    usp: '',
    offers: '',
    contactInfo: ''
  },
  guidance: {
    greeting: '',
    openingLine: '',
    mainPitch: '',
    qualificationQuestions: '',
    bookingPrompt: '',
    closingLine: '',
    followUpInstructions: ''
  },
  faqs: [],
  objections: [],
  appointments: {
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    timeSlots: '9:00 AM - 5:00 PM',
    bufferTime: 15,
    blackoutDates: '',
    rescheduleRules: '',
    bookingNotes: ''
  },
  tone: {
    tone: 'Friendly',
    language: 'English',
    verbosity: 'Balanced',
    safetyStyle: '',
    escalationRules: ''
  },
  updatedAt: null
};

export default function KnowledgeBase() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [kbData, setKbData] = useState<KBType>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadKB();
    }
  }, [user]);

  const loadKB = async () => {
    try {
      const data = await knowledgeBaseService.getKnowledgeBase(user!.uid);
      setKbData(prev => ({
        ...prev,
        ...data,
        faqs: (data.faqs as any)?.items || [],
        objections: (data.objections as any)?.items || []
      }));
    } catch (error) {
      console.error('Failed to load knowledge base:', error);
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await knowledgeBaseService.saveFullKnowledgeBase(user.uid, kbData);
      toast.success('Knowledge base saved successfully!');
    } catch (error) {
      console.error('Failed to save knowledge base:', error);
      toast.error('Failed to save knowledge base');
    } finally {
      setSaving(false);
    }
  };

  const handleImported = (importedData: Partial<KBType>) => {
    setKbData(prev => ({
      ...prev,
      ...importedData,
      // Merge arrays if needed, or replace? User requested "Review before final save"
      // Here we just update the state, user still needs to click "Save"
      profile: { ...prev.profile, ...importedData.profile },
      guidance: { ...prev.guidance, ...importedData.guidance },
      faqs: importedData.faqs || prev.faqs,
      objections: importedData.objections || prev.objections,
      tone: { ...prev.tone, ...importedData.tone }
    }));
  };

  const updateSection = (section: keyof KBType, updates: any) => {
    setKbData(prev => ({
      ...prev,
      [section]: { ...prev[section as keyof KBType], ...updates }
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Business Profile', icon: User },
    { id: 'guidance', label: 'Call Guidance', icon: MessageSquare },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
    { id: 'objections', label: 'Objections', icon: ShieldAlert },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'tone', label: 'Tone & Behavior', icon: Settings2 },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/20">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Knowledge Base</h1>
            <p className="text-zinc-500 font-medium">Configure how your AI agent talks to leads</p>
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/10 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Saving...' : 'Save Knowledge Base'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Tabs */}
          <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                    : 'bg-white text-zinc-500 hover:bg-zinc-50 border border-zinc-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form Content */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm">
            {activeTab === 'profile' && (
              <BusinessProfileForm 
                data={kbData.profile} 
                onChange={(updates) => updateSection('profile', updates)} 
              />
            )}
            {activeTab === 'guidance' && (
              <CallGuidanceForm 
                data={kbData.guidance} 
                onChange={(updates) => updateSection('guidance', updates)} 
              />
            )}
            {activeTab === 'faqs' && (
              <FAQManager 
                data={kbData.faqs} 
                onChange={(faqs) => setKbData(prev => ({ ...prev, faqs }))} 
              />
            )}
            {activeTab === 'objections' && (
              <ObjectionManager 
                data={kbData.objections} 
                onChange={(objections) => setKbData(prev => ({ ...prev, objections }))} 
              />
            )}
            {activeTab === 'appointments' && (
              <AppointmentRulesForm 
                data={kbData.appointments} 
                onChange={(updates) => updateSection('appointments', updates)} 
              />
            )}
            {activeTab === 'tone' && (
              <ToneSettingsForm 
                data={kbData.tone} 
                onChange={(updates) => updateSection('tone', updates)} 
              />
            )}
          </div>
        </div>

        <div className="space-y-8">
          <WebsiteImportPanel onImported={handleImported} />
          
          <div className="bg-orange-50 p-8 rounded-[2.5rem] border border-orange-100 space-y-4">
            <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Pro Tip
            </h3>
            <p className="text-orange-800/80 text-sm leading-relaxed">
              The more information you provide, the better your AI agent will perform. 
              Try to be specific about your unique selling points and how you handle common objections.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
