import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { authService } from '../services/authService';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string) => Promise<User>;
  sendPasswordReset: (email: string) => Promise<void>;
  setupRecaptcha: (containerId: string) => any;
  sendOTP: (phoneNumber: string, appVerifier: any) => Promise<any>;
  verifyOTP: (confirmationResult: any, otp: string) => Promise<User>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          await authService.ensureUserProfile(firebaseUser);
          
          unsubscribeProfile = authService.subscribeToProfile(firebaseUser.uid, (updatedProfile) => {
            setProfile(updatedProfile);
            setLoading(false);
            setIsAuthReady(true);
          });
        } catch (error) {
          console.error('Error ensuring user profile:', error);
          setProfile(null);
          setLoading(false);
          setIsAuthReady(true);
        }
      } else {
        setProfile(null);
        if (unsubscribeProfile) unsubscribeProfile();
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    return await authService.signInWithGoogle();
  };

  const signInWithEmail = async (email: string, password: string) => {
    return await authService.signIn(email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    return await authService.signUp(email, password);
  };

  const sendPasswordReset = async (email: string) => {
    await authService.sendPasswordReset(email);
  };

  const setupRecaptcha = (containerId: string) => {
    return authService.setupRecaptcha(containerId);
  };

  const sendOTP = async (phoneNumber: string, appVerifier: any) => {
    return await authService.sendOTP(phoneNumber, appVerifier);
  };

  const verifyOTP = async (confirmationResult: any, otp: string) => {
    return await authService.verifyOTP(confirmationResult, otp);
  };

  const signOut = async () => {
    await authService.signOut();
  };

  const value = {
    user,
    profile,
    loading,
    isAuthReady,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    setupRecaptcha,
    sendOTP,
    verifyOTP,
    signOut,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
