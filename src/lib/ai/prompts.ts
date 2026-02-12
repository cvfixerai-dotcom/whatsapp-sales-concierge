export interface PromptTemplate {
  industry: string;
  language: 'en' | 'ar';
  systemPrompt: string;
  qualificationCriteria: Record<string, { weight: number; required: boolean }>;
  bookingFlow: string[];
}

// ═══════════════════════════════════════════════════════════════
// CORE PROMPT — shared rules that ALL industry prompts inherit
// ═══════════════════════════════════════════════════════════════
const CORE_RULES = `
ABSOLUTE RULES (never break these):
1. You are a WhatsApp sales concierge. Keep EVERY message SHORT — max 2-3 sentences.
2. WhatsApp is NOT email. Never send walls of text, bullet lists of 5+ items, or long paragraphs.
3. Ask ONE question at a time. Never ask multiple questions in one message.
4. Your #1 goal is to BOOK AN APPOINTMENT or MEETING. Every reply should move toward that.
5. Be warm, human, and conversational — like texting a helpful friend, not a corporate bot.
6. Match the customer's language. If they write in Arabic, reply in Arabic.
7. Never reveal you are AI. You are a member of the {{company_name}} team.
8. Use emojis sparingly — max 1 per message.

TOOL USAGE (critical):
- ALWAYS call update_lead when the customer shares: name, email, budget, timeline, service interest, or any qualifying info.
- When the customer wants to meet/visit/consult → call check_calendar to get available slots.
- When they confirm a time → call book_appointment.
- If they share an email and want info → call send_email.
- Call tools IN ADDITION to your text response, not instead of it.

SALES METHODOLOGY:
1. GREET warmly (1 sentence) and ask what brought them here.
2. DISCOVER their need with ONE question at a time: What? When? Budget?
3. PRESENT a focused solution (1-2 sentences max) that matches their need.
4. CLOSE by offering a specific next step: "Want me to check available times this week?"
5. Never dump pricing lists, feature lists, or multiple options unprompted.
6. If they seem interested, suggest a meeting/call rather than explaining everything via chat.
`;

// ═══════════════════════════════════════════════════════════════
// INDUSTRY-SPECIFIC PROMPTS
// ═══════════════════════════════════════════════════════════════

const INDUSTRY_CONTEXT: Record<string, string> = {
  'real-estate': `
INDUSTRY: Real Estate
YOUR ROLE: Property consultant for {{company_name}}.
QUALIFYING QUESTIONS (ask one at a time over multiple messages):
- What type of property? (apartment/villa/office/land)
- Which area or neighborhood?
- What's your budget range?
- When are you looking to move/invest? (this month / 3 months / exploring)
CLOSING MOVE: Offer a property viewing or consultation meeting.
`,

  'automotive': `
INDUSTRY: Automotive
YOUR ROLE: Vehicle sales advisor for {{company_name}}.
QUALIFYING QUESTIONS (ask one at a time over multiple messages):
- What type of vehicle are you looking for?
- New or pre-owned?
- What's your budget range?
- When do you need it? (urgent / this month / researching)
CLOSING MOVE: Offer a test drive or dealership visit.
`,

  'home-services': `
INDUSTRY: Home Services
YOUR ROLE: Service coordinator for {{company_name}}.
QUALIFYING QUESTIONS (ask one at a time over multiple messages):
- What service do you need?
- Is this urgent or can it wait?
- Where is the property located?
- Have you gotten other quotes?
CLOSING MOVE: Offer to schedule a technician visit or site inspection.
`,

  'medical': `
INDUSTRY: Medical / Healthcare
YOUR ROLE: Patient coordinator for {{company_name}}.
QUALIFYING QUESTIONS (ask one at a time over multiple messages):
- What type of appointment are you looking for?
- Is this urgent or routine?
- Do you have a preferred doctor/specialist?
- Do you have insurance?
IMPORTANT: Never diagnose or give medical advice. Focus on scheduling.
CLOSING MOVE: Offer to book an appointment.
`,

  'other': `
INDUSTRY: General Business
YOUR ROLE: Sales consultant for {{company_name}}.
QUALIFYING QUESTIONS (ask one at a time over multiple messages):
- What are you looking for today?
- What's your timeline?
- What's your budget range?
- Have you worked with similar services before?
CLOSING MOVE: Offer a consultation call or meeting.
`,
};

function getIndustryContext(industry: string): string {
  return INDUSTRY_CONTEXT[industry] || INDUSTRY_CONTEXT['other'];
}

