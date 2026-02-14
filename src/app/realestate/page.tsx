// @ts-nocheck
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Clock,
  Calendar,
  TrendingUp,
  CheckCircle,
  Star,
  ArrowRight,
  Phone,
  Building2,
  Users,
  Zap,
  Shield,
  Play,
  ChevronRight,
  MessageCircle,
} from 'lucide-react';

const features = [
  {
    icon: Clock,
    title: 'Never Miss a Lead Again',
    description: 'AI responds to property inquiries in seconds, 24/7. Even at 2 AM when your competitors are sleeping.',
  },
  {
    icon: MessageSquare,
    title: 'Intelligent Qualification',
    description: 'Automatically asks about budget, timeline, and preferences. Only hot leads reach your phone.',
  },
  {
    icon: Calendar,
    title: 'Auto-Book Viewings',
    description: 'AI checks your calendar and books property viewings. Wake up to a full schedule.',
  },
  {
    icon: TrendingUp,
    title: 'Lead Scoring',
    description: 'Know which leads are ready to buy. Prioritize your time on high-value prospects.',
  },
];

const stats = [
  { value: '67%', label: 'of leads go cold if not responded to in 5 minutes' },
  { value: '3x', label: 'more viewings booked with 24/7 AI response' },
  { value: '45%', label: 'of property inquiries come outside business hours' },
];

const testimonials = [
  {
    name: 'Sarah M.',
    role: 'Real Estate Agent, Lagos',
    content: 'I booked 3 viewings while I was showing another property. The AI handled everything perfectly.',
    rating: 5,
  },
  {
    name: 'Ahmed K.',
    role: 'Property Developer, Dubai',
    content: 'Our response time went from 4 hours to 4 seconds. Lead conversion doubled in the first month.',
    rating: 5,
  },
  {
    name: 'Grace O.',
    role: 'Agency Owner, Nairobi',
    content: 'Finally, I can sleep without worrying about missing leads. The AI qualifies them better than my junior agents.',
    rating: 5,
  },
];

const pricingPlans = [
  {
    name: 'Free Trial',
    price: 0,
    conversations: 25,
    features: [
      '25 AI conversations',
      '7-day trial period',
      '24/7 instant responses',
      'Lead qualification',
      'Basic dashboard',
    ],
    popular: false,
    cta: 'Start Free',
  },
  {
    name: 'Starter',
    price: 197,
    conversations: 200,
    features: [
      '200 AI conversations/month',
      'Appointment auto-booking',
      'Lead scoring & qualification',
      'WhatsApp handoff alerts',
      'Full dashboard access',
    ],
    popular: false,
    cta: 'Get Started',
  },
  {
    name: 'Growth',
    price: 497,
    conversations: 800,
    features: [
      '800 AI conversations/month',
      'Everything in Starter',
      'Automated follow-up sequences',
      'Bilingual (English + Arabic)',
      'Priority support',
    ],
    popular: true,
    cta: 'Most Popular',
  },
  {
    name: 'Scale',
    price: 997,
    conversations: 2500,
    features: [
      '2,500 AI conversations/month',
      'Everything in Growth',
      'Multi-channel handoff',
      'Appointment reminders',
      'Dedicated account manager',
    ],
    popular: false,
    cta: 'Contact Sales',
  },
];

const faqs = [
  {
    question: 'How does the AI know about my properties?',
    answer: 'During setup, you provide your property listings, pricing, and business details. The AI learns your inventory and can answer specific questions about each property.',
  },
  {
    question: 'What if a client asks something the AI can\'t answer?',
    answer: 'The AI instantly notifies you via WhatsApp, email, or Telegram. You can take over the conversation seamlessly - the client never knows.',
  },
  {
    question: 'Do I need technical skills to set this up?',
    answer: 'Not at all. Our guided setup takes 15 minutes. We also offer free assisted setup on a discovery call where we configure everything for you.',
  },
  {
    question: 'Can clients tell they\'re talking to an AI?',
    answer: 'The AI is designed to be natural and helpful. Most clients appreciate the instant response. You can customize the AI personality to match your brand.',
  },
  {
    question: 'What happens when I reach my conversation limit?',
    answer: 'You can top up anytime or upgrade your plan. We\'ll notify you at 80% usage so you\'re never caught off guard.',
  },
];

