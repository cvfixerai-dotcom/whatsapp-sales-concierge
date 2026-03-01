// Export all AI tools
export { updateLead } from './update-lead';
export { checkCalendar } from './check-calendar';
export { bookAppointment } from './book-appointment';
export { cancelAppointment } from './cancel-appointment';
export { sendEmail } from './send-email';
export { calculateLeadScore, getMessageCount, hasAppointment } from './calculate-score';

// Tool registry for dynamic execution
// NOTE: Do NOT include tenantId, contactId, conversationId in schemas.
// These are injected automatically by agent.ts executeTools().
export const AI_TOOLS = {
  update_lead: {
    name: 'update_lead',
    description: 'MUST call this tool whenever the customer reveals their name, email, budget, timeline, service interest, or any personal info. Updates the lead record and recalculates their score.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name if revealed' },
        email: { type: 'string', description: 'Customer email if revealed', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        temperature: { type: 'string', enum: ['hot', 'warm', 'cold', 'new'], description: 'Lead temperature based on buying signals' },
        timeline: { type: 'string', enum: ['urgent', 'this-week', 'this-month', 'exploring'], description: 'Purchase/service timeline' },
        budget_range: { type: 'string', description: 'Budget range if mentioned' },
        service_interest: { type: 'string', description: 'What service/product they are interested in' },
        notes: { type: 'string', description: 'Any additional qualifying info from the conversation' },
      },
      required: [],
      additionalProperties: false,
    },
    handler: 'updateLead',
  },

  check_calendar: {
    name: 'check_calendar',
    description: 'MANDATORY: Check available appointment/meeting slots. You MUST call this tool BEFORE offering any appointment times to the customer. NEVER make up times like "1pm, 2pm, 3pm" - always get real availability from this tool first.',
    parameters: {
      type: 'object',
      properties: {
        preferredDate: { type: 'string', description: 'Customer preferred date if mentioned (ISO format or natural language)' },
        preferredTime: { type: 'string', description: 'Customer preferred time if mentioned' },
        daysAhead: { type: 'number', description: 'Number of days to search ahead (default 7)', minimum: 1, maximum: 60 },
      },
      required: [],
      additionalProperties: false,
    },
    handler: 'checkCalendar',
  },

  book_appointment: {
    name: 'book_appointment',
    description: 'Book a confirmed appointment. Call this after the customer agrees to a specific time slot. CRITICAL: You must pass the EXACT datetime (ISO string) from check_calendar results - never construct or guess a datetime.',
    parameters: {
      type: 'object',
      properties: {
        slotTime: { type: 'string', description: 'The EXACT datetime ISO string from check_calendar results (e.g., "2026-03-02T14:00:00+04:00"). When customer says "2pm", find the slot from check_calendar with that time and use its datetime value.', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}' },
      },
      required: ['slotTime'],
      additionalProperties: false,
    },
    handler: 'bookAppointment',
  },

  cancel_appointment: {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment. Call this when the customer wants to cancel or reschedule their appointment.',
    parameters: {
      type: 'object',
      properties: {
        appointmentId: { type: 'string', description: 'Specific appointment ID to cancel (optional, will cancel most recent if not provided)' },
      },
      required: [],
      additionalProperties: false,
    },
    handler: 'cancelAppointment',
  },

  send_email: {
    name: 'send_email',
    description: 'Send information, brochures, or details to the customer via email. Requires their email address.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        template: { type: 'string', enum: ['property_details', 'service_info', 'pricing', 'booking_confirmation', 'follow_up'], description: 'Email template to use' },
        data: { type: 'object', description: 'Template data like property details, pricing, etc.', additionalProperties: true },
        language: { type: 'string', enum: ['en', 'ar'], description: 'Email language' },
      },
      required: ['to', 'template'],
      additionalProperties: false,
    },
    handler: 'sendEmail',
  },
};

// Tool execution handler — maps AI tool calls to actual handler functions
export async function executeTool(toolName: string, parameters: any, context?: any): Promise<any> {
  const tool = AI_TOOLS[toolName as keyof typeof AI_TOOLS];

  if (!tool) {
    console.warn(`[AI Tool] Unknown tool: ${toolName}`);
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // For update_lead, wrap params into the shape the handler expects
  let handlerParams = parameters;
  if (toolName === 'update_lead') {
    const { name, email, temperature, timeline, budget_range, service_interest, notes, ...rest } = parameters;
    handlerParams = {
      contactId: context?.contact?.id || parameters.contactId,
      updates: {
        ...(name && { name }),
        ...(email && { email }),
        ...(temperature && { temperature }),
        ...(timeline && { timeline }),
        ...(budget_range && { budget_range }),
        ...(service_interest && { service_interest }),
        ...(notes && { metadata: { ...(rest.metadata || {}), notes } }),
      },
    };
  }

  // Import the handler function
  const handlers = await import('./index');
  const handler = handlers[tool.handler as keyof typeof handlers];

  if (typeof handler !== 'function') {
    console.error(`[AI Tool] Handler not found: ${tool.handler}`);
    return { success: false, error: `Tool handler not found: ${tool.handler}` };
  }

  try {
    const result = await handler(handlerParams, context);
    console.log(`[AI Tool] ${toolName} executed successfully`, result?.success !== false ? '' : result?.error);
    return result;
  } catch (error) {
    console.error(`[AI Tool] ${toolName} execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get available tools for AI provider
export function getAvailableTools(provider: string = 'anthropic'): any[] {
  if (provider === 'anthropic') {
    // Anthropic format
    return Object.values(AI_TOOLS).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  } else {
    // OpenAI format with strict mode
    return Object.values(AI_TOOLS).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: false,
      },
    }));
  }
}
