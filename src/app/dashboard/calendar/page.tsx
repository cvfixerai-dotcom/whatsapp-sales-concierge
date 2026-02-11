// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import {
  Calendar,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Video,
  Activity,
  Users,
  TrendingUp,
  Settings,
  UserPlus,
  CreditCard,
} from 'lucide-react';

interface Appointment {
  id: string;
  contact_id: string;
  scheduled_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  meeting_link?: string;
  notes?: string;
  created_at: string;
  contacts?: {
    name: string;
    whatsapp_number: string;
    email?: string;
  };
}

const STATUS_STYLES = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
  completed: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  'no-show': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: AlertCircle },
};

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'list' | 'month'>('list');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.tenantId) {
      fetchAppointments();
    }
  }, [status, session, currentDate]);

  const fetchAppointments = async () => {
    if (!session?.user?.tenantId) return;

    try {
      setLoading(true);
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          contacts(name, whatsapp_number, email)
        `)
        .eq('tenant_id', session.user.tenantId)
        .gte('scheduled_time', startOfMonth)
        .lte('scheduled_time', endOfMonth)
        .order('scheduled_time', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const groupByDate = (appointments: Appointment[]) => {
    const groups: Record<string, Appointment[]> = {};
    appointments.forEach(apt => {
      const dateKey = new Date(apt.scheduled_time).toLocaleDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(apt);
    });
    return groups;
  };

  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const grouped = groupByDate(appointments);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/dashboard/settings" className="p-2 rounded-md hover:bg-gray-100">
                <Settings className="w-5 h-5 text-gray-600" />
              </a>
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {session?.user?.name?.[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
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
            <a href="/dashboard/calendar" className="bg-gray-100 text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <Calendar className="mr-3 h-5 w-5" />
              Calendar
            </a>
            <a href="/dashboard/analytics" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
              <TrendingUp className="mr-3 h-5 w-5" />
              Analytics
            </a>
            <a href="/dashboard/handoffs" className="text-gray-600 hover:bg-gray-50 hover:text-gray-900 group flex items-center px-2 py-2 text-sm font-medium rounded-md mt-1">
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
          </nav>
        </aside>

        <main className="flex-1 p-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Total This Month</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Upcoming</p>
              <p className="text-2xl font-semibold text-blue-600">{stats.scheduled}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-semibold text-green-600">{stats.completed}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Cancelled</p>
              <p className="text-2xl font-semibold text-red-600">{stats.cancelled}</p>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex items-center justify-between">
              <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-md">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900">
                {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-md">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Appointments List */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Appointments</h3>
            </div>

            {appointments.length === 0 ? (
              <div className="p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments this month</h3>
                <p className="text-gray-500 mb-4">
                  Appointments will appear here when the AI books meetings with your leads.
                </p>
                <a
                  href="/dashboard/settings"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Configure Calendar
                </a>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {Object.entries(grouped).map(([dateKey, dayAppointments]) => (
                  <div key={dateKey}>
                    <div className="px-6 py-2 bg-gray-50">
                      <h4 className="text-sm font-medium text-gray-700">{formatDate(dayAppointments[0].scheduled_time)}</h4>
                    </div>
                    {dayAppointments.map(apt => {
                      const statusStyle = STATUS_STYLES[apt.status] || STATUS_STYLES.scheduled;
                      const StatusIcon = statusStyle.icon;
                      return (
                        <div key={apt.id} className="px-6 py-4 hover:bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="text-center min-w-[60px]">
                              <p className="text-lg font-semibold text-gray-900">{formatTime(apt.scheduled_time)}</p>
                              <p className="text-xs text-gray-500">{apt.duration_minutes || 30} min</p>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{apt.contacts?.name || 'Unknown Contact'}</p>
                              <p className="text-sm text-gray-500">{apt.contacts?.whatsapp_number}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            {apt.meeting_link && (
                              <a
                                href={apt.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
                              >
                                <Video className="w-4 h-4 mr-1" />
                                Join
                              </a>
                            )}
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {apt.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