// Build the full system prompt from tenant data
function buildFullPrompt(industry: string, companyName: string, services: any, businessHours: any, faqs: any, contact: any, conversationHistory: string, customPrompt?: string): string {
  const industryCtx = getIndustryContext(industry);

  // If tenant has a custom prompt, use it as the primary instruction
  const customSection = customPrompt
    ? `\nCUSTOM INSTRUCTIONS FROM BUSINESS OWNER (follow these closely):\n${customPrompt}\n`
    : '';

  const servicesText = Array.isArray(services) && services.length > 0
    ? `\nSERVICES OFFERED: ${services.map((s: any) => typeof s === 'string' ? s : s.name || s.title || JSON.stringify(s)).join(', ')}`
    : '';

  const faqsText = Array.isArray(faqs) && faqs.length > 0
    ? `\nFAQs:\n${faqs.slice(0, 10).map((f: any) => `Q: ${f.question || f.q}\nA: ${f.answer || f.a}`).join('\n')}`
    : '';

  const hoursText = businessHours && Object.keys(businessHours).length > 0
    ? `\nBUSINESS HOURS: ${JSON.stringify(businessHours)}`
    : '';

  return `You are the WhatsApp sales concierge for ${companyName}.
${CORE_RULES.replace(/\{\{company_name\}\}/g, companyName)}
${industryCtx.replace(/\{\{company_name\}\}/g, companyName)}
${customSection}
${servicesText}
${faqsText}
${hoursText}

CURRENT LEAD STATUS:
- Temperature: ${contact.temperature || 'new'}
- Score: ${contact.lead_score || 0}/100
- Timeline: ${contact.timeline || 'unknown'}
- Budget: ${contact.budget_range || 'unknown'}
- Name: ${contact.name || 'unknown'}

RECENT CONVERSATION:
${conversationHistory || 'This is the first message from this customer.'}
`.trim();
}

// ═══════════════════════════════════════════════════════════════
// LEGACY-compatible PromptTemplate array (for backward compat)
// ═══════════════════════════════════════════════════════════════
const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    industry: 'real-estate',
    language: 'en',
    systemPrompt: '', // Now built dynamically
    qualificationCriteria: {
      budget: { weight: 0.3, required: true },
      timeline: { weight: 0.25, required: true },
      location: { weight: 0.2, required: true },
      decision_maker: { weight: 0.25, required: false }
    },
    bookingFlow: ['qualify_need', 'qualify_budget', 'qualify_timeline', 'offer_viewing', 'book_appointment']
  },
  {
    industry: 'automotive',
    language: 'en',
    systemPrompt: '',
    qualificationCriteria: {
      budget: { weight: 0.3, required: true },
      vehicle_type: { weight: 0.25, required: true },
      timeline: { weight: 0.25, required: true },
      financing: { weight: 0.2, required: false }
    },
    bookingFlow: ['qualify_vehicle', 'qualify_budget', 'qualify_timeline', 'offer_test_drive', 'book_appointment']
  },
  {
    industry: 'home-services',
    language: 'en',
    systemPrompt: '',
    qualificationCriteria: {
      service_type: { weight: 0.35, required: true },
      urgency: { weight: 0.3, required: true },
      location: { weight: 0.25, required: true },
      budget: { weight: 0.1, required: false }
    },
    bookingFlow: ['identify_issue', 'assess_urgency', 'provide_quote', 'offer_appointment', 'book_service']
  },
  {
    industry: 'medical',
    language: 'en',
    systemPrompt: '',
    qualificationCriteria: {
      medical_need: { weight: 0.35, required: true },
      urgency: { weight: 0.3, required: true },
      specialty: { weight: 0.25, required: true },
      insurance: { weight: 0.1, required: false }
    },
    bookingFlow: ['assess_need', 'determine_urgency', 'match_specialty', 'offer_appointment', 'book_appointment']
  },
  {
    industry: 'other',
    language: 'en',
    systemPrompt: '',
    qualificationCriteria: {
      need: { weight: 0.3, required: true },
      budget: { weight: 0.25, required: true },
      timeline: { weight: 0.25, required: true },
      decision_maker: { weight: 0.2, required: false }
    },
    bookingFlow: ['qualify_need', 'qualify_budget', 'qualify_timeline', 'offer_meeting', 'book_appointment']
  },
];

export function getPromptTemplate(industry: string, _language: string): PromptTemplate {
  return PROMPT_TEMPLATES.find(t => t.industry === industry)
    || PROMPT_TEMPLATES.find(t => t.industry === 'other')!;
}

export function buildSystemPrompt(
  tenant: any,
  contact: any,
  language: string,
  conversationHistory?: string
): string {
  return buildFullPrompt(
    tenant.industry || 'other',
    tenant.company_name || 'Our Company',
    tenant.services || [],
    tenant.business_hours || {},
    tenant.faqs || [],
    contact,
    conversationHistory || '',
    tenant.ai_system_prompt || undefined
  );
}

export function getQualificationCriteria(industry: string): Record<string, { weight: number; required: boolean }> {
  const template = getPromptTemplate(industry, 'en');
  return template.qualificationCriteria;
}

export function getBookingFlow(industry: string): string[] {
  const template = getPromptTemplate(industry, 'en');
  return template.bookingFlow;
}

// Helper function to calculate lead score based on criteria
export function calculateLeadScore(
  industry: string,
  responses: Record<string, any>
): { score: number; missingRequired: string[] } {
  const criteria = getQualificationCriteria(industry);
  let score = 0;
  let totalWeight = 0;
  const missingRequired: string[] = [];
  
  for (const [key, { weight, required }] of Object.entries(criteria)) {
    totalWeight += weight;
    
    if (responses[key] !== undefined && responses[key] !== null && responses[key] !== '') {
      score += weight;
    } else if (required) {
      missingRequired.push(key);
    }
  }
  
  const finalScore = totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;
  return { score: finalScore, missingRequired };
}
