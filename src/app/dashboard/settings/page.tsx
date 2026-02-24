// @ts-nocheck
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { SkeletonPulse } from '@/components/skeletons';
import { useRouter, useSearchParams } from 'next/navigation';
import TeamSection from '@/components/TeamSection';
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
  Activity,
  Users,
  TrendingUp,
  UserPlus,
  CreditCard,
  LogOut,
  Bot,
  Sparkles,
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
  const [activeTab, setActiveTab] = useState<'calendar' | 'handoff' | 'ai' | 'templates' | 'team' | 'integrations'>('ai');

  // Integrations state
  const [crmWebhookUrl, setCrmWebhookUrl] = useState('');
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  
  // AI config state
  const [savingAi, setSavingAi] = useState(false);
  const [aiPersonality, setAiPersonality] = useState('professional');
  const [aiLanguage, setAiLanguage] = useState('en');
  const [aiGreeting, setAiGreeting] = useState('');
  const [aiFallback, setAiFallback] = useState('');
  const [qualificationQuestions, setQualificationQuestions] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [industry, setIndustry] = useState('other');

  // Team state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [inviting, setInviting] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  // Templates state
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [templates, setTemplates] = useState({
    appointment_reminder: '',
    follow_up: '',
    welcome: '',
  });

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
      fetchAiConfig();
      fetchTemplates();
      fetchTeam();
      fetchIntegrations();
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

  async function fetchAiConfig() {
    try {
      const response = await fetch('/api/settings/ai-config');
      if (!response.ok) throw new Error('Failed to fetch AI config');
      const data = await response.json();
      setAiPersonality(data.ai_personality || 'professional');
      setAiLanguage(data.ai_language || 'en');
      setAiGreeting(data.ai_greeting || '');
      setAiFallback(data.ai_fallback_message || '');
      setQualificationQuestions(data.qualification_questions || []);
      setCompanyName(data.company_name || '');
      setCustomSystemPrompt(data.custom_system_prompt || '');
      setIndustry(data.industry || 'other');
    } catch (error) {
      console.error('Error fetching AI config:', error);
    }
  }

  async function handleSaveAiConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingAi(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_personality: aiPersonality,
          ai_language: aiLanguage,
          ai_greeting: aiGreeting,
          ai_fallback_message: aiFallback,
          qualification_questions: qualificationQuestions,
          custom_system_prompt: customSystemPrompt,
        }),
      });
      if (!response.ok) throw new Error('Failed to save AI config');
      setMessage({ type: 'success', text: 'AI configuration saved successfully!' });
    } catch (error) {
      console.error('Error saving AI config:', error);
      setMessage({ type: 'error', text: 'Failed to save AI configuration' });
    } finally {
      setSavingAi(false);
    }
  }

  async function fetchIntegrations() {
    try {
      const res = await fetch('/api/settings/integrations');
      if (!res.ok) return;
      const data = await res.json();
      setCrmWebhookUrl(data.crm_webhook_url || '');
    } catch (e) { console.error('Error fetching integrations:', e); }
  }

  async function handleSaveIntegrations(e: React.FormEvent) {
    e.preventDefault();
    setSavingIntegrations(true); setMessage(null);
    try {
      const res = await fetch('/api/settings/integrations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crm_webhook_url: crmWebhookUrl }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'Webhook URL saved!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to save webhook URL' });
    } finally { setSavingIntegrations(false); }
  }

  async function fetchTeam() {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) return;
      const data = await res.json();
      setTeamMembers(data.members || []);
    } catch (e) { console.error('Error fetching team:', e); }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true); setMessage(null); setTempPassword('');
    try {
      const res = await fetch('/api/team', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, full_name: inviteName, invited_role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite');
      setTempPassword(data.temp_password);
      setMessage({ type: 'success', text: `Invited ${inviteEmail} successfully!` });
      setInviteEmail(''); setInviteName('');
      fetchTeam();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally { setInviting(false); }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this team member?')) return;
    try {
      const res = await fetch('/api/team', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setMessage({ type: 'success', text: 'Member removed' });
      fetchTeam();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); }
  }

  async function fetchTemplates() {
    try {
      const response = await fetch('/api/settings/templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data.templates || {});
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }

  async function handleSaveTemplates(e: React.FormEvent) {
    e.preventDefault();
    setSavingTemplates(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });
      if (!response.ok) throw new Error('Failed to save templates');
      setMessage({ type: 'success', text: 'Templates saved successfully!' });
    } catch (error) {
      console.error('Error saving templates:', error);
      setMessage({ type: 'error', text: 'Failed to save templates' });
    } finally {
      setSavingTemplates(false);
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

  if (loading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="mb-8">
          <SkeletonPulse className="h-8 w-48 mb-2" />
          <SkeletonPulse className="h-4 w-72" />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <SkeletonPulse className="h-6 w-40 mb-4" />
          <SkeletonPulse className="h-10 w-full mb-3" />
          <SkeletonPulse className="h-10 w-full mb-3" />
          <SkeletonPulse className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
          <div className="max-w-4xl">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Settings className="h-8 w-8 text-gray-600" />
                Settings
              </h1>
              <p className="mt-2 text-gray-600">
                Configure your AI assistant, templates, and notification preferences
              </p>
            </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200 sticky top-16 z-20 bg-gray-50 -mx-6 px-6">
          <nav className="flex space-x-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'ai'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Bot className="inline h-4 w-4 mr-2" />
              AI Configuration
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'templates'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <MessageSquare className="inline h-4 w-4 mr-2" />
              Templates
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
            {(session?.user?.role === 'admin' || session?.user?.role === 'owner') && (
              <button
                onClick={() => setActiveTab('team')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'team'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users className="inline h-4 w-4 mr-2" />
                Team
              </button>
            )}
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
            <div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-gray-900">In-App Calendar Active</h3>
                    <p className="text-sm text-gray-600">
                      Your calendar is managed directly within the dashboard. Configure availability in the Calendar tab.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hidden calendar provider options */}
            <div className="hidden">
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10 text-gray-900 bg-white"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
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
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-gray-900 font-medium"
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
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Current Configuration</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Active Provider:</span>
              <span className="ml-2 font-medium text-gray-900">In-App Calendar</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2 font-medium text-green-600">Active
                </span>
              </div>
            </div>
          </div>
        )}
        </>
        )}

        {/* AI Configuration Section */}
        {activeTab === 'ai' && (
          <form onSubmit={handleSaveAiConfig}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-purple-600" />
                  AI Configuration
                </h2>
                <p className="text-sm text-gray-600 mt-1">Customize your AI assistant&apos;s personality and behavior</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">AI Personality</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { value: 'professional', label: 'Professional', desc: 'Formal and business-like' },
                      { value: 'friendly', label: 'Friendly', desc: 'Warm and approachable' },
                      { value: 'casual', label: 'Casual', desc: 'Relaxed and conversational' },
                    ].map((o) => (
                      <button key={o.value} type="button" onClick={() => setAiPersonality(o.value)}
                        className={`p-4 border-2 rounded-lg text-left transition-colors ${aiPersonality === o.value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="font-medium text-gray-900">{o.label}</div>
                        <div className="text-xs text-gray-500">{o.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Language</label>
                  <select value={aiLanguage} onChange={(e) => setAiLanguage(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="pt">Portuguese</option>
                    <option value="ar">Arabic</option>
                    <option value="zh">Chinese</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Greeting</label>
                  <textarea value={aiGreeting} onChange={(e) => setAiGreeting(e.target.value)} rows={3}
                    placeholder={`Hi! Welcome to ${companyName || 'our company'}. How can I help you today?`}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white" />
                  <p className="mt-1 text-xs text-gray-500">First message new contacts receive</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Message</label>
                  <textarea value={aiFallback} onChange={(e) => setAiFallback(e.target.value)} rows={2}
                    placeholder="I'm not sure I understand. Could you rephrase that?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white" />
                  <p className="mt-1 text-xs text-gray-500">Used when the AI cannot understand a request</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qualification Questions</label>
                  <p className="text-xs text-gray-500 mb-3">Questions the AI asks to qualify leads</p>
                  <div className="space-y-2">
                    {qualificationQuestions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-6">{i + 1}.</span>
                        <input type="text" value={q} onChange={(e) => { const u = [...qualificationQuestions]; u[i] = e.target.value; setQualificationQuestions(u); }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white" />
                        <button type="button" onClick={() => setQualificationQuestions(qualificationQuestions.filter((_, idx) => idx !== i))}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setQualificationQuestions([...qualificationQuestions, ''])}
                      className="text-sm text-purple-600 hover:text-purple-800 font-medium">+ Add question</button>
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom AI Instructions</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Optional: Add specific instructions for how the AI should sell your product/service.
                    This overrides the default industry prompt. Describe your offering, pricing, unique selling points, and how to handle common objections.
                  </p>
                  <textarea
                    value={customSystemPrompt}
                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                    rows={6}
                    placeholder={`Example: We are a premium real estate agency specializing in luxury villas in Dubai Marina. Our price range is AED 2M-15M. Always mention our free property tour service. When customers ask about pricing, offer to schedule a private viewing first. Our key differentiator is our 10-year market expertise and exclusive off-plan deals.`}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 bg-white font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Industry: <span className="font-medium capitalize">{industry?.replace('-', ' ') || 'other'}</span> — The AI automatically adapts its sales approach to your industry.
                  </p>
                </div>
                <div className="pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />Preview
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-start">
                      <div className="max-w-xs px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-900">
                        {aiGreeting || `Hi! Welcome to ${companyName || 'our company'}. How can I help you today?`}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 text-center">
                      Tone: <span className="font-medium capitalize">{aiPersonality}</span> &middot; Language: <span className="font-medium uppercase">{aiLanguage}</span>
                    </div>
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-200">
                  <button type="submit" disabled={savingAi}
                    className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                    {savingAi ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save AI Configuration
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Templates Section */}
        {activeTab === 'templates' && (
          <form onSubmit={handleSaveTemplates}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                  WhatsApp Template Messages
                </h2>
                <p className="text-sm text-gray-600 mt-1">Configure pre-approved message templates for proactive outreach</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> WhatsApp requires template messages to be pre-approved in your Twilio console.
                    Configure your templates here for internal use by the AI and automation workers.
                    Use <code className="bg-blue-100 px-1 rounded">{'{{variable}}'}</code> for dynamic values.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Reminder</label>
                  <textarea value={templates.appointment_reminder || ''} onChange={(e) => setTemplates({ ...templates, appointment_reminder: e.target.value })} rows={3}
                    placeholder="Hi {{contact_name}}, reminder about your appointment on {{appointment_time}}. Reply YES to confirm."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900 bg-white" />
                  <p className="mt-1 text-xs text-gray-500">Variables: {'{{contact_name}}, {{appointment_time}}, {{company_name}}'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Follow-Up Message</label>
                  <textarea value={templates.follow_up || ''} onChange={(e) => setTemplates({ ...templates, follow_up: e.target.value })} rows={3}
                    placeholder="Hi {{contact_name}}, just checking in! We spoke about {{topic}}. Any questions?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900 bg-white" />
                  <p className="mt-1 text-xs text-gray-500">Variables: {'{{contact_name}}, {{topic}}, {{company_name}}'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Message</label>
                  <textarea value={templates.welcome || ''} onChange={(e) => setTemplates({ ...templates, welcome: e.target.value })} rows={3}
                    placeholder="Welcome to {{company_name}}! We're excited to help you. How can we assist you today?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900 bg-white" />
                  <p className="mt-1 text-xs text-gray-500">Variables: {'{{contact_name}}, {{company_name}}'}</p>
                </div>
                <div className="pt-6 border-t border-gray-200">
                  <button type="submit" disabled={savingTemplates}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {savingTemplates ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Templates
                  </button>
                </div>
              </div>
            </div>
          </form>
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
                          className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                          className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Escalate to
                        </label>
                        <select
                          value={escalationChannel}
                          onChange={(e) => setEscalationChannel(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
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

        {/* Integrations Section */}
        {activeTab === 'integrations' && (
          <form onSubmit={handleSaveIntegrations}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ExternalLink className="h-5 w-5 text-indigo-600" />
                  CRM / Zapier Integration
                </h2>
                <p className="text-sm text-gray-600 mt-1">Connect your CRM via webhook to sync leads and events automatically</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">Paste a Zapier or Make webhook URL below. We will POST a JSON payload whenever a lead is created, temperature changes, an appointment is booked, or a handoff is triggered.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                  <input type="url" value={crmWebhookUrl} onChange={e => setCrmWebhookUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/..." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white" />
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Event types sent:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li><code className="bg-gray-200 px-1 rounded">lead.created</code> — New contact from WhatsApp</li>
                    <li><code className="bg-gray-200 px-1 rounded">lead.temperature_changed</code> — Lead score updated</li>
                    <li><code className="bg-gray-200 px-1 rounded">appointment.booked</code> — Appointment confirmed</li>
                    <li><code className="bg-gray-200 px-1 rounded">handoff.triggered</code> — Human handoff requested</li>
                  </ul>
                </div>
                <div className="pt-6 border-t border-gray-200">
                  <button type="submit" disabled={savingIntegrations} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {savingIntegrations ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Webhook URL
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'team' && (
          <TeamSection
            members={teamMembers}
            uid={session?.user?.id}
            onRemove={handleRemoveMember}
            tempPw={tempPassword}
            email={inviteEmail}
            setEmail={setInviteEmail}
            name={inviteName}
            setName={setInviteName}
            role={inviteRole}
            setRole={setInviteRole}
            busy={inviting}
            onInvite={handleInvite}
          />
        )}
          </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
