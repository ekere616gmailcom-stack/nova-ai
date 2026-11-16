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
  LanguageCode,
  SUPPORTED_LANGUAGES,
  UserProfile,
  VOICE_OPTIONS,
  VoiceName,
} from '../types';
import { TranslationStrings } from '../i18n/translations';
import { PremiumStatus } from '../utils/premiumUnlock';

interface UserProfileViewProps {
  isSignedIn: boolean;
  profile: UserProfile;
  premiumStatus: PremiumStatus;
  onOpenPremiumModal: () => void;
  onBackToChat: () => void;
  onOpenLogin: () => void;
  onSignOut: () => void;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeVoice: (voice: VoiceName) => void;
  onClearHistory: () => Promise<void>;
  t: TranslationStrings;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  isSignedIn,
  profile,
  premiumStatus,
  onOpenPremiumModal,
  onBackToChat,
  onOpenLogin,
  onSignOut,
  onChangeLanguage,
  onChangeVoice,
  onClearHistory,
  t,
}) => {
  const [clearing, setClearing] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

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
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-[#0f0f0f]">
      <div className="max-w-[800px] mx-auto space-y-8">
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.backToChat}</span>
          </button>

          {isSignedIn ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] text-white hover:border-neutral-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-neutral-300" />
              <span>{t.signOut}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In / Sign Up</span>
            </button>
          )}
        </div>

        {/* Page Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {t.settings}
          </h1>
          <p className="text-sm text-neutral-400 mt-1.5">
            Manage your account, language, and voice preferences.
          </p>
        </div>

        {/* Account Identity */}
        <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-[#2a2a2a]">
            <div className="flex items-center gap-4 min-w-0">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-lg object-cover border border-[#2a2a2a] shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-[#212121] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                  <UserIcon className="w-7 h-7 text-neutral-300" />
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-semibold text-white truncate">
                  {isSignedIn ? profile.displayName : t.guestUser}
                </h2>
                <div className="flex items-center gap-2 text-sm text-neutral-400 truncate">
                  <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="truncate">
                    {isSignedIn ? profile.email : t.guestSyncHint}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1">
              <div className="text-xs text-neutral-400">{t.nameLabel}</div>
              <div className="text-sm font-medium text-white">
                {isSignedIn ? profile.displayName : t.guestUser}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-neutral-400">{t.emailLabel}</div>
              <div className="text-sm font-medium text-neutral-200">
                {isSignedIn ? profile.email : '—'}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-neutral-400">{t.currentPlanLabel}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <Crown className="w-4 h-4 text-neutral-300 shrink-0" />
                <span className="text-sm font-semibold text-white">
                  {premiumStatus.isPremium
                    ? premiumStatus.source === 'share'
                      ? `Premium - Free via Sharing (Expires in ${premiumStatus.daysRemaining} days)`
                      : 'Nova Premium'
                    : 'Free Plan'}
                </span>
                {!premiumStatus.isPremium && (
                  <button
                    type="button"
                    onClick={onOpenPremiumModal}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-neutral-200 text-black cursor-pointer"
                  >
                    Unlock Free / Go Premium
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Interface Language Selection */}
        <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-neutral-300 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                {t.languageSettingsTitle}
              </h3>
              <p className="text-xs text-neutral-400 mt-1">{t.languageSettingsDesc}</p>
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
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-start transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#262626] border-neutral-400 text-white'
                      : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{lang.nativeName}</div>
                    <div className="text-[11px] text-neutral-400 truncate">{lang.englishName}</div>
                  </div>
                  {selected && <Check className="w-4 h-4 text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Voice Persona Selection */}
        <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Volume2 className="w-5 h-5 text-neutral-300 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                {t.voiceSettingsTitle}
              </h3>
              <p className="text-xs text-neutral-400 mt-1">{t.voiceSettingsDesc}</p>
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
                  className={`px-3 py-2.5 rounded-lg border text-start transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#262626] border-neutral-400 text-white'
                      : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="text-[11px] text-neutral-400 truncate">{v.tone}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* About Nova */}
        <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 space-y-1.5">
          <h3 className="text-lg font-semibold text-white">
            About Nova<span className="trademark">™</span>
          </h3>
          <p className="text-sm text-neutral-200">Creator: John God&apos;s Will</p>
          <p className="text-xs text-neutral-400">
            Powered by Nova<span className="trademark">™</span> AI
          </p>
        </section>

        {/* Clear History Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 pb-8">
          <span className="text-xs text-neutral-500">
            © Nova<span className="trademark">™</span> - All Rights Reserved
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] text-white hover:border-neutral-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5 text-neutral-300" />
            <span>{clearedNotice ? t.clearHistoryConfirm : t.clearHistory}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
