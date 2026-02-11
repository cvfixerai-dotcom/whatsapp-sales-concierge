interface EmailParams {
  to: string;
  template: string;
  data: Record<string, any>;
  language?: string;
}

export async function sendEmail({
  to,
  template,
  data,
  language = 'en'
}: EmailParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log(`[Tool: sendEmail] Sending email to ${to} with template ${template}`);

    // Check Resend configuration
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey || !fromEmail) {
      console.error('[Tool: sendEmail] Resend not configured');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    // Get email template
    const emailContent = getEmailTemplate(template, data, language);

    // Send email via Resend REST API (direct fetch, no SDK needed)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Tool: sendEmail] Resend error:', result);
      return {
        success: false,
        error: result.message || 'Failed to send email',
      };
    }

    console.log(`[Tool: sendEmail] Email sent successfully to ${to}, id: ${result?.id}`);

    return { success: true };
  } catch (error) {
    console.error('[Tool: sendEmail] Failed to send email:', error);
    
    // Check if it's a Resend API error
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('API key')) {
        return {
          success: false,
          error: 'Invalid Resend API key',
        };
      } else if (error.message.includes('403')) {
        return {
          success: false,
          error: 'Resend authorization failed',
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getEmailTemplate(
  template: string,
  data: Record<string, any>,
  language: string
): { subject: string; html: string; text: string } {
  const templates = {
    booking_confirmation: {
      en: {
        subject: `Appointment Confirmed - ${data.company_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Your appointment is confirmed! 📅</h2>
            <p>Hi ${data.customer_name || 'there'},</p>
            <p>Your appointment with <strong>${data.company_name}</strong> has been scheduled.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Appointment Details:</h3>
              <p><strong>Date & Time:</strong> ${data.meeting_time}</p>
              <p><strong>Location:</strong> Online Meeting</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${data.meeting_link}" 
                 style="background-color: #007bff; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block;">
                Join Meeting
              </a>
            </p>
            
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 14px;">
              If you need to reschedule, please reply to this email or contact us directly.
            </p>
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              The ${data.company_name} Team
            </p>
          </div>
        `,
        text: `
          Appointment Confirmed - ${data.company_name}
          
          Hi ${data.customer_name || 'there'},
          
          Your appointment with ${data.company_name} has been scheduled.
          
          Date & Time: ${data.meeting_time}
          Location: Online Meeting
          
          Join Meeting: ${data.meeting_link}
          
          If you need to reschedule, please reply to this email or contact us directly.
          
          Best regards,
          The ${data.company_name} Team
        `,
      },
      ar: {
        subject: `تم تأكيد موعدك - ${data.company_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
            <h2 style="color: #333;">تم تأكيد موعدك! 📅</h2>
            <p>مرحباً ${data.customer_name || 'بك'}،</p>
            <p>تم جدولة موعدك مع <strong>${data.company_name}</strong>.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">تفاصيل الموعد:</h3>
              <p><strong>التاريخ والوقت:</strong> ${data.meeting_time}</p>
              <p><strong>الموقع:</strong> اجتماع عبر الإنترنت</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${data.meeting_link}" 
                 style="background-color: #007bff; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block;">
                الانضمام إلى الاجتماع
              </a>
            </p>
            
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 14px;">
              إذا كنت بحاجة إلى إعادة الجدولة، يرجى الرد على هذا البريد الإلكتروني أو الاتصال بنا مباشرة.
            </p>
            <p style="color: #666; font-size: 14px;">
              مع أطيب التحيات،<br>
              فريق ${data.company_name}
            </p>
          </div>
        `,
        text: `
          تم تأكيد موعدك - ${data.company_name}
          
          مرحباً ${data.customer_name || 'بك'}،
          
          تم جدولة موعدك مع ${data.company_name}.
          
          التاريخ والوقت: ${data.meeting_time}
          الموقع: اجتماع عبر الإنترنت
          
          الانضمام إلى الاجتماع: ${data.meeting_link}
          
          إذا كنت بحاجة إلى إعادة الجدولة، يرجى الرد على هذا البريد الإلكتروني أو الاتصال بنا مباشرة.
          
          مع أطيب التحيات،
          فريق ${data.company_name}
        `,
      },
    },
    lead_info: {
      en: {
        subject: `Information from ${data.company_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Here's the information you requested</h2>
            <p>Hi ${data.customer_name || 'there'},</p>
            <p>Thank you for your interest in ${data.company_name}. Here's the information you requested:</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${data.content || 'Please find the attached information.'}
            </div>
            
            <p>If you have any questions, feel free to reply to this email.</p>
            
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              The ${data.company_name} Team
            </p>
          </div>
        `,
        text: `
          Information from ${data.company_name}
          
          Hi ${data.customer_name || 'there'},
          
          Thank you for your interest in ${data.company_name}. Here's the information you requested:
          
          ${data.content || 'Please find the attached information.'}
          
          If you have any questions, feel free to reply to this email.
          
          Best regards,
          The ${data.company_name} Team
        `,
      },
      ar: {
        subject: `معلومات من ${data.company_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
            <h2 style="color: #333;">إليك المعلومات التي طلبتها</h2>
            <p>مرحباً ${data.customer_name || 'بك'}،</p>
            <p>شكراً لاهتمامك بـ ${data.company_name}. إليك المعلومات التي طلبتها:</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${data.content || 'يرجى العثور على المعلومات المرفقة.'}
            </div>
            
            <p>إذا كان لديك أي أسئلة، لا تتردد في الرد على هذا البريد الإلكتروني.</p>
            
            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 14px;">
              مع أطيب التحيات،<br>
              فريق ${data.company_name}
            </p>
          </div>
        `,
        text: `
          معلومات من ${data.company_name}
          
          مرحباً ${data.customer_name || 'بك'}،
          
          شكراً لاهتمامك بـ ${data.company_name}. إليك المعلومات التي طلبتها:
          
          ${data.content || 'يرجى العثور على المعلومات المرفقة.'}
          
          إذا كان لديك أي أسئلة، لا تتردد في الرد على هذا البريد الإلكتروني.
          
          مع أطيب التحيات،
          فريق ${data.company_name}
        `,
      },
    },
    handoff_request: {
      en: {
        subject: `🚨 Human Handoff Required - ${data.customer_name || 'Customer'} needs assistance`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #ff6b6b; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">🚨 Human Handoff Required</h2>
            </div>
            
            <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
              <p><strong>A customer needs human assistance.</strong></p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <h3 style="margin-top: 0; color: #333;">Customer Details:</h3>
                <p><strong>Name:</strong> ${data.customer_name || 'Unknown'}</p>
                <p><strong>Phone:</strong> ${data.customer_phone || 'N/A'}</p>
                <p><strong>Conversation ID:</strong> ${data.conversation_id || 'N/A'}</p>
              </div>
              
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107;">
                <h3 style="margin-top: 0; color: #856404;">Handoff Triggers:</h3>
                <p>${data.triggers || 'Customer requested human assistance'}</p>
              </div>
              
              <div style="background-color: #e8f4fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <h3 style="margin-top: 0; color: #0c5460;">Last Message:</h3>
                <p style="font-style: italic;">"${data.last_message || 'N/A'}"</p>
              </div>
              
              <div style="background-color: #d4edda; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <h3 style="margin-top: 0; color: #155724;">AI Summary:</h3>
                <p>${data.ai_summary || 'Customer requires human follow-up.'}</p>
              </div>
              
              <p style="text-align: center; margin-top: 20px;">
                <a href="${data.dashboard_link || '#'}" 
                   style="background-color: #007bff; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                  View Conversation in Dashboard
                </a>
              </p>
              
              <hr style="margin: 20px 0;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from ${data.company_name || 'WhatsApp Sales Concierge'}.
              </p>
            </div>
          </div>
        `,
        text: `
          🚨 HUMAN HANDOFF REQUIRED
          
          A customer needs human assistance.
          
          Customer Details:
          - Name: ${data.customer_name || 'Unknown'}
          - Phone: ${data.customer_phone || 'N/A'}
          - Conversation ID: ${data.conversation_id || 'N/A'}
          
          Handoff Triggers: ${data.triggers || 'Customer requested human assistance'}
          
          Last Message: "${data.last_message || 'N/A'}"
          
          AI Summary: ${data.ai_summary || 'Customer requires human follow-up.'}
          
          Please log into the dashboard to continue this conversation.
          
          This is an automated notification from ${data.company_name || 'WhatsApp Sales Concierge'}.
        `,
      },
      ar: {
        subject: `🚨 مطلوب تدخل بشري - ${data.customer_name || 'العميل'} يحتاج مساعدة`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
            <div style="background-color: #ff6b6b; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">🚨 مطلوب تدخل بشري</h2>
            </div>
            
            <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
              <p><strong>عميل يحتاج مساعدة بشرية.</strong></p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <h3 style="margin-top: 0; color: #333;">تفاصيل العميل:</h3>
                <p><strong>الاسم:</strong> ${data.customer_name || 'غير معروف'}</p>
                <p><strong>الهاتف:</strong> ${data.customer_phone || 'غير متوفر'}</p>
                <p><strong>معرف المحادثة:</strong> ${data.conversation_id || 'غير متوفر'}</p>
              </div>
              
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-right: 4px solid #ffc107;">
                <h3 style="margin-top: 0; color: #856404;">أسباب التحويل:</h3>
                <p>${data.triggers || 'طلب العميل مساعدة بشرية'}</p>
              </div>
              
              <div style="background-color: #e8f4fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <h3 style="margin-top: 0; color: #0c5460;">آخر رسالة:</h3>
                <p style="font-style: italic;">"${data.last_message || 'غير متوفر'}"</p>
              </div>
              
              <p style="text-align: center; margin-top: 20px;">
                <a href="${data.dashboard_link || '#'}" 
                   style="background-color: #007bff; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                  عرض المحادثة في لوحة التحكم
                </a>
              </p>
            </div>
          </div>
        `,
        text: `
          🚨 مطلوب تدخل بشري
          
          عميل يحتاج مساعدة بشرية.
          
          تفاصيل العميل:
          - الاسم: ${data.customer_name || 'غير معروف'}
          - الهاتف: ${data.customer_phone || 'غير متوفر'}
          - معرف المحادثة: ${data.conversation_id || 'غير متوفر'}
          
          أسباب التحويل: ${data.triggers || 'طلب العميل مساعدة بشرية'}
          
          آخر رسالة: "${data.last_message || 'غير متوفر'}"
          
          يرجى تسجيل الدخول إلى لوحة التحكم لمتابعة هذه المحادثة.
        `,
      },
    },
  };

  const templateData = templates[template as keyof typeof templates];
  if (!templateData) {
    throw new Error(`Email template '${template}' not found`);
  }

  const languageData = templateData[language as keyof typeof templateData] || templateData.en;
  
  return {
    subject: languageData.subject,
    html: languageData.html,
    text: languageData.text,
  };
}
