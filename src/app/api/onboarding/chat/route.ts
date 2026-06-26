/**
 * Onboarding Agent — conversational business-profile collection.
 *
 * This is the chat backend for the right-hand panel of the dual-panel
 * onboarding UI (src/app/onboarding/page.tsx, steps 0/2/3/4). It does NOT
 * replace /api/onboarding (which still owns step bookkeeping, Twilio setup,
 * and the `setup_completed` flag) — it's an additional, conversational way
 * to fill in the same tenant columns that the step forms write to.
 *
 * Two tool sets:
 *  1. Data-collection tools (update_business_profile, update_ai_preferences,
 *     set_business_hours, set_handoff_preferences) — write directly onto the
 *     `tenants` row the same columns /api/onboarding's step handlers write,
 *     so the left-hand live preview (subscribed via Supabase Realtime on
 *     `tenants`) updates immediately and the existing wizard step-completion
 *     logic in /api/onboarding's GET stays correct either way.
 *  2. generate_maya_config — the finishing move. Gathers everything collected
 *     so far, runs the nested "Prompt Architect" Claude call (using the
 *     matching industry_agents.prompt_generation_instructions as its system
 *     prompt), writes the resulting config onto tenants.agent_config /
 *     generated_prompt, and flips the EXISTING tenants.setup_completed flag
 *     to true — no new onboarding_complete flag is introduced.
 *
 * NOTE on Twilio (step 1): credential entry + the "Test Connection" call are
 * left on the existing form UI — there's nothing conversational about pasting
 * an Account SID, and the agent shouldn't be handling secrets. The dual-panel
 * chat experience covers steps 0 (business profile), 2 (AI config / focus),
 * 3 (availability), and 4 (handoff preferences).
 *
 * Chat history is kept client-side and replayed each turn (no new messages
 * table) — this is intentionally the simplest viable design for a v1 of a
 * scope that wasn't in the original onboarding system.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';
import { applyIndustryAgent, initializeTenantDefaults } from '@/lib/services/tenant-initializer';

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

// ─────────────────────────────────────────────────────────────────────────
// Tool definitions (Anthropic format)
// ─────────────────────────────────────────────────────────────────────────
const ONBOARDING_TOOLS = [
  {
    name: 'update_business_profile',
    description: 'Save business identity details as soon as the owner mentions them — company name, industry, what the business does, who its customers are, and what it sells. Call this incrementally; do not wait to have everything before saving.',
    input_schema: {
      type: 'object',
      properties: {
        company_name: { type: 'string' },
        business_type: {
          type: 'string',
          enum: ['ecommerce', 'saas', 'services', 'healthcare', 'real_estate', 'automotive', 'home_services', 'mortgage', 'dental', 'recruitment', 'education', 'hospitality', 'finance', 'other'],
          description: 'Closest matching industry category.',
        },
        business_description: { type: 'string' },
        target_audience: { type: 'string' },
        products_services: { type: 'string' },
        timezone: { type: 'string', description: 'IANA timezone, e.g. America/New_York, if mentioned' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'update_ai_preferences',
    description: "Save how the owner wants their AI assistant (Maya) to sound and what it should prioritize when qualifying leads — tone/personality, preferred greeting, and which qualification signals matter most (e.g. budget, timeline, urgency).",
    input_schema: {
      type: 'object',
      properties: {
        ai_personality: { type: 'string', enum: ['professional', 'friendly', 'casual'] },
        ai_greeting: { type: 'string', description: 'A first-message greeting in the owner\'s voice, if they gave one or you drafted one and they approved it' },
        qualification_priorities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered list of what matters most when qualifying a lead, e.g. ["budget", "timeline", "location"]',
        },
        agent_display_name: { type: 'string', description: 'What Maya should call the human team member leads get handed off to' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'set_business_hours',
    description: 'Save weekly availability once the owner tells you their hours (or confirms the default Mon–Sat 9–6 is fine).',
    input_schema: {
      type: 'object',
      properties: {
        business_hours: {
          type: 'object',
          description: 'Map of monday..sunday to { open, close, closed } e.g. {"monday":{"open":"09:00","close":"18:00","closed":false}}',
        },
      },
      required: ['business_hours'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_handoff_preferences',
    description: 'Save how the owner wants to be notified when Maya needs to hand a conversation off to a human.',
    input_schema: {
      type: 'object',
      properties: {
        channels: {
          type: 'object',
          properties: {
            dashboard: { type: 'boolean' },
            email: { type: 'boolean' },
            whatsapp: { type: 'boolean' },
          },
        },
        email: { type: 'string', description: 'Notification email, if email channel is enabled' },
        whatsapp: { type: 'string', description: 'Notification WhatsApp number, if that channel is enabled' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_maya_config',
    description: "Finalize setup. Call this ONLY once you have enough to work with — company name, industry, what they sell, and at least a sense of AI tone/qualification priorities. This generates Maya's final system prompt and completes onboarding, so don't call it prematurely.",
    input_schema: {
      type: 'object',
      properties: {
        ready_summary: { type: 'string', description: 'One sentence confirming what you collected, to show the owner before finishing.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

const ONBOARDING_SYSTEM_PROMPT = `You are the Onboarding Agent for a WhatsApp AI sales assistant product. You're having a short, warm conversation with a new business owner to set up their own AI sales assistant (nicknamed Maya).

YOUR JOB: collect, conversationally, the same information a setup form would ask for — business identity, what they sell, who buys it, how they want Maya to sound, what matters most when qualifying a lead, their availability, and how they want to be notified for handoffs.

RULES:
1. Ask ONE or two related questions at a time. Keep messages short (2-4 sentences).
2. The moment the owner gives you a piece of information, call the matching tool immediately (update_business_profile, update_ai_preferences, set_business_hours, set_handoff_preferences) — don't wait to batch it up. This is what makes their live preview update in real time, so call tools eagerly.
3. Don't ask about WhatsApp/Twilio credentials — that's handled in a separate step in this product, not by you.
4. Once you have: company name, an industry/category, what they sell, who their customers are, and a sense of tone/qualification priorities — you have enough. Don't drag the conversation out collecting every field; business hours and handoff preferences are nice-to-haves, default them sensibly (Mon-Sat 9-6, dashboard notifications) if the owner doesn't seem to want to go into detail.
5. When you're ready, briefly confirm what you've got, then call generate_maya_config. This is the finishing move — only call it once, and only when truly ready.
6. Never reveal you are an AI model or mention "Claude" or "Anthropic" — you're the Onboarding Agent for this product.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callClaude(opts: {
  system: string;
  messages: ChatMessage[] | any[];
  tools?: any[];
  maxTokens?: number;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens || 1024,
      system: opts.system,
      messages: opts.messages,
      ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools, tool_choice: { type: 'auto' } } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────
// Data-collection tool handlers — write onto the same tenants columns
// /api/onboarding's step handlers use.
// ─────────────────────────────────────────────────────────────────────────
async function handleToolCall(toolName: string, input: any, tenantId: string): Promise<any> {
  switch (toolName) {
    case 'update_business_profile': {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (input.company_name) updates.company_name = input.company_name;
      if (input.business_description) updates.business_description = input.business_description;
      if (input.target_audience) updates.target_audience = input.target_audience;
      if (input.products_services) updates.products_services = input.products_services;
      if (input.timezone) updates.timezone = input.timezone;

      if (input.business_type) {
        updates.business_type = input.business_type;
        // Same mapping as /api/onboarding's step-0 handler — kept in sync manually
        // since this is a second entry point onto the same column.
        const industryMap: Record<string, string> = {
          real_estate: 'real-estate', automotive: 'automotive',
          healthcare: 'medical', home_services: 'home-services',
          mortgage: 'mortgage', dental: 'dental', recruitment: 'recruitment',
        };
        updates.industry = industryMap[input.business_type] || 'other';
      }

      await supabaseAdmin.from('tenants').update(updates).eq('id', tenantId);

      // Apply the matching industry agent right away, same as step-0 in
      // /api/onboarding, so agent_config starts reflecting reality immediately
      // (generate_maya_config will refine it further at the end).
      if (updates.industry) {
        try {
          await applyIndustryAgent(tenantId, updates.industry);
        } catch (err) {
          console.error('[Onboarding Chat] applyIndustryAgent failed:', err);
        }
      }

      return { success: true, saved: Object.keys(updates).filter(k => k !== 'updated_at') };
    }

    case 'update_ai_preferences': {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (input.ai_personality) updates.ai_personality = input.ai_personality;
      if (input.ai_greeting) updates.ai_greeting = input.ai_greeting;
      if (input.agent_display_name) updates.agent_display_name = input.agent_display_name;
      if (input.qualification_priorities) {
        updates.onboarding_data = { qualification_priorities: input.qualification_priorities };
      }
      await supabaseAdmin.from('tenants').update(updates).eq('id', tenantId);
      return { success: true, saved: Object.keys(updates).filter(k => k !== 'updated_at') };
    }

    case 'set_business_hours': {
      await supabaseAdmin.from('tenants').update({
        business_hours: input.business_hours,
        updated_at: new Date().toISOString(),
      }).eq('id', tenantId);

      // Also sync availability_settings — the actual table the booking
      // system (check-calendar tool, calendar/inapp.ts) reads from. Without
      // this, real appointment availability stays stuck on the Mon-Sat 9-6
      // default written at signup, regardless of what the owner just said.
      try {
        const { data: tenant } = await supabaseAdmin
          .from('tenants').select('timezone, industry').eq('id', tenantId).single();
        await initializeTenantDefaults(tenantId, {
          timezone: tenant?.timezone || 'UTC',
          industry: tenant?.industry || 'other',
          businessHours: input.business_hours,
        });
      } catch (err) {
        console.error('[Onboarding Chat] Failed to sync availability_settings:', err);
      }

      return { success: true };
    }

    case 'set_handoff_preferences': {
      const { data: existing } = await supabaseAdmin
        .from('tenants').select('handoff_settings').eq('id', tenantId).single();
      const handoff_settings = {
        channels: { ...(existing?.handoff_settings?.channels || {}), ...(input.channels || {}) },
        recipients: {
          ...(existing?.handoff_settings?.recipients || {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
        },
      };
      await supabaseAdmin.from('tenants').update({
        handoff_settings,
        updated_at: new Date().toISOString(),
      }).eq('id', tenantId);
      return { success: true };
    }

    case 'generate_maya_config': {
      return await runPromptArchitect(tenantId);
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * The "Prompt Architect" — a nested Claude call that turns the collected
 * tenant data into a finished agent_config. Its system prompt comes from
 * industry_agents.prompt_generation_instructions for the tenant's matched
 * industry (falling back to 'other', same fallback rule as applyIndustryAgent).
 */
