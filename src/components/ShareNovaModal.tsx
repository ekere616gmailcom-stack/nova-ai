import React, { useState } from 'react';
import { Check, Copy, Crown, Gift, Share2, Sparkles, X } from 'lucide-react';
import { NovaLogo } from './NovaLogo';

interface ShareNovaModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPremium: boolean;
  onUnlockFreePremium: () => void;
}

export const ShareNovaModal: React.FC<ShareNovaModalProps> = ({
  isOpen,
  onClose,
  isPremium,
  onUnlockFreePremium,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [rewardUnlockedJustNow, setRewardUnlockedJustNow] = useState(false);

  if (!isOpen) return null;

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://nova.ai';
  const shareText = `Try Nova — my smart AI assistant for chat, images, voice, and building websites & apps! ${shareUrl}`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  const handleRewardShare = () => {
    if (!isPremium) {
      onUnlockFreePremium();
      setRewardUnlockedJustNow(true);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore clipboard errors
    }
    setCopiedLink(true);
    handleRewardShare();
    window.setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleTikTokShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // ignore
    }
    handleRewardShare();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl bg-[#11121A] border border-purple-500/35 p-6 shadow-[0_0_70px_-15px_rgba(168,85,247,0.55)] space-y-5 my-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C3AED]/30 to-[#38BDF8]/25 border border-purple-400/40 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-1.5">
                <span>Share &amp; Grow Nova</span>
                <NovaLogo size={18} glow={false} />
              </h2>
              <p className="text-xs text-purple-200 mt-0.5 font-medium">
                Share Nova with friends and get free Premium
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reward Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-[#7C3AED]/18 to-[#38BDF8]/15 border border-purple-400/30 p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center shrink-0">
            <Crown className="w-4 h-4 text-amber-300" />
          </div>
          <div className="text-xs leading-relaxed text-slate-200">
            {rewardUnlockedJustNow ? (
              <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                Free Nova Premium unlocked! Thanks for sharing.
              </span>
            ) : isPremium ? (
              <span className="text-sky-200 font-medium">
                Nova Premium is active on your account. Invite your friends to try Nova!
              </span>
            ) : (
              <span>
                Tap any platform below to invite friends and unlock{' '}
                <strong className="text-white">Free Nova Premium</strong> (unlimited chats &amp; images).
              </span>
            )}
          </div>
        </div>

        {/* Link Preview Box */}
        <div className="rounded-2xl bg-[#0A0A0F] border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-slate-300 truncate">{shareUrl}</span>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium bg-white/8 hover:bg-white/15 text-white shrink-0 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-purple-300" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* 4 Social Share Buttons: WhatsApp, TikTok, Facebook, Copy Link */}
        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={`https://wa.me/?text=${encodedText}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleRewardShare}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>WhatsApp</span>
          </a>

          <a
            href="https://www.tiktok.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void handleTikTokShare()}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold bg-[#181924] hover:bg-[#232536] border border-cyan-400/40 text-white transition-colors"
          >
            <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
            <span>TikTok</span>
          </a>

          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleRewardShare}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold bg-[#1877F2] hover:bg-[#166FE5] text-white transition-colors"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>Facebook</span>
          </a>

          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>Copied Link!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 shrink-0" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
