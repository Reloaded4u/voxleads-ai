import { firebase } from '../firebase/config';
import { errorHandler } from '../utils/errorHandler';
import { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

export const phoneAuthService = {
  setupRecaptcha(containerId: string) {
    try {
      // Check if already initialized to avoid multiple instances
      if ((window as any).recaptchaVerifier) {
        return (window as any).recaptchaVerifier;
      }

      const verifier = new firebase.RecaptchaVerifier(firebase.auth, containerId, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved, allow signInWithPhoneNumber.
          console.log('reCAPTCHA solved');
        },
        'expired-callback': () => {
          // Response expired. Ask user to solve reCAPTCHA again.
          console.warn('reCAPTCHA expired');
        }
      });

      (window as any).recaptchaVerifier = verifier;
      return verifier;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'PhoneAuthService.setupRecaptcha');
      throw error;
    }
  },

  async sendOTP(phoneNumber: string, appVerifier: RecaptchaVerifier): Promise<ConfirmationResult> {
    try {
      const confirmationResult = await firebase.signInWithPhoneNumber(firebase.auth, phoneNumber, appVerifier);
      return confirmationResult;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'PhoneAuthService.sendOTP');
      throw error;
    }
  },

  async verifyOTP(confirmationResult: ConfirmationResult, otp: string) {
    try {
      const result = await confirmationResult.confirm(otp);
      return result.user;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'PhoneAuthService.verifyOTP');
      throw error;
    }
  }
};
