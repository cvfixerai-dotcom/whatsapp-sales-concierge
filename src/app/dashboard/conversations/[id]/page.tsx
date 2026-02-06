// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import {
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  MessageSquare,
  Bot,
  UserCheck,
  AlertCircle,
  UserPlus,
  Edit,
  Plus,
  Send,
  Check,
  X,
  Info,
  Target,
  TrendingUp,
  FileText,
  Lightbulb,
} from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  whatsapp_number: string;
  email?: string;
  lead_score: number;
  temperature: string;
  timeline?: string;
  budget_range?: string;
  service_interest?: string;
  qualification_status: string;
  assigned_agent_id?: string;
  notes?: string;
}

interface Message {
  id: string;
  content: string;
  sender_type: 'contact' | 'ai' | 'human';
  created_at: string;
  confidence?: number;
  handoff_trigger?: string;
  metadata?: Record<string, any>;
}

interface Appointment {
  id: string;
  scheduled_time: string;
  status: string;
  meeting_link?: string;
  created_at: string;
}

interface AIInsight {
  type: 'sentiment' | 'intent' | 'risk' | 'opportunity';
  message: string;
  confidence: number;
}

interface TimelineEvent {
  type: 'message' | 'handoff' | 'appointment' | 'qualification';
  timestamp: string;
  description: string;
  icon: React.ReactNode;
}

const temperatureColors = {
  new: 'bg-gray-100 text-gray-800',
  warm: 'bg-yellow-100 text-yellow-800',
  hot: 'bg-red-100 text-red-800',
  cold: 'bg-blue-100 text-blue-800',
  booked: 'bg-green-100 text-green-800',
};

const getScoreColor = (score: number) => {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
};

