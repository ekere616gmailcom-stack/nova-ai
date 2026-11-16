import React, { useState } from 'react';
import {
  Brain,
  Check,
  Eye,
  Gauge,
  Globe,
  ShieldCheck,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  LanguageCode,
  NovaMemory,
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
  instantMode: boolean;
  isMuted: boolean;
  themeMode: 'normal' | 'premium';
  earthEnabled: boolean;
  memory: NovaMemory;
  onChangeLanguage: (lang: LanguageCode) => void;
  onChangeVoice: (voice: VoiceName) => void;
  onChangeVoiceSpeed: (speed: VoiceSpeed) => void;
  onToggleInstantMode: (enabled: boolean) => void;
  onToggleMute: () => void;
  onSelectThemeMode: (mode: 'normal' | 'premium') => void;
  onToggleEarth: () => void;
  onUpdateMemory: (patch: Partial<NovaMemory>) => void;
  onClearMemory: () => void;
  t: TranslationStrings;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  voiceSpeed,
  instantMode,
  isMuted,
  memory,
  onChangeLanguage,
  onChangeVoice,
  onChangeVoiceSpeed,
  onToggleInstantMode,
  onToggleMute,
  onUpdateMemory,
  onClearMemory,
  t,
}) => {
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memoryCleared, setMemoryCleared] = useState(false);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto overscroll-y-contain rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2a2a2a]">
          <div>
            <h2 className="text-lg font-semibold text-white">{t.settings}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Local memory, language &amp; voice</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Response Speed: Instant Mode (Default ON) */}
        <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-neutral-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Instant Mode — {instantMode ? 'ON' : 'OFF'}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Instant replies in browser cache with zero typing delay and fast 512px images.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleInstantMode(!instantMode)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer border ${
              instantMode
                ? 'bg-white border-white text-black'
                : 'bg-[#171717] border-[#2a2a2a] text-neutral-300 hover:text-white'
            }`}
          >
            {instantMode ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Global Sound Effects: Mute / Unmute */}
        <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-neutral-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-neutral-200" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Sound Effects — {isMuted ? 'Muted' : 'Unmuted'}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Audio feedback when sending messages and generating images.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={isMuted}
            aria-label={isMuted ? 'Unmute sound effects' : 'Mute sound effects'}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer border ${
              !isMuted
                ? 'bg-white border-white text-black'
                : 'bg-[#171717] border-[#2a2a2a] text-neutral-300 hover:text-white'
            }`}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Unmute</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Mute</span>
              </>
            )}
          </button>
        </div>

        {/* Local Memory Section */}
        <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-4 h-4 text-neutral-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Local Memory</div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Nova remembers your name, style, school, business, language, and past chats locally on this device ({savedMemoryCount} saved).
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMemoryPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] text-white hover:border-neutral-500 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-neutral-300" />
              <span>{showMemoryPanel ? 'Hide Memory' : 'View & Edit Memory'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearMemoryClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
              <span>{memoryCleared ? 'Memory Cleared' : 'Clear Memory'}</span>
            </button>
          </div>

          {showMemoryPanel && (
            <div className="pt-3 border-t border-[#2a2a2a] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] text-neutral-400">Your Name</span>
                  <input
                    type="text"
                    value={memory.name}
                    onChange={(e) => onUpdateMemory({ name: e.target.value })}
                    placeholder="e.g. Chidi"
                    className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-neutral-400">Favourite Style &amp; Vibe</span>
                  <input
                    type="text"
                    value={memory.favouriteStyle}
                    onChange={(e) => onUpdateMemory({ favouriteStyle: e.target.value })}
                    placeholder="e.g. Minimal, Cinematic, Documentary"
                    className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-neutral-400">School</span>
                  <input
                    type="text"
                    value={memory.school}
                    onChange={(e) => onUpdateMemory({ school: e.target.value })}
                    placeholder="e.g. UNILAG"
                    className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-neutral-400">Business / Work</span>
                  <input
                    type="text"
                    value={memory.business}
                    onChange={(e) => onUpdateMemory({ business: e.target.value })}
                    placeholder="e.g. Software studio"
                    className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] text-neutral-400">Preferred Chat Language</span>
                <input
                  type="text"
                  value={memory.preferredLanguage}
                  onChange={(e) => onUpdateMemory({ preferredLanguage: e.target.value })}
                  placeholder="e.g. English, Nigerian Pidgin, Yoruba, Igbo, Hausa"
                  className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                />
              </label>

              {memory.pastNotes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-neutral-400">Remembered from Past Chats</div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {memory.pastNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg bg-[#171717] border border-[#2a2a2a] px-3 py-1.5 text-xs text-neutral-200"
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
            <Globe className="w-4 h-4 text-neutral-300" />
            <span>{t.languageSettingsTitle}</span>
          </div>
          <p className="text-xs text-neutral-400">{t.languageSettingsDesc}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = profile.language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onChangeLanguage(lang.code)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-start transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#262626] border-neutral-400 text-white'
                      : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  <span className="text-sm font-medium truncate">{lang.nativeName}</span>
                  {active && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Read-Aloud Voice Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Volume2 className="w-4 h-4 text-neutral-300" />
            <span>{t.voiceSettingsTitle}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeVoice('Kore')}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                isFemaleVoice
                  ? 'bg-[#262626] border-neutral-400 text-white'
                  : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:border-neutral-500 hover:text-white'
              }`}
            >
              Female Voice (Kore / Zephyr)
            </button>
            <button
              type="button"
              onClick={() => onChangeVoice('Charon')}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                !isFemaleVoice
                  ? 'bg-[#262626] border-neutral-400 text-white'
                  : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:border-neutral-500 hover:text-white'
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
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#262626] border-neutral-400 text-white'
                      : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:border-neutral-500 hover:text-white'
                  }`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <Gauge className="w-3.5 h-3.5 text-neutral-400" />
              <span>Voice Speed</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(['slow', 'normal', 'fast'] as VoiceSpeed[]).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => onChangeVoiceSpeed(sp)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer border ${
                    voiceSpeed === sp
                      ? 'bg-[#262626] border-neutral-400 text-white'
                      : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:text-white'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* About Nova / Creator Info */}
        <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1c1c1c] border border-[#2a2a2a] flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4 text-neutral-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                About Nova<span className="trademark">™</span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Creator: John God&apos;s Will
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Nova<span className="trademark">™</span> is created by John God&apos;s Will in Nigeria.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-neutral-400 shrink-0">
            Nova<span className="trademark">™</span> AI
          </span>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
