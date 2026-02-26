// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import { StatsSkeleton, ListSkeleton } from '@/components/skeletons';
import {
  MessageSquare,
  User,
  Search,
  Bot,
  UserCheck,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

const temperatureColors = {
  new: 'bg-gray-100 text-gray-800',
  warm: 'bg-yellow-100 text-yellow-800',
  hot: 'bg-red-100 text-red-800',
  cold: 'bg-blue-100 text-blue-800',
  booked: 'bg-green-100 text-green-800',
};

export default function ConversationsPage() {
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const router = useRouter();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMessageMap, setNewMessageMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const pollRef = useRef(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }
    if (status === 'authenticated' && session?.user?.tenantId) {
      // Silently repair is_active on existing conversations (one-time fix for legacy records)
      fetch('/api/conversations/repair', { method: 'POST' }).catch(() => {});
      fetchConversations();

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        fetchConversations({ silent: true });
      }, 5000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, session?.user?.tenantId]);

  const fetchConversations = async ({ silent = false } = {}) => {
    if (!session?.user?.tenantId) return;
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/conversations', { cache: 'no-store' });
      if (!res.ok) {
        console.error('Conversations API error:', res.status);
        return;
      }
      const data = await res.json();
      const nextConversations = data.conversations || [];
      let lastSeen = {};
      try {
        const raw = localStorage.getItem('conversationLastSeen');
        lastSeen = raw ? JSON.parse(raw) : {};
      } catch {}

      const inboundUpdates = {};
      nextConversations.forEach((conv) => {
        if (conv.last_sender !== 'contact' || !conv.last_message_time) return;
        const seenAt = lastSeen[conv.id];
        if (!seenAt || new Date(conv.last_message_time).getTime() > new Date(seenAt).getTime()) {
          inboundUpdates[conv.id] = true;
        }
      });

      setConversations(nextConversations);
      setNewMessageMap(inboundUpdates);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const markConversationSeen = (conv) => {
    setNewMessageMap((current) => ({ ...current, [conv.id]: false }));
    try {
      if (!conv?.last_message_time) return;
      const raw = localStorage.getItem('conversationLastSeen');
      const map = raw ? JSON.parse(raw) : {};
      map[conv.id] = conv.last_message_time;
      localStorage.setItem('conversationLastSeen', JSON.stringify(map));
    } catch {}
  };

  const filtered = conversations.filter((c) => {
    const matchSearch = !searchQuery || c.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) || c.contact_phone.includes(searchQuery);
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && c.status === 'active' && !c.handoff_requested) ||
      (statusFilter === 'handoff' && c.handoff_requested) ||
      (statusFilter === 'closed' && c.status === 'closed');
    return matchSearch && matchStatus;
  });

  const formatTimeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  const stats = {
    total: conversations.length,
    active: conversations.filter((c) => c.status === 'active' && !c.handoff_requested).length,
    handoff: conversations.filter((c) => c.handoff_requested).length,
    closed: conversations.filter((c) => c.status === 'closed').length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={4} />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-semibold text-green-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Needs Handoff</p>
          <p className="text-2xl font-semibold text-orange-600">{stats.handoff}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Closed</p>
          <p className="text-2xl font-semibold text-gray-600">{stats.closed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full text-gray-900 bg-white"
              />
            </div>
          </div>
          <div className="flex space-x-2">
            {(['all', 'active', 'handoff', 'closed']).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'handoff' ? 'Handoff' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="bg-white rounded-lg shadow divide-y divide-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Conversations will appear here when customers message your WhatsApp number.
            </p>
          </div>
        ) : (
          filtered.map((conv) => (
            <a
              key={conv.id}
              href={`/dashboard/conversations/${conv.id}`}
              className="flex items-center w-full min-w-0 px-6 py-4 hover:bg-gray-50 transition-colors overflow-hidden"
              onClick={() => markConversationSeen(conv)}
            >
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-gray-500" />
              </div>
              <div className="ml-4 flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{conv.contact_name}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${temperatureColors[conv.contact_temperature] || temperatureColors.new}`}>
                      {conv.contact_temperature}
                    </span>
                    {conv.handoff_requested && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Handoff
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-shrink-0 ml-2 space-x-2">
                    {newMessageMap[conv.id] && conv.last_sender === 'contact' && (
                      <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        New
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{formatTimeAgo(conv.last_message_time)}</span>
                  </div>
                </div>
                <div className="flex items-center mt-1 min-w-0">
                  <span className="mr-1 flex-shrink-0">
                    {conv.last_sender === 'ai' ? <Bot className="w-3 h-3 text-purple-500 inline" /> :
                     conv.last_sender === 'human' ? <UserCheck className="w-3 h-3 text-blue-500 inline" /> :
                     <User className="w-3 h-3 text-gray-400 inline" />}
                  </span>
                  <p className="text-sm text-gray-500 truncate flex-1 min-w-0">{conv.last_message}</p>
                  <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{conv.message_count} msgs</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 ml-2 flex-shrink-0" />
            </a>
          ))
        )}
      </div>
    </div>
  );
}
