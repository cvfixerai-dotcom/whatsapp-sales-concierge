// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardSkeleton } from '@/components/skeletons';
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
  Cell
} from 'recharts';
import {
  MessageSquare,
  Users,
  Calendar,
  TrendingUp,
  Activity,
  Clock,
  AlertCircle,
  ChevronRight,
  Settings,
  Download,
  Eye,
  Plus,
  UserPlus,
  CreditCard,
  LogOut,
} from 'lucide-react';

interface KPICard {
  title: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  color: string;
}

interface Conversation {
  id: string;
  contact_name: string;
  last_message: string;
  temperature: string;
  created_at: string;
}

interface Booking {
  id: string;
  contact_name: string;
  scheduled_time: string;
  status: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState<KPICard[]>([]);
  const [conversationData, setConversationData] = useState<any[]>([]);
  const [temperatureData, setTemperatureData] = useState<any[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [handoffRequests, setHandoffRequests] = useState<any[]>([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      checkOnboardingStatus();
      fetchDashboardData();
      setupRealtimeSubscription();
    }
  }, [status, session]);

  const checkOnboardingStatus = async () => {
    // Onboarding check is handled by the API route
  };

  const fetchDashboardData = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);

      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) {
        console.error('Dashboard API error:', res.status);
        return;
      }
      const data = await res.json();

      // Set KPI data
      setKpiData([
        {
          title: 'Total Conversations',
          value: data.kpis?.total_conversations || 0,
          change: 0,
          icon: <MessageSquare className="w-5 h-5" />,
          color: 'bg-blue-500'
        },
        {
          title: 'Active Leads',
          value: data.kpis?.active_leads || 0,
          change: 0,
          icon: <Users className="w-5 h-5" />,
          color: 'bg-green-500'
        },
        {
          title: 'Booked Appointments',
          value: data.kpis?.booked_appointments || 0,
          change: 0,
          icon: <Calendar className="w-5 h-5" />,
          color: 'bg-purple-500'
        },
        {
          title: 'Conversion Rate',
          value: `${data.kpis?.conversion_rate || 0}%`,
          change: 0,
          icon: <TrendingUp className="w-5 h-5" />,
          color: 'bg-orange-500'
        }
      ]);

      // Set chart data
      setConversationData(
        (data.conversationVolumeData || []).map((d: any) => ({ date: d.date, conversations: d.count }))
      );
      setTemperatureData(data.temperatureData || []);
      setHourlyData([]);

      // Set lists
      setRecentConversations(data.recentConversations || []);
      setRecentBookings(data.recentBookings || []);
      setHandoffRequests(data.handoffRequests || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    // Poll every 30 seconds instead of realtime (realtime needs RLS auth)
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);

    setIsLive(true);

    return () => {
      clearInterval(interval);
      setIsLive(false);
    };
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <>
          {/* Live indicator */}
          {isLive && (
            <div className="flex items-center gap-2 mb-4">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-green-700">Live</span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {kpiData.map((kpi, index) => (
              <div key={index} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className={`${kpi.color} p-3 rounded-full text-white`}>
                    {kpi.icon}
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">{kpi.title}</p>
                    <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm">
                  {kpi.change > 0 ? (
                    <span className="text-green-600 flex items-center">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      {kpi.change}%
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center">
                      <TrendingUp className="w-4 h-4 mr-1 rotate-180" />
                      {Math.abs(kpi.change)}%
                    </span>
                  )}
                  <span className="text-gray-500 ml-2">from last month</span>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Conversation Volume */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Conversation Volume</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={conversationData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="conversations" stroke="#3B82F6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Lead Temperature Distribution */}
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
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {temperatureData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Performing Hours */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Performing Hours</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="conversations" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Activity */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
              
              {/* Latest Conversations */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Latest Conversations</h4>
                <div className="space-y-3">
                  {recentConversations.map(conv => (
                    <div key={conv.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0">
                        <MessageSquare className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{conv.contact_name}</p>
                        <p className="text-sm text-gray-500 truncate">{conv.last_message}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatTime(conv.created_at)}</p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        conv.temperature === 'hot' ? 'bg-red-100 text-red-800' :
                        conv.temperature === 'warm' ? 'bg-yellow-100 text-yellow-800' :
                        conv.temperature === 'cold' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {conv.temperature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Bookings */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Bookings</h4>
                <div className="space-y-3">
                  {recentBookings.map(booking => (
                    <div key={booking.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0">
                        <Calendar className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{booking.contact_name}</p>
                        <p className="text-sm text-gray-500">{formatTime(booking.scheduled_time)}</p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        booking.status === 'scheduled' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Handoff Requests */}
              {handoffRequests.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1 text-orange-500" />
                    Handoff Requests
                  </h4>
                  <div className="space-y-3">
                    {handoffRequests.map(handoff => (
                      <div key={handoff.id} className="flex items-start space-x-3 p-3 bg-orange-50 rounded-lg">
                        <div className="flex-shrink-0">
                          <AlertCircle className="w-5 h-5 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{handoff.contact_name}</p>
                          <p className="text-sm text-gray-500">{handoff.reason}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatTime(handoff.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <a href="/dashboard/leads" className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                  <span className="flex items-center">
                    <Eye className="w-5 h-5 mr-3" />
                    View All Leads
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </a>
                
                <a href="/dashboard/calendar" className="w-full flex items-center justify-between px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                  <span className="flex items-center">
                    <Calendar className="w-5 h-5 mr-3" />
                    View Calendar
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </a>
                
                <a href="/dashboard/settings" className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors">
                  <span className="flex items-center">
                    <Settings className="w-5 h-5 mr-3" />
                    Settings
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </a>
                
                <a href="/dashboard/analytics" className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                  <span className="flex items-center">
                    <Download className="w-5 h-5 mr-3" />
                    Export Data
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>

              {/* Add New Lead */}
              <div className="mt-6 pt-6 border-t">
                <a href="/dashboard/leads" className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Plus className="w-5 h-5 mr-2" />
                  Add New Lead
                </a>
              </div>
            </div>
          </div>
    </>
  );
}
