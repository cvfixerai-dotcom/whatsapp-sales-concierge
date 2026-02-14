// @ts-nocheck
/**
 * Demo Bot System
 * Handles demo conversations for potential customers to experience the AI
 * Captures leads after a few messages
 */

import { supabaseAdmin } from '../db/client';

export interface DemoConversation {
  phone_number: string;
  message_count: number;
  lead_captured: boolean;
  interested: boolean | null;
  created_at: string;
  last_message_at: string;
  messages: DemoMessage[];
}

export interface DemoMessage {
  direction: 'inbound' | 'outbound';
  content: string;
  timestamp: string;
}

// Demo conversation storage (in production, use Redis or database)
const demoConversations = new Map<string, DemoConversation>();

// Demo bot configuration
export const DEMO_CONFIG = {
  maxMessages: 6, // After 6 messages, reveal it's a demo
  leadCaptureMessage: 5, // Capture lead info at message 5
  demoTenantId: 'demo', // Special tenant ID for demo
  demoIndustry: 'real_estate', // Default demo industry
};

// Demo property data for real estate demo
const DEMO_PROPERTIES = [
  {
    name: '3-Bedroom Apartment in Lekki Phase 1',
    price: '₦3.5M/year',
    type: 'Apartment',
    bedrooms: 3,
    features: ['24/7 power & water', 'Swimming pool', 'Gym access', 'Security'],
    location: '15 Admiralty Way, Lekki Phase 1',
  },
  {
    name: '4-Bedroom Duplex in Ikoyi',
    price: '₦8M/year',
    type: 'Duplex',
    bedrooms: 4,
    features: ['Smart home', 'Private garden', 'BQ', '2 parking spaces'],
    location: 'Banana Island Road, Ikoyi',
  },
  {
    name: '2-Bedroom Flat in Victoria Island',
    price: '₦2.5M/year',
    type: 'Flat',
    bedrooms: 2,
    features: ['Sea view', 'Fitted kitchen', 'CCTV', 'Generator'],
    location: 'Adeola Odeku Street, VI',
  },
];

/**
 * Get or create demo conversation
 */
export function getOrCreateDemoConversation(phoneNumber: string): DemoConversation {
  if (!demoConversations.has(phoneNumber)) {
    demoConversations.set(phoneNumber, {
      phone_number: phoneNumber,
      message_count: 0,
      lead_captured: false,
      interested: null,
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      messages: [],
    });
  }
  return demoConversations.get(phoneNumber)!;
}

/**
 * Process demo message and generate response
 */
export async function processDemoMessage(
  phoneNumber: string,
  message: string
): Promise<{ response: string; shouldCaptureLead: boolean; isDemo: boolean }> {
  const conversation = getOrCreateDemoConversation(phoneNumber);
  
  // Add inbound message
  conversation.messages.push({
    direction: 'inbound',
    content: message,
    timestamp: new Date().toISOString(),
  });
  conversation.message_count++;
  conversation.last_message_at = new Date().toISOString();

  // Check if user responded to lead capture
  if (conversation.message_count >= DEMO_CONFIG.leadCaptureMessage) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('yes') || lowerMessage.includes('interested') || lowerMessage.includes('want')) {
      conversation.interested = true;
      await saveDemoLead(phoneNumber, conversation);
      
      const response = `🎉 Fantastic! I'll have someone from our team reach out to you within 24 hours to set up your AI assistant.

In the meantime, you can:
• Visit fixeraitech.com/realestate to learn more
• Start your free trial at fixeraitech.com/auth/signup

Thank you for trying our demo! 🙏`;
      
      conversation.messages.push({
        direction: 'outbound',
        content: response,
        timestamp: new Date().toISOString(),
      });
      
      return { response, shouldCaptureLead: true, isDemo: true };
    }
    
    if (lowerMessage.includes('no') || lowerMessage.includes('not interested')) {
      conversation.interested = false;
      
      const response = `No problem at all! 👋

If you change your mind or have questions later, feel free to message us anytime.

You can also visit fixeraitech.com to learn more about how AI can help your business.

Have a great day!`;
      
      conversation.messages.push({
        direction: 'outbound',
        content: response,
        timestamp: new Date().toISOString(),
      });
      
      return { response, shouldCaptureLead: false, isDemo: true };
    }
  }

  // Generate contextual response based on message count
  let response: string;
  
  if (conversation.message_count === 1) {
    response = generateFirstResponse(message);
  } else if (conversation.message_count === 2) {
    response = generateSecondResponse(message);
  } else if (conversation.message_count === 3) {
    response = generateThirdResponse(message);
  } else if (conversation.message_count === 4) {
    response = generateFourthResponse(message);
  } else if (conversation.message_count >= 5 && !conversation.lead_captured) {
    response = generateLeadCaptureResponse();
    conversation.lead_captured = true;
  } else {
    response = generateFollowUpResponse(message);
  }

  conversation.messages.push({
    direction: 'outbound',
    content: response,
    timestamp: new Date().toISOString(),
  });

  return { 
    response, 
    shouldCaptureLead: conversation.message_count >= DEMO_CONFIG.leadCaptureMessage,
    isDemo: conversation.message_count >= DEMO_CONFIG.leadCaptureMessage 
  };
}

