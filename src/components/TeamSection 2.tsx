'use client';
import { Users } from 'lucide-react';

export default function TeamSection(p: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />Team
        </h2>
      </div>
      <div className="p-6 space-y-6">
        <table className="min-w-full divide-y divide-gray-200">
          <thead><tr>
            <th className="px-3 py-2 text-left text-xs text-gray-500">Name</th>
            <th className="px-3 py-2 text-left text-xs text-gray-500">Email</th>
            <th className="px-3 py-2 text-left text-xs text-gray-500">Role</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody className="divide-y">
            {p.members.map((m:any)=>(
              <tr key={m.id}>
                <td className="px-3 py-2 text-sm">{m.full_name||'—'}</td>
                <td className="px-3 py-2 text-sm text-gray-600">{m.email}</td>
                <td className="px-3 py-2"><span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">{m.role}</span></td>
                <td className="px-3 py-2 text-right">{m.role!=='owner'&&m.id!==p.uid&&<button onClick={()=>p.onRemove(m.id)} className="text-red-600 text-xs">Remove</button>}</td>
              </tr>))}
          </tbody>
        </table>
        {p.tempPw&&<div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">Temp password: <code>{p.tempPw}</code></div>}
        <form onSubmit={p.onInvite} className="flex flex-wrap gap-3">
          <input value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="Email" required className="px-3 py-2 border rounded text-sm flex-1 min-w-[150px]"/>
          <input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Name" className="px-3 py-2 border rounded text-sm flex-1 min-w-[120px]"/>
          <select value={p.role} onChange={e=>p.setRole(e.target.value)} className="px-3 py-2 border rounded text-sm">
            <option value="agent">Agent</option><option value="admin">Admin</option><option value="viewer">Viewer</option>
          </select>
          <button type="submit" disabled={p.busy} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50">
            {p.busy?'Inviting...':'Invite'}
          </button>
        </form>
      </div>
    </div>
  );
}
