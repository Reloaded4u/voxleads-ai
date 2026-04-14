import React from 'react';
import { BusinessProfile } from '../../types';

interface Props {
  data: BusinessProfile;
  onChange: (updates: Partial<BusinessProfile>) => void;
}

export default function BusinessProfileForm({ data, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onChange({ [name]: value });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Business Name</label>
          <input
            type="text"
            name="name"
            value={data.name || ''}
            onChange={handleChange}
            placeholder="e.g. Acme Real Estate"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Industry / Category</label>
          <input
            type="text"
            name="industry"
            value={data.industry || ''}
            onChange={handleChange}
            placeholder="e.g. Real Estate, SaaS, Healthcare"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Business Description</label>
        <textarea
          name="description"
          value={data.description || ''}
          onChange={handleChange}
          rows={3}
          placeholder="Briefly describe what your business does..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Locations / Service Areas</label>
          <input
            type="text"
            name="locations"
            value={data.locations || ''}
            onChange={handleChange}
            placeholder="e.g. New York, Online, Nationwide"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Contact Information</label>
          <input
            type="text"
            name="contactInfo"
            value={data.contactInfo || ''}
            onChange={handleChange}
            placeholder="e.g. support@acme.com, +1 234 567 890"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-zinc-700">Products / Services</label>
        <textarea
          name="products"
          value={data.products || ''}
          onChange={handleChange}
          rows={2}
          placeholder="List your main products or services..."
          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Unique Selling Points (USP)</label>
          <textarea
            name="usp"
            value={data.usp || ''}
            onChange={handleChange}
            rows={2}
            placeholder="What makes you different?"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-zinc-700">Offers / Promotions</label>
          <textarea
            name="offers"
            value={data.offers || ''}
            onChange={handleChange}
            rows={2}
            placeholder="Any current discounts or special offers?"
            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
        </div>
      </div>
    </div>
  );
}
