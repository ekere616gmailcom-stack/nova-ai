import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Crown,
  Globe,
  LogIn,
  LogOut,
  Mail,
  Trash2,
  User as UserIcon,
  Volume2,
} from 'lucide-react';
import {
  FREE_DAILY_LIMIT,
  FREE_IMAGE_LIMIT,
  LanguageCode,
  PlanType,
  SUPPORTED_LANGUAGES,
  UserProfile,
  VOICE_OPTIONS,
  VoiceName,
} from '../types';
import { TranslationStrings } from '../i18n/translations';

interface UserProfileViewProps {
  isSignedIn: boolean;
  profile: UserProfile;
  dailyUsed: number;
  dailyImageUsed: number;
  onBackToChat: () => void;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeVoice: (voice: VoiceName) => void;
  onChangePlan: (plan: PlanType) => void;
  onClearHistory: () => Promise<void>;
  t: TranslationStrings;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  isSignedIn,
  profile,
  dailyUsed,
  dailyImageUsed,
  onBackToChat,
  onSignInGoogle,
  onSignOut,
  onChangeLanguage,
  onChangeVoice,
  onChangePlan,
  onClearHistory,
  t,
}) => {
  const [clearing, setClearing] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

  const isPremium = profile.plan === 'premium';
  const usagePercent = isPremium
    ? 100
    : Math.min(100, Math.round((dailyUsed / FREE_DAILY_LIMIT) * 100));

  const handleClear = async () => {
    setClearing(true);
    try {
      await onClearHistory();
      setClearedNotice(true);
      setTimeout(() => setClearedNotice(false), 2500);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-[#0A0A0F]">
      <div className="max-w-[800px] mx-auto space-y-8">
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-purple-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.backToChat}</span>
          </button>

          {isSignedIn ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-medium bg-[#1A1A22] border border-white/10 text-slate-300 hover:text-white hover:border-purple-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t.signOut}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignInGoogle}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-medium bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t.signInGoogle}</span>
            </button>
          )}
        </div>

        {/* Page Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {t.profileHeading}
          </h1>
          <p className="text-sm text-slate-400 mt-1.5">{t.profileSubheading}</p>
        </div>

        {/* Account Identity & Plan Overview */}
        <section className="rounded-2xl bg-[#1A1A22] border border-white/10 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-white/8">
            <div className="flex items-center gap-4 min-w-0">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-2xl object-cover border border-purple-400/40 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/35 flex items-center justify-center shrink-0">
                  <UserIcon className="w-7 h-7 text-purple-300" />
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-semibold text-white truncate">
                  {isSignedIn ? profile.displayName : t.guestUser}
                </h2>
                <div className="flex items-center gap-2 text-sm text-slate-400 truncate">
                  <Mail className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="truncate">
                    {isSignedIn ? profile.email : t.guestSyncHint}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm shrink-0">
              {isPremium ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-purple-200">
                  <Crown className="w-4 h-4 text-purple-400" />
                  <span>{t.premiumPlan}</span>
                </span>
              ) : (
                <span className="text-slate-300 font-medium">{t.freePlan}</span>
              )}
            </div>
          </div>

          {/* Account Details & Daily Usage Meter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="text-xs text-slate-400">{t.nameLabel}</div>
              <div className="text-sm font-medium text-white">
                {isSignedIn ? profile.displayName : t.guestUser}
              </div>
              <div className="text-xs text-slate-400 pt-2">{t.emailLabel}</div>
              <div className="text-sm font-medium text-slate-200">
                {isSignedIn ? profile.email : '—'}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t.dailyUsageLabel}</span>
                <span className="font-mono tabular-nums text-purple-200">
                  {isPremium
                    ? t.unlimitedChats
                    : `${dailyUsed} / ${FREE_DAILY_LIMIT} ${t.usedToday}`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isPremium
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7]'
                      : dailyUsed >= FREE_DAILY_LIMIT
                        ? 'bg-rose-500'
                        : 'bg-purple-500'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {t.currentPlanLabel}:{' '}
                  <span className="text-slate-200 font-medium">
                    {isPremium ? t.premiumPlan : t.freePlan}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-slate-300">
                  {isPremium
                    ? t.unlimitedChats
                    : `${Math.max(0, FREE_IMAGE_LIMIT - dailyImageUsed)} / ${FREE_IMAGE_LIMIT} ${t.imagesLeftToday}`}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Subscription Plan Management */}
        <section className="space-y-3">
          <h3 className="font-display text-lg font-semibold text-white">{t.subscriptionTitle}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Free Plan Option */}
            <div
              className={`rounded-2xl p-5 border transition-colors flex flex-col justify-between gap-4 ${
                !isPremium
                  ? 'bg-[#151124] border-purple-400/55'
                  : 'bg-[#0F0D18] border-white/10'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold text-white">{t.freePlan}</span>
                  {!isPremium && (
                    <span className="text-xs font-medium text-purple-300">{t.activeLabel}</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{t.freePlanDesc}</p>
              </div>
              {isPremium && (
                <button
                  type="button"
                  onClick={() => onChangePlan('free')}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {t.switchToFree}
                </button>
              )}
            </div>

            {/* Premium Plan Option */}
            <div
              className={`rounded-2xl p-5 border transition-colors flex flex-col justify-between gap-4 ${
                isPremium
                  ? 'bg-[#17112B] border-purple-400 shadow-[0_0_32px_-12px_rgba(168,85,247,0.65)]'
                  : 'bg-[#0F0D18] border-purple-500/25'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-display text-base font-semibold text-white">
                    <Crown className="w-4 h-4 text-purple-400" />
                    <span>{t.premiumPlan}</span>
                  </span>
                  {isPremium && (
                    <span className="text-xs font-medium text-purple-300">{t.activeLabel}</span>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{t.premiumPlanDesc}</p>
              </div>
              {!isPremium && (
                <button
                  type="button"
                  onClick={() => onChangePlan('premium')}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white nova-btn-glow transition-all cursor-pointer whitespace-nowrap"
                >
                  {t.activatePremium}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Interface Language Selection */}
        <section className="rounded-2xl bg-[#0F0D18] border border-white/10 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-display text-lg font-semibold text-white">
                {t.languageSettingsTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{t.languageSettingsDesc}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const selected = profile.language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onChangeLanguage(lang.code)}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-start transition-all cursor-pointer ${
                    selected
                      ? 'bg-purple-600/20 border-purple-400 text-white shadow-[0_0_20px_-8px_rgba(168,85,247,0.75)]'
                      : 'bg-[#151221] border-white/8 text-slate-300 hover:border-purple-500/35 hover:text-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{lang.nativeName}</div>
                    <div className="text-[11px] text-slate-400 truncate">{lang.englishName}</div>
                  </div>
                  {selected && <Check className="w-4 h-4 text-purple-300 shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Voice Persona Selection */}
        <section className="rounded-2xl bg-[#0F0D18] border border-white/10 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Volume2 className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-display text-lg font-semibold text-white">
                {t.voiceSettingsTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{t.voiceSettingsDesc}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {VOICE_OPTIONS.map((v) => {
              const selected = profile.voiceName === v.name;
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onChangeVoice(v.name)}
                  className={`px-3 py-2.5 rounded-xl border text-start transition-all cursor-pointer ${
                    selected
                      ? 'bg-purple-600/20 border-purple-400 text-white'
                      : 'bg-[#151221] border-white/8 text-slate-300 hover:border-purple-500/35'
                  }`}
                >
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{v.tone}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Clear History Action */}
        <div className="flex items-center justify-between gap-4 pt-2 pb-8">
          <span className="text-xs text-slate-400">{t.multilingualNote}</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{clearedNotice ? t.clearHistoryConfirm : t.clearHistory}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
