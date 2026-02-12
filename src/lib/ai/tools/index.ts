// Export all AI tools
export { updateLead } from './update-lead';
export { checkCalendar } from './check-calendar';
export { bookAppointment } from './book-appointment';
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
        email: { type: 'string', description: 'Customer email if revealed' },
        temperature: { type: 'string', enum: ['hot', 'warm', 'cold', 'new'], description: 'Lead temperature based on buying signals' },
        timeline: { type: 'string', enum: ['urgent', 'this-week', 'this-month', 'exploring'], description: 'Purchase/service timeline' },
        budget_range: { type: 'string', description: 'Budget range if mentioned' },
        service_interest: { type: 'string', description: 'What service/product they are interested in' },
        notes: { type: 'string', description: 'Any additional qualifying info from the conversation' },
      },
      required: [],
    },
    handler: 'updateLead',
  },

  check_calendar: {
    name: 'check_calendar',
    description: 'Check available appointment/meeting slots. Call this when the customer wants to schedule a meeting, viewing, demo, or consultation.',
    parameters: {
      type: 'object',
      properties: {
        preferredDate: { type: 'string', description: 'Customer preferred date if mentioned (ISO format or natural language)' },
        preferredTime: { type: 'string', description: 'Customer preferred time if mentioned' },
      },
      required: [],
    },
    handler: 'checkCalendar',
  },

  book_appointment: {
    name: 'book_appointment',
    description: 'Book a confirmed appointment. Call this after the customer agrees to a specific time slot.',
    parameters: {
      type: 'object',
      properties: {
        slotTime: { type: 'string', description: 'The confirmed appointment time in ISO 8601 format' },
      },
      required: ['slotTime'],
    },
    handler: 'bookAppointment',
  },

  send_email: {
    name: 'send_email',
    description: 'Send information, brochures, or details to the customer via email. Requires their email address.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        template: { type: 'string', enum: ['property_details', 'service_info', 'pricing', 'booking_confirmation', 'follow_up'], description: 'Email template to use' },
        data: { type: 'object', description: 'Template data like property details, pricing, etc.' },
        language: { type: 'string', enum: ['en', 'ar'], description: 'Email language' },
      },
      required: ['to', 'template'],
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
    // OpenAI format
    return Object.values(AI_TOOLS).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
