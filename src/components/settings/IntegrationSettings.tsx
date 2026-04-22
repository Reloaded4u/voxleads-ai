import React, { useState, useEffect } from 'react';
import { Loader2, Save, Eye, EyeOff, Calendar, FileSpreadsheet, Phone, Mic } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { integrationsService } from '../../services/integrationsService';
import { toast } from 'sonner';
import { IntegrationSettings as IIntegrationSettings } from '../../types';
import { cn } from '../../lib/utils';

export default function IntegrationSettings() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<IIntegrationSettings>({
    twilioSid: '',
    twilioAuthToken: '',
    twilioPhoneNumber: '',
    telephonyProvider: 'twilio',
    ttsProvider: 'polly',
    elevenLabsApiKey: '',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    azureApiKey: '',
    azureRegion: 'eastus',
    azureVoiceName: 'en-US-JennyNeural',
    googleApiKey: '',
    googleVoiceName: 'en-US-Wavenet-A',
    googleLanguageCode: 'en-US',
    pollyVoiceId: 'Polly.Amy',
    pollyEngine: 'neural',
    customTtsUrl: '',
    googleCalendarConnected: false,
    googleSheetsConnected: false
  });

  useEffect(() => {
    if (profile?.integrations) {
      setIntegrations(prev => ({
        ...prev,
        ...profile.integrations
      }));
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;

    if (integrations.ttsProvider === 'elevenlabs' && !integrations.elevenLabsApiKey) {
      toast.error('ElevenLabs API Key is required');
      return;
    }

    if (integrations.ttsProvider === 'azure' && (!integrations.azureApiKey || !integrations.azureRegion)) {
      toast.error('Azure API Key and Region are required');
      return;
    }

    if (integrations.ttsProvider === 'google' && !integrations.googleApiKey) {
      toast.error('Google Cloud API Key is required');
      return;
    }

    if (integrations.ttsProvider === 'custom' && !integrations.customTtsUrl) {
      toast.error('Custom TTS URL is required');
      return;
    }

    setLoading(true);
    try {
      await integrationsService.updateIntegrations(user.uid, integrations);
      toast.success('Integration settings saved');
    } catch (error) {
      console.error('Error saving integrations:', error);
      toast.error('Failed to save integration settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Communication & Voice</h3>
              <p className="text-sm text-zinc-500 mt-1">Configure your telephony and preferred TTS provider.</p>
            </div>
            <div className="px-3 py-1 bg-zinc-100 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Per-User Configuration
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4 mb-6">
            <p className="text-xs text-orange-700 leading-relaxed">
              <strong>Note:</strong> If you leave these fields blank, the system will use the default global configuration provided by the administrator (if available). Providing your own credentials allows you to use your own Twilio account and preferred voice provider.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <Phone size={18} />
              </div>
              <h4 className="text-sm font-bold text-zinc-900">Telephony Configuration</h4>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 anim-fade-in">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Account SID</label>
                    {!integrations.twilioSid && (
                      <span className="text-[9px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded uppercase">
                        System Default
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showSecrets['twilioSid'] ? 'text' : 'password'}
                      value={integrations.twilioSid}
                      onChange={(e) => setIntegrations({ ...integrations, twilioSid: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all pr-10"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret('twilioSid')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showSecrets['twilioSid'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Auth Token</label>
                    {!integrations.twilioAuthToken && (
                      <span className="text-[9px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded uppercase">
                        System Default
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showSecrets['twilioAuthToken'] ? 'text' : 'password'}
                      value={integrations.twilioAuthToken}
                      onChange={(e) => setIntegrations({ ...integrations, twilioAuthToken: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all pr-10"
                      placeholder="Your Twilio Auth Token"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret('twilioAuthToken')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showSecrets['twilioAuthToken'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Twilio Phone Number</label>
                    {!integrations.twilioPhoneNumber && (
                      <span className="text-[9px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded uppercase">
                        System Default
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={integrations.twilioPhoneNumber}
                    onChange={(e) => setIntegrations({ ...integrations, twilioPhoneNumber: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                    placeholder="+1234567890"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                <Mic size={18} />
              </div>
              <h4 className="text-sm font-bold text-zinc-900">Voice Provider Configuration</h4>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">TTS Provider</label>
              <select
                value={integrations.ttsProvider}
                onChange={(e) => setIntegrations({ ...integrations, ttsProvider: e.target.value as IIntegrationSettings['ttsProvider'] })}
                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
              >
                <option value="polly">Amazon Polly (Built-in)</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="azure">Azure Cognitive Services</option>
                <option value="google">Google Cloud TTS</option>
                <option value="custom">Custom TTS Endpoint</option>
              </select>
            </div>

            {integrations.ttsProvider === 'polly' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Voice</label>
                  <select
                    value={integrations.pollyVoiceId || 'Polly.Amy'}
                    onChange={(e) => setIntegrations({ ...integrations, pollyVoiceId: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                  >
                    <option value="Polly.Amy">Amy</option>
                    <option value="Polly.Joanna">Joanna</option>
                    <option value="Polly.Joey">Joey</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Engine</label>
                  <div className="flex bg-white p-1 rounded-xl border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => setIntegrations({ ...integrations, pollyEngine: 'standard' })}
                      className={cn(
                        'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all',
                        integrations.pollyEngine === 'standard' ? 'bg-orange-500 text-white shadow-sm' : 'text-zinc-400'
                      )}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntegrations({ ...integrations, pollyEngine: 'neural' })}
                      className={cn(
                        'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all',
                        integrations.pollyEngine === 'neural' ? 'bg-orange-500 text-white shadow-sm' : 'text-zinc-400'
                      )}
                    >
                      Neural
                    </button>
                  </div>
                </div>
              </div>
            )}

            {integrations.ttsProvider === 'elevenlabs' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">API Key</label>
                  <div className="relative">
                    <input
                      type={showSecrets['elevenLabsApiKey'] ? 'text' : 'password'}
                      value={integrations.elevenLabsApiKey || ''}
                      onChange={(e) => setIntegrations({ ...integrations, elevenLabsApiKey: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm pr-10"
                      placeholder="Your ElevenLabs API Key"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret('elevenLabsApiKey')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showSecrets['elevenLabsApiKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Voice ID</label>
                  <input
                    type="text"
                    value={integrations.elevenLabsVoiceId || ''}
                    onChange={(e) => setIntegrations({ ...integrations, elevenLabsVoiceId: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                    placeholder="ElevenLabs Voice ID"
                  />
                </div>
              </div>
            )}

            {integrations.ttsProvider === 'azure' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Subscription Key</label>
                  <div className="relative">
                    <input
                      type={showSecrets['azureApiKey'] ? 'text' : 'password'}
                      value={integrations.azureApiKey || ''}
                      onChange={(e) => setIntegrations({ ...integrations, azureApiKey: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm pr-10"
                      placeholder="Azure Speech Key"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret('azureApiKey')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showSecrets['azureApiKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Region</label>
                  <input
                    type="text"
                    value={integrations.azureRegion || ''}
                    onChange={(e) => setIntegrations({ ...integrations, azureRegion: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                    placeholder="eastus"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Voice Name</label>
                  <input
                    type="text"
                    value={integrations.azureVoiceName || ''}
                    onChange={(e) => setIntegrations({ ...integrations, azureVoiceName: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                    placeholder="en-US-JennyNeural"
                  />
                </div>
              </div>
            )}

            {integrations.ttsProvider === 'google' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">API Key</label>
                  <div className="relative">
                    <input
                      type={showSecrets['googleApiKey'] ? 'text' : 'password'}
                      value={integrations.googleApiKey || ''}
                      onChange={(e) => setIntegrations({ ...integrations, googleApiKey: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm pr-10"
                      placeholder="Google Cloud API Key"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret('googleApiKey')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showSecrets['googleApiKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Voice Name</label>
                  <input
                    type="text"
                    value={integrations.googleVoiceName || ''}
                    onChange={(e) => setIntegrations({ ...integrations, googleVoiceName: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                    placeholder="en-US-Wavenet-A"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Language Code</label>
                  <input
                    type="text"
                    value={integrations.googleLanguageCode || ''}
                    onChange={(e) => setIntegrations({ ...integrations, googleLanguageCode: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                    placeholder="en-US"
                  />
                </div>
              </div>
            )}

            {integrations.ttsProvider === 'custom' && (
              <div className="grid grid-cols-1 gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Custom TTS URL</label>
                  <input
                    type="text"
                    value={integrations.customTtsUrl || ''}
                    onChange={(e) => setIntegrations({ ...integrations, customTtsUrl: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm"
                    placeholder="https://your-tts-endpoint.com/speak"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 bg-zinc-50/50 border-t border-zinc-200 flex justify-end">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-sm shadow-orange-200 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-bold text-zinc-900">Productivity Tools</h3>
          <p className="text-sm text-zinc-500 mt-1">Sync your leads and appointments with external tools.</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <Calendar size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Google Calendar</h4>
                <p className="text-xs text-zinc-500 mt-0.5">Automatically sync site visits to your calendar.</p>
              </div>
            </div>
            <button
              disabled
              className="px-4 py-2 bg-zinc-100 text-zinc-500 rounded-lg text-sm font-bold opacity-50 cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Google Sheets</h4>
                <p className="text-xs text-zinc-500 mt-0.5">Export leads to a Google Sheet in real-time.</p>
              </div>
            </div>
            <button
              disabled
              className="px-4 py-2 bg-zinc-100 text-zinc-500 rounded-lg text-sm font-bold opacity-50 cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}