/**
 * Generate first response - Property inquiry
 */
function generateFirstResponse(message: string): string {
  const property = DEMO_PROPERTIES[0];
  const lowerMessage = message.toLowerCase();
  
  // Check if asking about specific property
  if (lowerMessage.includes('3-bed') || lowerMessage.includes('3 bed') || lowerMessage.includes('lekki')) {
    return `Hi! 👋 Yes, the ${property.name} is available!

It's ${property.price}, fully serviced with:
✓ ${property.features.join('\n✓ ')}

Would you like to schedule a viewing? I have slots available tomorrow at 10 AM or 2 PM. 📅`;
  }
  
  if (lowerMessage.includes('4-bed') || lowerMessage.includes('4 bed') || lowerMessage.includes('ikoyi') || lowerMessage.includes('duplex')) {
    const duplex = DEMO_PROPERTIES[1];
    return `Hi! 👋 Yes, the ${duplex.name} is available!

It's ${duplex.price}, featuring:
✓ ${duplex.features.join('\n✓ ')}

This is one of our premium listings. Would you like to schedule a viewing? 📅`;
  }
  
  // Generic property inquiry
  return `Hi! 👋 Thanks for reaching out to Demo Miracle!

We have several properties available. Here are some highlights:

🏠 ${DEMO_PROPERTIES[0].name} - ${DEMO_PROPERTIES[0].price}
🏡 ${DEMO_PROPERTIES[1].name} - ${DEMO_PROPERTIES[1].price}
🏢 ${DEMO_PROPERTIES[2].name} - ${DEMO_PROPERTIES[2].price}

Which one interests you? Or tell me your requirements (budget, bedrooms, location) and I'll find the perfect match! 🔍`;
}

/**
 * Generate second response - Qualification
 */
function generateSecondResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('budget') || lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
    return `Great question! Our properties range from ₦2.5M to ₦8M per year.

To help you find the best fit:
• What's your preferred budget range?
• How many bedrooms do you need?
• Any preferred locations?

This helps me show you only relevant options! 🎯`;
  }
  
  if (lowerMessage.includes('view') || lowerMessage.includes('see') || lowerMessage.includes('visit') || lowerMessage.includes('tomorrow') || lowerMessage.includes('2 pm') || lowerMessage.includes('10 am')) {
    return `Perfect! ✅ I've noted your interest in scheduling a viewing.

📅 Available slots:
• Tomorrow: 10 AM, 2 PM, 4 PM
• Day after: 9 AM, 11 AM, 3 PM

Which time works best for you? I'll confirm immediately and send you the address! 📍`;
  }
  
  return `Thanks for the details! 

Based on what you've shared, I think you'd love our properties in Lekki and Victoria Island.

Quick questions to narrow it down:
1. Are you looking to rent or buy?
2. When are you looking to move in?

This helps me prioritize the best options for you! 🏠`;
}

/**
 * Generate third response - Booking
 */
function generateThirdResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('rent')) {
    return `Perfect, rental it is! 🏠

For rentals, we typically require:
• Valid ID
• Proof of income/employment
• 1 year rent + 1 year security deposit

Don't worry about paperwork now - let's first find you the perfect place!

Would you like to see the 3-bedroom in Lekki tomorrow? It's our most popular listing and gets a lot of interest. 🔥`;
  }
  
  if (lowerMessage.includes('2 pm') || lowerMessage.includes('2pm') || lowerMessage.includes('afternoon')) {
    return `Excellent choice! ✅ 

I've booked your viewing for **tomorrow at 2 PM**.

📍 Address: 15 Admiralty Way, Lekki Phase 1
👤 Our agent Sarah will meet you there
📱 She'll call 30 mins before to confirm

I'll send you a reminder 2 hours before the viewing!

Is there anything specific you'd like to know about the property before then? 🤔`;
  }
  
  return `Great! Let me book that for you.

Just to confirm:
📍 Property: 3-Bedroom Apartment, Lekki Phase 1
💰 Price: ₦3.5M/year
📅 Viewing: Tomorrow

What time works best? Morning (10 AM) or afternoon (2 PM)? ⏰`;
}

/**
 * Generate fourth response - Confirmation
 */
function generateFourthResponse(message: string): string {
  return `All set! ✅

📋 **Viewing Confirmed**
━━━━━━━━━━━━━━━━━━
🏠 3-Bedroom Apartment
📍 15 Admiralty Way, Lekki Phase 1
📅 Tomorrow at 2:00 PM
👤 Agent: Sarah (will call 30 mins before)
━━━━━━━━━━━━━━━━━━

I'll send you:
• A reminder 2 hours before
• Directions via Google Maps
• Sarah's contact number

Looking forward to helping you find your new home! 🏡

Anything else you'd like to know?`;
}

/**
 * Generate lead capture response - Reveal demo
 */
function generateLeadCaptureResponse(): string {
  return `🤖 **Quick confession time!**

I'm actually a demo of **SalesConcierge AI** - the same technology that just helped you explore properties and book a viewing at 2 AM!

Imagine having this for YOUR business:
✅ Instant responses 24/7
✅ Lead qualification on autopilot  
✅ Automatic appointment booking
✅ Never miss a lead again

**Want this AI working for your business?**

Reply **YES** and I'll have our team set you up, or visit:
🔗 fixeraitech.com/realestate

What do you think? 🚀`;
}

/**
 * Generate follow-up response
 */
function generateFollowUpResponse(message: string): string {
  return `I appreciate your continued interest! 

As a demo, I've shown you just a glimpse of what's possible. The full system includes:

• Custom training on YOUR properties/services
• Integration with your calendar
• Lead scoring and qualification
• Handoff to human agents when needed
• Full analytics dashboard

Ready to see how it works for your business?

Reply **YES** or visit fixeraitech.com/auth/signup to start your free trial! 🎯`;
}

/**
 * Save demo lead to database
 */
async function saveDemoLead(phoneNumber: string, conversation: DemoConversation): Promise<void> {
  try {
    await supabaseAdmin.from('demo_leads').insert({
      phone_number: phoneNumber,
      source: 'whatsapp_demo',
      interested: conversation.interested,
      message_count: conversation.message_count,
      conversation_summary: conversation.messages.slice(-5).map(m => 
        `${m.direction === 'inbound' ? 'User' : 'AI'}: ${m.content}`
      ).join('\n'),
      created_at: conversation.created_at,
      captured_at: new Date().toISOString(),
    });
    
    console.log(`[DemoBot] Lead captured: ${phoneNumber}`);
  } catch (error) {
    console.error('[DemoBot] Error saving lead:', error);
  }
}

/**
 * Check if a phone number is in demo mode
 */
export function isDemoConversation(tenantId: string): boolean {
  return tenantId === DEMO_CONFIG.demoTenantId || tenantId === 'demo';
}

/**
 * Get demo statistics
 */
export function getDemoStats(): {
  totalConversations: number;
  leadsCapture: number;
  interestedCount: number;
  conversionRate: number;
} {
  const conversations = Array.from(demoConversations.values());
  const leadsCapture = conversations.filter(c => c.lead_captured).length;
  const interestedCount = conversations.filter(c => c.interested === true).length;
  
  return {
    totalConversations: conversations.length,
    leadsCapture,
    interestedCount,
    conversionRate: leadsCapture > 0 ? (interestedCount / leadsCapture) * 100 : 0,
  };
}

/**
 * Reset demo conversation (for testing)
 */
export function resetDemoConversation(phoneNumber: string): void {
  demoConversations.delete(phoneNumber);
}
