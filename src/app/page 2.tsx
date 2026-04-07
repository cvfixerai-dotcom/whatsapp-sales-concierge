'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ChatDemo from '@/components/ChatDemo';

const plans = [
  {
    name: 'Free Trial',
    price: 0,
    period: '7 days',
    conversations: '25 conversations',
    popular: false,
    features: [
      '25 AI conversations',
      'Lead qualification',
      'Basic dashboard',
      'Email support',
    ],
    cta: 'Start Free Trial',
  },
  {
    name: 'Starter',
    price: 197,
    period: '/month',
    conversations: '200 conversations/mo',
    popular: false,
    features: [
      '200 AI conversations/mo',
      'Lead scoring & qualification',
      'Appointment booking',
      'Follow-up sequences',
      'Email + WhatsApp handoff',
      '24hr support response',
    ],
    cta: 'Get Started',
  },
  {
    name: 'Growth',
    price: 497,
    period: '/month',
    conversations: '800 conversations/mo',
    popular: true,
    features: [
      '800 AI conversations/mo',
      'Everything in Starter',
      'Telegram handoff',
      'Bilingual (EN + AR)',
      'Appointment reminders',
      '2hr support response',
    ],
    cta: 'Get Started',
  },
  {
    name: 'Scale',
    price: 997,
    period: '/month',
    conversations: '2,500 conversations/mo',
    popular: false,
    features: [
      '2,500 AI conversations/mo',
      'Everything in Growth',
      'Multi-language (3+)',
      'Multi-number support',
      'API access',
      '30min support response',
    ],
    cta: 'Get Started',
  },
];

