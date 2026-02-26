// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { toast } from 'sonner';
import { StatsSkeleton, TableSkeleton } from '@/components/skeletons';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  Clock,
  CheckCircle,
  Filter,
  RefreshCw,
  Eye,
  UserCheck,
  AlertTriangle,
  Users,
  Activity,
} from 'lucide-react';

interface HandoffRequest {
  id: string;
  conversation_id: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'in-progress' | 'resolved';
  triggers: string[];
  requested_at: string;
  claimed_at?: string;
  claimed_by?: string;
  claimed_by_name?: string;
  resolved_at?: string;
  resolution?: string;
  notes?: string;
  escalated: boolean;
  response_time_minutes?: number | null;
}

interface HandoffStats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  avgResponseTime: number;
  escalatedCount: number;
}

const severityColors = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

const statusColors = {
  pending: 'bg-orange-100 text-orange-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
};

const DEFAULT_PERIOD = '30d';

export default function HandoffsPage() {
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [handoffQueue, setHandoffQueue] = useState<HandoffRequest[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffRequest[]>([]);
  const [stats, setStats] = useState<HandoffStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    avgResponseTime: 0,
    escalatedCount: 0,
  });
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffRequest | null>(null);
  const [resolutionType, setResolutionType] = useState<'resolved' | 'returned_to_ai'>('resolved');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      fetchHandoffs();
      setupRealtimeSubscription();
    }

    return () => {
      supabase.channel('handoffs-updates').unsubscribe();
    };
  }, [status, session]);

  useEffect(() => {
    setHandoffs(applyFilters(handoffQueue));
  }, [handoffQueue, statusFilter, severityFilter, searchQuery]);

  const fetchHandoffs = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/handoffs/queue?period=${DEFAULT_PERIOD}`);
      if (!response.ok) {
        throw new Error('Failed to fetch handoffs');
      }

      const data = await response.json();
      setHandoffQueue(data?.handoffs || []);
      setStats({
        total: data?.stats?.total || 0,
        pending: data?.stats?.pending || 0,
        inProgress: data?.stats?.inProgress || 0,
        resolved: data?.stats?.resolved || 0,
        avgResponseTime: data?.stats?.avgResponseTime || 0,
        escalatedCount: data?.stats?.escalatedCount || 0,
      });
    } catch (error) {
      console.error('Error fetching handoffs:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    supabase
      .channel('handoffs-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          if (payload.new?.status === 'handoff-requested' ||
              payload.new?.status === 'human-handled' ||
              payload.new?.status === 'resolved') {
            fetchHandoffs();
          }
        }
      )
      .subscribe();
  };

  const applyFilters = (items: HandoffRequest[]) => {
    let filtered = [...items];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((handoff) => handoff.status === statusFilter);
    }

    if (severityFilter !== 'all') {
      filtered = filtered.filter((handoff) => handoff.severity === severityFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((handoff) =>
        handoff.contact_name.toLowerCase().includes(query) ||
        handoff.contact_phone.includes(query) ||
        handoff.reason.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const handleClaimHandoff = async (handoffId: string) => {
    try {
      const response = await fetch('/api/handoffs/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: handoffId,
          agentId: session?.user?.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to claim handoff');

      fetchHandoffs();
    } catch (error) {
      console.error('Error claiming handoff:', error);
      toast.error('Failed to claim handoff');
    }
  };

  const handleViewConversation = (handoffId: string) => {
    router.push(`/dashboard/conversations/${handoffId}`);
  };

  const handleResolveHandoff = async () => {
    if (!selectedHandoff) return;

    try {
      const response = await fetch('/api/handoffs/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedHandoff.conversation_id,
          resolution: resolutionType,
          notes: resolutionNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to resolve handoff');

      setShowResolveModal(false);
      setResolutionType('resolved');
      setResolutionNotes('');
      setSelectedHandoff(null);
      fetchHandoffs();
    } catch (error) {
      console.error('Error resolving handoff:', error);
      toast.error('Failed to resolve handoff');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={6} />
        <TableSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div>
          {/* Refresh Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                fetchHandoffs();
              }}
              className="p-2 rounded-md hover:bg-gray-100"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-full">
                  <UserPlus className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 bg-indigo-100 rounded-full">
                  <Activity className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg Response</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.avgResponseTime ? `${stats.avgResponseTime} min` : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 bg-orange-100 rounded-full">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.pending}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-full">
                  <UserCheck className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.inProgress}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Resolved</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.resolved}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Escalated</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.escalatedCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search by name, phone, or reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          {/* Handoffs Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Requested
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {handoffs.map((handoff) => (
                    <tr key={handoff.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{handoff.contact_name}</div>
                          <div className="text-sm text-gray-500">{handoff.contact_phone}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {handoff.reason}
                        </div>
                        {handoff.escalated && (
                          <span className="text-xs text-red-600 flex items-center mt-1">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Escalated
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityColors[handoff.severity]}`}>
                          {handoff.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[handoff.status]}`}>
                          {handoff.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>{new Date(handoff.requested_at).toLocaleString()}</div>
                        {handoff.response_time_minutes != null && (
                          <div className="text-xs text-gray-400">Response: {handoff.response_time_minutes} min</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {handoff.claimed_by_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewConversation(handoff.conversation_id)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Conversation"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          {handoff.status === 'pending' && (
                            <button
                              onClick={() => handleClaimHandoff(handoff.conversation_id)}
                              className="text-green-600 hover:text-green-900"
                              title="Claim Handoff"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          
                          {handoff.status === 'in-progress' && (
                            <button
                              onClick={() => {
                                setSelectedHandoff(handoff);
                                setResolutionType('resolved');
                                setResolutionNotes('');
                                setShowResolveModal(true);
                              }}
                              className="text-gray-600 hover:text-gray-900"
                              title="Resolve Handoff"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {handoffs.length === 0 && (
              <div className="text-center py-16">
                <UserPlus className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No handoff requests</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                  Handoffs appear when the AI detects a customer needs human assistance. Your AI is handling all conversations smoothly.
                </p>
                <a
                  href="/dashboard/leads"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <Users className="w-4 h-4 mr-2" />
                  View All Leads
                </a>
              </div>
            )}
          </div>

      {/* Resolve Modal */}
      {showResolveModal && selectedHandoff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resolve Handoff</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resolution Type
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="resolution"
                      value="resolved"
                      checked={resolutionType === 'resolved'}
                      onChange={() => setResolutionType('resolved')}
                      className="mr-2"
                    />
                    <span className="text-sm">Resolved - Customer issue was resolved</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="resolution"
                      value="returned_to_ai"
                      checked={resolutionType === 'returned_to_ai'}
                      onChange={() => setResolutionType('returned_to_ai')}
                      className="mr-2"
                    />
                    <span className="text-sm">Return to AI - Hand back to AI assistant</span>
                  </label>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(event) => setResolutionNotes(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Add any notes about the resolution..."
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowResolveModal(false);
                    setSelectedHandoff(null);
                    setResolutionType('resolved');
                    setResolutionNotes('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleResolveHandoff()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Resolve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