export default function ConversationViewer() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const conversationId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [isHumanMode, setIsHumanMode] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [note, setNote] = useState('');
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [suggestedResponses, setSuggestedResponses] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && conversationId) {
      fetchConversationData();
      setupRealtimeSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [status, conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversationData = async () => {
    try {
      setLoading(true);

      // Fetch conversation with contact details
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          contacts(*)
        `)
        .eq('id', conversationId)
        .single();

      if (convError) throw convError;

      setContact(conversation.contacts);

      // Fetch messages
      const { data: messageData, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at');

      if (msgError) throw msgError;
      setMessages(messageData || []);

      // Fetch appointment if exists
      const { data: aptData } = await supabase
        .from('appointments')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('status', 'scheduled')
        .single();

      setAppointment(aptData);

      // Check if human agent is assigned
      setIsHumanMode(!!conversation.assigned_agent_id);

      // Generate AI insights
      generateInsights(messageData || []);

      // Build timeline
      buildTimeline(conversation, messageData || [], aptData);

      // Generate suggested responses if in human mode
      if (conversation.assigned_agent_id) {
        generateSuggestedResponses(messageData || []);
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    subscriptionRef.current = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => [...prev, newMessage]);
          
          // Update insights with new message
          generateInsights([...messages, newMessage]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.new.assigned_agent_id && !payload.old.assigned_agent_id) {
            setIsHumanMode(true);
            generateSuggestedResponses(messages);
          }
        }
      )
      .subscribe();
  };

  const generateInsights = (msgs: Message[]) => {
    const insights: AIInsight[] = [];

    // Sentiment analysis
    const recentMessages = msgs.slice(-5);
    const negativeWords = ['angry', 'frustrated', 'unhappy', 'problem', 'issue'];
    const hasNegative = recentMessages.some(m => 
      negativeWords.some(word => m.content.toLowerCase().includes(word))
    );

    if (hasNegative) {
      insights.push({
        type: 'risk',
        message: 'Customer shows signs of frustration',
        confidence: 0.85,
      });
    }

    // Intent detection
    const pricingKeywords = ['price', 'cost', 'how much', 'quote'];
    const askingPrice = recentMessages.some(m => 
      pricingKeywords.some(word => m.content.toLowerCase().includes(word))
    );

    if (askingPrice) {
      insights.push({
        type: 'opportunity',
        message: 'Customer is asking about pricing',
        confidence: 0.92,
      });
    }

    // Urgency detection
    const urgentWords = ['urgent', 'asap', 'immediately', 'need now'];
    const isUrgent = recentMessages.some(m => 
      urgentWords.some(word => m.content.toLowerCase().includes(word))
    );

    if (isUrgent) {
      insights.push({
        type: 'intent',
        message: 'High urgency detected',
        confidence: 0.88,
      });
    }

    setAiInsights(insights);
  };

  const generateSuggestedResponses = (msgs: Message[]) => {
    const lastMessage = msgs[msgs.length - 1];
    if (!lastMessage || lastMessage.sender_type !== 'contact') return;

    const suggestions = [];

    if (lastMessage.content.toLowerCase().includes('price')) {
      suggestions.push(
        "I'd be happy to discuss pricing. What's your budget range?",
        "Our pricing depends on your specific needs. Can you tell me more?",
        "Let me get you a detailed quote. What service are you interested in?"
      );
    } else if (lastMessage.content.toLowerCase().includes('when')) {
      suggestions.push(
        "We have availability this week. What day works best for you?",
        "I can check our calendar. Do you prefer morning or afternoon?",
        "Let me find the earliest available slot for you."
      );
    } else {
      suggestions.push(
        "Thank you for your message. How can I help you today?",
        "I understand. Could you provide more details?",
        "Let me make sure I understand your needs correctly."
      );
    }

    setSuggestedResponses(suggestions.slice(0, 3));
  };

  const buildTimeline = (conversation: any, msgs: Message[], apt: Appointment | null) => {
    const events: TimelineEvent[] = [];

    // Conversation start
    events.push({
      type: 'message',
      timestamp: conversation.created_at,
      description: 'Conversation started',
      icon: <MessageSquare className="w-4 h-4" />,
    });

    // Messages with handoff triggers
    msgs.forEach(msg => {
      events.push({
        type: 'message',
        timestamp: msg.created_at,
        description: msg.sender_type === 'contact' ? 'Customer message' : 
                     msg.sender_type === 'ai' ? 'AI response' : 'Agent response',
        icon: msg.sender_type === 'contact' ? <User className="w-4 h-4" /> :
              msg.sender_type === 'ai' ? <Bot className="w-4 h-4" /> :
              <UserCheck className="w-4 h-4" />,
      });

      if (msg.handoff_trigger) {
        events.push({
          type: 'handoff',
          timestamp: msg.created_at,
          description: `Handoff triggered: ${msg.handoff_trigger}`,
          icon: <UserPlus className="w-4 h-4" />,
        });
      }
    });

    // Appointment
    if (apt) {
      events.push({
        type: 'appointment',
        timestamp: apt.created_at,
        description: `Appointment scheduled for ${new Date(apt.scheduled_time).toLocaleString()}`,
        icon: <Calendar className="w-4 h-4" />,
      });
    }

    setTimeline(events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !conversationId) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: inputMessage,
          sender_type: 'human',
          metadata: {
            agent_id: session?.user?.id,
          },
        });

      if (error) throw error;

      setInputMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleTakeOver = async () => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          assigned_agent_id: session?.user?.id,
          status: 'human-handled',
        })
        .eq('id', conversationId);

      if (error) throw error;

      setIsHumanMode(true);
      generateSuggestedResponses(messages);
    } catch (error) {
      console.error('Error taking over conversation:', error);
    }
  };

  const handleAddNote = async () => {
    if (!contact || !note.trim()) return;

    try {
      const { error } = await supabase
        .from('contacts')
        .update({
          notes: (contact.notes || '') + `\n\n[${new Date().toLocaleString()}] ${note}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id);

      if (error) throw error;

      setContact({ ...contact, notes: (contact.notes || '') + `\n\n[${new Date().toLocaleString()}] ${note}` });
      setNote('');
      setShowNoteModal(false);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Conversation not found</h2>
          <button
            onClick={() => router.push('/dashboard/leads')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Leads
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-white">
      {/* Left Panel - Contact Info */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-gray-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{contact.name}</h2>
              <p className="text-sm text-gray-500">{contact.whatsapp_number}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Lead Score */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Lead Score</h3>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getScoreColor(contact.lead_score)}`}
                  style={{ width: `${contact.lead_score}%` }}
                />
              </div>
              <span className="text-sm font-medium">{contact.lead_score}</span>
            </div>
          </div>

          {/* Temperature */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Temperature</h3>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${temperatureColors[contact.temperature as keyof typeof temperatureColors]}`}>
              {contact.temperature}
            </span>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Contact Details</h3>
            <div className="space-y-2">
              <div className="flex items-center text-sm">
                <Phone className="w-4 h-4 mr-2 text-gray-400" />
                {contact.whatsapp_number}
              </div>
              {contact.email && (
                <div className="flex items-center text-sm">
                  <Mail className="w-4 h-4 mr-2 text-gray-400" />
                  {contact.email}
                </div>
              )}
            </div>
          </div>

          {/* Qualification Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Qualification</h3>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Timeline:</span>
                <span>{contact.timeline || 'Not set'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Budget:</span>
                <span>{contact.budget_range || 'Not set'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Interest:</span>
                <span>{contact.service_interest || 'Not set'}</span>
              </div>
            </div>
          </div>

          {/* Appointment Info */}
          {appointment && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Appointment</h3>
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="flex items-center text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-green-600" />
                  {new Date(appointment.scheduled_time).toLocaleString()}
                </div>
                {appointment.meeting_link && (
                  <a
                    href={appointment.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline mt-1 block"
                  >
                    Join Meeting
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Actions</h3>
            <div className="space-y-2">
              {!isHumanMode && (
                <button
                  onClick={handleTakeOver}
                  className="w-full flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Take Over
                </button>
              )}
              <button
                onClick={() => setShowNoteModal(true)}
                className="w-full flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <Edit className="w-4 h-4 mr-2" />
                Add Note
              </button>
              <button className="w-full flex items-center justify-center px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200">
                <UserPlus className="w-4 h-4 mr-2" />
                Handoff
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Center Panel - Messages */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender_type === 'contact' ? 'justify-start' : 'justify-end'}`}
              title={message.confidence ? `AI Confidence: ${(message.confidence * 100).toFixed(0)}%` : ''}
            >
              <div
                className={`max-w-lg px-4 py-2 rounded-lg ${
                  message.sender_type === 'contact'
                    ? 'bg-gray-100 text-gray-900'
                    : message.sender_type === 'ai'
                    ? 'bg-blue-600 text-white'
                    : 'bg-green-600 text-white'
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-xs ${
                    message.sender_type === 'contact' 
                      ? 'text-gray-500' 
                      : message.sender_type === 'ai'
                      ? 'text-blue-100'
                      : 'text-green-100'
                  }`}>
                    {new Date(message.created_at).toLocaleTimeString()}
                  </p>
                  {message.sender_type === 'ai' && (
                    <Bot className="w-3 h-3 text-blue-100" />
                  )}
                  {message.sender_type === 'human' && (
                    <UserCheck className="w-3 h-3 text-green-100" />
                  )}
                </div>
                {message.handoff_trigger && (
                  <div className="mt-2 flex items-center text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Handoff: {message.handoff_trigger}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        {isHumanMode && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type your message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Insights */}
      <div className="w-80 border-l border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">AI Insights</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* AI Insights */}
          <div className="p-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Analysis</h4>
            <div className="space-y-3">
              {aiInsights.map((insight, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg ${
                    insight.type === 'risk' ? 'bg-red-50' :
                    insight.type === 'opportunity' ? 'bg-green-50' :
                    'bg-blue-50'
                  }`}
                >
                  <div className="flex items-start">
                    {insight.type === 'risk' ? (
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 mr-2" />
                    ) : insight.type === 'opportunity' ? (
                      <Target className="w-4 h-4 text-green-600 mt-0.5 mr-2" />
                    ) : (
                      <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 mr-2" />
                    )}
                    <div>
                      <p className="text-sm text-gray-900">{insight.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Confidence: {(insight.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {aiInsights.length === 0 && (
                <p className="text-sm text-gray-500">No insights available</p>
              )}
            </div>
          </div>

          {/* Suggested Responses */}
          {isHumanMode && suggestedResponses.length > 0 && (
            <div className="p-6 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Suggested Responses</h4>
              <div className="space-y-2">
                {suggestedResponses.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => setInputMessage(suggestion)}
                    className="w-full text-left p-3 text-sm bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Qualification Checklist */}
          <div className="p-6 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Qualification Status</h4>
            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={!!contact.email}
                  readOnly
                  className="rounded text-blue-600"
                />
                <label className="ml-2 text-sm text-gray-700">Email provided</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={!!contact.budget_range}
                  readOnly
                  className="rounded text-blue-600"
                />
                <label className="ml-2 text-sm text-gray-700">Budget discussed</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={!!contact.timeline}
                  readOnly
                  className="rounded text-blue-600"
                />
                <label className="ml-2 text-sm text-gray-700">Timeline established</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={!!appointment}
                  readOnly
                  className="rounded text-blue-600"
                />
                <label className="ml-2 text-sm text-gray-700">Appointment booked</label>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="p-6 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Timeline</h4>
            <div className="space-y-3">
              {timeline.slice(-10).map((event, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {event.icon}
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">{event.description}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Note</h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Enter your note..."
              />
              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNote}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
