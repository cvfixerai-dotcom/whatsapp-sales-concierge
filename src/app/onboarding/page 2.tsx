// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, MessageSquare, Bot, Calendar, Bell, CheckCircle,
  ChevronRight, ChevronLeft, Loader2, Copy, Check, Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-browser';

interface OnboardingData {
  setup_completed: boolean;
  current_step: number;
  progress: number;
  steps: { id: string; name: string; completed: boolean }[];
  tenant: any;
}

const STEPS = [
  { id: 'business_profile', name: 'Business Profile', icon: Building2, description: 'Tell us about your business' },
  { id: 'twilio_setup', name: 'WhatsApp Setup', icon: MessageSquare, description: 'Connect your WhatsApp Business' },
  { id: 'ai_config', name: 'AI Configuration', icon: Bot, description: 'Customize your AI assistant' },
  { id: 'calendar_setup', name: 'Calendar', icon: Calendar, description: 'Connect your calendar (optional)' },
  { id: 'handoff_setup', name: 'Notifications', icon: Bell, description: 'Set up handoff alerts' },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [copied, setCopied] = useState(false);

  const [businessProfile, setBusinessProfile] = useState({
    company_name: '', business_type: '', business_description: '',
    target_audience: '', products_services: '', timezone: 'UTC',
  });
  const [twilioSetup, setTwilioSetup] = useState({
    twilio_account_sid: '', twilio_auth_token: '', twilio_whatsapp_number: '',
  });
  const [aiConfig, setAiConfig] = useState({
    ai_personality: 'professional', ai_language: 'en',
    ai_greeting: '', ai_fallback_message: '', qualification_questions: [] as string[],
  });
  const [handoffSetup, setHandoffSetup] = useState({
    channels: { dashboard: true, email: true, whatsapp: false, telegram: false },
    recipients: { email: '', whatsapp: '', telegram_chat_id: '' },
  });

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
        if (data.tenant.handoff_settings) {
          setHandoffSetup({
            channels: data.tenant.handoff_settings.channels || { dashboard: true, email: true, whatsapp: false, telegram: false },
            recipients: data.tenant.handoff_settings.recipients || { email: '', whatsapp: '', telegram_chat_id: '' },
          });
        }
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

  async function saveStepData(stepIndex: number, data: any) {
    setSaving(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepIndex, data, action: 'update_step' }),
      });
      if (!response.ok) throw new Error('Failed to save');
      return true;
    } catch (error) {
      console.error('Error saving step:', error);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    let stepData: any;
    switch (currentStep) {
      case 0: stepData = businessProfile; break;
      case 1: stepData = twilioSetup; break;
      case 2: stepData = aiConfig; break;
      case 3: stepData = {}; break;
      case 4: stepData = { handoff_settings: handoffSetup }; break;
    }

    const saved = await saveStepData(currentStep, stepData);
    if (!saved) return;

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_onboarding' }),
      });
      router.push('/dashboard');
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Show spinner while checking auth or loading data
  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const CurrentStepIcon = STEPS[currentStep].icon;
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhook/twilio`
    : 'https://concierge.fixeraitech.com/api/webhook/twilio';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to WhatsApp Sales Concierge
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Let's set up your AI assistant</h1>
          <p className="text-gray-600 mt-2">Complete these steps to start automating your sales conversations</p>
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

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <CurrentStepIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{STEPS[currentStep].name}</h2>
              <p className="text-gray-500">{STEPS[currentStep].description}</p>
            </div>
          </div>

          {/* Step 0: Business Profile */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                <input type="text" value={businessProfile.company_name}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, company_name: e.target.value })}
                  placeholder="Acme Inc." className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Type *</label>
                <select value={businessProfile.business_type}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, business_type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">Select your business type</option>
                  <option value="ecommerce">E-commerce / Retail</option>
                  <option value="saas">SaaS / Software</option>
                  <option value="services">Professional Services</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="real_estate">Real Estate</option>
                  <option value="education">Education</option>
                  <option value="hospitality">Hospitality / Travel</option>
                  <option value="finance">Finance / Insurance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Description *</label>
                <textarea value={businessProfile.business_description}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, business_description: e.target.value })}
                  placeholder="Describe what your business does..." rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
                <input type="text" value={businessProfile.target_audience}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, target_audience: e.target.value })}
                  placeholder="e.g., Small business owners, Enterprise companies"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Products/Services</label>
                <textarea value={businessProfile.products_services}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, products_services: e.target.value })}
                  placeholder="List your main products or services..." rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                <select value={businessProfile.timezone}
                  onChange={(e) => setBusinessProfile({ ...businessProfile, timezone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time (US)</option>
                  <option value="America/Chicago">Central Time (US)</option>
                  <option value="America/Denver">Mountain Time (US)</option>
                  <option value="America/Los_Angeles">Pacific Time (US)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Dubai">Dubai (GST)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                  <option value="Asia/Singapore">Singapore (SGT)</option>
                  <option value="Australia/Sydney">Sydney (AEST)</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 1: Twilio Setup */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-900 mb-2">📱 WhatsApp Business Setup Guide</h3>
                <ol className="text-sm text-blue-800 space-y-2">
                  <li>1. Go to <a href="https://www.twilio.com/console" target="_blank" rel="noopener" className="underline">Twilio Console</a> and create an account</li>
                  <li>2. Navigate to Messaging → Try it out → Send a WhatsApp message</li>
                  <li>3. Follow the sandbox setup instructions</li>
                  <li>4. Copy your credentials below</li>
                </ol>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Twilio Account SID *</label>
                <input type="text" value={twilioSetup.twilio_account_sid}
                  onChange={(e) => setTwilioSetup({ ...twilioSetup, twilio_account_sid: e.target.value })}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Twilio Auth Token *</label>
                <input type="password" value={twilioSetup.twilio_auth_token}
                  onChange={(e) => setTwilioSetup({ ...twilioSetup, twilio_auth_token: e.target.value })}
                  placeholder="Your auth token"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">WhatsApp Number *</label>
                <input type="text" value={twilioSetup.twilio_whatsapp_number}
                  onChange={(e) => setTwilioSetup({ ...twilioSetup, twilio_whatsapp_number: e.target.value })}
                  placeholder="+14155238886 (Twilio sandbox number)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-medium text-yellow-900 mb-2">⚠️ Important: Configure Webhook URL</h3>
                <p className="text-sm text-yellow-800 mb-3">In your Twilio Console, set the webhook URL to:</p>
                <div className="flex items-center gap-2 bg-white rounded-lg p-3 border">
                  <code className="flex-1 text-sm text-gray-800 break-all">{webhookUrl}</code>
                  <button onClick={() => copyToClipboard(webhookUrl)} className="p-2 hover:bg-gray-100 rounded">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: AI Configuration */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AI Personality</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'professional', label: 'Professional', desc: 'Formal and business-like' },
                    { value: 'friendly', label: 'Friendly', desc: 'Warm and approachable' },
                    { value: 'casual', label: 'Casual', desc: 'Relaxed and conversational' },
                  ].map((option) => (
                    <button key={option.value} type="button"
                      onClick={() => setAiConfig({ ...aiConfig, ai_personality: option.value })}
                      className={`p-4 border-2 rounded-lg text-left transition-colors ${
                        aiConfig.ai_personality === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="font-medium text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Primary Language</label>
                <select value={aiConfig.ai_language} onChange={(e) => setAiConfig({ ...aiConfig, ai_language: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Welcome Greeting *</label>
                <textarea value={aiConfig.ai_greeting} onChange={(e) => setAiConfig({ ...aiConfig, ai_greeting: e.target.value })}
                  placeholder={`Hi! 👋 Welcome to ${businessProfile.company_name || '[Your Company]'}. I'm your AI assistant. How can I help you today?`}
                  rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fallback Message</label>
                <textarea value={aiConfig.ai_fallback_message} onChange={(e) => setAiConfig({ ...aiConfig, ai_fallback_message: e.target.value })}
                  placeholder="I'm not sure I understand. Could you please rephrase that?"
                  rows={2} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {/* Step 3: Calendar Setup */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">In-App Calendar Ready</h4>
                    <p className="text-sm text-gray-700">
                      Your calendar is built-in and ready to use. Configure availability in the Calendar section after setup.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Handoff Setup */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-orange-800">Configure how you want to be notified when the AI needs human assistance.</p>
              </div>
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">Dashboard Alerts</p>
                      <p className="text-sm text-gray-500">Real-time notifications in your dashboard</p>
                    </div>
                  </div>
                  <input type="checkbox" checked={handoffSetup.channels.dashboard}
                    onChange={(e) => setHandoffSetup({ ...handoffSetup, channels: { ...handoffSetup.channels, dashboard: e.target.checked } })}
                    className="h-5 w-5 text-blue-600 rounded" />
                </label>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">Email Notifications</p>
                        <p className="text-sm text-gray-500">Detailed alerts with conversation summary</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={handoffSetup.channels.email}
                      onChange={(e) => setHandoffSetup({ ...handoffSetup, channels: { ...handoffSetup.channels, email: e.target.checked } })}
                      className="h-5 w-5 text-blue-600 rounded" />
                  </label>
                  {handoffSetup.channels.email && (
                    <input type="email" value={handoffSetup.recipients.email}
                      onChange={(e) => setHandoffSetup({ ...handoffSetup, recipients: { ...handoffSetup.recipients, email: e.target.value } })}
                      placeholder="your@email.com" className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-emerald-600" />
                      <div>
                        <p className="font-medium text-gray-900">WhatsApp Notifications</p>
                        <p className="text-sm text-gray-500">Instant alerts to your WhatsApp</p>
                      </div>
                    </div>
                    <input type="checkbox" checked={handoffSetup.channels.whatsapp}
                      onChange={(e) => setHandoffSetup({ ...handoffSetup, channels: { ...handoffSetup.channels, whatsapp: e.target.checked } })}
                      className="h-5 w-5 text-blue-600 rounded" />
                  </label>
                  {handoffSetup.channels.whatsapp && (
                    <input type="tel" value={handoffSetup.recipients.whatsapp}
                      onChange={(e) => setHandoffSetup({ ...handoffSetup, recipients: { ...handoffSetup.recipients, whatsapp: e.target.value } })}
                      placeholder="+1234567890" className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <button onClick={handleBack} disabled={currentStep === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                currentStep === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button onClick={handleNext} disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : currentStep === STEPS.length - 1 ? (
                <><span>Complete Setup</span><CheckCircle className="h-4 w-4" /></>
              ) : (
                <><span>Continue</span><ChevronRight className="h-4 w-4" /></>
              )}
            </button>
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
