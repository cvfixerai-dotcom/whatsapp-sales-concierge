// @ts-nocheck
export const PRICING = {
  tiers: {
    trial: {
      name: 'Free Trial',
      price: 0,
      conversations: 25,
      features: [
        '25 AI conversations',
        '24/7 AI responses in 4 seconds',
        'Lead qualification & scoring',
        'Basic dashboard access',
        'Email support'
      ],
      ideal_for: 'Businesses testing AI sales automation'
    },
    starter: {
      name: 'Starter',
      price: 197,
      conversations: 200,
      features: [
        '200 AI conversations/month',
        '24/7 AI responses in 4 seconds',
        'Lead qualification & scoring',
        'Appointment booking',
        'Full dashboard access',
        'Email support (24-hour response)',
        'WhatsApp handoff notifications'
      ],
      ideal_for: 'Small businesses with 1-3 salespeople'
    },
    growth: {
      name: 'Growth',
      price: 497,
      conversations: 800,
      features: [
        '800 AI conversations/month',
        'Everything in Starter',
        'Bilingual support (English + Arabic)',
        'Lead temperature tracking (Hot/Warm/Cold)',
        'Priority support (2-hour response)',
        'Multi-channel handoff (Email + WhatsApp + Telegram)',
        'Advanced analytics dashboard'
      ],
      ideal_for: 'Growing businesses with 4-10 salespeople'
    },
    scale: {
      name: 'Scale',
      price: 997,
      conversations: 2500,
      features: [
        '2,500 AI conversations/month',
        'Everything in Growth',
        'Multi-language support (3 languages)',
        'Multi-number support (up to 3 numbers)',
        'Dedicated account manager',
        'Real-time support (30-minute response)',
        'Custom AI personality training',
        'API access'
      ],
      ideal_for: 'High-volume businesses and agencies (10+ salespeople)'
    }
  },
  setup_fee: 0,
  topups: {
    small: {
      name: 'Small Top-Up',
      price: 70,
      conversations: 100,
      cost_per_conv: 0.70
    },
    medium: {
      name: 'Medium Top-Up',
      price: 149,
      conversations: 250,
      cost_per_conv: 0.60
    },
    large: {
      name: 'Large Top-Up',
      price: 399,
      conversations: 1000,
      cost_per_conv: 0.40
    }
  },
  currency: 'USD'
};

export function getPriceForTier(tier: string): number {
  return PRICING.tiers[tier]?.price || 299;
}

export function getConversationsForTier(tier: string): number {
  return PRICING.tiers[tier]?.conversations || 25;
}

export function calculateOverageCost(
  conversationsUsed: number,
  tierLimit: number
): { overage: number; recommendedTopup: string; cost: number } {
  const overage = conversationsUsed - tierLimit;
  
  if (overage <= 0) {
    return { overage: 0, recommendedTopup: 'none', cost: 0 };
  }
  
  // Recommend most cost-effective top-up
  if (overage <= 100) {
    return {
      overage,
      recommendedTopup: 'small',
      cost: PRICING.topups.small.price
    };
  } else if (overage <= 250) {
    return {
      overage,
      recommendedTopup: 'medium',
      cost: PRICING.topups.medium.price
    };
  } else {
    // For 251+ overage, recommend large or multiple
    const largeTopupsNeeded = Math.ceil(overage / 1000);
    return {
      overage,
      recommendedTopup: 'large',
      cost: PRICING.topups.large.price * largeTopupsNeeded
    };
  }
}

export function getTopupEfficiency(topupType: 'small' | 'medium' | 'large'): {
  bestFor: string;
  savings: number;
} {
  const topup = PRICING.topups[topupType];
  const baseCost = 0.70; // Small top-up cost per conversation
  
  return {
    bestFor: topupType === 'small' ? 'Light usage' :
             topupType === 'medium' ? 'Moderate usage' :
             'Heavy usage',
    savings: ((baseCost - topup.cost_per_conv) / baseCost) * 100
  };
}

export function calculateMonthlyProjected(
  currentUsage: number,
  daysInMonth: number,
  currentDay: number
): number {
  const dailyAverage = currentUsage / currentDay;
  return Math.round(dailyAverage * daysInMonth);
}

export function getTierUpgradePath(currentTier: string): {
  nextTier: string | null;
  additionalConversations: number;
  priceDifference: number;
  valuePerExtra: number;
} {
  const tiers = ['trial', 'starter', 'growth', 'scale'];
  const currentIndex = tiers.indexOf(currentTier);
  
  if (currentIndex >= tiers.length - 1) {
    return { nextTier: null, additionalConversations: 0, priceDifference: 0, valuePerExtra: 0 };
  }
  
  const next = tiers[currentIndex + 1];
  const current = PRICING.tiers[currentTier];
  const nextPlan = PRICING.tiers[next];
  
  return {
    nextTier: next,
    additionalConversations: nextPlan.conversations - current.conversations,
    priceDifference: nextPlan.price - current.price,
    valuePerExtra: (nextPlan.price - current.price) / (nextPlan.conversations - current.conversations)
  };
}
