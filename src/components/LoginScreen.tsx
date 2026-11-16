import React, { useState } from 'react';
import { Eye, EyeOff, Lock, LogIn, Mail, UserPlus } from 'lucide-react';
import { NovaLogo } from './NovaLogo';
import { LocalAuthResult } from '../utils/localAuth';

interface LoginScreenProps {
  onSignIn: (email: string, password: string) => LocalAuthResult;
  onSignUp: (email: string, password: string) => LocalAuthResult;
  onContinueAsGuest: () => void;
  authError: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSignIn,
  onSignUp,
  onContinueAsGuest,
  authError,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  const displayError = localFeedback || authError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalFeedback(null);

    const result =
      mode === 'signup' ? onSignUp(email, password) : onSignIn(email, password);

    if (!result.ok) {
      setLocalFeedback(result.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 min-h-[100dvh] w-full bg-[#0f0f0f] text-white overflow-y-auto flex flex-col items-center justify-between px-6 py-8">
      <div className="relative z-10 flex-1 w-full max-w-sm flex flex-col items-center justify-center text-center space-y-6 py-4">
        <NovaLogo size={44} />

        {/* Title */}
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Welcome to Nova<span className="trademark">™</span>
          </h1>
          <p className="text-xs text-neutral-400">
            Sign in or create an account to continue
          </p>
        </div>

        {/* Sign In / Sign Up Mode Tabs */}
        <div className="w-full grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#171717] border border-[#2a2a2a]">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setLocalFeedback(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'signin'
                ? 'bg-white text-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setLocalFeedback(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Sign Up</span>
          </button>
        </div>

        {displayError && (
          <div
            role="alert"
            className="w-full rounded-lg bg-[#171717] border border-neutral-600 px-4 py-2.5 text-xs text-neutral-100 text-start"
          >
            {displayError}
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-3.5 text-start">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-300">Email</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] ps-10 pe-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-300">
              Password {mode === 'signup' && '(6+ characters)'}
            </span>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] ps-10 pe-10 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-sm transition-colors cursor-pointer mt-2"
          >
            {mode === 'signup' ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Sign Up</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={onContinueAsGuest}
          className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer py-1"
        >
          Continue as Guest
        </button>
      </div>

      {/* Bottom Footer Attribution */}
      <p className="relative z-10 text-xs text-neutral-500 pt-4 text-center">
        © Nova<span className="trademark">™</span> - All Rights Reserved
      </p>
    </div>
  );
};
