import React, { useState } from 'react';
import {
  Brain,
  Check,
  Crown,
  Eye,
  Gauge,
  Globe,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  LanguageCode,
  NovaMemory,
  PlanType,
  SUPPORTED_LANGUAGES,
  UserProfile,
  VOICE_OPTIONS,
  VoiceName,
  VoiceSpeed,
} from '../types';
import { TranslationStrings } from '../i18n/translations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  voiceSpeed: VoiceSpeed;
  memory: NovaMemory;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeVoice: (voice: VoiceName) => void;
  onChangeVoiceSpeed: (speed: VoiceSpeed) => void;
  onChangePlan: (plan: PlanType) => void;
  onUpdateMemory: (patch: Partial<NovaMemory>) => void;
  onClearMemory: () => void;
  t: TranslationStrings;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  voiceSpeed,
  memory,
  onChangeLanguage,
  onChangeVoice,
  onChangeVoiceSpeed,
  onChangePlan,
  onUpdateMemory,
  onClearMemory,
  t,
}) => {
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memoryCleared, setMemoryCleared] = useState(false);

  if (!isOpen) return null;

  const isPremium = profile.plan === 'premium';
  const isFemaleVoice = profile.voiceName === 'Kore' || profile.voiceName === 'Zephyr';

  const savedMemoryCount = [
    memory.name,
    memory.school,
    memory.business,
    memory.favouriteStyle,
    memory.preferredLanguage,
    ...(memory.pastNotes || []),
  ].filter((v) => v && v.trim().length > 0).length;

  const handleClearMemoryClick = () => {
    onClearMemory();
    setMemoryCleared(true);
    setTimeout(() => setMemoryCleared(false), 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto overscroll-y-contain rounded-2xl bg-[#0F0D18] border border-purple-500/30 p-6 shadow-[0_0_64px_-16px_rgba(168,85,247,0.55)] space-y-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Customize Nova</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.settings}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Memory Section inside Customize */}
        <div className="rounded-2xl bg-[#161324] border border-sky-500/25 p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-4 h-4 text-sky-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Memory</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Nova remembers your name, school, business, favourite style, language, and past chats ({savedMemoryCount} saved).
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMemoryPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-sky-500/15 border border-sky-400/35 text-sky-200 hover:bg-sky-500/25 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showMemoryPanel ? 'Hide Memory' : 'View Memory'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearMemoryClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{memoryCleared ? 'Memory Cleared' : 'Clear Memory'}</span>
            </button>
          </div>

          {showMemoryPanel && (
            <div className="pt-3 border-t border-white/10 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Your Name</span>
                  <input
                    type="text"
                    value={memory.name}
                    onChange={(e) => onUpdateMemory({ name: e.target.value })}
                    placeholder="e.g. Chidi"
                    className="w-full rounded-xl bg-[#0A0A0F] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">School</span>
                  <input
                    type="text"
                    value={memory.school}
                    onChange={(e) => onUpdateMemory({ school: e.target.value })}
                    placeholder="e.g. UNILAG"
                    className="w-full rounded-xl bg-[#0A0A0F] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Business / Work</span>
                  <input
                    type="text"
                    value={memory.business}
                    onChange={(e) => onUpdateMemory({ business: e.target.value })}
                    placeholder="e.g. Fashion brand"
                    className="w-full rounded-xl bg-[#0A0A0F] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Favourite Style</span>
                  <input
                    type="text"
                    value={memory.favouriteStyle}
                    onChange={(e) => onUpdateMemory({ favouriteStyle: e.target.value })}
                    placeholder="e.g. Anime, Cinematic"
                    className="w-full rounded-xl bg-[#0A0A0F] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] text-slate-400">Preferred Chat Language</span>
                <input
                  type="text"
                  value={memory.preferredLanguage}
                  onChange={(e) => onUpdateMemory({ preferredLanguage: e.target.value })}
                  placeholder="e.g. English, Nigerian Pidgin, Yoruba, Igbo, Hausa"
                  className="w-full rounded-xl bg-[#0A0A0F] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-400"
                />
              </label>

              {memory.pastNotes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-400">Remembered from Past Chats</div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {memory.pastNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-[#0A0A0F] border border-white/8 px-3 py-1.5 text-xs text-slate-300"
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Language Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Globe className="w-4 h-4 text-purple-400" />
            <span>{t.languageSettingsTitle}</span>
          </div>
          <p className="text-xs text-slate-400">{t.languageSettingsDesc}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = profile.language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onChangeLanguage(lang.code)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-start transition-colors cursor-pointer ${
                    active
                      ? 'bg-purple-600/20 border-purple-400 text-white'
                      : 'bg-[#161324] border-white/8 text-slate-300 hover:border-purple-500/35'
                  }`}
                >
                  <span className="text-sm font-medium truncate">{lang.nativeName}</span>
                  {active && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice Settings: Male / Female + Speed (Slow / Normal / Fast) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Volume2 className="w-4 h-4 text-purple-400" />
            <span>{t.voiceSettingsTitle}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeVoice('Kore')}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isFemaleVoice
                  ? 'bg-purple-600/25 border-purple-400 text-white'
                  : 'bg-[#161324] border-white/8 text-slate-300 hover:border-purple-500/35'
              }`}
            >
              Female Voice (Kore / Zephyr)
            </button>
            <button
              type="button"
              onClick={() => onChangeVoice('Charon')}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                !isFemaleVoice
                  ? 'bg-purple-600/25 border-purple-400 text-white'
                  : 'bg-[#161324] border-white/8 text-slate-300 hover:border-purple-500/35'
              }`}
            >
              Male Voice (Charon / Puck)
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {VOICE_OPTIONS.map((v) => {
              const active = profile.voiceName === v.name;
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onChangeVoice(v.name)}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-purple-600/25 border-purple-400 text-white'
                      : 'bg-[#161324] border-white/8 text-slate-300 hover:border-purple-500/35'
                  }`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Gauge className="w-3.5 h-3.5 text-purple-400" />
              <span>Voice Speed</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(['slow', 'normal', 'fast'] as VoiceSpeed[]).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => onChangeVoiceSpeed(sp)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors cursor-pointer ${
                    voiceSpeed === sp
                      ? 'bg-purple-600/25 border border-purple-400 text-white'
                      : 'bg-[#161324] border border-white/8 text-slate-400 hover:text-white'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Plan Switch */}
        <div className="rounded-xl bg-[#161324] border border-purple-500/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <Crown className="w-4 h-4 text-purple-400" />
              <span>{isPremium ? t.premiumPlan : t.freePlan}</span>
            </div>
            <p className="text-xs text-slate-400">
              {isPremium ? t.premiumPlanDesc : t.freePlanDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChangePlan(isPremium ? 'free' : 'premium')}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white nova-btn-glow transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPremium ? t.switchToFree : t.activatePremium}
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-medium bg-white/8 hover:bg-white/14 text-slate-200 transition-colors cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
