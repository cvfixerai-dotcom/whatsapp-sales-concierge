// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { StatsSkeleton, ChartSkeleton } from '@/components/skeletons';
import { useRouter } from 'next/navigation';
import {
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
import {
  TrendingUp,
  Users,
  MessageSquare,
  Calendar,
  Clock,
  Target,
  Settings,
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
    qualifiedLeads: 0,
    conversionRate: 0,
    avgResponseTime: 0,
    handoffRate: 0,
  });
  const [funnel, setFunnel] = useState({
    conversations: 0,
    qualified: 0,
    booked: 0,
  });
  const [conversationTrend, setConversationTrend] = useState<any[]>([]);
  const [temperatureData, setTemperatureData] = useState<any[]>([]);
  const [leadScoreData, setLeadScoreData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [conversionByTemperature, setConversionByTemperature] = useState<any[]>([]);
  const [responseCoverage, setResponseCoverage] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      fetchAnalytics();
    }
  }, [status, session, period]);

  const fetchAnalytics = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/analytics?period=${period}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      const statsData = data?.stats || {};

      setStats({
        totalConversations: statsData.totalConversations || 0,
        totalLeads: statsData.totalLeads || 0,
        totalAppointments: statsData.totalAppointments || 0,
        qualifiedLeads: statsData.qualifiedLeads || 0,
        conversionRate: statsData.conversionRate || 0,
        avgResponseTime: statsData.avgResponseTime || 0,
        handoffRate: statsData.handoffRate || 0,
      });
      setFunnel({
        conversations: data?.funnel?.conversations || 0,
        qualified: data?.funnel?.qualified || 0,
        booked: data?.funnel?.booked || 0,
      });
      setConversationTrend(data?.conversationTrend || []);
      setTemperatureData(data?.temperatureDistribution || []);
      setLeadScoreData(data?.leadScoreDistribution || []);
      setHourlyData(data?.hourlyActivity || []);
      setConversionByTemperature(data?.conversionByTemperature || []);
      setResponseCoverage(data?.responseCoverage || 0);

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const qualifiedRate = funnel.conversations
    ? Math.round((funnel.qualified / funnel.conversations) * 100)
    : 0;
  const bookedRate = funnel.qualified
    ? Math.round((funnel.booked / funnel.qualified) * 100)
    : 0;
  const overallBookedRate = funnel.conversations
    ? Math.round((funnel.booked / funnel.conversations) * 100)
    : 0;
  const responseTimeLabel = responseCoverage ? `${stats.avgResponseTime} min` : '—';
  const responseCoverageLabel = responseCoverage
    ? `${responseCoverage} conversations`
    : 'Awaiting responses';

  const renderConversionTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs shadow">
        <div className="font-medium text-gray-900">{label}</div>
        <div className="mt-1 text-gray-500">Leads: {data?.leads ?? 0}</div>
        <div className="text-gray-500">Booked: {data?.booked ?? 0}</div>
        <div className="text-gray-500">Conversion: {data?.conversionRate ?? 0}%</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={6} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
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
                  <p className="text-xs text-gray-400">Qualified: {stats.qualifiedLeads}</p>
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
                <div className="bg-indigo-500 p-3 rounded-full text-white">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Avg Response Time</p>
                  <p className="text-2xl font-semibold text-gray-900">{responseTimeLabel}</p>
                  <p className="text-xs text-gray-400">{responseCoverageLabel}</p>
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

          {/* Funnel Overview */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Conversation Funnel</h3>
                <p className="text-sm text-gray-500">Conversations → Qualified → Booked</p>
              </div>
              <div className="text-sm text-gray-500">
                Overall conversion: <span className="font-semibold text-gray-900">{overallBookedRate}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">Conversations</p>
                  <span className="text-sm text-gray-400">100%</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 mt-2">{funnel.conversations}</p>
                <div className="mt-3 h-2 rounded-full bg-blue-100">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">Qualified</p>
                  <span className="text-sm text-gray-400">{qualifiedRate}%</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 mt-2">{funnel.qualified}</p>
                <div className="mt-3 h-2 rounded-full bg-emerald-100">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${qualifiedRate}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">{qualifiedRate}% of conversations</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-500">Booked</p>
                  <span className="text-sm text-gray-400">{bookedRate}%</span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 mt-2">{funnel.booked}</p>
                <div className="mt-3 h-2 rounded-full bg-purple-100">
                  <div
                    className="h-2 rounded-full bg-purple-500"
                    style={{ width: `${overallBookedRate}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">{bookedRate}% of qualified leads</p>
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

          <div className="grid grid-cols-1 gap-6 mt-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Conversion by Temperature</h3>
                  <p className="text-sm text-gray-500">Booked vs total leads per temperature</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={conversionByTemperature} barGap={12}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="temperature" />
                  <YAxis />
                  <Tooltip content={renderConversionTooltip} />
                  <Legend />
                  <Bar dataKey="leads" name="Leads" fill="#60A5FA" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="booked" name="Booked" fill="#34D399" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Score Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Lead Score Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={leadScoreData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10B981">
                    {leadScoreData.map((_, index) => (
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
