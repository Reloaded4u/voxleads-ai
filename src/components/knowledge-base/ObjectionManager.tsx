import React, { useState } from 'react';
import { Objection } from '../../types';
import { Plus, Trash2, Edit2, Check, X, ShieldAlert } from 'lucide-react';

interface Props {
  data: Objection[];
  onChange: (objections: Objection[]) => void;
}

export default function ObjectionManager({ data, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newObjection, setNewObjection] = useState({ objection: '', response: '' });

  const handleAdd = () => {
    if (!newObjection.objection || !newObjection.response) return;
    const item: Objection = {
      id: Date.now().toString(),
      ...newObjection
    };
    onChange([...data, item]);
    setNewObjection({ objection: '', response: '' });
  };

  const handleDelete = (id: string) => {
    onChange(data.filter(f => f.id !== id));
  };

  const handleUpdate = (id: string, updates: Partial<Objection>) => {
    onChange(data.map(f => f.id === id ? { ...f, ...updates } : f));
    setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 space-y-4">
        <h3 className="font-bold text-red-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" /> Add New Objection
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            value={newObjection.objection}
            onChange={(e) => setNewObjection({ ...newObjection, objection: e.target.value })}
            placeholder="Objection (e.g. 'Too expensive')"
            className="w-full px-4 py-3 bg-white border border-red-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
          <textarea
            value={newObjection.response}
            onChange={(e) => setNewObjection({ ...newObjection, response: e.target.value })}
            placeholder="Response / Rebuttal"
            rows={2}
            className="w-full px-4 py-3 bg-white border border-red-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={!newObjection.objection || !newObjection.response}
            className="w-full py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Add Objection
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.id} className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3 group">
            {editingId === item.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  defaultValue={item.objection}
                  onBlur={(e) => handleUpdate(item.id, { objection: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg"
                  autoFocus
                />
                <textarea
                  defaultValue={item.response}
                  onBlur={(e) => handleUpdate(item.id, { response: e.target.value })}
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
                  <h4 className="font-bold text-zinc-900">{item.objection}</h4>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingId(item.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed">{item.response}</p>
              </>
            )}
          </div>
        ))}
        {data.length === 0 && (
          <div className="text-center py-12 text-zinc-400">
            No objections added yet. Add one above to help the AI handle tough questions.
          </div>
        )}
      </div>
    </div>
  );
}
