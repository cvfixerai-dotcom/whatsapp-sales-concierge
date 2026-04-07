/**
 * Conversation State Manager
 * 
 * Determines the explicit state of a conversation so the AI knows
 * exactly what it should be doing, rather than guessing from a long prompt.
 */

export type ConversationState = 
  | 'first_greeting'      // First message - send tenant greeting, skip AI
  | 'needs_name'          // Have service interest, need name
  | 'qualifying'          // Have name, collecting budget/timeline/interest
  | 'ready_to_book'       // Qualified, should check calendar
  | 'offering_slots'      // Just offered slots, waiting for selection
  | 'post_booking'        // Just booked, ask for email
  | 'email_collected'     // Have email, booking complete
  | 'general_chat';       // Default state

interface StateCheckResult {
  state: ConversationState;
  context: string;
  allowedTools: string[];
  blockedTools: string[];
  promptAddendum: string;
}

export function determineConversationState(
  messageCount: number,
  contact: any,
  lastToolCalls: any[],
  hasRecentBooking: boolean
): StateCheckResult {
  const name = contact?.name;
  const email = contact?.email;
  const budget = contact?.budget_range;
  const timeline = contact?.timeline;
  const temperature = contact?.temperature;
  const serviceInterest = contact?.service_interest;

  // STATE 1: First message - greeting should be handled by code, not AI
  if (messageCount === 1) {
    return {
      state: 'first_greeting',
      context: 'FIRST_MESSAGE: Send the tenant\'s custom greeting directly. Do not ask for name yet.',
      allowedTools: [],
      blockedTools: ['check_calendar', 'book_appointment', 'cancel_appointment', 'update_lead'],
      promptAddendum: `This is the FIRST message. Your ONLY job is to send the welcome greeting.`,
    };
  }

  // STATE 2: Post-booking with email collected
  if (hasRecentBooking && email) {
    return {
      state: 'email_collected',
      context: 'POST_BOOKING_COMPLETE: Booking confirmed, email collected.',
      allowedTools: ['update_lead'],
      blockedTools: ['check_calendar', 'book_appointment', 'cancel_appointment'],
      promptAddendum: `BOOKING COMPLETE. Email: ${email}. Say warm goodbye only. Do NOT ask for email again.`,
    };
  }

  // STATE 3: Post-booking, need email
  if (hasRecentBooking && !email) {
    return {
      state: 'post_booking',
      context: 'POST_BOOKING: Just booked, need to collect email.',
      allowedTools: ['update_lead'],
      blockedTools: ['check_calendar', 'book_appointment', 'cancel_appointment'],
      promptAddendum: `POST-BOOKING STATE: Booking confirmed. ONLY ask: "To send you a confirmation, what's your email address?" Do NOT offer more slots.`,
    };
  }

  // STATE 4: Just offered slots, waiting for customer to pick
  const lastToolWasCalendar = lastToolCalls.length > 0 && 
    lastToolCalls[lastToolCalls.length - 1].name === 'check_calendar' &&
    lastToolCalls[lastToolCalls.length - 1].result?.success;

  if (lastToolWasCalendar) {
    return {
      state: 'offering_slots',
      context: 'SLOTS_OFFERED: Customer should pick a time from the offered slots.',
      allowedTools: ['book_appointment', 'update_lead'],
      blockedTools: ['check_calendar'],
      promptAddendum: `SLOTS OFFERED: Wait for customer to pick a time. When they say a time (e.g., "4:30pm"), call book_appointment immediately. Do NOT call check_calendar again.`,
    };
  }

  // STATE 5: Ready to book - have qualification
  if (name && (budget || timeline || serviceInterest)) {
    return {
      state: 'ready_to_book',
      context: 'QUALIFIED: Have name + qualification data, ready to check calendar.',
      allowedTools: ['check_calendar', 'update_lead'],
      blockedTools: ['book_appointment'],
      promptAddendum: `QUALIFIED: Name=${name}, Budget=${budget || 'unknown'}, Timeline=${timeline || 'unknown'}. Call check_calendar to offer available times.`,
    };
  }

  // STATE 6: Qualifying - have name, collecting data
  if (name) {
    return {
      state: 'qualifying',
      context: 'QUALIFYING: Have name, collecting budget/timeline/service.',
      allowedTools: ['update_lead'],
      blockedTools: ['check_calendar', 'book_appointment'],
      promptAddendum: `QUALIFYING: Name collected (${name}). Ask for budget, timeline, and service interest. Call update_lead after each answer.`,
    };
  }

  // STATE 7: Need name
  if (!name && serviceInterest) {
    return {
      state: 'needs_name',
      context: 'NEEDS_NAME: Have service interest, need customer name.',
      allowedTools: ['update_lead'],
      blockedTools: ['check_calendar', 'book_appointment'],
      promptAddendum: `NEED NAME: Service interest known. Ask "By the way, what's your name?" Call update_lead with name immediately.`,
    };
  }

  // Default: General chat
  return {
    state: 'general_chat',
    context: 'GENERAL: Default state, gather basic info.',
    allowedTools: ['update_lead', 'check_calendar'],
    blockedTools: [],
    promptAddendum: `Start by asking what they're looking for. Then get their name.`,
  };
}
