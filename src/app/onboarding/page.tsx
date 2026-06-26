'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Bot, Calendar, Bell, CheckCircle,
  ChevronLeft, ChevronDown, Loader2, Sparkles, Send,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-browser';

interface OnboardingData {
  setup_completed: boolean;
  current_step: number;
  progress: number;
  steps: { id: string; name: string; completed: boolean }[];
  tenant: any;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

// WhatsApp/Twilio connection is intentionally NOT one of these steps — it's
// decoupled from onboarding completion (see /dashboard/settings's WhatsApp
// tab) since the customer's own Twilio account creation/verification can
// take 24-48hrs and must not block the rest of setup.
const STEPS = [
  { id: 'business_profile', name: 'Business Profile', icon: Building2, description: 'Tell us about your business' },
  { id: 'ai_config', name: 'AI Configuration', icon: Bot, description: 'Customize your AI assistant' },
  { id: 'calendar_setup', name: 'Calendar', icon: Calendar, description: 'Connect your calendar (optional)' },
  { id: 'handoff_setup', name: 'Notifications', icon: Bell, description: 'Set up handoff alerts' },
];

// Brand colors for the dual-panel onboarding experience (live preview side).
const NAVY = '#0A1628';
const GOLD = '#C9A84C';

export default function OnboardingPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);

  const [businessProfile, setBusinessProfile] = useState({
    company_name: '', business_type: '', business_description: '',
    target_audience: '', products_services: '', timezone: 'UTC',
  });
  const [aiConfig, setAiConfig] = useState({
    ai_personality: 'professional', ai_language: 'en',
    ai_greeting: '', ai_fallback_message: '', qualification_questions: [] as string[],
  });
  const [handoffSetup, setHandoffSetup] = useState({
    channels: { dashboard: true, email: true, whatsapp: false, telegram: false },
    recipients: { email: '', whatsapp: '', telegram_chat_id: '' },
  });
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalEmail, setGcalEmail] = useState('');

  const [businessHours, setBusinessHours] = useState({
    monday:    { open: '09:00', close: '18:00', closed: false },
    tuesday:   { open: '09:00', close: '18:00', closed: false },
    wednesday: { open: '09:00', close: '18:00', closed: false },
    thursday:  { open: '09:00', close: '18:00', closed: false },
    friday:    { open: '09:00', close: '18:00', closed: false },
    saturday:  { open: '09:00', close: '18:00', closed: false },
    sunday:    { open: '09:00', close: '18:00', closed: true },
  });

  // ── Dual-panel Onboarding Agent state ──────────────────────────────────
  // livePreviewTenant mirrors the tenants row for the left-hand live preview.
  // It's seeded from /api/onboarding's GET and then kept fresh via Supabase
  // Realtime (tenants RLS already scopes subscriptions to the caller's own
  // tenant — see "Tenant access" policy in schema.sql — so no new policy
  // is needed for this subscription).
  const [livePreviewTenant, setLivePreviewTenant] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: "Hi! I'm Maya's setup assistant 👋 Let's get your AI sales assistant configured. To start — what's your business called, and what does it do?" },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatDone, setChatDone] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Step 1: verify Supabase session
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  // Step 2: fetch onboarding data only after auth is confirmed
  useEffect(() => {
    if (!authChecked) return;
    fetchOnboardingStatus();
  }, [authChecked]);

  // Step 3: subscribe to live tenant changes for the left preview panel.
  useEffect(() => {
    if (!authChecked) return;
    const channel = supabase
      .channel('onboarding-tenant-preview')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenants' }, (payload) => {
        setLivePreviewTenant((prev: any) => ({ ...(prev || {}), ...(payload.new || {}) }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authChecked]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  async function fetchOnboardingStatus() {
    try {
      const response = await fetch('/api/onboarding');
      if (response.status === 401) { router.replace('/auth/login'); return; }
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setOnboardingData(data);
      setCurrentStep(data.current_step || 0);

      if (data.tenant) {
        setBusinessProfile({
          company_name: data.tenant.company_name || '',
          business_type: data.tenant.business_type || '',
          business_description: data.tenant.business_description || '',
          target_audience: data.tenant.target_audience || '',
          products_services: data.tenant.products_services || '',
          timezone: data.tenant.timezone || 'UTC',
        });
        setAiConfig({
          ai_personality: data.tenant.ai_personality || 'professional',
          ai_language: data.tenant.ai_language || 'en',
          ai_greeting: data.tenant.ai_greeting || '',
          ai_fallback_message: data.tenant.ai_fallback_message || '',
          qualification_questions: data.tenant.qualification_questions || [],
        });
        if (data.tenant.google_calendar_connected) {
          setGcalConnected(true);
          setGcalEmail(data.tenant.google_calendar_id || '');
        }
        if (data.tenant.handoff_settings) {
          setHandoffSetup({
            channels: data.tenant.handoff_settings.channels || { dashboard: true, email: true, whatsapp: false, telegram: false },
            recipients: data.tenant.handoff_settings.recipients || { email: '', whatsapp: '', telegram_chat_id: '' },
          });
        }
        setLivePreviewTenant((prev: any) => ({ ...(prev || {}), ...data.tenant }));
      }

      // Only redirect to dashboard if setup is completed
      if (data.setup_completed) {
        router.replace('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching onboarding:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  }

  // Bumps the wizard's onboarding_step on the server (same column /api/onboarding
  // already tracks) without touching any other field, then advances locally.
  // This is how the Onboarding Agent "drives" the wizard instead of the user
  // clicking Continue — triggered from sendChatMessage() based on which tool
  // the agent just called.
  async function advanceStepProgrammatically(nextStep: number) {
    setCurrentStep(nextStep);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: nextStep, data: {}, action: 'update_step' }),
      });
    } catch (err) {
      console.error('Failed to sync auto-advanced step:', err);
    }
  }

  async function sendChatMessage(text: string) {
    if (!text.trim() || chatSending || chatDone) return;
    const nextMessages: ChatMsg[] = [...chatMessages, { role: 'user', content: text.trim() }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatSending(true);

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();

      if (!res.ok) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong on my end — could you try that again?" }]);
        return;
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message || '...' }]);

      const calledTools: string[] = (data.toolCalls || []).map((t: any) => t.name);

      // Re-sync the live preview + local mirrors so anything the agent just
      // wrote via Supabase shows up immediately, even ahead of the Realtime push.
      if (calledTools.length > 0) {
        fetchOnboardingStatus();
      }

      // Agent-driven step progression — see advanceStepProgrammatically() above.
      // Indices: 0 business_profile, 1 ai_config, 2 calendar_setup, 3 handoff_setup.
      if (currentStep === 0 && calledTools.includes('update_business_profile')) {
        advanceStepProgrammatically(1);
      } else if (currentStep === 1 && calledTools.includes('update_ai_preferences')) {
        advanceStepProgrammatically(2);
      } else if (currentStep === 2 && calledTools.includes('set_business_hours')) {
        advanceStepProgrammatically(3);
      }

      if (data.setup_completed) {
        setChatDone(true);
        setTimeout(() => router.push('/dashboard'), 1800);
      }
    } catch (error) {
      console.error('Onboarding chat error:', error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong on my end — could you try that again?" }]);
    } finally {
      setChatSending(false);
    }
  }

  // Show spinner while checking auth or loading data
  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to WhatsApp Sales Concierge
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Let's set up your AI assistant</h1>
          <p className="text-gray-600 mt-2">Complete these steps to start automating your sales conversations</p>
          <p className="text-sm text-gray-500 mt-1">You'll connect your WhatsApp number afterward, from Settings — no need to have it ready now.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-between mb-8">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            return (
              <div key={step.id} className="flex flex-col items-center flex-1">
                <div className="flex items-center w-full">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isCompleted ? 'bg-green-500 text-white' : isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isCompleted ? <CheckCircle className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
                <span className={`text-xs mt-2 text-center ${isCurrent ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                  {step.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step Content — every step is dual-panel: live preview (left) +
            Onboarding Agent chat (right). Twilio/WhatsApp connection lives
            in Settings post-onboarding, not here. */}
        <div className="rounded-2xl shadow-xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[640px]">
            <BusinessPreviewPanel tenant={livePreviewTenant} />
            <OnboardingChatPanel
              messages={chatMessages}
              input={chatInput}
              onInputChange={setChatInput}
              sending={chatSending}
              done={chatDone}
              onSend={sendChatMessage}
              scrollRef={chatScrollRef}
            />
          </div>

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t px-8 pb-8">
            <button onClick={handleBack} disabled={currentStep === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                currentStep === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <span className="text-sm text-gray-400 italic self-center">Maya will move you to the next step automatically</span>
          </div>
        </div>

        <div className="text-center mt-6">
          <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-500 hover:text-gray-700">
            Skip setup and go to dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Left panel — live business profile preview, populated from the tenants
// row (initial fetch + Supabase Realtime). Sections render as skeleton
// placeholders until data arrives, then animate in.
// ─────────────────────────────────────────────────────────────────────────
function BusinessPreviewPanel({ tenant }: { tenant: any }) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const t = tenant || {};

  const businessTypeLabels: Record<string, string> = {
    ecommerce: 'E-commerce / Retail', saas: 'SaaS / Software', services: 'Professional Services',
    healthcare: 'Healthcare', real_estate: 'Real Estate', automotive: 'Automotive',
    home_services: 'Home Services', mortgage: 'Mortgage / Lending', dental: 'Dental',
    recruitment: 'Recruitment / Staffing', education: 'Education', hospitality: 'Hospitality / Travel',
    finance: 'Finance / Insurance', other: 'Other',
  };

  const hasIdentity = !!(t.company_name || t.business_type || t.business_description);
  const greeting = t.ai_greeting || t.agent_config?.greeting_message;
  const qualification: string[] = t.onboarding_data?.qualification_priorities
    || (t.agent_config?.qualification_stages || []).map((s: any) => s.name || s.label).filter(Boolean);
  const hours = t.business_hours;
  const generatedPrompt = t.generated_prompt || t.agent_config?.system_prompt;

  return (
    <div className="p-8 text-white overflow-y-auto" style={{ backgroundColor: NAVY }}>
      <div className="flex items-center gap-2 mb-8">
        <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
        <span className="text-sm font-semibold tracking-wide uppercase" style={{ color: GOLD }}>Live Preview</span>
      </div>

      {/* Business Identity */}
      <PreviewSection title="Business Identity" ready={hasIdentity}>
        {hasIdentity ? (
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">{t.company_name || 'Your business'}</p>
            {t.business_type && (
              <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10" style={{ color: GOLD }}>
                {businessTypeLabels[t.business_type] || t.business_type}
              </span>
            )}
            {t.business_description && <p className="text-sm text-white/70 mt-2">{t.business_description}</p>}
            {t.products_services && <p className="text-sm text-white/60 mt-1"><span className="text-white/40">Offers: </span>{t.products_services}</p>}
            {t.target_audience && <p className="text-sm text-white/60"><span className="text-white/40">For: </span>{t.target_audience}</p>}
          </div>
        ) : null}
      </PreviewSection>

      {/* Maya's Greeting — WhatsApp bubble */}
      <PreviewSection title="Maya's Greeting" ready={!!greeting}>
        {greeting && (
          <div className="bg-[#DCF8C6] text-gray-900 rounded-lg rounded-tl-none px-4 py-3 max-w-[85%] text-sm shadow-md relative">
            {greeting}
            <span className="block text-[10px] text-gray-500 mt-1 text-right">✓✓ Maya</span>
          </div>
        )}
      </PreviewSection>

      {/* Qualification Focus */}
      <PreviewSection title="Qualification Focus" ready={qualification.length > 0}>
        {qualification.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {qualification.map((q, i) => (
              <span key={i} className="text-xs px-3 py-1.5 rounded-full border" style={{ borderColor: GOLD, color: GOLD }}>
                {q}
              </span>
            ))}
          </div>
        )}
      </PreviewSection>

      {/* Availability */}
      <PreviewSection title="Availability" ready={!!hours}>
        {hours && (
          <div className="space-y-1 text-sm text-white/70">
            {Object.entries(hours).slice(0, 7).map(([day, h]: [string, any]) => (
              <div key={day} className="flex justify-between border-b border-white/5 py-1">
                <span className="capitalize">{day}</span>
                <span>{h.closed ? 'Closed' : `${h.open} – ${h.close}`}</span>
              </div>
            ))}
          </div>
        )}
      </PreviewSection>

      {/* Collapsible Maya Prompt Preview */}
      <div className="mt-6">
        <button
          onClick={() => setPromptExpanded(!promptExpanded)}
          disabled={!generatedPrompt}
          className="flex items-center justify-between w-full text-left text-sm font-medium text-white/80 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>Maya Prompt Preview</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${promptExpanded ? 'rotate-180' : ''}`} />
        </button>
        {promptExpanded && generatedPrompt && (
          <pre className="mt-3 text-[11px] leading-relaxed text-white/60 bg-black/30 rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap">
            {generatedPrompt}
          </pre>
        )}
        {!generatedPrompt && (
          <p className="text-xs text-white/30 mt-2">Generated once setup is complete.</p>
        )}
      </div>
    </div>
  );
}

