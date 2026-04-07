// ═══════════════════════════════════════════════════════════════
// SIMPLIFIED SYSTEM PROMPT (Under 1000 tokens)
// Designed for Claude Sonnet 4 with explicit state management
// ═══════════════════════════════════════════════════════════════

export function buildSimplifiedPrompt(
  companyName: string,
  assistantName: string,
  industry: string,
  stateAddendum: string,  // Injected by state manager
  contact: any,
  conversationHistory: string
): string {
  const name = contact?.name || 'unknown';
  const email = contact?.email || 'not collected';
  const budget = contact?.budget_range || 'unknown';
  const timeline = contact?.timeline || 'unknown';
  const temperature = contact?.temperature || 'new';
  const service = contact?.service_interest || 'unknown';

  return `You are ${assistantName} from ${companyName}. Be warm, professional, and direct.

YOUR GOAL: Book appointments and collect customer information.

CURRENT CUSTOMER STATUS:
- Name: ${name}
- Email: ${email}
- Budget: ${budget}
- Timeline: ${timeline}
- Service Interest: ${service}
- Temperature: ${temperature}

${stateAddendum}

RULES:
1. Keep messages to 1-2 sentences max
2. Ask ONE question at a time
3. Call update_lead IMMEDIATELY when customer gives: name, email, budget, timeline, service interest
4. Call check_calendar ONLY when ready to book (have name + qualification)
5. Call book_appointment ONLY when customer confirms a specific time
6. NEVER save location names (Marina, Downtown) as the customer's name
7. NEVER send confirmations yourself - the system handles it

RECENT CONVERSATION:
${conversationHistory || 'First message.'}
`;
}

// ═══════════════════════════════════════════════════════════════
// FIRST GREETING TEMPLATE
// Sent automatically without AI involvement
// ═══════════════════════════════════════════════════════════════
export function getFirstGreeting(
  greeting: string | null,
  companyName: string,
  assistantName: string
): string {
  // Use tenant's custom greeting if available
  if (greeting && greeting.length > 10) {
    return greeting;
  }
  
  // Fallback greeting
  return `Hi! I'm ${assistantName} from ${companyName} 👋 What brings you here today?`;
}
