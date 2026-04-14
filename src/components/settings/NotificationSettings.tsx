import React, { useState, useEffect } from 'react';
import { Loader2, Save, Mail, Bell, PhoneMissed, Calendar, BarChart3 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { settingsService } from '../../services/settingsService';
import { toast } from 'sonner';
import { NotificationSettings as INotificationSettings } from '../../types';

export default function NotificationSettings() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<INotificationSettings>({
    emailNotifications: true,
    appointmentReminders: true,
    missedCallAlerts: true,
    followUpReminders: true,
    weeklySummary: true
  });

  useEffect(() => {
    if (profile?.notifications) {
      setNotifications(profile.notifications);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await settingsService.updateNotifications(user.uid, notifications);
      toast.success('Notification preferences saved');
    } catch (error) {
      console.error('Error saving notifications:', error);
      toast.error('Failed to save notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: keyof INotificationSettings) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const items = [
    { 
      id: 'emailNotifications', 
      label: 'Email Notifications', 
      desc: 'Receive general updates and alerts via email.',
      icon: Mail 
    },
    { 
      id: 'appointmentReminders', 
      label: 'Appointment Reminders', 
      desc: 'Get notified before scheduled site visits and meetings.',
      icon: Calendar 
    },
    { 
      id: 'missedCallAlerts', 
      label: 'Missed Call Alerts', 
      desc: 'Instant alerts when the AI agent misses a lead call.',
      icon: PhoneMissed 
    },
    { 
      id: 'followUpReminders', 
      label: 'Follow-up Reminders', 
      desc: 'Reminders for leads that need immediate attention.',
      icon: Bell 
    },
    { 
      id: 'weeklySummary', 
      label: 'Weekly Performance Summary', 
      desc: 'A detailed report of your leads and conversions every Monday.',
      icon: BarChart3 
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-zinc-200">
        <h3 className="text-lg font-bold text-zinc-900">Notification Preferences</h3>
        <p className="text-sm text-zinc-500 mt-1">Choose how and when you want to be notified.</p>
      </div>
      <div className="p-6 space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-100 hover:bg-zinc-50 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 shrink-0">
                <item.icon size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">{item.label}</h4>
                <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
            <button
              onClick={() => toggle(item.id as keyof INotificationSettings)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                notifications[item.id as keyof INotificationSettings] ? 'bg-orange-500' : 'bg-zinc-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifications[item.id as keyof INotificationSettings] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
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
  );
}
