// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Save,
  ChevronLeft,
  Settings,
  Calendar,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const TIMEZONES = [
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain',
  'Africa/Cairo', 'Europe/London', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Singapore',
];

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

interface DaySettings {
  enabled: boolean;
  start: string;
  end: string;
}

interface Settings {
  [key: string]: any;
  slot_duration: number;
  buffer_time: number;
  max_per_day: number;
  booking_window_days: number;
  min_notice_hours: number;
  timezone: string;
}

export default function AvailabilitySettingsPage() {
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [days, setDays] = useState<Record<string, DaySettings>>({
    monday: { enabled: true, start: '09:00', end: '17:00' },
    tuesday: { enabled: true, start: '09:00', end: '17:00' },
    wednesday: { enabled: true, start: '09:00', end: '17:00' },
    thursday: { enabled: true, start: '09:00', end: '17:00' },
    friday: { enabled: true, start: '09:00', end: '17:00' },
    saturday: { enabled: false, start: '09:00', end: '13:00' },
    sunday: { enabled: false, start: '09:00', end: '13:00' },
  });

  const [settings, setSettings] = useState({
    slot_duration: 30,
    buffer_time: 0,
    max_per_day: 20,
    booking_window_days: 30,
    min_notice_hours: 2,
    timezone: 'Asia/Dubai',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated') {
      fetchSettings();
    }
  }, [status]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/calendar/availability');
      const data = await res.json();
      if (data.settings) {
        const s = data.settings;
        const newDays: Record<string, DaySettings> = {};
        DAYS.forEach(({ key }) => {
          newDays[key] = {
            enabled: s[`${key}_enabled`] ?? true,
            start: s[`${key}_start`] || '09:00',
            end: s[`${key}_end`] || '17:00',
          };
        });
        setDays(newDays);
        setSettings({
          slot_duration: s.slot_duration ?? 30,
          buffer_time: s.buffer_time ?? 0,
          max_per_day: s.max_per_day ?? 20,
          booking_window_days: s.booking_window_days ?? 30,
          min_notice_hours: s.min_notice_hours ?? 2,
          timezone: s.timezone || 'Asia/Dubai',
        });
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload: Record<string, any> = { ...settings };
      DAYS.forEach(({ key }) => {
        payload[`${key}_enabled`] = days[key].enabled;
        payload[`${key}_start`] = days[key].start;
        payload[`${key}_end`] = days[key].end;
      });

      const res = await fetch('/api/calendar/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (key: string, field: string, value: any) => {
    setDays(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => router.push('/dashboard/calendar')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Availability Settings</h1>
            <p className="text-sm text-gray-500">Configure when customers can book appointments</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
          ) : saved ? (
            <CheckCircle className="w-4 h-4 mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {/* Weekly Schedule */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Weekly Schedule
          </h2>
          <p className="text-sm text-gray-500 mt-1">Set your working hours for each day of the week</p>
        </div>
        <div className="divide-y divide-gray-100">
          {DAYS.map(({ key, label }) => (
            <div key={key} className="px-6 py-4 flex items-center space-x-4">
              <div className="w-32">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={days[key].enabled}
                    onChange={(e) => updateDay(key, 'enabled', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className={`text-sm font-medium ${days[key].enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </label>
              </div>
              {days[key].enabled ? (
                <div className="flex items-center space-x-2">
                  <select
                    value={days[key].start}
                    onChange={(e) => updateDay(key, 'start', e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-gray-400">to</span>
                  <select
                    value={days[key].end}
                    onChange={(e) => updateDay(key, 'end', e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Appointment Settings */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-blue-600" />
            Appointment Settings
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration</label>
            <select
              value={settings.slot_duration}
              onChange={(e) => setSettings(s => ({ ...s, slot_duration: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buffer Between Appointments</label>
            <select
              value={settings.buffer_time}
              onChange={(e) => setSettings(s => ({ ...s, buffer_time: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={0}>No buffer</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Appointments Per Day</label>
            <input
              type="number"
              value={settings.max_per_day}
              onChange={(e) => setSettings(s => ({ ...s, max_per_day: parseInt(e.target.value) || 20 }))}
              min={1}
              max={50}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Booking Window</label>
            <select
              value={settings.booking_window_days}
              onChange={(e) => setSettings(s => ({ ...s, booking_window_days: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={7}>1 week ahead</option>
              <option value={14}>2 weeks ahead</option>
              <option value={30}>1 month ahead</option>
              <option value={60}>2 months ahead</option>
              <option value={90}>3 months ahead</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Notice</label>
            <select
              value={settings.min_notice_hours}
              onChange={(e) => setSettings(s => ({ ...s, min_notice_hours: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={4}>4 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings(s => ({ ...s, timezone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-blue-900">How it works</h3>
            <p className="text-sm text-blue-700 mt-1">
              The AI will automatically offer available slots from your schedule when customers ask to book appointments via WhatsApp. 
              If you have an external calendar (Calendly or Google Calendar) connected, it will be checked first. 
              Otherwise, slots are generated from these availability settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
