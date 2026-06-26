import { supabaseAdmin } from '../../db/client';
import { calculateLeadScore } from '../prompts';
import { calculateWeightedLeadScore } from '../lead-scoring';
import { scheduleFollowUps, cancelFollowUps } from '../../services/followup-scheduler';
import { sendEmail } from './send-email';

interface UpdateLeadParams {
  contactId: string;
  updates: {
    name?: string;
    email?: string;
    temperature?: string;
    timeline?: string;
    budget_range?: string;
    service_interest?: string;
    needs_human?: boolean;
    needs_followup?: boolean;
    metadata?: Record<string, any>;
  };
}

export async function updateLead({ contactId, updates }: UpdateLeadParams): Promise<{
  success: boolean;
  newScore?: number;
  error?: string;
  contact?: any;
}> {
  try {
    console.log(`[Tool: updateLead] ✅ CALLED - Updating contact ${contactId}`);
    console.log(`[Tool: updateLead] Updates:`, JSON.stringify(updates, null, 2));

    // Validate contact exists
    const { data: existingContact, error: fetchError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (fetchError || !existingContact) {
      console.error('[Tool: updateLead] ❌ FAILED - Contact not found:', contactId);
      return {
        success: false,
        error: 'Contact not found',
      };
    }

    console.log('[Tool: updateLead] Existing contact data:', {
      name: existingContact.name,
      email: existingContact.email,
      temperature: existingContact.temperature,
      budget_range: existingContact.budget_range,
      timeline: existingContact.timeline,
    });

    // Validate name - reject locations/property types being saved as names
    if (updates.name) {
      const invalidNamePatterns = [
        'marina', 'downtown', 'jlt', 'palm', 'jumeirah', 'dubai', 'abu dhabi',
        'apartment', 'villa', 'studio', 'office', 'townhouse', 'penthouse',
        '1br', '2br', '3br', '4br', '5br', '1 bedroom', '2 bedroom', '3 bedroom',
        'bedroom', 'bhk', 'flat', 'house', 'building', 'tower', 'complex',
        'area', 'location', 'community', 'district', 'zone'
      ];
      const nameLower = updates.name.toLowerCase().trim();
      const isInvalidName = invalidNamePatterns.some(pattern => 
        nameLower === pattern || nameLower.includes(pattern)
      );
      
      if (isInvalidName) {
        console.warn(`[Tool: updateLead] 🚨 REJECTED invalid name: "${updates.name}"`);
        console.warn('[Tool: updateLead] This looks like a location/property type, not a person name');
        // Remove the name from updates to prevent saving it
        delete updates.name;
      } else {
        console.log(`[Tool: updateLead] ✅ Name validated: "${updates.name}"`);
      }
    }

    // Prepare update data - merge metadata with existing to preserve calendar_last_slots etc.
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // If updating metadata, merge with existing metadata
    if (updates.metadata && existingContact.metadata) {
      updateData.metadata = {
        ...(typeof existingContact.metadata === 'object' && !Array.isArray(existingContact.metadata) 
          ? existingContact.metadata 
          : {}),
        ...updates.metadata,
      };
      console.log('[Tool: updateLead] Merging metadata - existing keys:', Object.keys(existingContact.metadata || {}));
      console.log('[Tool: updateLead] Merging metadata - new keys:', Object.keys(updates.metadata || {}));
      console.log('[Tool: updateLead] Merging metadata - final keys:', Object.keys(updateData.metadata));
    }

    // Only update qualification_status if temperature is being updated
    if (updates.temperature) {
      if (updates.temperature === 'booked') {
        updateData.qualification_status = 'contacted';
      } else if (updates.temperature === 'hot') {
        updateData.qualification_status = 'qualified';
      } else if (updates.temperature === 'cold') {
        updateData.qualification_status = 'unqualified';
      }
    }

    // Update contact record
    const { data: updatedContact, error: updateError } = await supabaseAdmin
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .select()
      .single();

    if (updateError) {
      console.error('[Tool: updateLead] ❌ DATABASE UPDATE FAILED:', updateError);
      return {
        success: false,
        error: 'Failed to update contact',
      };
    }

    console.log('[Tool: updateLead] ✅ DATABASE UPDATE SUCCESSFUL');
    console.log('[Tool: updateLead] Updated contact data:', {
      name: updatedContact.name,
      email: updatedContact.email,
      temperature: updatedContact.temperature,
      budget_range: updatedContact.budget_range,
      timeline: updatedContact.timeline,
    });

    // CRITICAL: Verify temperature was actually updated
    if (updates.temperature && updatedContact.temperature !== updates.temperature) {
      console.error('[Tool: updateLead] 🚨 TEMPERATURE UPDATE FAILED!');
      console.error('[Tool: updateLead] Expected:', updates.temperature);
      console.error('[Tool: updateLead] Got:', updatedContact.temperature);
      console.error('[Tool: updateLead] This is a critical bug - temperature did not persist to database');
    } else if (updates.temperature) {
      console.log('[Tool: updateLead] ✅ Temperature successfully updated to:', updatedContact.temperature);
    }

    // Recalculate lead score using the weighted, industry-aware scorer from prompts.ts
    // (same scorer agent.ts uses post-response — this was previously a separate,
    // unweighted 3-signal implementation that disagreed with it).
    const { data: tenantForScore } = await supabaseAdmin
      .from('tenants')
      .select('industry, agent_config')
      .eq('id', existingContact.tenant_id)
      .single();

    const customFields = (updatedContact.custom_fields && typeof updatedContact.custom_fields === 'object')
      ? updatedContact.custom_fields
      : {};

    const scoreResponses: Record<string, any> = {
      budget: updatedContact.budget_range
        || (updatedContact.budget_min || updatedContact.budget_max ? `${updatedContact.budget_min ?? ''}-${updatedContact.budget_max ?? ''}` : undefined),
      timeline: updatedContact.timeline || updatedContact.move_timeline,
      location: (Array.isArray(updatedContact.preferred_locations) && updatedContact.preferred_locations.length > 0)
        ? updatedContact.preferred_locations.join(', ')
        : customFields.location,
      decision_maker: customFields.decision_maker,
      need: updatedContact.service_interest,
      service_type: updatedContact.service_interest,
      medical_need: updatedContact.service_interest,
      vehicle_type: updatedContact.property_type || customFields.vehicle_type,
      urgency: updatedContact.timeline || updatedContact.move_timeline,
      financing: customFields.financing,
      specialty: customFields.specialty,
      insurance: customFields.insurance,
    };

    // Prefer the tenant's industry-agent lead_score_weights over the static
    // prompts.ts table when present (same preference rule as agent.ts's
    // post-response updateLeadScore — see lead-scoring.ts).
    const weights = tenantForScore?.agent_config?.lead_score_weights;
    const { score: newScore } = (weights && Object.keys(weights).length > 0)
      ? calculateWeightedLeadScore(weights, scoreResponses)
      : calculateLeadScore(tenantForScore?.industry || 'other', scoreResponses);

    // Update the score separately
    const { error: scoreError } = await supabaseAdmin
      .from('contacts')
      .update({ lead_score: newScore, updated_at: new Date().toISOString() })
      .eq('id', contactId);

    if (scoreError) {
      console.error('[Tool: updateLead] Score update failed:', scoreError);
      // Don't fail the operation, just log it
    }

    console.log(`[Tool: updateLead] ✅ COMPLETED - Contact updated successfully. New score: ${newScore}/100`);

    // 🔥 CRITICAL FIX: Send confirmation email if email was just added and contact has a recent booking
    if (updates.email && !existingContact.email && updatedContact.temperature === 'booked') {
      console.log('[Tool: updateLead] Email was just collected for a booked contact - sending confirmation email');
      
      // Get the most recent appointment for this contact
      const { data: recentAppointment } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('contact_id', contactId)
        .eq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (recentAppointment) {
        // Get tenant info for the email
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('company_name, timezone')
          .eq('id', existingContact.tenant_id)
          .single();
        
        try {
          await sendEmail({
            to: updates.email,
            template: 'booking_confirmation',
            data: {
              company_name: tenant?.company_name || 'Our Company',
              meeting_time: recentAppointment.scheduled_time,
              meeting_link: recentAppointment.meeting_link || 'Details will be shared before the meeting',
              customer_name: updatedContact.name || 'Customer',
            },
          });
          console.log('[Tool: updateLead] ✅ Confirmation email sent to:', updates.email);
        } catch (emailError) {
          console.error('[Tool: updateLead] Failed to send confirmation email:', emailError);
          // Don't fail the update if email fails
        }
      } else {
        console.log('[Tool: updateLead] No recent appointment found - skipping confirmation email');
      }
    }

    // Handle follow-up scheduling based on temperature change
    if (updates.temperature) {
      if (updates.temperature === 'hot' || updates.temperature === 'booked') {
        await cancelFollowUps(contactId, updates.temperature === 'booked' ? 'converted' : 'hot_lead');
      } else if (updates.temperature === 'warm' || updates.temperature === 'cold') {
        // Get active conversation for this contact
        const { data: conv } = await supabaseAdmin
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (conv) {
          await scheduleFollowUps(existingContact.tenant_id, contactId, conv.id, updates.temperature);
        }
      }
    }

    return {
      success: true,
      newScore,
      contact: { ...updatedContact, lead_score: newScore },
    };
  } catch (error) {
    console.error('[Tool: updateLead] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
