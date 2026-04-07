import { supabaseAdmin } from '../../db/client';

interface Contact {
  id: string;
  name?: string;
  email?: string;
  temperature?: string;
  timeline?: string;
  budget_range?: string;
  service_interest?: string;
  lead_score?: number;
  qualification_status?: string;
}

export async function calculateLeadScore(contact: Contact): Promise<number> {
  try {
    console.log(`[Tool: calculateScore] Calculating score for contact ${contact.id}`);

    let score = 0;

    // Has email: +10
    if (contact.email && contact.email.includes('@')) {
      score += 10;
      console.log('[Tool: calculateScore] +10 for email');
    }

    // Has name: +10
    if (contact.name && contact.name.trim().length > 0) {
      score += 10;
      console.log('[Tool: calculateScore] +10 for name');
    }

    // Budget confirmed: +25
    if (contact.budget_range && contact.budget_range !== 'unknown' && contact.budget_range !== '') {
      score += 25;
      console.log('[Tool: calculateScore] +25 for budget range');
    }

    // Timeline scoring
    if (contact.timeline) {
      switch (contact.timeline) {
        case 'urgent':
          score += 20;
          console.log('[Tool: calculateScore] +20 for urgent timeline');
          break;
        case 'this-week':
          score += 15;
          console.log('[Tool: calculateScore] +15 for this-week timeline');
          break;
        case 'this-month':
          score += 10;
          console.log('[Tool: calculateScore] +10 for this-month timeline');
          break;
        case 'exploring':
          score += 5;
          console.log('[Tool: calculateScore] +5 for exploring timeline');
          break;
      }
    }

    // Service interest: +15
    if (contact.service_interest && contact.service_interest !== '') {
      score += 15;
      console.log('[Tool: calculateScore] +15 for service interest');
    }

    // Temperature scoring
    if (contact.temperature) {
      switch (contact.temperature) {
        case 'hot':
          score += 20;
          console.log('[Tool: calculateScore] +20 for hot temperature');
          break;
        case 'warm':
          score += 10;
          console.log('[Tool: calculateScore] +10 for warm temperature');
          break;
        case 'cold':
          score += 0;
          console.log('[Tool: calculateScore] +0 for cold temperature');
          break;
      }
    }

    // Response rate (message count): +10
    try {
      const { count } = await supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contact.id);

      const messageCount = count || 0;
      if (messageCount >= 5) {
        score += 10;
        console.log('[Tool: calculateScore] +10 for message count >= 5');
      } else if (messageCount >= 3) {
        score += 5;
        console.log('[Tool: calculateScore] +5 for message count >= 3');
      }
    } catch (error) {
      console.error('[Tool: calculateScore] Error fetching message count:', error);
    }

    // Appointment booked: +20
    try {
      const { data: appointment } = await supabaseAdmin
        .from('appointments')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('status', 'scheduled')
        .single();

      if (appointment) {
        score += 20;
        console.log('[Tool: calculateScore] +20 for booked appointment');
      }
    } catch (error) {
      // No appointment found, which is fine
    }

    // Ensure score is within bounds
    const finalScore = Math.min(Math.max(score, 0), 100);

    console.log(`[Tool: calculateScore] Final score: ${finalScore}`);

    return finalScore;
  } catch (error) {
    console.error('[Tool: calculateScore] Unexpected error:', error);
    // Return a default score if calculation fails
    return contact.lead_score || 0;
  }
}

// Helper function to get message count
async function getMessageCount(contactId: string): Promise<number> {
  try {
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('contact_id', contactId);

    return count || 0;
  } catch (error) {
    console.error('[Tool: calculateScore] Error getting message count:', error);
    return 0;
  }
}

// Helper function to check if contact has appointment
async function hasAppointment(contactId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('contact_id', contactId)
      .eq('status', 'scheduled')
      .single();

    return !!data;
  } catch (error) {
    return false;
  }
}

// Export helper functions for use in other tools
export { getMessageCount, hasAppointment };
