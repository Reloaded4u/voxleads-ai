import React, { useState, useEffect } from 'react';
import { User, Loader2, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import { toast } from 'sonner';

export default function ProfileSettings() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [settings, setSettings] = useState({
    voiceId: 'ElevenLabs - Josh (Natural, Professional)',
    agentPersonality: '',
    notificationsEnabled: true
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      if (profile.settings) {
        setSettings(profile.settings);
      }
    }
  }, [profile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPG, PNG and GIF are allowed');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      toast.error('Full Name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      let photoURL = profile?.photoURL;

      if (avatarFile) {
        setUploading(true);
        photoURL = await authService.uploadAvatar(user.uid, avatarFile);
        setUploading(false);
      }

      await authService.updateUserProfile(user.uid, {
        displayName: displayName.trim(),
        photoURL: photoURL,
        settings: settings
      });

      setAvatarFile(null);
      setAvatarPreview(null);
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-bold text-zinc-900">Personal Information</h3>
          <p className="text-sm text-zinc-500 mt-1">Update your profile details and contact info.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="w-20 h-20 bg-zinc-100 rounded-2xl flex items-center justify-center border border-zinc-200 overflow-hidden">
                {avatarPreview || profile?.photoURL ? (
                  <img 
                    src={avatarPreview || profile?.photoURL} 
                    alt={displayName} 
                    className={cn("w-full h-full object-cover", uploading && "opacity-50")} 
                    referrerPolicy="no-referrer" 
                  />
                ) : (
                  <User size={32} className="text-zinc-400" />
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="animate-spin text-orange-500" size={24} />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="cursor-pointer px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-bold hover:bg-zinc-800 transition-all inline-block">
                Change Avatar
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/jpeg,image/png,image/gif"
                  onChange={handleAvatarChange}
                />
              </label>
              <p className="text-xs text-zinc-500">JPG, GIF or PNG. Max size of 2MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-700">Full Name</label>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
                placeholder="Enter your full name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-zinc-700">Email Address</label>
              <input 
                type="email" 
                readOnly
                value={profile?.email || ''}
                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all cursor-not-allowed opacity-70"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="text-lg font-bold text-zinc-900">AI Voice Configuration</h3>
          <p className="text-sm text-zinc-500 mt-1">Configure your AI agent's voice and personality.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-700">Voice Selection</label>
            <select 
              value={settings.voiceId}
              onChange={(e) => setSettings({ ...settings, voiceId: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all"
            >
              <option>ElevenLabs - Josh (Natural, Professional)</option>
              <option>ElevenLabs - Rachel (Warm, Friendly)</option>
              <option>Twilio - Standard Male</option>
              <option>Twilio - Standard Female</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-700">Agent Personality</label>
            <textarea 
              rows={4}
              value={settings.agentPersonality}
              onChange={(e) => setSettings({ ...settings, agentPersonality: e.target.value })}
              placeholder="Describe how the agent should behave..."
              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:bg-white focus:border-orange-500 focus:ring-0 transition-all resize-none"
            />
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
    </div>
  );
}
