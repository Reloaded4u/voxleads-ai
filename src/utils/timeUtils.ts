import { formatInTimeZone, toDate } from 'date-fns-tz';

export const timeUtils = {
  /**
   * Checks if the current time in a specific timezone is within the allowed calling hours.
   * @param startTime HH:mm format
   * @param endTime HH:mm format
   * @param timezone IANA timezone string
   */
  isWithinCallingHours(startTime: string, endTime: string, timezone: string): boolean {
    try {
      const now = new Date();
      const currentTimeStr = formatInTimeZone(now, timezone, 'HH:mm');
      
      return currentTimeStr >= startTime && currentTimeStr <= endTime;
    } catch (error) {
      console.error('[TimeUtils] Error checking calling hours:', error);
      return true; // Default to true if error occurs to avoid blocking calls unnecessarily
    }
  },

  /**
   * Formats a date for a specific timezone.
   */
  formatInUserTimeZone(date: Date, timezone: string, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
    try {
      return formatInTimeZone(date, timezone, formatStr);
    } catch (error) {
      console.error('[TimeUtils] Error formatting date:', error);
      return date.toLocaleString();
    }
  }
};
