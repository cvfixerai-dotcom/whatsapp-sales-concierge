// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast, Toaster } from 'sonner';
import {
  Search,
  RefreshCw,
  ExternalLink,
  Linkedin,
  ChevronLeft,
  ChevronRight,
  Building2,
  Lock,
  LogOut,
  Copy,
  Filter,
  CheckCheck,
  X,
} from 'lucide-react';

interface AgencyLead {
  id: string;
  title: string;
  street: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
  contact_name: string | null;
  linkedin_url: string | null;
  company_corrected: string | null;
  notes: string | null;
  linkedin_found: boolean;
  contacted: boolean;
  replied: boolean;
  demo_done: boolean;
  trial_started: boolean;
  client: boolean;
  created_at: string;
}

const TOGGLE_FIELDS = [
  { key: 'linkedin_found', label: 'LinkedIn' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' },
  { key: 'demo_done', label: 'Demo' },
  { key: 'trial_started', label: 'Trial' },
  { key: 'client', label: 'Client' },
] as const;

const OUTREACH_MESSAGE = `Hi — I help Dubai real estate agents automatically respond to WhatsApp inquiries, qualify buyers, and book viewings using AI. Would you be open to a quick demo?`;

type BooleanFilter = { [key: string]: 'true' | 'false' | '' };

export default function OutreachStandalonePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<BooleanFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const pageSize = 25;
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('outreach_auth');
      if (saved === 'true') setAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Password123') {
      setAuthenticated(true);
      setPasswordError('');
      sessionStorage.setItem('outreach_auth', 'true');
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    sessionStorage.removeItem('outreach_auth');
  };

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        ...(searchQuery && { search: searchQuery }),
      });
      // Add boolean filters
      Object.entries(filters).forEach(([key, val]) => {
        if (val) params.set(key, val);
      });
      const res = await fetch(`/api/outreach/standalone?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load outreach data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, searchQuery, filters]);

  useEffect(() => {
    if (authenticated) fetchLeads();
  }, [authenticated, fetchLeads]);

  const handleToggle = async (id: string, field: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setLeads(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: newValue } : l))
    );
    try {
      const res = await fetch('/api/outreach/standalone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value: newValue }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      setLeads(prev =>
        prev.map(l => (l.id === id ? { ...l, [field]: currentValue } : l))
      );
      toast.error('Failed to update');
    }
  };

  const handleInlineEdit = (id: string, field: string, value: string) => {
    // Update local state immediately
    setLeads(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: value } : l))
    );
    // Debounce the API call
    const timerKey = `${id}-${field}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
    }
    debounceTimers.current[timerKey] = setTimeout(async () => {
      try {
        const res = await fetch('/api/outreach/standalone', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, field, value: value || null }),
        });
        if (!res.ok) throw new Error('Save failed');
      } catch (err) {
        toast.error(`Failed to save ${field}`);
      }
    }, 600);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLeads();
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(0);
  };

  const handleFilterChange = (key: string, val: 'true' | 'false' | '') => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(0);
  };

  const handleNeedsFollowUp = () => {
    setFilters({ contacted: 'true', replied: 'false' });
    setShowFilters(true);
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({});
    setPage(0);
  };

  const handleMarkAllContacted = async () => {
    const ids = leads.filter(l => !l.contacted).map(l => l.id);
    if (ids.length === 0) {
      toast.info('All visible rows are already marked as contacted');
      return;
    }
    setBulkUpdating(true);
    setLeads(prev => prev.map(l => ({ ...l, contacted: true })));
    try {
      const res = await fetch('/api/outreach/standalone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, field: 'contacted', value: true }),
      });
      if (!res.ok) throw new Error('Bulk update failed');
      toast.success(`Marked ${ids.length} agencies as contacted`);
    } catch (err) {
      fetchLeads();
      toast.error('Failed to bulk update');
    } finally {
      setBulkUpdating(false);
    }
  };

  const copyOutreachMessage = () => {
    navigator.clipboard.writeText(OUTREACH_MESSAGE);
    toast.success('Message copied!');
  };

  const activeFilterCount = Object.values(filters).filter(v => v).length;
  const totalPages = Math.ceil(total / pageSize);

  // Password gate
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Toaster position="top-right" richColors />
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Outreach Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Enter password to access</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main outreach page
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* Top bar */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Outreach Queue</h1>
            <p className="text-xs text-gray-500">FixerAI internal sales dashboard</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search, filters & bulk actions */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search agency name..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-gray-900 bg-white text-sm"
                />
              </div>
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center px-3 py-2 border rounded-lg text-sm ${
                activeFilterCount > 0 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4 mr-1.5" />
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            <button
              onClick={handleNeedsFollowUp}
              className="flex items-center px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm hover:bg-amber-100"
            >
              Needs Follow-Up
            </button>
            <button
              onClick={handleMarkAllContacted}
              disabled={bulkUpdating || leads.length === 0}
              className="flex items-center px-3 py-2 bg-green-50 border border-green-300 text-green-800 rounded-lg text-sm hover:bg-green-100 disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark All Visible as Contacted
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="text-sm text-gray-500">
              {total} total
            </div>
          </div>

          {/* Filter row */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-xs font-medium text-gray-500 uppercase">Filter by:</span>
                {TOGGLE_FIELDS.map(f => (
                  <select
                    key={f.key}
                    value={filters[f.key] || ''}
                    onChange={e => handleFilterChange(f.key, e.target.value as 'true' | 'false' | '')}
                    className="text-xs border border-gray-300 rounded-md px-2 py-1.5 text-gray-900 bg-white"
                  >
                    <option value="">{f.label}: All</option>
                    <option value="true">{f.label}: Yes</option>
                    <option value="false">{f.label}: No</option>
                  </select>
                ))}
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center text-xs text-red-600 hover:text-red-800"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-10">#</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agency</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company (Corrected)</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">LinkedIn URL</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    {TOGGLE_FIELDS.map(f => (
                      <th key={f.key} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.length > 0 ? (
                    leads.map((lead, idx) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-center text-xs text-gray-400 font-mono">
                          {page * pageSize + idx + 1}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{lead.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={lead.contact_name || ''}
                            onChange={e => handleInlineEdit(lead.id, 'contact_name', e.target.value)}
                            placeholder="—"
                            className="w-full text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-0 py-0.5 text-gray-900 bg-transparent placeholder-gray-300 min-w-[100px]"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={lead.company_corrected || ''}
                            onChange={e => handleInlineEdit(lead.id, 'company_corrected', e.target.value)}
                            placeholder="—"
                            className="w-full text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-0 py-0.5 text-gray-900 bg-transparent placeholder-gray-300 min-w-[100px]"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{lead.street || '-'}</div>
                          <div className="text-xs text-gray-500">{lead.city || ''}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {lead.phone || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={lead.linkedin_url || ''}
                            onChange={e => handleInlineEdit(lead.id, 'linkedin_url', e.target.value)}
                            placeholder="—"
                            className="w-full text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-0 py-0.5 text-blue-700 bg-transparent placeholder-gray-300 min-w-[120px]"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={lead.notes || ''}
                            onChange={e => handleInlineEdit(lead.id, 'notes', e.target.value)}
                            placeholder="—"
                            className="w-full text-sm border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-0 py-0.5 text-gray-900 bg-transparent placeholder-gray-300 min-w-[120px]"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            {lead.website && (
                              <a
                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                title="Open Website"
                              >
                                <ExternalLink className="w-3 h-3 mr-0.5" />
                                Web
                              </a>
                            )}
                            <a
                              href={lead.linkedin_url
                                ? (lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`)
                                : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(lead.title)}%20Dubai`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                              title={lead.linkedin_url ? 'Open LinkedIn Profile' : 'Search LinkedIn'}
                            >
                              <Linkedin className="w-3 h-3 mr-0.5" />
                              {lead.linkedin_url ? 'Open' : 'Search'}
                            </a>
                            <button
                              onClick={copyOutreachMessage}
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded hover:bg-purple-100"
                              title="Copy outreach message"
                            >
                              <Copy className="w-3 h-3 mr-0.5" />
                              Msg
                            </button>
                          </div>
                        </td>
                        {TOGGLE_FIELDS.map(f => (
                          <td key={f.key} className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleToggle(lead.id, f.key, lead[f.key as keyof AgencyLead] as boolean)}
                              className={`w-8 h-5 rounded-full relative transition-colors duration-200 ${
                                lead[f.key as keyof AgencyLead] ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                              aria-label={`Toggle ${f.label}`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                                  lead[f.key as keyof AgencyLead] ? 'translate-x-3' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={15} className="px-6 py-16 text-center">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No agencies found</h3>
                        <p className="text-gray-500 text-sm">No agencies match your search or filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {total > 0 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, total)} of {total}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
