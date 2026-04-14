import { firebase } from '../firebase/config';
import { errorHandler } from '../utils/errorHandler';

export const emailAuthService = {
  async signUp(email: string, password: string) {
    try {
      const result = await firebase.createUserWithEmailAndPassword(firebase.auth, email, password);
      return result.user;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'EmailAuthService.signUp');
      throw error;
    }
  },

  async signIn(email: string, password: string) {
    try {
      const result = await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
      return result.user;
    } catch (error) {
      errorHandler.handleGeneralError(error, 'EmailAuthService.signIn');
      throw error;
    }
  },

  async sendPasswordReset(email: string) {
    try {
      await firebase.sendPasswordResetEmail(firebase.auth, email);
    } catch (error) {
      errorHandler.handleGeneralError(error, 'EmailAuthService.sendPasswordReset');
      throw error;
    }
  }
};
