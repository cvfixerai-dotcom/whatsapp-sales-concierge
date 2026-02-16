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
  flow: 'demo' | 'discovery';
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
    name: '3-Bed Villa in Dubai Marina',
    price: 'AED 3.2M',
    type: 'Villa',
    bedrooms: 3,
    features: ['Direct sea view', 'Private balcony', 'Swimming pool & gym', '24/7 security & concierge'],
    location: 'Marina Walk, Dubai Marina',
  },
  {
    name: '4-Bed Penthouse in Palm Jumeirah',
    price: 'AED 8.5M',
    type: 'Penthouse',
    bedrooms: 4,
    features: ['Full sea view', 'Private pool', 'Smart home system', '3 parking spaces'],
    location: 'Shoreline Apartments, Palm Jumeirah',
  },
  {
    name: '2-Bed Apartment in Downtown Dubai',
    price: 'AED 1.8M',
    type: 'Apartment',
    bedrooms: 2,
    features: ['Burj Khalifa view', 'Fitted kitchen', 'Gym & pool', 'Walking distance to Dubai Mall'],
    location: 'Boulevard Point, Downtown Dubai',
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
      flow: 'demo',
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

  // Detect discovery call intent on first message
  if (conversation.message_count === 1) {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('discovery call') || lowerMsg.includes('book a call') || lowerMsg.includes('booked a discovery') || lowerMsg.includes('how the ai assistant works for my business') || lowerMsg.includes('for my business')) {
      conversation.flow = 'discovery';
    }
  }

  // Generate contextual response based on flow and message count
  let response: string;

  if (conversation.flow === 'discovery') {
    response = generateDiscoveryResponse(conversation, message);
  } else if (conversation.message_count === 1) {
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
  if (lowerMessage.includes('3-bed') || lowerMessage.includes('3 bed') || lowerMessage.includes('marina') || lowerMessage.includes('villa')) {
    return `Hi! 👋 Yes, the ${property.name} is available!

It's ${property.price}, 2,800 sq ft with:
✓ ${property.features.join('\n✓ ')}

Would you like to schedule a viewing? I have slots available tomorrow at 10 AM or 2 PM. 📅`;
  }
  
  if (lowerMessage.includes('4-bed') || lowerMessage.includes('4 bed') || lowerMessage.includes('palm') || lowerMessage.includes('penthouse')) {
    const penthouse = DEMO_PROPERTIES[1];
    return `Hi! 👋 Yes, the ${penthouse.name} is available!

It's ${penthouse.price}, featuring:
✓ ${penthouse.features.join('\n✓ ')}

This is one of our premium listings. Would you like to schedule a viewing? 📅`;
  }
  
  // Generic property inquiry
  return `Hi! 👋 Thanks for reaching out to Dubai Properties AI!

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
    return `Great question! Our properties range from AED 1.8M to AED 8.5M.

To help you find the best fit:
• What's your preferred budget range?
• How many bedrooms do you need?
• Any preferred areas? (Marina, Downtown, Palm, JBR)

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

Based on what you've shared, I think you'd love our properties in Dubai Marina and Downtown.

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

For rentals in Dubai, we typically require:
• Valid Emirates ID or passport
• Proof of income/employment
• 1-4 cheques (depending on the landlord)

Don't worry about paperwork now - let's first find you the perfect place!

Would you like to see the 3-bed villa in Dubai Marina tomorrow? It's our most popular listing and gets a lot of interest. 🔥`;
  }
  
  if (lowerMessage.includes('2 pm') || lowerMessage.includes('2pm') || lowerMessage.includes('afternoon')) {
    return `Excellent choice! ✅ 

I've booked your viewing for **tomorrow at 2 PM**.

📍 Address: Marina Walk, Dubai Marina
👤 Our agent Sarah will meet you there
📱 She'll call 30 mins before to confirm

I'll send you a reminder 2 hours before the viewing!

Is there anything specific you'd like to know about the property before then? 🤔`;
  }
  
  return `Great! Let me book that for you.

Just to confirm:
📍 Property: 3-Bed Villa, Dubai Marina
💰 Price: AED 3.2M
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
🏠 3-Bed Villa, Dubai Marina
📍 Marina Walk, Dubai Marina
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
 * Generate discovery call flow responses
 */
function generateDiscoveryResponse(conversation: DemoConversation, message: string): string {
  const count = conversation.message_count;
  const lowerMsg = message.toLowerCase();

  // Extract name from first message if present
  const nameMatch = message.match(/My name is ([^.]+?)(?:\s+from|\.|$)/i);
  const agencyMatch = message.match(/from ([^.]+?)(?:\.|I'd|$)/i);

  if (count === 1) {
    const greeting = nameMatch ? `Hi ${nameMatch[1].trim()}! ` : 'Hi there! ';
    const agencyNote = agencyMatch ? `Great to hear from ${agencyMatch[1].trim()}. ` : '';
    return `${greeting}👋 Thanks for booking a discovery call!

${agencyNote}I'm the AI assistant that could be working for your business 24/7. Let me show you what I can do while we get your call set up.

Quick question — how many WhatsApp property inquiries does your team get per week on average?

1️⃣ Less than 20
2️⃣ 20-50
3️⃣ 50-100
4️⃣ More than 100`;
  }

  if (count === 2) {
    return `Got it! That's exactly the kind of volume where our AI makes the biggest impact.

And how quickly does your team usually respond to new WhatsApp inquiries?

⚡ Under 5 minutes
⏱️ 5-30 minutes
🕐 1-4 hours
😴 Next business day`;
  }

  if (count === 3) {
    return `Thanks for sharing! Here's what we typically see with teams like yours:

📊 **Your Potential Results:**
• Instant response time (4 seconds vs hours)
• 3x more viewings booked automatically
• Zero missed leads — even at 2 AM
• Your agents focus only on hot, qualified leads

Let's get your discovery call booked! 📅

What works better for you?

1️⃣ Tomorrow morning (10 AM GST)
2️⃣ Tomorrow afternoon (2 PM GST)
3️⃣ Day after tomorrow (10 AM GST)
4️⃣ Suggest another time`;
  }

  if (count === 4) {
    let timeSlot = 'your preferred time';
    if (lowerMsg.includes('1') || lowerMsg.includes('morning') || lowerMsg.includes('10')) {
      timeSlot = 'tomorrow at 10 AM GST';
    } else if (lowerMsg.includes('2') || lowerMsg.includes('afternoon') || lowerMsg.includes('2 pm')) {
      timeSlot = 'tomorrow at 2 PM GST';
    } else if (lowerMsg.includes('3') || lowerMsg.includes('day after')) {
      timeSlot = 'day after tomorrow at 10 AM GST';
    }

    conversation.lead_captured = true;
    conversation.interested = true;
    saveDemoLead(conversation.phone_number, conversation);

    return `Excellent! ✅ **Discovery Call Confirmed!**

━━━━━━━━━━━━━━━━━━
📅 ${timeSlot}
⏱️ 15 minutes
👤 With our team
📍 Via this WhatsApp chat or Zoom
━━━━━━━━━━━━━━━━━━

During the call we'll:
✅ Show you a live demo customized to your properties
✅ Set up your AI assistant in 15 minutes
✅ Answer any questions

In the meantime, feel free to test the property demo — just ask about any property in Dubai! 🏠

See you soon! 🚀`;
  }

  // After booking, switch to property demo mode for exploration
  return generateFirstResponse(message);
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
