'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

interface Props { onClose: () => void; onSuccess: () => void; }

export default function AddLeadModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({ name: '', whatsapp_number: '', email: '', temperature: 'new', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.whatsapp_number) { toast.error('Name & WhatsApp required'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      toast.success('Lead added!'); onSuccess(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const inp = "w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add New Lead</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input value={form.name} onChange={e=>set('name',e.target.value)} className={inp}/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label><input value={form.whatsapp_number} onChange={e=>set('whatsapp_number',e.target.value)} placeholder="+1234567890" className={inp}/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} className={inp}/></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
            <select value={form.temperature} onChange={e=>set('temperature',e.target.value)} className={inp}>
              <option value="new">New</option><option value="warm">Warm</option><option value="hot">Hot</option><option value="cold">Cold</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={3} className={inp}/></div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? 'Adding...' : 'Add Lead'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
