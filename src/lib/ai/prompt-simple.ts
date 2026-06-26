// ═══════════════════════════════════════════════════════════════
// FIRST GREETING TEMPLATE
// Sent automatically without AI involvement
//
// NOTE: buildSimplifiedPrompt() (the old <1000-token state-machine prompt)
// was removed here as dead code — agent.ts now always builds its system
// prompt via buildEffectiveSystemPrompt()/buildSystemPrompt() from prompts.ts.
// getFirstGreeting() is still live (called from webhook/twilio/route.ts for
// the very first inbound message, before any AI call is made).
// ═══════════════════════════════════════════════════════════════
export function getFirstGreeting(
  greeting: string | null,
  companyName: string,
  assistantName: string,
  industryGreeting?: string | null
): string {
  // 1. Tenant's own explicit custom greeting (set in onboarding AI Config step)
  if (greeting && greeting.length > 10) {
    return greeting;
  }

  // 2. Industry-agent default greeting (from industry_agents.greeting_message,
  //    applied onto tenant.agent_config by applyIndustryAgent)
  if (industryGreeting && industryGreeting.length > 5) {
    return industryGreeting
      .replace(/\{\{company_name\}\}/g, companyName)
      .replace(/\{\{assistant_name\}\}/g, assistantName);
  }

  // 3. Hardcoded fallback
  return `Hi! I'm ${assistantName} from ${companyName} 👋 What brings you here today?`;
}
