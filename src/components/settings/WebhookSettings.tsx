import React, { useState, useEffect } from 'react';
import { Loader2, Save, Globe, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { webhooksService } from '../../services/webhooksService';
import { toast } from 'sonner';
import { WebhookSettings as IWebhookSettings } from '../../types';
import { cn } from '../../lib/utils';

export default function WebhookSettings() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [webhooks, setWebhooks] = useState<IWebhookSettings>({
    url: '',
    enabled: false,
    events: {
      leadCreated: true,
      leadUpdated: false,
      appointmentCreated: true,
      appointmentUpdated: false,
      callCompleted: true
    }
  });

  useEffect(() => {
    if (profile?.webhooks) {
      setWebhooks(profile.webhooks);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    if (webhooks.enabled && !webhooks.url) {
      toast.error('Webhook URL is required when enabled');
      return;
    }
    setLoading(true);
    try {
      await webhooksService.updateWebhooks(user.uid, webhooks);
      toast.success('Webhook settings saved');
    } catch (error) {
      console.error('Error saving webhooks:', error);
      toast.error('Failed to save webhook settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!webhooks.url) {
      toast.error('Please enter a webhook URL first');
      return;
    }
    setTesting(true);
    try {
      const result = await webhooksService.testWebhook(webhooks.url);
      if (result.success) {
        toast.success('Webhook test successful!');
      } else {
        toast.error(`Webhook test failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error testing webhook:', error);
      toast.error('Failed to test webhook. Check the URL and try again.');
    } finally {
      setTesting(false);
    }
  };

  const toggleEvent = (key: keyof IWebhookSettings['events']) => {
    setWebhooks(prev => ({
      ...prev,
      events: { ...prev.events, [key]: !prev.events[key] }
    }));
  };

  const eventItems = [
    { id: 'leadCreated', label: 'lead.created', desc: 'Triggered when a new lead is added.' },
    { id: 'leadUpdated', label: 'lead.updated', desc: 'Triggered when lead details change.' },
    { id: 'appointmentCreated', label: 'appointment.created', desc: 'Triggered when a visit is scheduled.' },
    { id: 'appointmentUpdated', label: 'appointment.updated', desc: 'Triggered when a visit is modified.' },
    { id: 'callCompleted', label: 'call.completed', desc: 'Triggered when an AI call finishes.' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-bold text-zinc-900">Webhook Configuration</h3>
          <p className="text-sm text-zinc-500 mt-1">Send real-time event data to your own server or tools like Zapier.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-zinc-600 border border-zinc-200">
                <Globe size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Enable Webhooks</h4>
                <p className="text-xs text-zinc-500 mt-0.5">Toggle outgoing webhook requests.</p>
              </div>
            </div>
            <button
              onClick={() => setWebhooks({ ...webhooks, enabled: !webhooks.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                webhooks.enabled ? 'bg-orange-500' : 'bg-zinc-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  webhooks.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-700">Webhook URL</label>
            <div className="flex gap-2">
              <input 
                type="url"
                value={webhooks.url}
                onChange={(e) => setWebhooks({ ...webhooks, url: e.target.value })}
                className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                placeholder="https://your-api.com/webhook"
              />
              <button 
                onClick={handleTest}
                disabled={testing || !webhooks.url}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-lg text-sm font-bold hover:bg-zinc-50 transition-all disabled:opacity-50"
              >
                {testing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                Test
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Events to Trigger</h4>
            <div className="grid grid-cols-1 gap-3">
              {eventItems.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => toggleEvent(item.id as keyof IWebhookSettings['events'])}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                    webhooks.events[item.id as keyof IWebhookSettings['events']] 
                      ? "bg-orange-50 border-orange-200" 
                      : "bg-white border-zinc-100 hover:border-zinc-200"
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-zinc-900">{item.label}</span>
                      {webhooks.events[item.id as keyof IWebhookSettings['events']] && (
                        <CheckCircle2 size={14} className="text-orange-500" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
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

      <div className="bg-zinc-50 rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-zinc-400 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-zinc-900">Webhook Security</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">
              We recommend verifying webhook signatures to ensure requests are coming from our platform. 
              A signing secret will be provided in a future update.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
