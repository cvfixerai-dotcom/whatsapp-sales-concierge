// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { StatsSkeleton, ChartSkeleton } from '@/components/skeletons';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { supabase } from '@/lib/supabase-client';
import {
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  Calendar,
  Clock,
  Target,
  Activity,
  Settings,
  Download,
  UserPlus,
  CreditCard,
  LogOut,
} from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalLeads: 0,
    totalAppointments: 0,
    conversionRate: 0,
    avgResponseTime: 0,
    handoffRate: 0,
  });
  const [conversationTrend, setConversationTrend] = useState<any[]>([]);
  const [temperatureData, setTemperatureData] = useState<any[]>([]);
  const [sourceData, setSourceData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      fetchAnalytics();
    }
  }, [status, session, period]);

  const getPeriodDays = () => {
    switch (period) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
    }
  };

  const fetchAnalytics = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);
      const days = getPeriodDays();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const [convResult, leadsResult, appointmentsResult, handoffsResult] = await Promise.all([
        supabase
          .from('conversations')
          .select('id, created_at, status')
          .eq('tenant_id', session.user.tenantId)
          .gte('created_at', since),
        supabase
          .from('contacts')
          .select('id, temperature, created_at, lead_score')
          .eq('tenant_id', session.user.tenantId),
        supabase
          .from('appointments')
          .select('id, status, created_at')
          .eq('tenant_id', session.user.tenantId)
          .gte('created_at', since),
        supabase
          .from('conversations')
          .select('id')
          .eq('tenant_id', session.user.tenantId)
          .eq('status', 'handoff-requested')
          .gte('created_at', since),
      ]);

      const conversations = convResult.data || [];
      const leads = leadsResult.data || [];
      const appointments = appointmentsResult.data || [];
      const handoffs = handoffsResult.data || [];

      const totalConversations = conversations.length;
      const totalLeads = leads.length;
      const totalAppointments = appointments.length;
      const conversionRate = totalLeads > 0 ? Math.round((totalAppointments / totalLeads) * 100) : 0;
      const handoffRate = totalConversations > 0 ? Math.round((handoffs.length / totalConversations) * 100) : 0;

      setStats({
        totalConversations,
        totalLeads,
        totalAppointments,
        conversionRate,
        avgResponseTime: 0,
        handoffRate,
      });

      // Conversation trend
      const trendMap: Record<string, number> = {};
      conversations.forEach(conv => {
        const date = new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        trendMap[date] = (trendMap[date] || 0) + 1;
      });
      setConversationTrend(
        Object.entries(trendMap).map(([date, count]) => ({ date, conversations: count }))
      );

      // Temperature distribution
      const tempMap: Record<string, number> = {};
      leads.forEach(lead => {
        const temp = lead.temperature || 'new';
        tempMap[temp] = (tempMap[temp] || 0) + 1;
      });
      setTemperatureData(
        Object.entries(tempMap).map(([name, value]) => ({ name, value }))
      );

      // Score distribution
      const scoreRanges = { 'High (70-100)': 0, 'Medium (40-69)': 0, 'Low (0-39)': 0 };
      leads.forEach(lead => {
        const score = lead.lead_score || 0;
        if (score >= 70) scoreRanges['High (70-100)']++;
        else if (score >= 40) scoreRanges['Medium (40-69)']++;
        else scoreRanges['Low (0-39)']++;
      });
      setSourceData(
        Object.entries(scoreRanges).map(([name, value]) => ({ name, value }))
      );

      // Hourly distribution
      const hourMap: Record<number, number> = {};
      conversations.forEach(conv => {
        const hour = new Date(conv.created_at).getHours();
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      });
      const hourlyArr = [];
      for (let i = 0; i < 24; i++) {
        hourlyArr.push({ hour: `${i}:00`, conversations: hourMap[i] || 0 });
      }
      setHourlyData(hourlyArr);

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={5} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  return (
    <>
          {/* Period Selector */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex space-x-2">
              {(['7d', '30d', '90d'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {p === '7d' ? 'Last 7 Days' : p === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* Empty State */}
          {stats.totalConversations === 0 && stats.totalLeads === 0 && stats.totalAppointments === 0 && (
            <div className="bg-white rounded-lg shadow p-16 text-center mb-8">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Not enough data yet</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                Analytics will populate after your first WhatsApp conversations. Connect your number and start receiving messages.
              </p>
              <a
                href="/dashboard/settings"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Settings className="w-4 h-4 mr-2" />
                Go to Settings
              </a>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-blue-500 p-3 rounded-full text-white">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Conversations</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalConversations}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-green-500 p-3 rounded-full text-white">
                  <Users className="w-5 h-5" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Leads</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalLeads}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-purple-500 p-3 rounded-full text-white">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Appointments</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalAppointments}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-orange-500 p-3 rounded-full text-white">
                  <Target className="w-5 h-5" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Conversion Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.conversionRate}%</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="bg-red-500 p-3 rounded-full text-white">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Handoff Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.handoffRate}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Conversation Trend */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Conversation Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={conversationTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="conversations" stroke="#3B82F6" fill="#DBEAFE" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Temperature Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Lead Temperature</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={temperatureData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {temperatureData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Score Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Lead Score Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sourceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10B981">
                    {sourceData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Hourly Activity */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Hourly Activity</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="conversations" fill="#8B5CF6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
    </>
  );
}