export default function RealEstateLandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    agency: '',
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would submit to your API
    console.log('Lead captured:', formData);
    setFormSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm z-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900">SalesConcierge</span>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Real Estate</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900">Features</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</a>
              <a href="#faq" className="text-gray-600 hover:text-gray-900">FAQ</a>
              <Link href="/auth/login" className="text-gray-600 hover:text-gray-900">Login</Link>
              <a
                href="#discovery"
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Book Discovery Call
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-br from-emerald-50 via-white to-green-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium mb-6">
                <Zap className="h-4 w-4" />
                AI-Powered Lead Response
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Book More Viewings
                <span className="text-emerald-600"> While You Sleep</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Your AI assistant responds to WhatsApp property inquiries instantly, qualifies leads, 
                and books viewings 24/7. Never lose a deal to slow response times again.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-emerald-700 transition-colors"
                >
                  Try Live Demo
                  <MessageCircle className="h-5 w-5" />
                </a>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold border-2 border-gray-200 hover:border-emerald-300 transition-colors"
                >
                  View Pricing
                  <ArrowRight className="h-5 w-5" />
                </a>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  7-day free trial
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  No credit card required
                </div>
              </div>
            </div>
            
            {/* Chat Preview */}
            <div className="relative">
              <div className="bg-gray-900 rounded-3xl p-4 shadow-2xl">
                <div className="bg-emerald-700 rounded-2xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-emerald-700" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">Demo Miracle</p>
                      <p className="text-emerald-200 text-sm">Online • AI Assistant</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-2">
                  {/* Customer message */}
                  <div className="flex justify-end">
                    <div className="bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]">
                      <p>Hi, I saw your 3-bedroom apartment in Lekki. Is it still available?</p>
                      <p className="text-emerald-200 text-xs mt-1">2:34 AM</p>
                    </div>
                  </div>
                  {/* AI response */}
                  <div className="flex justify-start">
                    <div className="bg-gray-700 text-white rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%]">
                      <p>Hi! 👋 Yes, the 3-bedroom apartment in Lekki Phase 1 is available!</p>
                      <p className="mt-2">It's ₦3.5M/year, fully serviced with:</p>
                      <p>✓ 24/7 power & water</p>
                      <p>✓ Swimming pool</p>
                      <p>✓ Gym access</p>
                      <p className="mt-2">Would you like to schedule a viewing? I have slots available tomorrow at 10 AM or 2 PM.</p>
                      <p className="text-gray-400 text-xs mt-1">2:34 AM • AI Assistant</p>
                    </div>
                  </div>
                  {/* Customer message */}
                  <div className="flex justify-end">
                    <div className="bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]">
                      <p>2 PM works for me!</p>
                      <p className="text-emerald-200 text-xs mt-1">2:35 AM</p>
                    </div>
                  </div>
                  {/* AI response */}
                  <div className="flex justify-start">
                    <div className="bg-gray-700 text-white rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%]">
                      <p>Perfect! ✅ I've booked your viewing for tomorrow at 2 PM.</p>
                      <p className="mt-2">📍 Address: 15 Admiralty Way, Lekki Phase 1</p>
                      <p className="mt-2">Our agent Sarah will meet you there. I'll send a reminder 2 hours before!</p>
                      <p className="text-gray-400 text-xs mt-1">2:35 AM • AI Assistant</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                Viewing booked at 2:35 AM! 🎉
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-4xl md:text-5xl font-bold text-emerald-400 mb-2">{stat.value}</p>
                <p className="text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before vs After */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">Without AI vs With AI</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-red-700 mb-6">Without SalesConcierge</h3>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-start gap-3"><span className="text-red-500 mt-1">&#10005;</span>Leads message at 2 AM with no reply until morning</li>
                <li className="flex items-start gap-3"><span className="text-red-500 mt-1">&#10005;</span>67% of leads go cold before you respond</li>
                <li className="flex items-start gap-3"><span className="text-red-500 mt-1">&#10005;</span>Hours wasted qualifying tire-kickers</li>
                <li className="flex items-start gap-3"><span className="text-red-500 mt-1">&#10005;</span>Forgot to follow up? Deal is gone</li>
                <li className="flex items-start gap-3"><span className="text-red-500 mt-1">&#10005;</span>Showing properties to unqualified buyers</li>
              </ul>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-emerald-700 mb-6">With SalesConcierge</h3>
              <ul className="space-y-4 text-gray-700">
                <li className="flex items-start gap-3"><span className="text-emerald-500 mt-1">&#10003;</span>AI responds in 4 seconds, 24/7/365</li>
                <li className="flex items-start gap-3"><span className="text-emerald-500 mt-1">&#10003;</span>Every lead qualified and scored automatically</li>
                <li className="flex items-start gap-3"><span className="text-emerald-500 mt-1">&#10003;</span>Only hot leads reach your phone</li>
                <li className="flex items-start gap-3"><span className="text-emerald-500 mt-1">&#10003;</span>Automated follow-ups at 3, 7, and 21 days</li>
                <li className="flex items-start gap-3"><span className="text-emerald-500 mt-1">&#10003;</span>Viewings auto-booked on your calendar</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Close More Deals
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From instant response to viewing confirmation, our AI handles the entire lead journey.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 px-4 bg-emerald-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Try It Right Now
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Send a message to our demo WhatsApp and experience the AI yourself.
            Ask about properties, pricing, or request a viewing.
          </p>
          <a
            href="https://wa.me/14099083940?text=Hi%2C%20I%20want%20to%20see%20how%20the%20AI%20works"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-green-500 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-green-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Message Demo on WhatsApp
          </a>
          <p className="text-gray-500 mt-4 text-sm">
            * This is a demo number. Your actual AI will use your business WhatsApp.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Trusted by Real Estate Professionals
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-4">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <span className="text-emerald-700 font-semibold">{testimonial.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{testimonial.name}</p>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Start free, upgrade when you're ready. No hidden fees.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`bg-white rounded-2xl p-8 ${
                  plan.popular
                    ? 'ring-2 ring-emerald-600 shadow-xl scale-105'
                    : 'border border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="bg-emerald-600 text-white text-sm font-semibold px-3 py-1 rounded-full inline-block mb-4">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-500">/month</span>
                </div>
                <p className="text-gray-600 mb-6">{plan.conversations} conversations/month</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#discovery"
                  className={`block text-center py-3 rounded-xl font-semibold transition-colors ${
                    plan.popular
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
                >
                  <span className="font-semibold text-gray-900">{faq.question}</span>
                  <ChevronRight
                    className={`h-5 w-5 text-gray-500 transition-transform ${
                      openFaq === index ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Discovery Call Form */}
      <section id="discovery" className="py-20 px-4 bg-emerald-600">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Book a Free Discovery Call</h2>
            <p className="text-xl text-emerald-100">See how AI can transform your lead response. We set everything up in 15 minutes.</p>
          </div>
          {formSubmitted ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">We will be in touch!</h3>
              <p className="text-gray-600">Check your WhatsApp for a message from our AI assistant.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 space-y-4">
              <input type="text" placeholder="Your Name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              <input type="email" placeholder="Email Address" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              <input type="tel" placeholder="WhatsApp Number" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              <input type="text" placeholder="Agency / Company Name" value={formData.agency} onChange={e => setFormData({...formData, agency: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">Book Discovery Call <ArrowRight className="h-5 w-5" /></button>
              <p className="text-gray-500 text-sm text-center">No commitment. 15-minute call. We show you exactly how it works.</p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-white">SalesConcierge</span>
            </div>
            <div className="flex gap-6 text-gray-400">
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <a href="mailto:support@fixeraitech.com" className="hover:text-white">Contact</a>
            </div>
            <p className="text-gray-500">© 2026 FixerAI Tech. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
