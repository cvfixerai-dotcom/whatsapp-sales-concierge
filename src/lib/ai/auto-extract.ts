import { supabaseAdmin } from '../db/client';

interface ExtractionResult {
  email?: string;
  phone?: string;
  name?: string;
  hasChanges: boolean;
}

/**
 * Auto-extract critical contact information from user messages
 * This acts as a safety net when AI fails to call update_lead
 */
export async function autoExtractAndSave(
  contactId: string,
  messageContent: string,
  existingContact: any
): Promise<ExtractionResult> {
  const result: ExtractionResult = { hasChanges: false };
  const updates: Record<string, any> = {};

  // Extract email
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi;
  const emailMatch = messageContent.match(emailRegex);
  if (emailMatch && emailMatch[0]) {
    const extractedEmail = emailMatch[0].toLowerCase();
    if (!existingContact.email || existingContact.email.includes('@wa.placeholder')) {
      result.email = extractedEmail;
      updates.email = extractedEmail;
      result.hasChanges = true;
      console.log(`[Auto-Extract] Email found: ${extractedEmail}`);
    }
  }

  // Extract phone number (basic patterns)
  const phoneRegex = /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const phoneMatch = messageContent.match(phoneRegex);
  if (phoneMatch && phoneMatch[0]) {
    const extractedPhone = phoneMatch[0].replace(/[\s\-()]/g, '');
    if (extractedPhone.length >= 8 && !existingContact.phone) {
      result.phone = extractedPhone;
      updates.phone = extractedPhone;
      result.hasChanges = true;
      console.log(`[Auto-Extract] Phone found: ${extractedPhone}`);
    }
  }

  // Extract name (heuristics - look for "I am [Name]" or "My name is [Name]")
  const namePatterns = [
    /(?:i am|i'm|my name is|name is|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/m, // Single capitalized word or two
  ];
  
  for (const pattern of namePatterns) {
    const nameMatch = messageContent.match(pattern);
    if (nameMatch && nameMatch[1]) {
      const extractedName = nameMatch[1].trim();
      // Skip common false positives
      const falsePositives = ['Hello', 'Hi', 'Hey', 'Thanks', 'Yes', 'No', 'Ok', 'Okay', 'Sure'];
      if (!falsePositives.includes(extractedName) && (!existingContact.name || existingContact.name === 'unknown')) {
        result.name = extractedName;
        updates.name = extractedName;
        result.hasChanges = true;
        console.log(`[Auto-Extract] Name found: ${extractedName}`);
        break;
      }
    }
  }

  // Save updates to database if any changes detected
  if (result.hasChanges) {
    console.log(`[Auto-Extract] Saving updates for contact ${contactId}:`, updates);
    
    try {
      const { error } = await supabaseAdmin
        .from('contacts')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      if (error) {
        console.error('[Auto-Extract] Failed to save updates:', error);
      } else {
        console.log('[Auto-Extract] Successfully saved updates');
      }
    } catch (err) {
      console.error('[Auto-Extract] Unexpected error saving updates:', err);
    }
  } else {
    console.log('[Auto-Extract] No new information extracted from message');
  }

  return result;
}

/**
 * Extract budget hints from message content
 */
export function extractBudgetHints(messageContent: string): string | null {
  // Look for price patterns
  const pricePatterns = [
    /(?:budget|price|looking at|spend|afford)[^\d]*(?:AED|Dh|dirham)?\s*([\d,]+(?:\.\d{2})?)\s*(?:k|thousand|million|m)?/i,
    /(?:AED|Dh|dirham)\s*([\d,]+(?:\.\d{2})?)\s*(?:k|thousand|million|m)?/i,
  ];

  for (const pattern of pricePatterns) {
    const match = messageContent.match(pattern);
    if (match && match[1]) {
      let amount = parseFloat(match[1].replace(/,/g, ''));
      const text = messageContent.toLowerCase();
      
      // Apply multipliers
      if (text.includes('million') || text.includes('m ')) {
        amount *= 1_000_000;
      } else if (text.includes('thousand') || text.includes('k')) {
        amount *= 1_000;
      }

      // Categorize budget range
      if (amount < 600_000) return 'under-600k';
      if (amount < 1_000_000) return '600k-1m';
      if (amount < 3_000_000) return '1m-3m';
      if (amount < 5_000_000) return '3m-5m';
      return '5m+';
    }
  }

  return null;
}

/**
 * Extract timeline hints from message content
 */
export function extractTimelineHints(messageContent: string): string | null {
  const text = messageContent.toLowerCase();
  
  // Urgent patterns
  if (/(urgent|asap|immediately|today|this week|right now|very soon)/i.test(text)) {
    return 'urgent';
  }
  
  // This month patterns
  if (/(this month|within a month|30 days|next few weeks)/i.test(text)) {
    return 'this-month';
  }
  
  // 1-3 months
  if (/(next month|1-3 months|few months|2 months|3 months)/i.test(text)) {
    return '1-3-months';
  }
  
  // 3-6 months
  if (/(3-6 months|next quarter|4 months|5 months|6 months)/i.test(text)) {
    return '3-6-months';
  }
  
  // Just exploring
  if (/(just looking|exploring|researching|not sure|maybe|thinking about|considering)/i.test(text)) {
    return 'exploring';
  }

  return null;
}
