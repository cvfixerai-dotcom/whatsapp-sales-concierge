// @ts-nocheck
'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase-browser';
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
  Bell,
  MessageSquare,
  Mail,
  Phone,
  Send,
  Users,
  Bot,
  Sparkles,
  Clock,
  Briefcase,
  HelpCircle,
  Plus,
  ChevronDown,
} from 'lucide-react';

interface TenantSettings {
  calendar_provider: string | null;
  availability_settings: any | null;
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
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [handoffSettings, setHandoffSettings] = useState<HandoffSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'handoff' | 'ai' | 'templates' | 'team' | 'integrations' | 'business'>('ai');

  // Business settings state
  const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>({});
  const [businessTimezone, setBusinessTimezone] = useState('Asia/Dubai');
  const [services, setServices] = useState<Array<{ name: string; description: string; duration_minutes: number; price?: string }>>([]);
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>([]);
  const [savingBusiness, setSavingBusiness] = useState(false);

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

  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const DEFAULT_HOURS = { open: '09:00', close: '18:00', closed: false };

  useEffect(() => {
    if (_authReady) {
      fetchSettings();
      fetchHandoffSettings();
      fetchAiConfig();
      fetchTemplates();
      fetchTeam();
      fetchIntegrations();
      fetchBusinessSettings();
    }
  }, [_authReady]);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings/calendar');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
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

  async function fetchBusinessSettings() {
    try {
      const res = await fetch('/api/settings/business');
      if (!res.ok) return;
      const data = await res.json();
      const hours: Record<string, { open: string; close: string; closed: boolean }> = {};
      for (const day of DAYS) {
        hours[day] = data.business_hours?.[day] ?? { ...DEFAULT_HOURS };
      }
      if (data.business_hours?.timezone) setBusinessTimezone(data.business_hours.timezone);
      setBusinessHours(hours);
      setServices(Array.isArray(data.services) ? data.services : []);
      setFaqs(Array.isArray(data.faqs) ? data.faqs : []);
    } catch (e) { console.error('Error fetching business settings:', e); }
  }

  async function handleSaveBusinessSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingBusiness(true); setMessage(null);
    try {
      const res = await fetch('/api/settings/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_hours: { ...businessHours, timezone: businessTimezone },
          services,
          faqs,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'Business settings saved successfully!' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to save business settings' });
    } finally { setSavingBusiness(false); }
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
            <button
              onClick={() => setActiveTab('business')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'business'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Briefcase className="inline h-4 w-4 mr-2" />
              Business
            </button>
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

        {/* Business Settings Section */}
        {activeTab === 'business' && (
          <form onSubmit={handleSaveBusinessSettings}>
            <div className="space-y-6">

              {/* Business Hours */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    Business Hours
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">Set your weekly schedule so the AI knows when you&apos;re open</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                    <select value={businessTimezone} onChange={e => setBusinessTimezone(e.target.value)}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                      {['UTC','America/New_York','America/Chicago','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Dubai','Asia/Singapore','Asia/Tokyo','Australia/Sydney'].map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {DAYS.map(day => {
                      const h = businessHours[day] ?? { open: '09:00', close: '18:00', closed: false };
                      return (
                        <div key={day} className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                          <span className="w-24 text-sm font-medium text-gray-700 capitalize">{day}</span>
                          <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input type="checkbox" checked={!h.closed}
                              onChange={e => setBusinessHours(prev => ({ ...prev, [day]: { ...h, closed: !e.target.checked } }))}
                              className="h-4 w-4 text-blue-600 rounded" />
                            Open
                          </label>
                          {!h.closed && (
                            <>
                              <input type="time" value={h.open}
                                onChange={e => setBusinessHours(prev => ({ ...prev, [day]: { ...h, open: e.target.value } }))}
                                className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white" />
                              <span className="text-gray-400 text-sm">to</span>
                              <input type="time" value={h.close}
                                onChange={e => setBusinessHours(prev => ({ ...prev, [day]: { ...h, close: e.target.value } }))}
                                className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white" />
                            </>
                          )}
                          {h.closed && <span className="text-sm text-gray-400 italic">Closed</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Services */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-emerald-600" />
                    Services
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">Services the AI can present and book for customers</p>
                </div>
                <div className="p-6 space-y-4">
                  {(services ?? []).map((svc, i) => (
                    <div key={i} className="p-4 border border-gray-200 rounded-lg space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Service {i + 1}</span>
                        <button type="button" onClick={() => setServices(services.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                          <input type="text" value={svc.name} required
                            onChange={e => { const u = [...services]; u[i] = { ...u[i], name: e.target.value }; setServices(u); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Duration (minutes)</label>
                          <input type="number" min="5" step="5" value={svc.duration_minutes}
                            onChange={e => { const u = [...services]; u[i] = { ...u[i], duration_minutes: parseInt(e.target.value) || 60 }; setServices(u); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                          <input type="text" value={svc.description}
                            onChange={e => { const u = [...services]; u[i] = { ...u[i], description: e.target.value }; setServices(u); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Price (optional)</label>
                          <input type="text" value={svc.price ?? ''} placeholder="e.g. $99 or Free"
                            onChange={e => { const u = [...services]; u[i] = { ...u[i], price: e.target.value }; setServices(u); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setServices([...services, { name: '', description: '', duration_minutes: 60, price: '' }])}
                    className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-800 font-medium">
                    <Plus className="h-4 w-4" /> Add Service
                  </button>
                </div>
              </div>

              {/* FAQs */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-purple-600" />
                    FAQs
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">Common questions the AI will answer automatically</p>
                </div>
                <div className="p-6 space-y-4">
                  {(faqs ?? []).map((faq, i) => (
                    <div key={i} className="p-4 border border-gray-200 rounded-lg space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">FAQ {i + 1}</span>
                        <button type="button" onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Question *</label>
                          <input type="text" value={faq.question} required
                            onChange={e => { const u = [...faqs]; u[i] = { ...u[i], question: e.target.value }; setFaqs(u); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Answer *</label>
                          <textarea value={faq.answer} required rows={2}
                            onChange={e => { const u = [...faqs]; u[i] = { ...u[i], answer: e.target.value }; setFaqs(u); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}
                    className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 font-medium">
                    <Plus className="h-4 w-4" /> Add FAQ
                  </button>
                </div>
              </div>

              {/* Save */}
              <div className="pb-6">
                <button type="submit" disabled={savingBusiness}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {savingBusiness ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Business Settings
                </button>
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
            uid={undefined}
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
