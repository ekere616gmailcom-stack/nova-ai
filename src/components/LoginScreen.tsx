import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { NovaLogo } from './NovaLogo';

interface LoginScreenProps {
  onGoogleLogin: () => Promise<void>;
  onContinueAsGuest: () => void;
  authError: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onGoogleLogin,
  onContinueAsGuest,
  authError,
}) => {
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleClick = async () => {
    setGoogleLoading(true);
    try {
      await onGoogleLogin();
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 min-h-[100dvh] w-full bg-black text-white overflow-y-auto flex flex-col items-center justify-between px-6 py-8">
      {/* Subtle Neon Purple Ambient Glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(191, 90, 242, 0.25), transparent 52%), radial-gradient(circle at 50% 82%, rgba(168, 85, 247, 0.14), transparent 55%)',
        }}
      />

      <div className="relative z-10 flex-1 w-full max-w-sm flex flex-col items-center justify-center text-center space-y-8 py-4">
        {/* Big Glowing Neon Purple & White Nova Orb */}
        <div className="relative flex items-center justify-center w-44 h-44">
          <div className="absolute inset-0 rounded-full bg-[#BF5AF2]/35 blur-3xl animate-pulse" />
          <div
            className="relative w-36 h-36 rounded-full border border-[#BF5AF2]/85 shadow-[0_0_80px_rgba(191,90,242,0.85),inset_0_0_32px_rgba(255,255,255,0.85)] flex items-center justify-center"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #F3E8FF 24%, #BF5AF2 58%, #A855F7 84%, #0A0A0A 100%)',
            }}
          >
            <NovaLogo size={46} glow={true} />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          Welcome to Nova
        </h1>

        {authError && (
          <div className="w-full rounded-2xl bg-[#0A0A0A] border border-[#BF5AF2]/60 px-4 py-2.5 text-xs text-white">
            {authError}
          </div>
        )}

        {/* Primary Big White Google Button + Small Continue as Guest Link */}
        <div className="w-full flex flex-col items-center space-y-4">
          <button
            type="button"
            onClick={() => void handleGoogleClick()}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white hover:bg-white/90 text-black font-semibold text-base shadow-[0_0_34px_-6px_rgba(191,90,242,0.65)] transition-all cursor-pointer disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-black" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#000000"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#A855F7"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#BF5AF2"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#000000"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          <button
            type="button"
            onClick={onContinueAsGuest}
            className="text-xs text-white/65 hover:text-[#BF5AF2] underline underline-offset-4 transition-colors cursor-pointer py-1"
          >
            Continue as Guest
          </button>
        </div>
      </div>

      {/* Bottom Footer Attribution */}
      <p className="relative z-10 text-xs text-white/60 tracking-wide pt-4 text-center">
        Made by [Your Name] in Nigeria
      </p>
    </div>
  );
};
