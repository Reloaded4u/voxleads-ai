import React from 'react';
import { ToneSettings } from '../../types';

interface Props {
  data: ToneSettings;
  onChange: (updates: Partial<ToneSettings>) => void;
}

export default function ToneSettingsForm({ data, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    onChange({ [name]: value });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Tone</label>
          <select
            name="tone"
            value={data.tone || 'Friendly'}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          >
            <option value="Formal">Formal</option>
            <option value="Friendly">Friendly</option>
            <option value="Consultative">Consultative</option>
            <option value="Sales-focused">Sales-focused</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Verbosity</label>
          <select
            name="verbosity"
            value={data.verbosity || 'Balanced'}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          >
            <option value="Concise">Concise</option>
            <option value="Balanced">Balanced</option>
            <option value="Detailed">Detailed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Language Preference</label>
          <input
            type="text"
            name="language"
            value={data.language || 'English'}
            onChange={handleChange}
            placeholder="e.g. English, Spanish, Multi-lingual"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Business-Safe Response Style</label>
          <input
            type="text"
            name="safetyStyle"
            value={data.safetyStyle || ''}
            onChange={handleChange}
            placeholder="e.g. Never mention competitors, Always be polite"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Escalation Rules for Sensitive Cases</label>
        <textarea
          name="escalationRules"
          value={data.escalationRules || ''}
          onChange={handleChange}
          rows={3}
          placeholder="When should the AI agent transfer to a human or stop the call?"
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>
    </div>
  );
}
