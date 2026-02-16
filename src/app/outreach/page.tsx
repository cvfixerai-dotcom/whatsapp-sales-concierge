// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

interface AgencyLead {
  id: string;
  title: string;
  street: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
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
  const pageSize = 25;

  // Check if already authenticated from sessionStorage
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
  }, [page, searchQuery]);

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

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLeads();
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(0);
  };

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search & controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search agency name..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-gray-900 bg-white"
                />
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="text-sm text-gray-500">
              {total} agencies total
            </div>
          </div>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agency</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    {TOGGLE_FIELDS.map(f => (
                      <th key={f.key} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.length > 0 ? (
                    leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{lead.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{lead.street || '-'}</div>
                          <div className="text-xs text-gray-500">{lead.city || ''}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {lead.phone || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            {lead.website && (
                              <a
                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                title="Open Website"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Web
                              </a>
                            )}
                            <a
                              href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(lead.title)}%20Dubai`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                              title="Search LinkedIn"
                            >
                              <Linkedin className="w-3 h-3 mr-1" />
                              LinkedIn
                            </a>
                          </div>
                        </td>
                        {TOGGLE_FIELDS.map(f => (
                          <td key={f.key} className="px-3 py-3 text-center">
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
                      <td colSpan={10} className="px-6 py-16 text-center">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No agencies found</h3>
                        <p className="text-gray-500 text-sm">No agencies match your search.</p>
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
