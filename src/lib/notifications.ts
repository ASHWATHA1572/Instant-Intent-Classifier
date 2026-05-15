/**
 * Service to handle email notifications for high-priority or low-confidence tickets.
 * Using Resend (https://resend.com) as the email provider.
 */

const NOTIFICATION_EMAIL = import.meta.env.VITE_NOTIFICATION_EMAIL;

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function sendPushNotification(ticket: {
  intent: string;
  confidence: number;
  message: string;
  urgent?: boolean;
}) {
  if (!('Notification' in window)) return;

  if (Notification.permission !== 'granted') return;

  const isLowConfidence = ticket.confidence < 0.8;
  const isUrgent = ticket.urgent || ['Refund Request', 'Product Defect', 'Delivery Inquiry', 'Account Recovery'].includes(ticket.intent);

  if (!isLowConfidence && !isUrgent) return;

  const title = `🚨 ${isLowConfidence ? 'Low Confidence' : 'Urgent Ticket'}: ${ticket.intent}`;
  
  new Notification(title, {
    body: ticket.message.substring(0, 100) + (ticket.message.length > 100 ? '...' : ''),
    icon: '/favicon.ico',
    tag: 'support-alert',
    requireInteraction: true
  });
}

export async function sendEmailNotification(ticket: {
  message: string;
  intent: string;
  confidence: number;
  reason: string;
  urgent?: boolean;
}) {
  if (!NOTIFICATION_EMAIL) {
    console.info('Email notification skipped: NOTIFICATION_EMAIL not set.');
    return;
  }

  const isLowConfidence = ticket.confidence < 0.8;
  const isUrgent = ticket.urgent || ['Refund Request', 'Product Defect', 'Delivery Inquiry', 'Account Recovery'].includes(ticket.intent);

  if (!isLowConfidence && !isUrgent) return false;

  const subject = `[URGENT] ${isLowConfidence ? 'Low Confidence' : 'New Ticket'} - ${ticket.intent}`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #1a1a1a; border-radius: 12px; background: #050505; color: #ffffff;">
      <h2 style="color: #6366f1; margin-top: 0;">Support Alert</h2>
      <p style="font-size: 14px; opacity: 0.7;">A ticket requires immediate attention.</p>
      
      <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Intent:</strong> <span style="color: #818cf8;">${ticket.intent}</span></p>
        <p><strong>Confidence:</strong> ${(ticket.confidence * 100).toFixed(1)}%</p>
        <p><strong>Reason:</strong> ${ticket.reason}</p>
      </div>

      <div style="border-left: 4px solid #6366f1; padding-left: 15px; margin: 20px 0;">
        <p style="font-style: italic; opacity: 0.9;">"${ticket.message}"</p>
      </div>

      <p style="font-size: 12px; opacity: 0.5; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
        This is an automated notification from the Intent Classifier Prototype.
      </p>
    </div>
  `;

  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: [NOTIFICATION_EMAIL],
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send email through proxy:', errorData);
      return false;
    } else {
      console.log('Email notification sent successfully via proxy');
      return true;
    }
  } catch (error) {
    console.error('Error in sendEmailNotification (proxy):', error);
    return false;
  }
}

