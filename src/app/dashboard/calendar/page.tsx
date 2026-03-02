// @ts-nocheck
'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { StatsSkeleton, ListSkeleton } from '@/components/skeletons';
import { useRouter } from 'next/navigation';
import {
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Video,
  Ban,
  X,
} from 'lucide-react';

interface Appointment {
  id: string;
  contact_id?: string;
  scheduled_time: string;
  duration?: number;
  duration_minutes?: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  meeting_link?: string;
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  booked_via?: string;
  created_at?: string;
  contacts?: {
    name?: string;
    whatsapp_number?: string;
    email?: string;
  };
}

interface BlockedSlot {
  id: string;
  start_time: string;
  end_time: string;
  reason?: string;
}

const STATUS_STYLES = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
  confirmed: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
  completed: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle },
  'no-show': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: AlertCircle },
};

export default function CalendarPage() {
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [blockForm, setBlockForm] = useState(() => {
    const today = new Date();
    return {
      date: today.toLocaleDateString('en-CA'),
      start: '09:00',
      end: '10:00',
      reason: '',
    };
  });

  useEffect(() => {
    if (_authReady) {
      fetchCalendarData();
    }
  }, [_authReady, currentDate]);

  useEffect(() => {
    if (
      selectedDate.getMonth() !== currentDate.getMonth() ||
      selectedDate.getFullYear() !== currentDate.getFullYear()
    ) {
      setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    }
  }, [currentDate]);

  const fetchCalendarData = async () => {

    try {
      setLoading(true);
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      const [appointmentsRes, blocksRes] = await Promise.all([
        fetch(
          `/api/calendar/appointments?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}`,
          { cache: 'no-store' }
        ),
        fetch(
          `/api/calendar/blocks?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}`,
          { cache: 'no-store' }
        ),
      ]);

      if (appointmentsRes.ok) {
        const data = await appointmentsRes.json();
        setAppointments(data.appointments || []);
      } else {
        console.error('Error fetching appointments:', appointmentsRes.status);
      }

      if (blocksRes.ok) {
        const data = await blocksRes.json();
        setBlocks(data.blocks || []);
      } else {
        console.error('Error fetching blocks:', blocksRes.status);
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Dubai' // Always show Dubai time regardless of viewer's location
    });
  };

  const getDuration = (appointment: Appointment) =>
    appointment.duration ?? appointment.duration_minutes ?? 30;

  const formatDateLabel = (date: Date) =>
    date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const toDateKey = (value: Date | string) => new Date(value).toLocaleDateString('en-CA');

  const openBlockModal = () => {
    setBlockForm({
      date: toDateKey(selectedDate),
      start: '09:00',
      end: '10:00',
      reason: '',
    });
    setBlockError('');
    setShowBlockModal(true);
  };

  const handleSaveBlock = async () => {
    setBlockError('');
    if (!blockForm.date || !blockForm.start || !blockForm.end) {
      setBlockError('Select a date, start time, and end time.');
      return;
    }
    const start = new Date(`${blockForm.date}T${blockForm.start}:00`);
    const end = new Date(`${blockForm.date}T${blockForm.end}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setBlockError('Invalid date/time.');
      return;
    }
    if (end <= start) {
      setBlockError('End time must be after start time.');
      return;
    }

    setBlockSaving(true);
    try {
      const res = await fetch('/api/calendar/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          reason: blockForm.reason?.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBlockError(data.error || 'Failed to save blocked time.');
        return;
      }

      setShowBlockModal(false);
      await fetchCalendarData();
    } catch (error) {
      console.error('Error saving block:', error);
      setBlockError('Failed to save blocked time.');
    } finally {
      setBlockSaving(false);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    try {
      const res = await fetch(`/api/calendar/blocks?id=${blockId}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('Failed to delete block');
        return;
      }
      await fetchCalendarData();
    } catch (error) {
      console.error('Error deleting block:', error);
    }
  };

  const stats = {
    total: appointments.length,
    scheduled: appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length,
    completed: appointments.filter(a => a.status === 'completed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  };

  const calendarDays = useMemo(() => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const start = new Date(startOfMonth);
    start.setDate(startOfMonth.getDate() - startOfMonth.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [currentDate]);

  const appointmentsByDate = useMemo(() => {
    return appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
      const key = toDateKey(apt.scheduled_time);
      if (!acc[key]) acc[key] = [];
      acc[key].push(apt);
      return acc;
    }, {});
  }, [appointments]);

  const blocksByDate = useMemo(() => {
    return blocks.reduce<Record<string, BlockedSlot[]>>((acc, block) => {
      const key = toDateKey(block.start_time);
      if (!acc[key]) acc[key] = [];
      acc[key].push(block);
      return acc;
    }, {});
  }, [blocks]);

  const selectedKey = toDateKey(selectedDate);
  const selectedAppointments = (appointmentsByDate[selectedKey] || []).sort(
    (a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
  );
  const selectedBlocks = (blocksByDate[selectedKey] || []).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayKey = toDateKey(new Date());
  const currentMonth = currentDate.getMonth();
  const selectedStats = {
    upcoming: selectedAppointments.filter(
      apt => apt.status === 'scheduled' || apt.status === 'confirmed'
    ).length,
    completed: selectedAppointments.filter(apt => apt.status === 'completed').length,
    cancelled: selectedAppointments.filter(apt => apt.status === 'cancelled').length,
    blocked: selectedBlocks.length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatsSkeleton count={4} />
        <ListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500">
            Track AI-booked meetings, manage availability, and block time for your team.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            All times shown in Dubai/GST (UTC+4)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openBlockModal}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Block time
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>Scheduled
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500"></span>Completed
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>Cancelled
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500"></span>No-show
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-400"></span>Blocked
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
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

            <div className="mt-4 grid grid-cols-7 text-xs text-gray-500">
              {weekdayLabels.map(label => (
                <div key={label} className="px-2 py-1 text-center font-medium">
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map(day => {
                const dayKey = toDateKey(day);
                const dayAppointments = appointmentsByDate[dayKey] || [];
                const dayBlocks = blocksByDate[dayKey] || [];
                const isCurrentMonth = day.getMonth() === currentMonth;
                const isSelected = dayKey === selectedKey;
                const isToday = dayKey === todayKey;
                const upcomingCount = dayAppointments.filter(
                  apt => apt.status === 'scheduled' || apt.status === 'confirmed'
                ).length;
                const completedCount = dayAppointments.filter(apt => apt.status === 'completed').length;
                const cancelledCount = dayAppointments.filter(apt => apt.status === 'cancelled').length;
                const noShowCount = dayAppointments.filter(apt => apt.status === 'no-show').length;

                return (
                  <button
                    key={dayKey}
                    onClick={() => setSelectedDate(day)}
                    className={`rounded-lg border p-2 text-left transition ${
                      isSelected ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-200'
                    } ${isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'} hover:border-blue-300`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-semibold ${
                          isToday ? 'text-blue-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayBlocks.length > 0 && <Ban className="h-3.5 w-3.5 text-gray-400" />}
                    </div>

                    <div className="mt-2 space-y-1 text-[11px]">
                      {upcomingCount > 0 && (
                        <div className="text-blue-600">{upcomingCount} upcoming</div>
                      )}
                      {completedCount > 0 && (
                        <div className="text-green-600">{completedCount} completed</div>
                      )}
                      {cancelledCount > 0 && (
                        <div className="text-red-600">{cancelledCount} cancelled</div>
                      )}
                      {noShowCount > 0 && (
                        <div className="text-yellow-600">{noShowCount} no-show</div>
                      )}
                      {dayAppointments.length === 0 && dayBlocks.length > 0 && (
                        <div className="text-gray-500">Blocked</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{formatDateLabel(selectedDate)}</h3>
              <p className="text-sm text-gray-500">
                {selectedStats.upcoming} upcoming · {selectedStats.completed} completed · {selectedStats.cancelled}{' '}
                cancelled · {selectedStats.blocked} blocked
              </p>
            </div>
            <button
              onClick={openBlockModal}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Ban className="h-3.5 w-3.5" />
              Block time
            </button>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Appointments</h4>
            {selectedAppointments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No appointments booked for this day yet.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedAppointments.map(apt => {
                  const statusStyle = STATUS_STYLES[apt.status] || STATUS_STYLES.scheduled;
                  const StatusIcon = statusStyle.icon;
                  const contactName =
                    apt.contacts?.name || apt.customer_name || apt.customer_phone || 'Unknown Contact';
                  const contactMeta = apt.contacts?.whatsapp_number || apt.customer_phone || '';
                  return (
                    <div key={apt.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                            {formatTime(apt.scheduled_time)} · {getDuration(apt)} min
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              {contactName}
                            </p>
                            {contactMeta && (
                              <p className="text-xs text-gray-500">{contactMeta}</p>
                            )}
                            {apt.customer_email && (
                              <p className="text-xs text-gray-400">{apt.customer_email}</p>
                            )}
                            {apt.booked_via && (
                              <p className="text-[11px] text-gray-400">Booked via {apt.booked_via}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {apt.meeting_link && (
                            <a
                              href={apt.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Join
                            </a>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {apt.status}
                          </span>
                        </div>
                      </div>
                      {apt.notes && (
                        <p className="mt-2 text-xs text-gray-500">Notes: {apt.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Blocked times</h4>
            {selectedBlocks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No blocked time ranges for this day.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedBlocks.map(block => (
                  <div key={block.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatTime(block.start_time)} - {formatTime(block.end_time)}
                      </p>
                      {block.reason && <p className="text-xs text-gray-500">{block.reason}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteBlock(block.id)}
                      className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      aria-label="Delete blocked time"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Block time</h3>
              <button
                onClick={() => setShowBlockModal(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Date
                <input
                  type="date"
                  value={blockForm.date}
                  onChange={event => setBlockForm(prev => ({ ...prev, date: event.target.value }))}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  Start
                  <input
                    type="time"
                    value={blockForm.start}
                    onChange={event => setBlockForm(prev => ({ ...prev, start: event.target.value }))}
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  End
                  <input
                    type="time"
                    value={blockForm.end}
                    onChange={event => setBlockForm(prev => ({ ...prev, end: event.target.value }))}
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Reason (optional)
                <input
                  type="text"
                  value={blockForm.reason}
                  onChange={event => setBlockForm(prev => ({ ...prev, reason: event.target.value }))}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Holiday, internal meeting, admin work"
                />
              </label>

              {blockError && <p className="text-sm text-red-600">{blockError}</p>}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowBlockModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBlock}
                disabled={blockSaving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {blockSaving ? 'Saving...' : 'Save block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
