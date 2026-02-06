// @ts-nocheck
import { supabaseAdmin } from '../db/client';
import { sendEmail } from '../ai/tools/send-email';

interface Message {
  id: string;
  content: string;
  conversation_id: string;
  sender_type: string;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  lead_score: number;
  budget_range?: string;
  temperature: string;
  timeline?: string;
}

interface AIResponse {
  confidence: number;
  sentiment?: string;
  content: string;
}

interface HandoffTrigger {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

interface HandoffResult {
  needed: boolean;
  triggers: HandoffTrigger[];
  recommendedAction: 'immediate_handoff' | 'continue_ai' | 'monitor';
}

export async function checkHandoffTriggers(
  message: Message,
  contact: Contact,
  aiResponse: AIResponse
): Promise<HandoffResult> {
  const triggers: HandoffTrigger[] = [];
  
  // Low AI confidence
  if (aiResponse.confidence < 0.70) {
    triggers.push({
      type: 'low_confidence',
      severity: 'medium',
      message: `AI confidence only ${(aiResponse.confidence * 100).toFixed(0)}%` 
    });
  }
  
  // High-value lead
  if (contact.lead_score > 80 && contact.budget_range === 'high') {
    triggers.push({
      type: 'high_value_lead',
      severity: 'high',
      message: 'High-value lead detected (score > 80, high budget)'
    });
  }
  
  // Urgent timeline
  if (contact.timeline === 'urgent' && contact.lead_score > 60) {
    triggers.push({
      type: 'urgent_timeline',
      severity: 'high',
      message: 'Urgent timeline with qualified lead'
    });
  }
  
  // Hot temperature with specific requests
  if (contact.temperature === 'hot' && aiResponse.confidence < 0.85) {
    triggers.push({
      type: 'hot_lead_uncertainty',
      severity: 'medium',
      message: 'Hot lead with AI uncertainty'
    });
  }
  
  // Keyword detection
  const handoffKeywords = [
    'human', 'agent', 'person', 'speak to someone',
    'manager', 'complaint', 'escalate', 'real person',
    'representative', 'supervisor', 'talk to human',
    'not helpful', 'dissatisfied', 'unhappy',
    // Arabic
    'إنسان', 'موظف', 'مدير', 'شخص حقيقي',
    'شكوى', 'موظف خدمة', 'تحدث مع شخص',
    'غير راضي', 'مدير', 'خدمة عملاء'
  ];
  
  const messageText = message.content.toLowerCase();
  const matchedKeywords = handoffKeywords.filter(kw => 
    messageText.includes(kw.toLowerCase())
  );
  
  if (matchedKeywords.length > 0) {
    triggers.push({
      type: 'keyword_match',
      severity: 'high',
      message: `Keywords detected: ${matchedKeywords.join(', ')}` 
    });
  }
  
  // Repeated questions (AI couldn't resolve)
  const recentMessages = await getRecentMessages(message.conversation_id, 5);
  const repeatedTopics = detectRepeatedTopics(recentMessages);
  if (repeatedTopics.length > 0) {
    triggers.push({
      type: 'repeated_question',
      severity: 'medium',
      message: `User asking repeatedly about: ${repeatedTopics.join(', ')}` 
    });
  }
  
  // Negative sentiment
  if (aiResponse.sentiment === 'negative' || aiResponse.sentiment === 'frustrated') {
    triggers.push({
      type: 'negative_sentiment',
      severity: 'high',
      message: 'Negative sentiment detected'
    });
  }
  
  // Complex query detection
  const complexPatterns = [
    /what if/gi,
    /compare/gi,
    /difference between/gi,
    /which one is better/gi,
    /pros and cons/gi
  ];
  
  const hasComplexQuery = complexPatterns.some(pattern => 
    pattern.test(message.content)
  );
  
  if (hasComplexQuery && aiResponse.confidence < 0.80) {
    triggers.push({
      type: 'complex_query',
      severity: 'medium',
      message: 'Complex query with low confidence'
    });
  }
  
  // Message length analysis (very long messages might indicate frustration)
  if (message.content.length > 500) {
    triggers.push({
      type: 'long_message',
      severity: 'low',
      message: 'Unusually long message detected'
    });
  }
  
  // Rapid fire messages (user sending multiple messages quickly)
  const rapidFireCount = await checkRapidFireMessages(message.conversation_id);
  if (rapidFireCount >= 3) {
    triggers.push({
      type: 'rapid_fire',
      severity: 'medium',
      message: 'User sending multiple messages quickly'
    });
  }
  
  // Determine if handoff needed
  const highSeverityTriggers = triggers.filter(t => t.severity === 'high');
  const mediumSeverityTriggers = triggers.filter(t => t.severity === 'medium');
  
  const needsHandoff = highSeverityTriggers.length > 0 || 
                       mediumSeverityTriggers.length >= 2 ||
                       (highSeverityTriggers.length > 0 && mediumSeverityTriggers.length > 0);
  
  // Determine recommended action
  let recommendedAction: 'immediate_handoff' | 'continue_ai' | 'monitor' = 'continue_ai';
  
  if (needsHandoff) {
    recommendedAction = highSeverityTriggers.length > 0 ? 'immediate_handoff' : 'monitor';
  } else if (triggers.length > 0) {
    recommendedAction = 'monitor';
  }
  
  return {
    needed: needsHandoff,
    triggers,
    recommendedAction
  };
}

async function getRecentMessages(conversationId: string, limit: number = 5): Promise<Message[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'contact')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching recent messages:', error);
    return [];
  }
}

