// @ts-nocheck
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Generates a deterministic booking confirmation message.
 * Uses date-fns-tz to format the ISO datetime in the tenant's timezone.
 * The AI never generates this text — it is always produced in code.
 */
export function formatBookingConfirmation(
  isoDatetime: string,
  timezone: string,
  language: string = 'en'
): string {
  const tz = timezone || 'Asia/Dubai';
  const date = new Date(isoDatetime);

  if (isNaN(date.getTime())) {
    throw new Error(`formatBookingConfirmation: invalid ISO datetime "${isoDatetime}"`);
  }

  if (language === 'ar') {
    const formatted = formatInTimeZone(date, tz, "EEEE، d MMMM 'الساعة' h:mm a");
    return `تم تأكيد حجزك ليوم ${formatted}.`;
  }

  const formatted = formatInTimeZone(date, tz, "EEEE, MMMM d 'at' h:mm a");
  return `You're booked for ${formatted}.`;
}
