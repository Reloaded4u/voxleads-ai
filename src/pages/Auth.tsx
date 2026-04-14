import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { PhoneCall, Sparkles, Shield, Zap, Mail, Phone, Lock, ArrowRight, Loader2, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

type AuthMode = 'options' | 'email' | 'phone' | 'otp';

export default function Auth() {
  const { 
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithEmail, 
    sendPasswordReset,
    setupRecaptcha,
    sendOTP,
    verifyOTP 
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('options');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Phone state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  useEffect(() => {
    if (mode === 'phone') {
      // Initialize reCAPTCHA when entering phone mode
      try {
        setupRecaptcha('recaptcha-container');
      } catch (error) {
        console.error('reCAPTCHA init error:', error);
      }
    }
  }, [mode, setupRecaptcha]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Signed in successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        toast.success('Signed in successfully!');
      } else {
        await signUpWithEmail(email, password);
        toast.success('Account created successfully!');
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      toast.success('Password reset email sent!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;

    setLoading(true);
    try {
      const appVerifier = (window as any).recaptchaVerifier;
      const result = await sendOTP(phoneNumber, appVerifier);
      setConfirmationResult(result);
      setMode('otp');
      toast.success('OTP sent to your phone!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send OTP');
      // Reset reCAPTCHA on error
      if ((window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier.render().then((widgetId: any) => {
          (window as any).grecaptcha.reset(widgetId);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult) return;

    setLoading(true);
    try {
      await verifyOTP(confirmationResult, otp);
      toast.success('Phone verified successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const renderOptions = () => (
    <div className="space-y-4 pt-4">
      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border border-zinc-200 text-zinc-900 rounded-2xl font-bold hover:bg-zinc-50 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
        Continue with Google
      </button>

      <button
        onClick={() => setMode('phone')}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200 active:scale-[0.98] disabled:opacity-50"
      >
        <Phone size={20} />
        Continue with Phone
      </button>

      <button
        onClick={() => setMode('email')}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-zinc-100 text-zinc-900 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50"
      >
        <Mail size={20} />
        Continue with Email
      </button>
    </div>
  );

  const renderEmailForm = () => (
    <form onSubmit={handleEmailAuth} className="space-y-4 pt-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center ml-1">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
          {isLogin && (
            <button 
              type="button"
              onClick={handleForgotPassword}
              className="text-xs font-bold text-orange-600 hover:text-orange-700"
            >
              Forgot?
            </button>
          )}
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Sign In' : 'Create Account')}
        {!loading && <ArrowRight size={20} />}
      </button>

      <button
        type="button"
        onClick={() => setIsLogin(!isLogin)}
        className="w-full text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
      </button>
    </form>
  );

  const renderPhoneForm = () => (
    <form onSubmit={handleSendOTP} className="space-y-4 pt-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Phone Number</label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 234 567 8900"
            className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            required
          />
        </div>
        <p className="text-[10px] text-zinc-400 ml-1">Include country code (e.g. +1 for USA)</p>
      </div>

      <div id="recaptcha-container"></div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Verification Code'}
        {!loading && <ArrowRight size={20} />}
      </button>
    </form>
  );

  const renderOTPForm = () => (
    <form onSubmit={handleVerifyOTP} className="space-y-4 pt-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Verification Code</label>
        <div className="relative">
          <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            maxLength={6}
            className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-center tracking-[0.5em] font-bold text-xl"
            required
          />
        </div>
        <p className="text-[10px] text-zinc-400 ml-1 text-center">Enter the 6-digit code sent to {phoneNumber}</p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Verify & Continue'}
      </button>

      <button
        type="button"
        onClick={() => setMode('phone')}
        className="w-full text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        Change Phone Number
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-3xl border border-zinc-200 shadow-xl shadow-zinc-200/50">
        <div className="text-center">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200 mb-6">
            <PhoneCall size={32} />
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center border-2 border-white">
              <Sparkles size={12} className="text-orange-400" />
            </div>
          </div>
          
          {mode !== 'options' && (
            <button 
              onClick={() => setMode('options')}
              className="absolute left-6 top-10 p-2 hover:bg-zinc-50 rounded-xl transition-colors text-zinc-400 hover:text-zinc-900"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">
            {mode === 'options' ? 'VoxLeads AI' : 
             mode === 'email' ? (isLogin ? 'Welcome Back' : 'Create Account') :
             mode === 'phone' ? 'Phone Login' : 'Verify Phone'}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            {mode === 'options' ? 'The next generation of AI-driven sales automation.' :
             mode === 'email' ? (isLogin ? 'Enter your credentials to continue.' : 'Join the future of sales automation.') :
             mode === 'phone' ? 'Enter your number to receive an OTP.' : 'We sent a code to your device.'}
          </p>
        </div>

        {mode === 'options' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
              <div className="p-2 bg-white rounded-lg text-orange-500 shadow-sm">
                <Sparkles size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">AI Voice Agents</h4>
                <p className="text-xs text-zinc-500 mt-0.5">Automated calling with natural language understanding.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
              <div className="p-2 bg-white rounded-lg text-orange-500 shadow-sm">
                <Shield size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Secure & Reliable</h4>
                <p className="text-xs text-zinc-500 mt-0.5">Enterprise-grade security for your lead data.</p>
              </div>
            </div>
          </div>
        )}

        {mode === 'options' && renderOptions()}
        {mode === 'email' && renderEmailForm()}
        {mode === 'phone' && renderPhoneForm()}
        {mode === 'otp' && renderOTPForm()}

        <p className="mt-6 text-center text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
          Secure enterprise authentication
        </p>
      </div>
    </div>
  );
}