function detectRepeatedTopics(messages: Message[]): string[] {
  if (messages.length < 3) return [];
  
  // Simple topic detection based on keywords
  const topics: { [key: string]: number } = {};
  
  messages.forEach(msg => {
    const words = msg.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 4) { // Only consider words longer than 4 characters
        topics[word] = (topics[word] || 0) + 1;
      }
    });
  });
  
  // Find topics mentioned multiple times
  return Object.entries(topics)
    .filter(([_, count]) => count >= 2)
    .map(([topic]) => topic)
    .slice(0, 3); // Return top 3 repeated topics
}

async function checkRapidFireMessages(conversationId: string): Promise<number> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'contact')
      .gte('created_at', fiveMinutesAgo);
    
    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error('Error checking rapid fire messages:', error);
    return 0;
  }
}

// Log handoff triggers for analytics
export async function logHandoffTrigger(
  conversationId: string,
  trigger: HandoffTrigger,
  aiResponse: AIResponse
): Promise<void> {
  try {
    await supabaseAdmin
      .from('handoff_logs')
      .insert({
        conversation_id: conversationId,
        trigger_type: trigger.type,
        severity: trigger.severity,
        message: trigger.message,
        ai_confidence: aiResponse.confidence,
        ai_sentiment: aiResponse.sentiment,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error logging handoff trigger:', error);
  }
}

// Get handoff statistics for dashboard
export async function getHandoffStats(tenantId: string): Promise<{
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  avgResponseTime: number;
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('status, handoff_requested_at, handoff_resolved_at')
      .eq('tenant_id', tenantId)
      .in('status', ['handoff-requested', 'human-handled', 'resolved']);
    
    if (error) throw error;
    
    const stats = {
      total: data?.length || 0,
      pending: data?.filter(c => c.status === 'handoff-requested').length || 0,
      inProgress: data?.filter(c => c.status === 'human-handled').length || 0,
      resolved: data?.filter(c => c.status === 'resolved').length || 0,
      avgResponseTime: 0 // TODO: Calculate average response time
    };
    
    return stats;
  } catch (error) {
    console.error('Error fetching handoff stats:', error);
    return {
      total: 0,
      pending: 0,
      inProgress: 0,
      resolved: 0,
      avgResponseTime: 0
    };
  }
}
