import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Gift,
  KeyRound,
  MessageCircle,
  Send,
  Share2,
  Unlock,
  X,
} from 'lucide-react';
import {
  PremiumStatus,
  REQUIRED_SHARES_FOR_FREE_PREMIUM,
  VIP_UNLOCK_CODE,
  getNovaShareLinks,
  incrementShareCount,
  unlockPremiumPaidMonthly,
  unlockPremiumViaVipCode,
} from '../utils/premiumUnlock';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  premiumStatus: PremiumStatus;
  onStatusUpdated: (next: PremiumStatus, celebration?: string) => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  isOpen,
  onClose,
  premiumStatus,
  onStatusUpdated,
}) => {
  const [vipCode, setVipCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldownHint, setCooldownHint] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [celebrationMsg, setCelebrationMsg] = useState<string | null>(null);
  const lastShareMsRef = useRef<number>(0);

  if (!isOpen) return null;

  const { text, whatsappUrl, telegramUrl, facebookUrl } = getNovaShareLinks();
  const shares = premiumStatus.shares;
  const progressPct = Math.min(100, (shares / REQUIRED_SHARES_FOR_FREE_PREMIUM) * 100);

  const registerShareClick = () => {
    const now = Date.now();
    const diff = now - lastShareMsRef.current;
    if (lastShareMsRef.current > 0 && diff < 2000) {
      setCooldownHint('Wait 2 seconds before counting your next share.');
      return;
    }
    lastShareMsRef.current = now;
    setCooldownHint(null);

    const { justUnlocked, status } = incrementShareCount();
    if (justUnlocked) {
      const msg =
        'Congratulations. You shared with 5 people. Premium unlocked for 30 days free.';
      setCelebrationMsg(msg);
      onStatusUpdated(status, msg);
    } else {
      onStatusUpdated(status);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard errors
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
    registerShareClick();
  };

  const handleRedeemCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (vipCode.trim().toUpperCase() === VIP_UNLOCK_CODE) {
      const next = unlockPremiumViaVipCode();
      setCodeError(null);
      setVipCode('');
      const msg = 'VIP Code accepted. Nova Premium unlocked.';
      setCelebrationMsg(msg);
      onStatusUpdated(next, msg);
      return;
    }
    setCodeError('Invalid code. Enter a valid VIP code.');
  };

  const handleActivatePaidPlan = () => {
    const next = unlockPremiumPaidMonthly();
    const msg = 'Nova Premium activated for 30 days.';
    setCelebrationMsg(msg);
    onStatusUpdated(next, msg);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto overscroll-y-contain rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#212121] border border-[#2a2a2a] flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-neutral-200" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Unlock Nova Premium</h2>
              <p className="text-xs text-neutral-400">
                Access Wallpapers, Live Wallpapers &amp; Unlimited Pro Tools
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close popup"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {celebrationMsg && (
          <div
            role="status"
            className="rounded-lg bg-[#212121] border border-neutral-500 px-4 py-3 text-xs font-semibold text-white space-y-2"
          >
            <p>{celebrationMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold cursor-pointer"
            >
              Start Using Premium
            </button>
          </div>
        )}

        {/* Option B: FREE — Share to 5 friends to unlock Premium FREE */}
        <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Gift className="w-5 h-5 text-neutral-300 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-neutral-400">
                  Option B · Free
                </div>
                <h3 className="text-sm font-semibold text-white">
                  Share to 5 friends to unlock Premium FREE
                </h3>
              </div>
            </div>
            <span className="text-xs font-mono font-semibold text-neutral-300 shrink-0 tabular-nums">
              {shares}/5
            </span>
          </div>

          {/* Share Progress Counter & Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-300 font-medium">
                You have shared to {shares}/5 people
              </span>
              <span className="text-neutral-300 font-mono tabular-nums">{Math.round(progressPct)}%</span>
            </div>
            <div className="w-full h-2 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={registerShareClick}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share Nova on WhatsApp</span>
          </a>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={registerShareClick}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-neutral-300" />
              <span>WhatsApp</span>
            </a>

            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={registerShareClick}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-neutral-300" />
              <span>Telegram</span>
            </a>

            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={registerShareClick}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-neutral-300" />
              <span>Facebook</span>
            </a>

            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-300" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          {cooldownHint && (
            <p className="text-[11px] text-neutral-300 font-medium">{cooldownHint}</p>
          )}
        </div>

        {/* Option A: Pay ₦2,000/month + Unlock with VIP Code */}
        <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-neutral-400">
                Option A · Instant Access
              </div>
              <div className="text-sm font-semibold text-white">
                Pay - ₦2,000/month
              </div>
            </div>
            <button
              type="button"
              onClick={handleActivatePaidPlan}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer shrink-0"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Go Premium - ₦2,000/mo</span>
            </button>
          </div>

          <form onSubmit={handleRedeemCode} className="pt-3 border-t border-[#2a2a2a] space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-300">
              <KeyRound className="w-3.5 h-3.5 text-neutral-400" />
              <span>Have a VIP Code?</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={vipCode}
                onChange={(e) => {
                  setVipCode(e.target.value);
                  if (codeError) setCodeError(null);
                }}
                placeholder="Enter unlock code..."
                className="flex-1 rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 font-mono"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#262626] border border-[#3a3a3a] text-white hover:bg-[#333333] transition-colors cursor-pointer shrink-0"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Apply</span>
              </button>
            </div>
            {codeError && <p className="text-xs text-neutral-300">{codeError}</p>}
          </form>
        </div>
      </div>
    </div>
  );
};
