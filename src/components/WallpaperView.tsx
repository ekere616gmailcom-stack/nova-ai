import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallpaper,
} from 'lucide-react';
import {
  WALLPAPER_STYLES,
  WALLPAPER_TIMES,
  WallpaperState,
  WallpaperStyle,
  WallpaperTime,
} from '../types';

interface WallpaperViewProps {
  state: WallpaperState;
  onUpdateState: (patch: Partial<WallpaperState>) => void;
  onGenerateWallpaper: (style: WallpaperStyle) => Promise<void>;
  isGenerating: boolean;
  errorMessage?: string | null;
  onBackToChat: () => void;
}

export const WallpaperView: React.FC<WallpaperViewProps> = ({
  state,
  onUpdateState,
  onGenerateWallpaper,
  isGenerating,
  errorMessage = null,
  onBackToChat,
}) => {
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'toggle' | 'set' | null>(null);
  const [appliedToast, setAppliedToast] = useState(false);

  const handleToggleDaily = () => {
    if (!state.autoEnabled && !state.permissionGranted) {
      setPendingAction('toggle');
      setShowPermissionModal(true);
      return;
    }
    onUpdateState({ autoEnabled: !state.autoEnabled });
  };

  const handleSetAsWallpaper = () => {
    if (!state.permissionGranted) {
      setPendingAction('set');
      setShowPermissionModal(true);
      return;
    }
    onUpdateState({ appliedAsBackground: true });
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 2600);
  };

  const handleConfirmPermission = () => {
    setShowPermissionModal(false);
    if (pendingAction === 'toggle') {
      onUpdateState({ permissionGranted: true, autoEnabled: true });
      if (!state.currentImageUrl) {
        void onGenerateWallpaper(state.style);
      }
    } else if (pendingAction === 'set') {
      onUpdateState({ permissionGranted: true, appliedAsBackground: true });
      setAppliedToast(true);
      setTimeout(() => setAppliedToast(false), 2600);
    }
    setPendingAction(null);
  };

  const handleDownload = () => {
    if (!state.currentImageUrl) return;
    const link = document.createElement('a');
    link.href = state.currentImageUrl;
    link.download = `nova-wallpaper-${state.style.toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-black">
      <div className="max-w-[800px] mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#BF5AF2] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          {state.permissionGranted && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#BF5AF2]">
              <ShieldCheck className="w-4 h-4" />
              <span>Wallpaper permission granted</span>
            </span>
          )}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            Daily AI Wallpaper
          </h1>
          <p className="text-sm text-white/65 mt-1.5">
            Wake up to a fresh Nova wallpaper every morning. Choose your daily schedule and aesthetic style.
          </p>
        </div>

        {/* Daily Auto-Change Toggle Card */}
        <section className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">
              Change my wallpaper every day
            </div>
            <p className="text-xs text-white/65">
              Generates a new wallpaper at {state.scheduleTime} in {state.style} style. Web displays Download + Set; Android auto-applies on schedule.
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleDaily}
            role="switch"
            aria-checked={state.autoEnabled}
            className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl text-xs font-semibold transition-all cursor-pointer shrink-0 border ${
              state.autoEnabled
                ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                : 'bg-black border-[#A855F7]/30 text-white/80 hover:text-white hover:border-[#BF5AF2]'
            }`}
          >
            <span>{state.autoEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </section>

        {/* Style & Time Settings */}
        <section className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 p-5 space-y-5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-white">
              <Sparkles className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>Wallpaper Style</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {WALLPAPER_STYLES.map((style) => {
                const active = state.style === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      onUpdateState({ style });
                      void onGenerateWallpaper(style);
                    }}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap border ${
                      active
                        ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                        : 'bg-black border-[#A855F7]/25 text-white/80 hover:text-white hover:border-[#BF5AF2]'
                    }`}
                  >
                    {style}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-[#A855F7]/20">
            <div className="flex items-center gap-2 text-xs font-medium text-white">
              <Clock className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>Daily Schedule Time</span>
            </div>
            <div className="flex items-center gap-2.5">
              {WALLPAPER_TIMES.map((time: WallpaperTime) => {
                const active = state.scheduleTime === time;
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => onUpdateState({ scheduleTime: time })}
                    className={`px-4 py-2 rounded-2xl text-xs font-mono font-medium transition-all cursor-pointer border ${
                      active
                        ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white nova-active-glow'
                        : 'bg-black border-[#A855F7]/25 text-white/70 hover:text-white'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Today's Wallpaper Big Preview */}
        <section className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs text-[#BF5AF2] font-medium">
                Today’s Wallpaper · {state.style}
              </div>
              <h2 className="text-lg font-semibold text-white mt-0.5">
                {state.currentTitle || `${state.style} Edition`}
              </h2>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-white/65">
              <Smartphone className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>9:16 Mobile · Web + Android Ready</span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="relative w-64 aspect-[9/16] rounded-3xl overflow-hidden border border-[#BF5AF2]/50 bg-black shadow-[0_0_40px_-14px_rgba(191,90,242,0.65)] shrink-0 flex items-center justify-center">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#BF5AF2]" />
                  <span className="text-xs text-white">
                    Generating real image...
                  </span>
                </div>
              ) : errorMessage ? (
                <div className="flex flex-col items-center justify-center gap-2.5 p-5 text-center">
                  <AlertCircle className="w-6 h-6 text-[#BF5AF2]" />
                  <div className="text-xs font-semibold text-white">Wallpaper generation failed</div>
                  <p className="text-[11px] text-white/75 leading-relaxed">{errorMessage}</p>
                </div>
              ) : state.currentImageUrl ? (
                <img
                  src={state.currentImageUrl}
                  alt={state.currentTitle || 'Today Nova Wallpaper'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-5 text-center">
                  <Wallpaper className="w-6 h-6 text-[#A855F7]" />
                  <span className="text-xs text-white/70">
                    Click Next Wallpaper to generate today’s real AI wallpaper.
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4 w-full">
              {state.currentQuote && (
                <blockquote className="rounded-2xl bg-black border border-[#A855F7]/30 p-4 text-sm text-white/90 leading-relaxed">
                  “{state.currentQuote}”
                </blockquote>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSetAsWallpaper}
                  disabled={!state.currentImageUrl || isGenerating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {appliedToast ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Applied to Nova Workspace</span>
                    </>
                  ) : (
                    <>
                      <Wallpaper className="w-4 h-4" />
                      <span>Set as Wallpaper</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!state.currentImageUrl || isGenerating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-medium bg-black border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-[#BF5AF2]" />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={() => void onGenerateWallpaper(state.style)}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-medium bg-black border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-4 h-4 text-[#BF5AF2] ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>Next Wallpaper</span>
                </button>
              </div>

              <p className="text-xs text-white/60 leading-relaxed">
                On web browsers, click <strong>Download</strong> to save the high-resolution image or <strong>Set as Wallpaper</strong> to theme your Nova workspace backdrop. In the Android build, Nova automatically updates your home screen wallpaper every day at {state.scheduleTime}.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Wallpaper Permission Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0A0A0A] border border-[#BF5AF2]/60 p-6 shadow-[0_0_60px_-15px_rgba(191,90,242,0.7)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#A855F7]/20 border border-[#BF5AF2]/50 flex items-center justify-center shrink-0">
                <Wallpaper className="w-5 h-5 text-[#BF5AF2]" />
              </div>
              <h2 className="text-base font-semibold text-white">
                Allow Nova to change wallpaper?
              </h2>
            </div>

            <p className="text-xs text-white/75 leading-relaxed">
              Nova will generate a new {state.style} wallpaper at {state.scheduleTime} each day only after you grant permission.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPermissionModal(false);
                  setPendingAction(null);
                }}
                className="px-4 py-2 rounded-2xl text-xs font-medium bg-black border border-white/20 text-white hover:border-[#BF5AF2] cursor-pointer"
              >
                Deny
              </button>
              <button
                type="button"
                onClick={handleConfirmPermission}
                className="px-4 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow cursor-pointer"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