export default function HomePage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
      
      const sections = ['features', 'pricing', 'cta'];
      const visible = new Set<string>();
      
      sections.forEach((section) => {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          const isVisible = rect.top < window.innerHeight * 0.8;
          if (isVisible) visible.add(section);
        }
      });
      
      setVisibleSections(visible);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-100' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
                  <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">SalesConcierge<span className="text-blue-600">AI</span></span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <Link href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
              <Link href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
              <Link href="/realestate" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Real Estate Demo</Link>
              <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Sign In</Link>
              <Link
                href="/auth/signup"
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40"></div>
        <div className="absolute top-20 right-0 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-100/30 rounded-full blur-3xl"></div>
        
        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 text-blue-700 rounded-full text-sm font-medium mb-8">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                AI-Powered Sales Automation
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.1] mb-6 tracking-tight">
                Your AI Sales Team
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  That Never Sleeps
                </span>
              </h1>
              <p className="text-lg text-gray-600 mb-10 max-w-lg leading-relaxed">
                Qualify leads, book appointments, and close deals 24/7 on WhatsApp. 
                Respond in 5 seconds, not 5 hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-10">
                <Link
                  href="/auth/signup"
                  className="px-8 py-4 bg-blue-600 text-white text-base font-semibold rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg shadow-blue-600/25 text-center"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/realestate"
                  className="px-8 py-4 bg-white text-gray-700 text-base font-semibold rounded-xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-200 text-center"
                >
                  See Live Demo
                </Link>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  7-day free trial
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  $0 setup fees
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 to-indigo-400/10 rounded-3xl transform rotate-2 scale-105"></div>
              <div className="relative">
                <ChatDemo />
              </div>
              <p className="text-center text-sm text-gray-500 mt-4">See how the AI qualifies leads and books appointments in real time</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            {[
              { value: '< 5s', label: 'Average Response Time' },
              { value: '24/7', label: 'Always Available' },
              { value: '3x', label: 'More Appointments Booked' },
              { value: '85%', label: 'Lead Qualification Rate' },
            ].map((stat, i) => (
              <div key={i}>
                <p className="text-3xl md:text-4xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-gray-400 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={`py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${visibleSections.has('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Convert More Leads
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From instant response to automated follow-up, your AI handles the entire sales pipeline.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: '⚡',
                title: 'Instant AI Responses',
                desc: 'Your AI responds to every WhatsApp inquiry in under 5 seconds. No lead goes cold.',
                color: 'bg-amber-50 border-amber-100',
              },
              {
                icon: '🎯',
                title: 'Smart Lead Scoring',
                desc: 'Automatically score and classify leads as Hot, Warm, or Cold based on conversation context.',
                color: 'bg-red-50 border-red-100',
              },
              {
                icon: '📅',
                title: 'Automated Booking',
                desc: 'The AI books appointments directly into your calendar. Sends reminders 2hr and 30min before.',
                color: 'bg-blue-50 border-blue-100',
              },
              {
                icon: '🔄',
                title: 'Follow-Up Sequences',
                desc: 'Automated nurture messages on Day 3, 7, and 21. Never forget to follow up again.',
                color: 'bg-green-50 border-green-100',
              },
              {
                icon: '🤝',
                title: 'Human Handoff',
                desc: 'One-click takeover via dashboard, email, WhatsApp, or Telegram when you need to step in.',
                color: 'bg-purple-50 border-purple-100',
              },
              {
                icon: '📊',
                title: 'Analytics Dashboard',
                desc: 'Track conversations, lead quality, response times, and revenue impact in real time.',
                color: 'bg-indigo-50 border-indigo-100',
              },
            ].map((feature, i) => (
              <div key={i} className={`p-8 rounded-2xl border ${feature.color} hover:shadow-lg transition-all duration-300`}>
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Set Up in 15 Minutes</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: '01', title: 'Connect WhatsApp', desc: 'Link your Twilio WhatsApp number. We guide you through every step.' },
              { step: '02', title: 'Train Your AI', desc: 'Tell it about your business, services, and pricing. It learns your style.' },
              { step: '03', title: 'Start Converting', desc: 'Your AI is live 24/7. Watch qualified leads and booked appointments roll in.' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-lg font-bold mx-auto mb-6">{item.step}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className={`py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${visibleSections.has('pricing') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Start free. Upgrade when you're ready. No hidden fees. No setup costs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 transition-all duration-300 ${
                  plan.popular
                    ? 'bg-blue-600 text-white ring-2 ring-blue-600 shadow-xl scale-[1.02]'
                    : 'bg-white border border-gray-200 hover:border-blue-200 hover:shadow-lg'
                }`}
              >
                {plan.popular && (
                  <div className="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded-full inline-block mb-4 uppercase tracking-wide">
                    Most Popular
                  </div>
                )}
                <h3 className={`text-xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                <div className="mb-1">
                  <span className={`text-4xl font-bold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>${plan.price}</span>
                  <span className={`text-sm ${plan.popular ? 'text-blue-100' : 'text-gray-500'}`}>{plan.period}</span>
                </div>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-blue-100' : 'text-gray-500'}`}>{plan.conversations}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${plan.popular ? 'text-blue-200' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                      <span className={`text-sm ${plan.popular ? 'text-blue-50' : 'text-gray-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth/signup"
                  className={`block w-full text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.popular
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="cta" className={`py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-900 via-blue-950 to-indigo-950 transition-all duration-700 ${visibleSections.has('cta') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to stop losing leads?
          </h2>
          <p className="text-lg text-gray-300 mb-10 max-w-xl mx-auto">
            Your competitors respond in hours. Your AI responds in seconds. 
            Start your free trial today — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-blue-600 text-white text-base font-semibold rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg shadow-blue-600/25"
            >
              Start Free Trial
            </Link>
            <Link
              href="/realestate"
              className="px-8 py-4 bg-white/10 text-white text-base font-semibold rounded-xl border border-white/20 hover:bg-white/20 transition-all duration-200"
            >
              See Live Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
                    <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
                  </svg>
                </div>
                <span className="text-lg font-bold text-white">SalesConcierge<span className="text-blue-400">AI</span></span>
              </div>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                AI-powered WhatsApp sales automation. Qualify leads, book appointments, and close deals 24/7.
              </p>
              <p className="text-xs text-gray-600">
                A product of{' '}
                <a href="https://fixeraitech.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                  FixerAI Technologies Ltd
                </a>
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Product</h4>
              <ul className="space-y-3 text-sm">
                <li><Link href="#features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/realestate" className="hover:text-white transition-colors">Real Estate Demo</Link></li>
                <li><Link href="/auth/signup" className="hover:text-white transition-colors">Free Trial</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Company</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="https://fixeraitech.com/about" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">About FixerAI</a></li>
                <li><a href="https://fixeraitech.com/blog" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="https://fixeraitech.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="https://www.linkedin.com/company/fixeraitech" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">LinkedIn</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Support</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="mailto:info@fixeraitech.com" className="hover:text-white transition-colors">info@fixeraitech.com</a></li>
                <li><a href="https://fixeraitech.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="https://fixeraitech.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-600">&copy; 2026 FixerAI Technologies Ltd. All rights reserved.</p>
            <p className="text-xs text-gray-700">SalesConcierge AI — Serving businesses in Dubai & UAE</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