async function runPromptArchitect(tenantId: string): Promise<any> {
  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error || !tenant) {
    return { success: false, error: 'Could not load tenant data' };
  }

  const industry = tenant.industry || 'other';
  let { data: industryAgent } = await supabaseAdmin
    .from('industry_agents')
    .select('prompt_generation_instructions, agent_name, contact_fields, display_name')
    .eq('industry', industry)
    .eq('is_active', true)
    .single();

  if (!industryAgent) {
    const fallback = await supabaseAdmin
      .from('industry_agents')
      .select('prompt_generation_instructions, agent_name, contact_fields, display_name')
      .eq('industry', 'other')
      .eq('is_active', true)
      .single();
    industryAgent = fallback.data || null;
  }

  if (!industryAgent) {
    return { success: false, error: 'No industry_agents row available to generate from (not even "other")' };
  }

  const collectedData = {
    company_name: tenant.company_name,
    industry: tenant.industry,
    business_type: tenant.business_type,
    business_description: tenant.business_description,
    target_audience: tenant.target_audience,
    products_services: tenant.products_services,
    ai_personality: tenant.ai_personality,
    ai_greeting: tenant.ai_greeting,
    agent_display_name: tenant.agent_display_name,
    qualification_priorities: tenant.onboarding_data?.qualification_priorities,
    business_hours: tenant.business_hours,
    handoff_settings: tenant.handoff_settings,
  };

  let architectResponse;
  try {
    architectResponse = await callClaude({
      system: industryAgent.prompt_generation_instructions,
      messages: [{
        role: 'user',
        content: `Here is everything collected about this business during onboarding. Generate the final Maya configuration as a single JSON object with EXACTLY these keys: system_prompt, greeting_message, qualification_stages, lead_score_weights, handoff_triggers. Return ONLY the JSON object, no other text.\n\n${JSON.stringify(collectedData, null, 2)}`,
      }],
      maxTokens: 4096,
    });
  } catch (err) {
    console.error('[Prompt Architect] Claude call failed:', err);
    return { success: false, error: 'Prompt Architect call failed' };
  }

  const textBlock = (architectResponse.content || []).find((b: any) => b.type === 'text');
  if (!textBlock?.text) {
    return { success: false, error: 'Prompt Architect returned no text content' };
  }

  let generated: any;
  try {
    // Be lenient about the model wrapping JSON in a code fence.
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    generated = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text);
  } catch (err) {
    console.error('[Prompt Architect] Failed to parse JSON response:', textBlock.text);
    return { success: false, error: 'Prompt Architect returned invalid JSON' };
  }

  if (!generated.system_prompt) {
    return { success: false, error: 'Prompt Architect response missing system_prompt' };
  }

  const newAgentConfig = {
    ...(tenant.agent_config || {}),
    system_prompt: generated.system_prompt,
    greeting_message: generated.greeting_message || tenant.agent_config?.greeting_message,
    qualification_stages: generated.qualification_stages || tenant.agent_config?.qualification_stages || [],
    lead_score_weights: generated.lead_score_weights || tenant.agent_config?.lead_score_weights || {},
    handoff_triggers: generated.handoff_triggers || tenant.agent_config?.handoff_triggers || [],
    contact_fields: tenant.agent_config?.contact_fields || industryAgent.contact_fields || [],
    agent_name: tenant.agent_config?.agent_name || industryAgent.agent_name || 'Maya',
  };

  const { error: updateError } = await supabaseAdmin
    .from('tenants')
    .update({
      agent_config: newAgentConfig,
      generated_prompt: generated.system_prompt,
      // Reuse the EXISTING setup_completed flag as the single source of
      // truth for onboarding completion — no new onboarding_complete column.
      setup_completed: true,
      onboarding_completed: true,
      setup_completed_at: new Date().toISOString(),
      onboarding_step: 4,
    })
    .eq('id', tenantId);

  if (updateError) {
    console.error('[Prompt Architect] Failed to save generated config:', updateError);
    return { success: false, error: updateError.message };
  }

  await supabaseAdmin.from('onboarding_logs').insert({
    tenant_id: tenantId,
    step_name: 'maya_config_generated',
    step_number: 4,
    status: 'completed',
    data: { industry, generated_by: 'prompt_architect' },
    completed_at: new Date().toISOString(),
  });

  return { success: true, setup_completed: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const history: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

    if (history.length === 0) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 });
    }

    // The client seeds its local chat history with Maya's greeting as an
    // assistant-role message purely for display. Anthropic's Messages API
    // requires the first message in the array to have role 'user', so that
    // greeting must be stripped before replaying history to Claude — leaving
    // it in causes a 400 from Anthropic on every user's very first reply,
    // which surfaces to the chat UI as "Sorry, something went wrong."
    while (history.length > 0 && history[0].role !== 'user') {
      history.shift();
    }

    if (history.length === 0) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 });
    }

    // Anthropic-format running transcript for this turn.
    let claudeMessages: any[] = history.map(m => ({ role: m.role, content: m.content }));

    let response = await callClaude({
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: claudeMessages,
      tools: ONBOARDING_TOOLS,
    });

    let setupCompleted = false;
    const toolResultsLog: { name: string; result: any }[] = [];

    // Tool-call loop — execute any tool_use blocks, feed results back, repeat
    // until Claude responds with plain text (cap at 4 rounds as a safety net).
    let rounds = 0;
    while (response.stop_reason === 'tool_use' && rounds < 4) {
      rounds++;
      const toolUseBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use');
      const textBlocks = (response.content || []).filter((b: any) => b.type === 'text');

      claudeMessages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of toolUseBlocks) {
        const result = await handleToolCall(block.name, block.input, sessionUser.tenantId);
        toolResultsLog.push({ name: block.name, result });
        if (block.name === 'generate_maya_config' && result.success) {
          setupCompleted = true;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      claudeMessages.push({ role: 'user', content: toolResults });

      if (setupCompleted) break; // don't keep calling tools after onboarding is done

      response = await callClaude({
        system: ONBOARDING_SYSTEM_PROMPT,
        messages: claudeMessages,
        tools: ONBOARDING_TOOLS,
      });
    }

    const finalText = (response.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n') || (setupCompleted ? "All set! Your AI assistant is ready — taking you to your dashboard." : '');

    return NextResponse.json({
      message: finalText,
      toolCalls: toolResultsLog,
      setup_completed: setupCompleted,
    });
  } catch (error) {
    console.error('[Onboarding Chat] POST error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
