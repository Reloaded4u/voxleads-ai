import React, { useState, useEffect } from 'react';
import { Loader2, Save, Shield, LogOut, Mail, Clock, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { settingsService } from '../../services/settingsService';
import { toast } from 'sonner';
import { SecuritySettings as ISecuritySettings } from '../../types';

export default function SecuritySettings() {
  const { profile, user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [security, setSecurity] = useState<ISecuritySettings>({
    allowAnalytics: true,
    allowActivityTracking: true
  });

  useEffect(() => {
    if (profile?.security) {
      setSecurity(profile.security);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await settingsService.updateSecurity(user.uid, security);
      toast.success('Security preferences saved');
    } catch (error) {
      console.error('Error saving security:', error);
      toast.error('Failed to save security preferences');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: keyof ISecuritySettings) => {
    setSecurity(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-bold text-zinc-900">Account Security</h3>
          <p className="text-sm text-zinc-500 mt-1">Manage your account access and security settings.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-zinc-600 border border-zinc-200">
                <Mail size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Primary Email</h4>
                <p className="text-xs text-zinc-500 mt-0.5">{user?.email}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
              Verified
            </span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-zinc-600 border border-zinc-200">
                <Clock size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Last Login</h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {user?.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Recently'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button 
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-lg text-sm font-bold hover:bg-zinc-50 transition-all"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-bold text-zinc-900">Privacy Settings</h3>
          <p className="text-sm text-zinc-500 mt-1">Control how your data is used for analytics and tracking.</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Allow Analytics</h4>
              <p className="text-xs text-zinc-500 mt-0.5">Help us improve the platform by sharing anonymous usage data.</p>
            </div>
            <button
              onClick={() => toggle('allowAnalytics')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                security.allowAnalytics ? 'bg-orange-500' : 'bg-zinc-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  security.allowAnalytics ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-900">Activity Tracking</h4>
              <p className="text-xs text-zinc-500 mt-0.5">Track your activity to provide personalized recommendations.</p>
            </div>
            <button
              onClick={() => toggle('allowActivityTracking')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                security.allowActivityTracking ? 'bg-orange-500' : 'bg-zinc-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  security.allowActivityTracking ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
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

      <div className="bg-red-50 rounded-2xl border border-red-100 p-6 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-red-900">Delete Account</h4>
          <p className="text-xs text-red-600 mt-0.5">Permanently delete your account and all associated data.</p>
        </div>
        <button 
          disabled
          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold opacity-50 cursor-not-allowed"
        >
          Coming Soon
        </button>
      </div>
    </div>
  );
}
