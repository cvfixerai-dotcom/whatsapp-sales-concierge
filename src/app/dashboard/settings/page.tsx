// @ts-nocheck
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Calendar,
  Settings,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Bell,
  MessageSquare,
  Mail,
  Phone,
  Send,
} from 'lucide-react';

interface TenantSettings {
  calendar_provider: 'calendly' | 'google' | null;
  calendly_api_key: string | null;
  calendly_event_url: string | null;
  google_calendar_id: string | null;
  google_connected: boolean;
}

interface HandoffSettings {
  channels: {
    dashboard: boolean;
    email: boolean;
    whatsapp: boolean;
    telegram: boolean;
  };
  recipients: {
    email: string | null;
    whatsapp: string | null;
    telegram_chat_id: string | null;
  };
  escalation: {
    enabled: boolean;
    timeout_minutes: number;
    escalation_channel: 'email' | 'whatsapp' | 'telegram';
  };
}

function SettingsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [handoffSettings, setHandoffSettings] = useState<HandoffSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'handoff'>('calendar');
  
  // Calendar form state
  const [calendarProvider, setCalendarProvider] = useState<'calendly' | 'google'>('calendly');
  const [calendlyApiKey, setCalendlyApiKey] = useState('');
  const [calendlyEventUrl, setCalendlyEventUrl] = useState('');
  
  // Handoff form state
  const [handoffChannels, setHandoffChannels] = useState({
    dashboard: true,
    email: true,
    whatsapp: false,
    telegram: false,
  });
  const [handoffRecipients, setHandoffRecipients] = useState({
    email: '',
    whatsapp: '',
    telegram_chat_id: '',
  });
  const [escalationEnabled, setEscalationEnabled] = useState(false);
  const [escalationTimeout, setEscalationTimeout] = useState(5);
  const [escalationChannel, setEscalationChannel] = useState<'email' | 'whatsapp' | 'telegram'>('email');

  useEffect(() => {
    // Check for OAuth callback messages
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    
    if (success === 'google_calendar_connected') {
      setMessage({ type: 'success', text: 'Google Calendar connected successfully!' });
    } else if (error) {
      const errorMessages: Record<string, string> = {
        google_oauth_denied: 'Google Calendar authorization was denied',
        missing_params: 'Missing OAuth parameters',
        invalid_state: 'Invalid OAuth state',
        token_exchange_failed: 'Failed to exchange OAuth token',
        no_refresh_token: 'No refresh token received. Please try again.',
        save_failed: 'Failed to save calendar settings',
        unexpected_error: 'An unexpected error occurred',
      };
      setMessage({ type: 'error', text: errorMessages[error] || 'An error occurred' });
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.tenantId) {
      fetchSettings();
      fetchHandoffSettings();
    }
  }, [status, session]);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings/calendar');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
      setCalendarProvider(data.calendar_provider || 'calendly');
      setCalendlyApiKey(data.calendly_api_key || '');
      setCalendlyEventUrl(data.calendly_event_url || '');
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }

  async function fetchHandoffSettings() {
    try {
      const response = await fetch('/api/settings/handoff');
      if (!response.ok) throw new Error('Failed to fetch handoff settings');
      const data = await response.json();
      setHandoffSettings(data);
      setHandoffChannels(data.channels || { dashboard: true, email: true, whatsapp: false, telegram: false });
      setHandoffRecipients({
        email: data.recipients?.email || '',
        whatsapp: data.recipients?.whatsapp || '',
        telegram_chat_id: data.recipients?.telegram_chat_id || '',
      });
      setEscalationEnabled(data.escalation?.enabled || false);
      setEscalationTimeout(data.escalation?.timeout_minutes || 5);
      setEscalationChannel(data.escalation?.escalation_channel || 'email');
    } catch (error) {
      console.error('Error fetching handoff settings:', error);
    }
  }

  async function handleSaveCalendly(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendar_provider: 'calendly',
          calendly_api_key: calendlyApiKey,
          calendly_event_url: calendlyEventUrl,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save settings');
      
      setMessage({ type: 'success', text: 'Calendly settings saved successfully!' });
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectGoogle() {
    // Redirect to Google OAuth flow
    window.location.href = '/api/auth/google-calendar';
  }

  async function handleDisconnectGoogle() {
    if (!confirm('Are you sure you want to disconnect Google Calendar?')) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/settings/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendar_provider: null,
          google_calendar_id: null,
          google_refresh_token: null,
        }),
      });
      
      if (!response.ok) throw new Error('Failed to disconnect');
      
      setMessage({ type: 'success', text: 'Google Calendar disconnected' });
      fetchSettings();
    } catch (error) {
      console.error('Error disconnecting:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect Google Calendar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveHandoffSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingHandoff(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: handoffChannels,
          recipients: handoffRecipients,
          escalation: {
            enabled: escalationEnabled,
            timeout_minutes: escalationTimeout,
            escalation_channel: escalationChannel,
          },
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save handoff settings');
      
      setMessage({ type: 'success', text: 'Handoff settings saved successfully!' });
      fetchHandoffSettings();
    } catch (error) {
      console.error('Error saving handoff settings:', error);
      setMessage({ type: 'error', text: 'Failed to save handoff settings' });
    } finally {
      setSavingHandoff(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="h-8 w-8 text-gray-600" />
            Settings
          </h1>
          <p className="mt-2 text-gray-600">
            Configure your calendar integration and handoff notifications
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'calendar'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Calendar className="inline h-4 w-4 mr-2" />
              Calendar Integration
            </button>
            <button
              onClick={() => setActiveTab('handoff')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'handoff'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Bell className="inline h-4 w-4 mr-2" />
              Handoff Notifications
            </button>
          </nav>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Calendar Integration Section */}
        {activeTab === 'calendar' && (
        <>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Calendar Integration
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Connect your calendar to allow the AI to check availability and book appointments
            </p>
          </div>

          <div className="p-6">
            {/* Provider Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Choose your calendar provider
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Calendly Option */}
                <button
                  type="button"
                  onClick={() => setCalendarProvider('calendly')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    calendarProvider === 'calendly'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📅</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Calendly</h3>
                      <p className="text-sm text-gray-500">Use your Calendly account</p>
                    </div>
                  </div>
                  {calendarProvider === 'calendly' && (
                    <CheckCircle className="absolute top-3 right-3 h-5 w-5 text-blue-600" />
                  )}
                </button>

                {/* Google Calendar Option */}
                <button
                  type="button"
                  onClick={() => setCalendarProvider('google')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    calendarProvider === 'google'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📆</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Google Calendar</h3>
                      <p className="text-sm text-gray-500">Use Google Workspace</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Calendly Configuration */}
            {calendarProvider === 'calendly' && (
              <form onSubmit={handleSaveCalendly} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calendly API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={calendlyApiKey}
                      onChange={(e) => setCalendlyApiKey(e.target.value)}
                      placeholder="Enter your Calendly API key"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Get your API key from{' '}
                    <a
                      href="https://calendly.com/integrations/api_webhooks"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Calendly Integrations
                      <ExternalLink className="inline h-3 w-3 ml-1" />
                    </a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calendly Event Type URL
                  </label>
                  <input
                    type="text"
                    value={calendlyEventUrl}
                    onChange={(e) => setCalendlyEventUrl(e.target.value)}
                    placeholder="e.g., https://calendly.com/your-name/30min"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The URL of the event type you want to use for bookings
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={saving || !calendlyApiKey || !calendlyEventUrl}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Calendly Settings
                </button>
              </form>
            )}

            {/* Google Calendar Configuration */}
            {calendarProvider === 'google' && (
              <div className="space-y-4">
                {settings?.google_connected ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                        <div>
                          <h4 className="font-medium text-green-800">Google Calendar Connected</h4>
                          <p className="text-sm text-green-600">
                            Calendar ID: {settings.google_calendar_id}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleDisconnectGoogle}
                        disabled={saving}
                        className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="h-8 w-8 text-gray-400" />
                    </div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      Connect Google Calendar
                    </h4>
                    <p className="text-gray-600 mb-6 max-w-md mx-auto">
                      Connect your Google Workspace calendar to allow the AI to check your
                      availability and book appointments with Google Meet links.
                    </p>
                    <button
                      onClick={handleConnectGoogle}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Connect with Google
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Current Status */}
        {settings && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Current Configuration</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Active Provider:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {settings.calendar_provider === 'google'
                    ? 'Google Calendar'
                    : settings.calendar_provider === 'calendly'
                    ? 'Calendly'
                    : 'Not configured'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>
                <span
                  className={`ml-2 font-medium ${
                    settings.calendar_provider ? 'text-green-600' : 'text-yellow-600'
                  }`}
                >
                  {settings.calendar_provider ? 'Connected' : 'Not connected'}
                </span>
              </div>
            </div>
          </div>
        )}
        </>
        )}

        {/* Handoff Notifications Section */}
        {activeTab === 'handoff' && (
          <form onSubmit={handleSaveHandoffSettings}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-orange-600" />
                  Handoff Notifications
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Configure how you want to be notified when the AI needs human assistance
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Notification Channels */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-4">Notification Channels</h3>
                  <div className="space-y-4">
                    {/* Dashboard */}
                    <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <MessageSquare className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">Dashboard</p>
                          <p className="text-sm text-gray-500">Real-time alerts in your dashboard</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={handoffChannels.dashboard}
                        onChange={(e) => setHandoffChannels({ ...handoffChannels, dashboard: e.target.checked })}
                        className="h-5 w-5 text-blue-600 rounded"
                      />
                    </label>

                    {/* Email */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <Mail className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Email</p>
                            <p className="text-sm text-gray-500">Detailed notification with conversation summary</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={handoffChannels.email}
                          onChange={(e) => setHandoffChannels({ ...handoffChannels, email: e.target.checked })}
                          className="h-5 w-5 text-blue-600 rounded"
                        />
                      </label>
                      {handoffChannels.email && (
                        <input
                          type="email"
                          value={handoffRecipients.email}
                          onChange={(e) => setHandoffRecipients({ ...handoffRecipients, email: e.target.value })}
                          placeholder="Enter email address"
                          className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>

                    {/* WhatsApp */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <Phone className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">WhatsApp</p>
                            <p className="text-sm text-gray-500">Instant notification to your WhatsApp</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={handoffChannels.whatsapp}
                          onChange={(e) => setHandoffChannels({ ...handoffChannels, whatsapp: e.target.checked })}
                          className="h-5 w-5 text-blue-600 rounded"
                        />
                      </label>
                      {handoffChannels.whatsapp && (
                        <input
                          type="tel"
                          value={handoffRecipients.whatsapp}
                          onChange={(e) => setHandoffRecipients({ ...handoffRecipients, whatsapp: e.target.value })}
                          placeholder="+1234567890 (with country code)"
                          className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>

                    {/* Telegram */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
                            <Send className="h-5 w-5 text-sky-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Telegram</p>
                            <p className="text-sm text-gray-500">Notifications via Telegram bot</p>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={handoffChannels.telegram}
                          onChange={(e) => setHandoffChannels({ ...handoffChannels, telegram: e.target.checked })}
                          className="h-5 w-5 text-blue-600 rounded"
                        />
                      </label>
                      {handoffChannels.telegram && (
                        <div className="mt-3">
                          <input
                            type="text"
                            value={handoffRecipients.telegram_chat_id}
                            onChange={(e) => setHandoffRecipients({ ...handoffRecipients, telegram_chat_id: e.target.value })}
                            placeholder="Telegram Chat ID"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Start a chat with our bot and send /start to get your Chat ID
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Escalation Settings */}
                <div className="pt-6 border-t border-gray-200">
                  <label className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Escalation</h3>
                      <p className="text-sm text-gray-500">Auto-escalate if no response within timeout</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={escalationEnabled}
                      onChange={(e) => setEscalationEnabled(e.target.checked)}
                      className="h-5 w-5 text-blue-600 rounded"
                    />
                  </label>

                  {escalationEnabled && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Timeout (minutes)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={escalationTimeout}
                          onChange={(e) => setEscalationTimeout(parseInt(e.target.value) || 5)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Escalate to
                        </label>
                        <select
                          value={escalationChannel}
                          onChange={(e) => setEscalationChannel(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="email">Email</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="telegram">Telegram</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="pt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={savingHandoff}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingHandoff ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Handoff Settings
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
