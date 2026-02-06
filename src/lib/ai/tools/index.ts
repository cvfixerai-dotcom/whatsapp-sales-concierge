// Export all AI tools
export { updateLead } from './update-lead';
export { checkCalendar } from './check-calendar';
export { bookAppointment } from './book-appointment';
export { sendEmail } from './send-email';
export { calculateLeadScore, getMessageCount, hasAppointment } from './calculate-score';

// Tool registry for dynamic execution
export const AI_TOOLS = {
  update_lead: {
    name: 'update_lead',
    description: 'Update lead information and recalculate score',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'Contact ID to update' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            temperature: { type: 'string' },
            timeline: { type: 'string' },
            budget_range: { type: 'string' },
            service_interest: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
      },
      required: ['contactId', 'updates'],
    },
    handler: 'updateLead',
  },
  
  check_calendar: {
    name: 'check_calendar',
    description: 'Check available appointment slots',
    parameters: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID' },
        preferredDate: { type: 'string', description: 'Preferred date (optional)' },
      },
      required: ['tenantId'],
    },
    handler: 'checkCalendar',
  },
  
  book_appointment: {
    name: 'book_appointment',
    description: 'Book an appointment',
    parameters: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant ID' },
        contactId: { type: 'string', description: 'Contact ID' },
        conversationId: { type: 'string', description: 'Conversation ID' },
        slotTime: { type: 'string', description: 'Appointment slot time' },
      },
      required: ['tenantId', 'contactId', 'conversationId', 'slotTime'],
    },
    handler: 'bookAppointment',
  },
  
  send_email: {
    name: 'send_email',
    description: 'Send email to contact',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email' },
        template: { type: 'string', description: 'Email template' },
        data: { type: 'object', description: 'Template data' },
        language: { type: 'string', description: 'Language (en/ar)' },
      },
      required: ['to', 'template', 'data'],
    },
    handler: 'sendEmail',
  },
  
  calculate_score: {
    name: 'calculate_score',
    description: 'Calculate lead score',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'Contact ID' },
      },
      required: ['contactId'],
    },
    handler: 'calculateLeadScore',
  },
};

// Tool execution handler
export async function executeTool(toolName: string, parameters: any, context?: any): Promise<any> {
  const tool = AI_TOOLS[toolName as keyof typeof AI_TOOLS];
  
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  
  // Import the handler function
  const handlers = await import('./index');
  const handler = handlers[tool.handler as keyof typeof handlers];
  
  if (typeof handler !== 'function') {
    throw new Error(`Tool handler not found: ${tool.handler}`);
  }
  
  // Execute the tool
  try {
    const result = await handler(parameters, context);
    
    // Log tool execution
    console.log(`[AI Tool] ${toolName} executed successfully`);
    
    return result;
  } catch (error) {
    console.error(`[AI Tool] ${toolName} execution failed:`, error);
    
    // Return error in consistent format
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