function PreviewSection({ title, ready, children }: { title: string; ready: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">{title}</h3>
      {ready ? (
        <div className="animate-[fadeIn_0.4s_ease-in-out]">{children}</div>
      ) : (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Right panel — Onboarding Agent chat. Posts the full transcript to
// /api/onboarding/chat each turn (see that route for the tool-calling logic
// that writes onto the tenants row and ultimately calls generate_maya_config).
// ─────────────────────────────────────────────────────────────────────────
function OnboardingChatPanel({
  messages, input, onInputChange, sending, done, onSend, scrollRef,
}: {
  messages: ChatMsg[];
  input: string;
  onInputChange: (v: string) => void;
  sending: boolean;
  done: boolean;
  onSend: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="flex flex-col bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[480px] max-h-[640px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Maya is typing...
            </div>
          </div>
        )}
        {done && (
          <div className="flex justify-center">
            <div className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: `${GOLD}22`, color: '#8a6d1f' }}>
              Setup complete — heading to your dashboard...
            </div>
          </div>
        )}
      </div>
      <div className="border-t p-4 flex items-center gap-2">
        <input
          type="text"
          value={input}
          disabled={sending || done}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input); } }}
          placeholder={done ? 'Setup complete' : 'Type your answer...'}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-full text-sm focus:ring-2 focus:outline-none disabled:opacity-50"
          style={{ ['--tw-ring-color' as any]: GOLD }}
        />
        <button
          onClick={() => onSend(input)}
          disabled={sending || done || !input.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-full disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: GOLD }}
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}
