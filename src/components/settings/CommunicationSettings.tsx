import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Loader2, Save, Phone, Clock, Video, Globe } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { firebase } from '../../firebase/config';
import { CommunicationSettings as CommSettings, UserSettings } from '../../types';
import { summaryService } from '../../services/summaryService';
import { toast } from 'sonner';

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney"
];

export default function CommunicationSettings() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [settings, setSettings] = useState<CommSettings>({
    smsAlertsEnabled: false,
    meetingSmsRecipients: [],
    sendLeadConfirmationSms: false,
    dailySummaryEnabled: false,
    dailySummaryTime: '09:00',
    dailySummaryTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dailySummaryRecipient: '',
    recordingEnabled: false,
    agentTakeoverEnabled: false,
    liveCallingEnabled: false
  });

  const [userSettings, setUserSettings] = useState<Partial<UserSettings>>({
    callingStartTime: '09:00',
    callingEndTime: '18:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    autoCallingEnabled: false,
    maxCallsPerMinute: 5,
    maxRetryAttempts: 3,
    retryDelayMinutes: 20,
    autoQueueOnImport: false
  });

  useEffect(() => {
    if (profile?.communication) {
      setSettings(profile.communication);
    }
    if (profile?.settings) {
      setUserSettings({
        ...userSettings,
        ...profile.settings
      });
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    
    // Validate calling hours
    if (userSettings.callingStartTime && userSettings.callingEndTime) {
      if (userSettings.callingStartTime >= userSettings.callingEndTime) {
        toast.error('Calling end time must be after start time');
        return;
      }
    }

    setSaving(true);
    try {
      await firebase.updateDoc(firebase.doc(firebase.db, 'users', user.uid), {
        communication: settings,
        settings: {
          ...profile?.settings,
          ...userSettings
        },
        updatedAt: firebase.serverTimestamp()
      });
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSendSummary = async () => {
    if (!user || !settings.dailySummaryRecipient) {
      toast.error('Please provide a recipient phone number for the summary');
      return;
    }
    setSendingSummary(true);
    try {
      await summaryService.sendManualSummary(user.uid, settings.dailySummaryRecipient);
      toast.success('Daily summary SMS sent');
    } catch (error) {
      console.error('Error sending summary:', error);
      toast.error('Failed to send summary SMS');
    } finally {
      setSendingSummary(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">SMS Alerts</h3>
              <p className="text-sm text-zinc-500">Configure automated SMS notifications.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Meeting Alerts</label>
              <p className="text-xs text-zinc-500">Send SMS when an appointment is scheduled.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, smsAlertsEnabled: !settings.smsAlertsEnabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.smsAlertsEnabled ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.smsAlertsEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          {settings.smsAlertsEnabled && (
            <div className="space-y-4 pt-4 border-t border-zinc-100">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Recipient Phone Numbers</label>
                <input
                  type="text"
                  placeholder="e.g. +1234567890, +0987654321"
                  value={settings.meetingSmsRecipients.join(', ')}
                  onChange={(e) => setSettings({ ...settings, meetingSmsRecipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  className="w-full px-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                />
                <p className="text-[10px] text-zinc-400 italic">Separate multiple numbers with commas.</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-zinc-700">Lead Confirmation</label>
                  <p className="text-xs text-zinc-500">Send a confirmation SMS to the lead as well.</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, sendLeadConfirmationSms: !settings.sendLeadConfirmationSms })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    settings.sendLeadConfirmationSms ? "bg-orange-500" : "bg-zinc-200"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    settings.sendLeadConfirmationSms ? "left-7" : "left-1"
                  )} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
              <Video size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Automation</h3>
              <p className="text-sm text-zinc-500">Configure automated calling behavior.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Auto-Calling Engine</label>
              <p className="text-xs text-zinc-500">Enable the background worker to place calls automatically.</p>
            </div>
            <button
              onClick={() => setUserSettings({ ...userSettings, autoCallingEnabled: !userSettings.autoCallingEnabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                userSettings.autoCallingEnabled ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                userSettings.autoCallingEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Auto-Queue on Import</label>
              <p className="text-xs text-zinc-500">Automatically add new leads to the queue when imported.</p>
            </div>
            <button
              onClick={() => setUserSettings({ ...userSettings, autoQueueOnImport: !userSettings.autoQueueOnImport })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                userSettings.autoQueueOnImport ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                userSettings.autoQueueOnImport ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-zinc-100">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Max Calls / Min</label>
              <input
                type="number"
                min="1"
                max="20"
                value={userSettings.maxCallsPerMinute}
                onChange={(e) => setUserSettings({ ...userSettings, maxCallsPerMinute: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Max Retries</label>
              <input
                type="number"
                min="0"
                max="10"
                value={userSettings.maxRetryAttempts}
                onChange={(e) => setUserSettings({ ...userSettings, maxRetryAttempts: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Retry Delay (Min)</label>
              <input
                type="number"
                min="1"
                value={userSettings.retryDelayMinutes}
                onChange={(e) => setUserSettings({ ...userSettings, retryDelayMinutes: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Calling Hours Section */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Automated Calling Hours</h3>
              <p className="text-sm text-zinc-500">Define when the AI is allowed to make calls.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Start Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="time"
                  value={userSettings.callingStartTime}
                  onChange={(e) => setUserSettings({ ...userSettings, callingStartTime: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">End Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="time"
                  value={userSettings.callingEndTime}
                  onChange={(e) => setUserSettings({ ...userSettings, callingEndTime: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Timezone</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <select
                value={userSettings.timezone}
                onChange={(e) => setUserSettings({ ...userSettings, timezone: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all appearance-none"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
                {!TIMEZONES.includes(userSettings.timezone || '') && (
                  <option value={userSettings.timezone}>{userSettings.timezone}</option>
                )}
              </select>
            </div>
            <p className="text-[10px] text-zinc-400 italic">
              Calls will only be initiated within these hours in your selected timezone.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Send size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Daily Summary SMS</h3>
              <p className="text-sm text-zinc-500">Get a daily performance report via SMS.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Enable Daily Summary</label>
              <p className="text-xs text-zinc-500">Receive a summary of leads and calls every day.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, dailySummaryEnabled: !settings.dailySummaryEnabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.dailySummaryEnabled ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.dailySummaryEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          {settings.dailySummaryEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-zinc-100">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Recipient Number</label>
                <input
                  type="tel"
                  placeholder="+1234567890"
                  value={settings.dailySummaryRecipient}
                  onChange={(e) => setSettings({ ...settings, dailySummaryRecipient: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Send Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input
                    type="time"
                    value={settings.dailySummaryTime}
                    onChange={(e) => setSettings({ ...settings, dailySummaryTime: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-zinc-700">Test Summary</label>
              <p className="text-xs text-zinc-500">Send a summary SMS to yourself right now.</p>
            </div>
            <button
              onClick={handleSendSummary}
              disabled={sendingSummary || !settings.dailySummaryRecipient}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-all disabled:opacity-50"
            >
              {sendingSummary ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Send Now
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <Phone size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Call Control</h3>
              <p className="text-sm text-zinc-500">Manage recording and agent takeover.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Call Recording</label>
              <p className="text-xs text-zinc-500">Automatically record all AI calls for review.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, recordingEnabled: !settings.recordingEnabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.recordingEnabled ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.recordingEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Agent Takeover</label>
              <p className="text-xs text-zinc-500">Allow human agents to join or take over live AI calls.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, agentTakeoverEnabled: !settings.agentTakeoverEnabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.agentTakeoverEnabled ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.agentTakeoverEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-zinc-900">Live Calling</label>
              <p className="text-xs text-zinc-500">Enable real outbound calls via Twilio (requires configuration).</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, liveCallingEnabled: !settings.liveCallingEnabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.liveCallingEnabled ? "bg-orange-500" : "bg-zinc-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                settings.liveCallingEnabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          Save All Settings
        </button>
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
