import React, { useState } from 'react';
import { 
  User, 
  Bell, 
  Shield, 
  Globe, 
  Key,
  MessageSquare
} from 'lucide-react';
import { cn } from '../lib/utils';
import ProfileSettings from '../components/settings/ProfileSettings';
import NotificationSettings from '../components/settings/NotificationSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import IntegrationSettings from '../components/settings/IntegrationSettings';
import WebhookSettings from '../components/settings/WebhookSettings';
import CommunicationSettings from '../components/settings/CommunicationSettings';

const sections = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'communication', label: 'Communication', icon: MessageSquare },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security & Privacy', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'api', label: 'API & Webhooks', icon: Key },
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState('profile');

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSettings />;
      case 'communication':
        return <CommunicationSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'security':
        return <SecuritySettings />;
      case 'integrations':
        return <IntegrationSettings />;
      case 'api':
        return <WebhookSettings />;
      default:
        return <ProfileSettings />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="text-zinc-500 mt-1">Manage your account and application preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
                section.id === activeSection 
                  ? "bg-white text-orange-600 shadow-sm border border-zinc-200" 
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              <section.icon size={18} />
              {section.label}
            </button>
          ))}
        </nav>

        <div className="md:col-span-3">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
