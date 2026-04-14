import React, { useState } from 'react';
import { Globe, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { websiteImportService } from '../../services/websiteImportService';
import { aiStructuringService } from '../../services/aiStructuringService';
import { KnowledgeBase } from '../../types';
import { toast } from 'sonner';

interface Props {
  onImported: (data: Partial<KnowledgeBase>) => void;
}

export default function WebsiteImportPanel({ onImported }: Props) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'structuring' | 'success' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url) return;
    
    setStatus('fetching');
    setError(null);
    
    try {
      // 1. Fetch website content
      const rawData = await websiteImportService.importFromUrl(url);
      
      // 2. Structure with AI
      setStatus('structuring');
      const structuredData = await aiStructuringService.structureWebsiteContent(rawData.content);
      
      setStatus('success');
      onImported(structuredData);
      toast.success('Website content imported and structured successfully!');
    } catch (err) {
      console.error(err);
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Failed to import website');
      toast.error('Failed to import website content');
    }
  };

  return (
    <div className="bg-zinc-900 text-white p-8 rounded-3xl space-y-6 shadow-2xl shadow-zinc-900/20">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Globe className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Import from Website</h2>
          <p className="text-zinc-400 text-sm">Auto-build your knowledge base in seconds</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-business.com"
            className="w-full pl-12 pr-4 py-4 bg-zinc-800 border border-zinc-700 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all outline-none"
          />
          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        </div>

        <button
          onClick={handleImport}
          disabled={!url || status === 'fetching' || status === 'structuring'}
          className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 group"
        >
          {status === 'fetching' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Fetching Website...
            </>
          ) : status === 'structuring' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              AI Structuring Content...
            </>
          ) : (
            <>
              Start Import
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 animate-in zoom-in-95 duration-300">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-medium">Import complete! Review the fields below.</span>
        </div>
      )}

      {status === 'failed' && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 animate-in shake duration-300">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <div className="pt-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Our AI will analyze your homepage and key pages to extract business details, 
          services, FAQs, and tone. You can review and edit everything before saving.
        </p>
      </div>
    </div>
  );
}
