'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { toast } from 'sonner';
import { SkeletonPulse } from '@/components/skeletons';
import { useRouter } from 'next/navigation';
import { PRICING, calculateOverageCost, getTierUpgradePath, calculateMonthlyProjected } from '@/lib/billing/pricing';
import {
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  DollarSign,
  MessageSquare,
  Zap,
  Crown,
  Rocket,
  Building,
  Activity,
  Users,
  UserPlus,
  Settings,
  LogOut,
} from 'lucide-react';

interface UsageData {
  subscription_tier: string;
  subscription_status: string;
  conversation_count: number;
  monthly_conversation_limit: number;
  topup_conversations_remaining: number;
  payments: Array<{
    id: string;
    type: string;
    amount: number;
    status: string;
    paid_at: string;
  }>;
  current_month_start: string;
  days_in_month: number;
  current_day: number;
}

export default function BillingPage() {
  const [_authReady, setAuthReady] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAuthReady(true); }); }, []);
  const status = _authReady ? 'authenticated' : 'loading';
  const router = useRouter();
  
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (_authReady) {
      fetchUsageData();
    }
  }, [_authReady]);

  async function fetchUsageData() {
    try {
      const response = await fetch('/api/billing/usage');
      if (!response.ok) throw new Error('Failed to fetch usage data');
      const data = await response.json();
      setUsage(data);
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(tier: string) {
    setProcessing(tier);
    try {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      
      if (!response.ok) throw new Error('Failed to initiate upgrade');
      
      const { authorization_url } = await response.json();
      window.location.href = authorization_url;
    } catch (error) {
      console.error('Error upgrading:', error);
      toast.error('Failed to process upgrade. Please try again.');
    } finally {
      setProcessing(null);
    }
  }

  async function handleTopUp(topupType: string) {
    setProcessing(topupType);
    try {
      const response = await fetch('/api/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topup_type: topupType })
      });
      
      if (!response.ok) throw new Error('Failed to initiate top-up');
      
      const { authorization_url } = await response.json();
      window.location.href = authorization_url;
    } catch (error) {
      console.error('Error purchasing top-up:', error);
      toast.error('Failed to process top-up. Please try again.');
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-lg shadow p-6">
          <SkeletonPulse className="h-6 w-32 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonPulse className="h-20 w-full" />
            <SkeletonPulse className="h-20 w-full" />
            <SkeletonPulse className="h-20 w-full" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <SkeletonPulse className="h-6 w-40 mb-4" />
          <SkeletonPulse className="h-8 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Unable to load billing data</h2>
          <button
            onClick={fetchUsageData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const tier = usage.subscription_tier;
  const plan = PRICING.tiers[tier as keyof typeof PRICING.tiers];
  const limit = (tier === 'trial') ? plan.conversations : usage.monthly_conversation_limit;
  const overageInfo = calculateOverageCost(usage.conversation_count, limit);
  const percentUsed = (usage.conversation_count / limit) * 100;
  const projectedUsage = calculateMonthlyProjected(
    usage.conversation_count,
    usage.days_in_month,
    usage.current_day
  );
  const upgradePath = getTierUpgradePath(tier);

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case 'trial': return <Zap className="w-6 h-6" />;
      case 'starter': return <Rocket className="w-6 h-6" />;
      case 'growth': return <TrendingUp className="w-6 h-6" />;
      case 'scale': return <Crown className="w-6 h-6" />;
      default: return <Building className="w-6 h-6" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
          {/* Current Plan */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Current Plan</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                usage.subscription_status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : usage.subscription_status === 'trial'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {usage.subscription_status === 'trial' ? 'Free Trial' : usage.subscription_status}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  {getTierIcon(tier)}
                </div>
                <div>
                  <p className="text-2xl font-bold capitalize">{plan.name}</p>
                  <p className="text-gray-600">${plan.price}/month</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {plan.conversations.toLocaleString()} conversations included
                  </p>
                </div>
              </div>
              
              {upgradePath.nextTier && (
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">Next tier</p>
                  <p className="font-semibold">{upgradePath.nextTier}</p>
                  <p className="text-sm text-gray-600">
                    {(PRICING.tiers[upgradePath.nextTier as keyof typeof PRICING.tiers]?.conversations ?? upgradePath.additionalConversations).toLocaleString()} conversations
                  </p>
                  <p className="text-lg font-bold text-blue-600">
                    +${upgradePath.priceDifference}/mo
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Usage This Month */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage This Month</h2>
            
            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <div>
                  <span className="text-gray-600">Conversations Used</span>
                  <p className="text-3xl font-bold">
                    {usage.conversation_count.toLocaleString()} / {limit.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Projected</p>
                  <p className="text-xl font-semibold">
                    {projectedUsage.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                <div 
                  className={`h-4 rounded-full transition-all ${
                    percentUsed >= 100 ? 'bg-red-500' : 
                    percentUsed >= 80 ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
              
              <div className="flex justify-between text-sm">
                <p className="text-gray-500">
                  {percentUsed.toFixed(1)}% of monthly limit used
                </p>
                <p className="text-gray-500">
                  {usage.days_in_month - usage.current_day} days remaining
                </p>
              </div>
            </div>
            
            {usage.topup_conversations_remaining > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <Zap className="w-5 h-5 text-blue-600 mr-2" />
                  <div>
                    <p className="text-blue-800 font-semibold">
                      Top-up conversations available: {usage.topup_conversations_remaining}
                    </p>
                    <p className="text-blue-600 text-sm mt-1">
                      These will be used automatically when you exceed your monthly limit
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {overageInfo.overage > 0 && usage.topup_conversations_remaining === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-yellow-800 font-semibold mb-2">
                      You've exceeded your monthly limit
                    </p>
                    <p className="text-yellow-700 mb-3">
                      Overage: {overageInfo.overage} conversations
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-yellow-600">
                        💡 Recommended: {overageInfo.recommendedTopup} top-up for ${overageInfo.cost}
                      </p>
                      <button
                        onClick={() => handleTopUp(overageInfo.recommendedTopup)}
                        disabled={processing === overageInfo.recommendedTopup}
                        className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                      >
                        {processing === overageInfo.recommendedTopup ? 'Processing...' : 'Buy Now'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top-Up Packages */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Need More Conversations?</h2>
            <p className="text-gray-600 mb-6">
              Purchase additional conversation credits that never expire during your billing cycle.
            </p>
            
            <div className="grid md:grid-cols-3 gap-6">
              {Object.entries(PRICING.topups).map(([key, topup]) => (
                <div key={key} className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
                  <h3 className="text-lg font-bold mb-2">{topup.name}</h3>
                  <p className="text-3xl font-bold mb-1">
                    ${topup.price}
                  </p>
                  <p className="text-gray-600 mb-4">
                    {topup.conversations.toLocaleString()} conversations
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    ${topup.cost_per_conv.toFixed(2)} per conversation
                  </p>
                  <button
                    onClick={() => handleTopUp(key)}
                    disabled={processing === key}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {processing === key ? 'Processing...' : 'Purchase Now'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Upgrade Plans — only show for non-scale tiers */}
          {tier !== 'scale' && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Upgrade Your Plan</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                {Object.entries(PRICING.tiers).map(([key, plan]) => {
                  const isCurrentPlan = tier === key;
                  const isUpgrade = key === upgradePath.nextTier;
                  
                  return (
                    <div 
                      key={key}
                      className={`border rounded-lg p-6 hover:shadow-lg transition-shadow ${
                        isCurrentPlan ? 'border-blue-500 border-2' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          {getTierIcon(key)}
                          <h3 className="text-xl font-bold">{plan.name}</h3>
                        </div>
                        {isCurrentPlan && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            Current
                          </span>
                        )}
                        {isUpgrade && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            Recommended
                          </span>
                        )}
                      </div>
                      
                      <p className="text-3xl font-bold mb-1">
                        ${plan.price}<span className="text-sm font-normal">/mo</span>
                      </p>
                      <p className="text-gray-600 mb-4">
                        {plan.conversations.toLocaleString()} conversations
                      </p>
                      
                      <ul className="space-y-2 mb-6 text-sm">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-center">
                            <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      
                      <button
                        onClick={() => handleUpgrade(key)}
                        disabled={isCurrentPlan || processing === key}
                        className={`w-full px-4 py-2 rounded-lg transition-colors ${
                          isCurrentPlan
                            ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                            : isUpgrade
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        } disabled:opacity-50`}
                      >
                        {processing === key ? 'Processing...' :
                         isCurrentPlan ? 'Current Plan' :
                         isUpgrade ? 'Upgrade Now' : 'Upgrade'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment History</h2>
            
            {usage.payments && usage.payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Description</th>
                      <th className="text-right py-3 px-4">Amount</th>
                      <th className="text-right py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.payments.map((payment) => (
                      <tr key={payment.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          {new Date(payment.paid_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 capitalize">
                          {payment.type.replace('_', ' ')}
                        </td>
                        <td className="text-right py-3 px-4 font-semibold">
                          ${payment.amount}
                        </td>
                        <td className="text-right py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            payment.status === 'success' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {payment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                No payment history available
              </p>
            )}
          </div>
    </div>
  );
}
