import React, { useState } from 'react';
import { FAQ } from '../../types';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

interface Props {
  data: FAQ[];
  onChange: (faqs: FAQ[]) => void;
}

export default function FAQManager({ data, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });

  const handleAdd = () => {
    if (!newFaq.question || !newFaq.answer) return;
    const faq: FAQ = {
      id: Date.now().toString(),
      ...newFaq
    };
    onChange([...data, faq]);
    setNewFaq({ question: '', answer: '' });
  };

  const handleDelete = (id: string) => {
    onChange(data.filter(f => f.id !== id));
  };

  const handleUpdate = (id: string, updates: Partial<FAQ>) => {
    onChange(data.map(f => f.id === id ? { ...f, ...updates } : f));
    setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 space-y-4">
        <h3 className="font-bold text-orange-900 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add New FAQ
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            value={newFaq.question}
            onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
            placeholder="Question"
            className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
          <textarea
            value={newFaq.answer}
            onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
            placeholder="Answer"
            rows={2}
            className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={!newFaq.question || !newFaq.answer}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Add FAQ
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {data.map((faq) => (
          <div key={faq.id} className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3 group">
            {editingId === faq.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  defaultValue={faq.question}
                  onBlur={(e) => handleUpdate(faq.id, { question: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg"
                  autoFocus
                />
                <textarea
                  defaultValue={faq.answer}
                  onBlur={(e) => handleUpdate(faq.id, { answer: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingId(null)} className="p-2 text-zinc-400 hover:text-zinc-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start gap-4">
                  <h4 className="font-bold text-zinc-900">{faq.question}</h4>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingId(faq.id)}
                      className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(faq.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed">{faq.answer}</p>
              </>
            )}
          </div>
        ))}
        {data.length === 0 && (
          <div className="text-center py-12 text-zinc-400">
            No FAQs added yet. Add one above or import from website.
          </div>
        )}
      </div>
    </div>
  );
}
