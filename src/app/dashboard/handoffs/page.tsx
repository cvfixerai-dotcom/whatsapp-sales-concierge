// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import {
  UserPlus,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  Filter,
  RefreshCw,
  Eye,
  UserCheck,
  ArrowRight,
  AlertTriangle,
  Activity,
  Users,
  TrendingUp,
  Settings,
  CreditCard,
  LogOut,
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

export default function HandoffsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
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
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      fetchHandoffs();
      fetchStats();
      setupRealtimeSubscription();
    }

    return () => {
      supabase.channel('handoffs-updates').unsubscribe();
    };
  }, [status, session, statusFilter, severityFilter, searchQuery]);

  const fetchHandoffs = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);
      
      let query = supabase
        .from('conversations')
        .select(`
          id,
          status,
          handoff_reason,
          handoff_requested_at,
          handoff_claimed_at,
          handoff_claimed_by,
          handoff_resolved_at,
          handoff_resolution,
          handoff_notes,
          handoff_triggers,
          handoff_escalated,
          contacts(name, whatsapp_number, email),
          users!handoff_claimed_by(name)
        `)
        .eq('tenant_id', session.user.tenantId)
        .in('status', ['handoff-requested', 'human-handled', 'resolved'])
        .order('handoff_requested_at', { ascending: false });

      // Apply filters
      if (statusFilter !== 'all') {
        const statusMap = {
          pending: 'handoff-requested',
          'in-progress': 'human-handled',
          resolved: 'resolved'
        };
        query = query.eq('status', statusMap[statusFilter as keyof typeof statusMap]);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data
      const transformedData: HandoffRequest[] = (data || []).map(conv => ({
        id: conv.id,
        conversation_id: conv.id,
        contact_name: conv.contacts?.name || 'Unknown',
        contact_phone: conv.contacts?.whatsapp_number || '',
        contact_email: conv.contacts?.email,
        reason: conv.handoff_reason || 'No reason provided',
        severity: determineSeverity(conv.handoff_triggers, conv.handoff_escalated),
        status: conv.status === 'handoff-requested' ? 'pending' :
                conv.status === 'human-handled' ? 'in-progress' : 'resolved',
        triggers: conv.handoff_triggers || [],
        requested_at: conv.handoff_requested_at,
        claimed_at: conv.handoff_claimed_at,
        claimed_by: conv.handoff_claimed_by,
        claimed_by_name: conv.users?.name,
        resolved_at: conv.handoff_resolved_at,
        resolution: conv.handoff_resolution,
        notes: conv.handoff_notes,
        escalated: conv.handoff_escalated || false,
      }));

      // Apply search filter
      let filteredData = transformedData;
      if (searchQuery) {
        filteredData = transformedData.filter(handoff =>
          handoff.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          handoff.contact_phone.includes(searchQuery) ||
          handoff.reason.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      // Apply severity filter
      if (severityFilter !== 'all') {
        filteredData = filteredData.filter(h => h.severity === severityFilter);
      }

      setHandoffs(filteredData);
    } catch (error) {
      console.error('Error fetching handoffs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!session?.user?.tenantId) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('status, handoff_requested_at, handoff_claimed_at, handoff_escalated')
        .eq('tenant_id', session.user.tenantId)
        .in('status', ['handoff-requested', 'human-handled', 'resolved']);

      if (error) throw error;

      const stats: HandoffStats = {
        total: data?.length || 0,
        pending: data?.filter(c => c.status === 'handoff-requested').length || 0,
        inProgress: data?.filter(c => c.status === 'human-handled').length || 0,
        resolved: data?.filter(c => c.status === 'resolved').length || 0,
        avgResponseTime: calculateAvgResponseTime(data || []),
        escalatedCount: data?.filter(c => c.handoff_escalated).length || 0,
      };

      setStats(stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
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
            fetchStats();
          }
        }
      )
      .subscribe();
  };

  const determineSeverity = (triggers: string[], escalated: boolean): 'low' | 'medium' | 'high' => {
    if (escalated) return 'high';
    if (!triggers || triggers.length === 0) return 'low';
    
    const highSeverityTriggers = ['high_value_lead', 'keyword_match', 'negative_sentiment', 'urgent_timeline'];
    const hasHighSeverity = triggers.some(t => highSeverityTriggers.includes(t));
    
    return hasHighSeverity ? 'high' : 'medium';
  };

  const calculateAvgResponseTime = (data: any[]): number => {
    const resolvedHandoffs = data.filter(c => c.handoff_claimed_at && c.handoff_requested_at);
    if (resolvedHandoffs.length === 0) return 0;

    const totalTime = resolvedHandoffs.reduce((sum, handoff) => {
      const requested = new Date(handoff.handoff_requested_at);
      const claimed = new Date(handoff.handoff_claimed_at);
      return sum + (claimed.getTime() - requested.getTime());
    }, 0);

    return Math.round(totalTime / resolvedHandoffs.length / 1000 / 60); // in minutes
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
      fetchStats();
    } catch (error) {
      console.error('Error claiming handoff:', error);
      toast.error('Failed to claim handoff');
    }
  };

  const handleViewConversation = (handoffId: string) => {
    router.push(`/dashboard/conversations/${handoffId}`);
  };

  const handleResolveHandoff = async (resolution: 'resolved' | 'returned_to_ai') => {
    if (!selectedHandoff) return;

    try {
      const response = await fetch('/api/handoffs/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedHandoff.conversation_id,
          resolution,
          notes: resolutionNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to resolve handoff');

      setShowResolveModal(false);
      setResolutionNotes('');
      setSelectedHandoff(null);
      fetchHandoffs();
      fetchStats();
    } catch (error) {
      console.error('Error resolving handoff:', error);
      toast.error('Failed to resolve handoff');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Handoff Management</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  fetchHandoffs();
                  fetchStats();
                }}
                className="p-2 rounded-md hover:bg-gray-100"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-screen">
          <nav className="mt-5 px-2">
            <a href="/dashboard" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md">
              <Activity className="mr-3 h-5 w-5" />
              Dashboard
            </a>
            <a href="/dashboard/leads" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <Users className="mr-3 h-5 w-5" />
              Leads
            </a>
            <a href="/dashboard/calendar" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <Calendar className="mr-3 h-5 w-5" />
              Calendar
            </a>
            <a href="/dashboard/analytics" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <TrendingUp className="mr-3 h-5 w-5" />
              Analytics
            </a>
            <a href="/dashboard/handoffs" className="bg-gray-100 text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <UserPlus className="mr-3 h-5 w-5" />
              Handoffs
            </a>
            <a href="/dashboard/billing" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <CreditCard className="mr-3 h-5 w-5" />
              Billing
            </a>
            <a href="/dashboard/settings" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <Settings className="mr-3 h-5 w-5" />
              Settings
            </a>
            <div className="border-t border-gray-200 mt-4 pt-4">
              <button
                onClick={() => signOut({ callbackUrl: '/auth/login' })}
                className="text-gray-600 hover:bg-red-50 hover:text-red-700 group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign Out
              </button>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
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
                        {new Date(handoff.requested_at).toLocaleString()}
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
        </main>
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
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">Resolved - Customer issue was resolved</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="resolution"
                      value="returned_to_ai"
                      onChange={(e) => setResolutionNotes(e.target.value)}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Add any notes about the resolution..."
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowResolveModal(false);
                    setSelectedHandoff(null);
                    setResolutionNotes('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const resolution = resolutionNotes === 'returned_to_ai' ? 'returned_to_ai' : 'resolved';
                    handleResolveHandoff(resolution);
                  }}
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
