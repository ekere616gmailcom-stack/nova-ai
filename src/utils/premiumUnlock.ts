export const NOVA_PREMIUM_KEY = 'nova_premium';
export const NOVA_PREMIUM_UNTIL_KEY = 'nova_premium_until';
export const NOVA_SHARES_KEY = 'nova_shares';
export const NOVA_PREMIUM_SOURCE_KEY = 'nova_premium_source';
export const VIP_UNLOCK_CODE = 'JOHN-VIP-2026';
export const REQUIRED_SHARES_FOR_FREE_PREMIUM = 5;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type PremiumSource = 'share' | 'vip' | 'paid' | '';

export interface PremiumStatus {
  isPremium: boolean;
  source: PremiumSource;
  daysRemaining: number;
  untilMs: number | null;
  shares: number;
  expired: boolean;
}

export function getShareCount(): number {
  try {
    const raw = localStorage.getItem(NOVA_SHARES_KEY);
    const num = Number(raw || '0');
    if (Number.isFinite(num) && num >= 0) {
      return Math.min(REQUIRED_SHARES_FOR_FREE_PREMIUM, Math.floor(num));
    }
  } catch {
    // ignore storage errors
  }
  return 0;
}

export function getPremiumStatus(): PremiumStatus {
  let active = false;
  let source: PremiumSource = '';
  let untilMs: number | null = null;
  let expired = false;
  let shares = getShareCount();

  try {
    const rawActive = localStorage.getItem(NOVA_PREMIUM_KEY);
    const rawSource = (localStorage.getItem(NOVA_PREMIUM_SOURCE_KEY) || '') as PremiumSource;
    const rawUntil = localStorage.getItem(NOVA_PREMIUM_UNTIL_KEY);

    if (rawActive === 'true') {
      if (rawUntil) {
        const parsedUntil = Number(rawUntil);
        if (Number.isFinite(parsedUntil)) {
          if (Date.now() > parsedUntil) {
            // Expired after 30 days: reset so user can share again or pay
            expired = true;
            active = false;
            localStorage.setItem(NOVA_PREMIUM_KEY, 'false');
            localStorage.removeItem(NOVA_PREMIUM_UNTIL_KEY);
            localStorage.removeItem(NOVA_PREMIUM_SOURCE_KEY);
            localStorage.setItem(NOVA_SHARES_KEY, '0');
            shares = 0;
          } else {
            active = true;
            untilMs = parsedUntil;
            source = rawSource || 'share';
          }
        } else {
          active = true;
          source = rawSource || 'vip';
        }
      } else {
        active = true;
        source = rawSource || 'vip';
      }
    }
  } catch {
    // ignore storage errors
  }

  const daysRemaining =
    untilMs && active
      ? Math.max(1, Math.ceil((untilMs - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0;

  return {
    isPremium: active,
    source,
    daysRemaining,
    untilMs,
    shares,
    expired,
  };
}

export function unlockPremiumViaVipCode(): PremiumStatus {
  try {
    localStorage.setItem(NOVA_PREMIUM_KEY, 'true');
    localStorage.setItem(NOVA_PREMIUM_SOURCE_KEY, 'vip');
    localStorage.removeItem(NOVA_PREMIUM_UNTIL_KEY);
  } catch {
    // ignore
  }
  return getPremiumStatus();
}

export function unlockPremiumFreeViaShare(): PremiumStatus {
  const until = Date.now() + THIRTY_DAYS_MS;
  try {
    localStorage.setItem(NOVA_PREMIUM_KEY, 'true');
    localStorage.setItem(NOVA_PREMIUM_UNTIL_KEY, String(until));
    localStorage.setItem(NOVA_PREMIUM_SOURCE_KEY, 'share');
    localStorage.setItem(NOVA_SHARES_KEY, String(REQUIRED_SHARES_FOR_FREE_PREMIUM));
  } catch {
    // ignore
  }
  return getPremiumStatus();
}

export function unlockPremiumPaidMonthly(): PremiumStatus {
  const until = Date.now() + THIRTY_DAYS_MS;
  try {
    localStorage.setItem(NOVA_PREMIUM_KEY, 'true');
    localStorage.setItem(NOVA_PREMIUM_UNTIL_KEY, String(until));
    localStorage.setItem(NOVA_PREMIUM_SOURCE_KEY, 'paid');
  } catch {
    // ignore
  }
  return getPremiumStatus();
}

export function incrementShareCount(): {
  nextShares: number;
  justUnlocked: boolean;
  status: PremiumStatus;
} {
  const current = getShareCount();
  const nextShares = Math.min(REQUIRED_SHARES_FOR_FREE_PREMIUM, current + 1);
  try {
    localStorage.setItem(NOVA_SHARES_KEY, String(nextShares));
  } catch {
    // ignore
  }
  if (nextShares >= REQUIRED_SHARES_FOR_FREE_PREMIUM) {
    const status = unlockPremiumFreeViaShare();
    return { nextShares, justUnlocked: true, status };
  }
  return {
    nextShares,
    justUnlocked: false,
    status: getPremiumStatus(),
  };
}

export function getNovaShareLinks(): {
  link: string;
  text: string;
  whatsappUrl: string;
  telegramUrl: string;
  facebookUrl: string;
} {
  const link =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://nova-ai.app';
  const text = `Try Nova - AI created by John God's Will. Chat, generate images, and build apps: ${link}`;
  return {
    link,
    text,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
    telegramUrl: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
    facebookUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(text)}`,
  };
}
