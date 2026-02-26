// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { TableSkeleton } from '@/components/skeletons';
import { Activity, RefreshCw, AlertCircle, CheckCircle, Clock, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

const PAGE_SIZE = 20;

export default function ActivityPage() {
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (status === 'authenticated') fetchEvents();
  }, [status, page, sortAsc, filterSource, filterStatus]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchEvents, 10000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  async function fetchEvents() {
    try {
      const params = new URLSearchParams({
        page: String(page),
        sort: sortAsc ? 'asc' : 'desc',
        source: filterSource,
        status: filterStatus,
      });
      const res = await fetch(`/api/activity?${params}`);
      if (!res.ok) throw new Error('Failed');
      const { events: data, total } = await res.json();
      setEvents(data || []);
      setTotalCount(total || 0);
    } catch (e) { console.error('Error:', e); }
    finally { setLoading(false); }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const srcColors: Record<string, string> = {
    twilio: 'bg-blue-100 text-blue-800',
    calendly: 'bg-purple-100 text-purple-800',
    stripe: 'bg-orange-100 text-orange-800',
  };

  if (loading) return <TableSkeleton rows={10} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />Webhook Activity Log
          </h2>
          <p className="text-sm text-gray-500">{totalCount} total events</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border ${autoRefresh ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-700'}`}>
            {autoRefresh ? <><Pause className="h-4 w-4" />Live</> : <><Play className="h-4 w-4" />Auto-refresh</>}
          </button>
          <button onClick={() => fetchEvents()} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border bg-white border-gray-300 text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900">
          <option value="all">All Sources</option>
          <option value="twilio">Twilio</option>
          <option value="calendly">Calendly</option>
          <option value="stripe">Stripe</option>
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900">
          <option value="all">All Statuses</option>
          <option value="processed">Processed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <button onClick={() => setSortAsc(!sortAsc)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-700 hover:bg-gray-50">
          {sortAsc ? 'Oldest first' : 'Newest first'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">No webhook events found</td></tr>
              ) : events.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{new Date(ev.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${srcColors[ev.source] || 'bg-gray-100 text-gray-800'}`}>{ev.source}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-mono">{ev.event_type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{ev.payload?.From || ev.payload?.WaId || '—'}</td>
                  <td className="px-4 py-3">
                    {ev.processed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="h-3 w-3" />Processed</span>
                    ) : ev.retry_count > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><AlertCircle className="h-3 w-3" />Failed</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3" />Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-red-600 max-w-xs truncate">{ev.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">Page {page + 1} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-white"><ChevronLeft className="h-4 w-4 inline" /> Prev</button>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-white">Next <ChevronRight className="h-4 w-4 inline" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
