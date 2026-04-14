import React from 'react';
import { CallGuidance } from '../../types';

interface Props {
  data: CallGuidance;
  onChange: (updates: Partial<CallGuidance>) => void;
}

export default function CallGuidanceForm({ data, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onChange({ [name]: value });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Greeting Script</label>
        <textarea
          name="greeting"
          value={data.greeting || ''}
          onChange={handleChange}
          rows={2}
          placeholder="e.g. Hello! Thank you for calling Acme Real Estate. My name is Alex..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Opening Line / Hook</label>
        <textarea
          name="openingLine"
          value={data.openingLine || ''}
          onChange={handleChange}
          rows={2}
          placeholder="The first thing the agent says after the greeting to engage the lead..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Main Pitch</label>
        <textarea
          name="mainPitch"
          value={data.mainPitch || ''}
          onChange={handleChange}
          rows={3}
          placeholder="The core value proposition and sales pitch..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Qualification Questions</label>
        <textarea
          name="qualificationQuestions"
          value={data.qualificationQuestions || ''}
          onChange={handleChange}
          rows={3}
          placeholder="Questions to ask to see if the lead is a good fit..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Appointment Booking Prompt</label>
          <textarea
            name="bookingPrompt"
            value={data.bookingPrompt || ''}
            onChange={handleChange}
            rows={2}
            placeholder="How to ask for the appointment..."
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Closing Line</label>
          <textarea
            name="closingLine"
            value={data.closingLine || ''}
            onChange={handleChange}
            rows={2}
            placeholder="How to end the call professionally..."
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Follow-up Instructions</label>
        <textarea
          name="followUpInstructions"
          value={data.followUpInstructions || ''}
          onChange={handleChange}
          rows={2}
          placeholder="What happens after the call? (e.g. Send SMS, email brochure)..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>
    </div>
  );
}
