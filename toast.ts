import { toast as sonnerToast } from 'sonner';

const lastToasts = new Map<string, number>();
const DEDUPE_WINDOW = 2000; // 2 seconds

function shouldShow(message: string): boolean {
  const now = Date.now();
  const lastTime = lastToasts.get(message);
  
  if (lastTime && now - lastTime < DEDUPE_WINDOW) {
    return false;
  }
  
  lastToasts.set(message, now);
  
  // Cleanup old entries occasionally
  if (lastToasts.size > 50) {
    for (const [msg, time] of lastToasts.entries()) {
      if (now - time > DEDUPE_WINDOW * 5) {
        lastToasts.delete(msg);
      }
    }
  }
  
  return true;
}

export const toast = {
  success: (message: string, options?: any) => {
    if (shouldShow(`success:${message}`)) {
      return sonnerToast.success(message, options);
    }
  },
  error: (message: string, options?: any) => {
    if (shouldShow(`error:${message}`)) {
      return sonnerToast.error(message, options);
    }
  },
  info: (message: string, options?: any) => {
    if (shouldShow(`info:${message}`)) {
      return sonnerToast.info(message, options);
    }
  },
  warning: (message: string, options?: any) => {
    if (shouldShow(`warning:${message}`)) {
      return sonnerToast.warning(message, options);
    }
  },
  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
  custom: sonnerToast.custom,
};
