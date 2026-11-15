import React, { useState } from 'react';
import {
  Brain,
  Check,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto overscroll-y-contain rounded-2xl bg-[#0A0A0A] border border-[#BF5AF2]/40 p-6 shadow-[0_0_64px_-16px_rgba(191,90,242,0.55)] space-y-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#A855F7]/25">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">{t.settings}</h2>
            <p className="text-xs text-white/60 mt-0.5">Local memory, language &amp; voice</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 rounded-lg text-white/65 hover:text-white hover:bg-[#A855F7]/15 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Local Memory Section */}
        <div className="rounded-2xl bg-black border border-[#A855F7]/35 p-4 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/45 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-4 h-4 text-[#BF5AF2]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Local Memory</div>
                <p className="text-xs text-white/65 mt-0.5">
                  Nova remembers your name, style, school, business, language, and past chats locally on this device ({savedMemoryCount} saved).
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMemoryPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-[#0A0A0A] border border-[#BF5AF2]/50 text-white hover:bg-[#A855F7]/20 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>{showMemoryPanel ? 'Hide Memory' : 'View & Edit Memory'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearMemoryClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/35 text-white/80 hover:text-white hover:border-[#BF5AF2] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>{memoryCleared ? 'Memory Cleared' : 'Clear Memory'}</span>
            </button>
          </div>

          {showMemoryPanel && (
            <div className="pt-3 border-t border-[#A855F7]/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] text-white/65">Your Name</span>
                  <input
                    type="text"
                    value={memory.name}
                    onChange={(e) => onUpdateMemory({ name: e.target.value })}
                    placeholder="e.g. Chidi"
                    className="w-full rounded-xl bg-[#0A0A0A] border border-[#A855F7]/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#BF5AF2]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-white/65">Favourite Style &amp; Vibe</span>
                  <input
                    type="text"
                    value={memory.favouriteStyle}
                    onChange={(e) => onUpdateMemory({ favouriteStyle: e.target.value })}
                    placeholder="e.g. Casual & funny, Anime, Cinematic"
                    className="w-full rounded-xl bg-[#0A0A0A] border border-[#A855F7]/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#BF5AF2]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-white/65">School</span>
                  <input
                    type="text"
                    value={memory.school}
                    onChange={(e) => onUpdateMemory({ school: e.target.value })}
                    placeholder="e.g. UNILAG"
                    className="w-full rounded-xl bg-[#0A0A0A] border border-[#A855F7]/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#BF5AF2]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-white/65">Business / Work</span>
                  <input
                    type="text"
                    value={memory.business}
                    onChange={(e) => onUpdateMemory({ business: e.target.value })}
                    placeholder="e.g. Fashion brand"
                    className="w-full rounded-xl bg-[#0A0A0A] border border-[#A855F7]/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#BF5AF2]"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] text-white/65">Preferred Chat Language</span>
                <input
                  type="text"
                  value={memory.preferredLanguage}
                  onChange={(e) => onUpdateMemory({ preferredLanguage: e.target.value })}
                  placeholder="e.g. English, Nigerian Pidgin, Yoruba, Igbo, Hausa"
                  className="w-full rounded-xl bg-[#0A0A0A] border border-[#A855F7]/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#BF5AF2]"
                />
              </label>

              {memory.pastNotes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-white/65">Remembered from Past Chats</div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {memory.pastNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-[#0A0A0A] border border-[#A855F7]/25 px-3 py-1.5 text-xs text-white/85"
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
            <Globe className="w-4 h-4 text-[#BF5AF2]" />
            <span>{t.languageSettingsTitle}</span>
          </div>
          <p className="text-xs text-white/60">{t.languageSettingsDesc}</p>
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
                      ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white nova-active-glow'
                      : 'bg-black border-[#A855F7]/25 text-white/80 hover:border-[#BF5AF2]'
                  }`}
                >
                  <span className="text-sm font-medium truncate">{lang.nativeName}</span>
                  {active && <Check className="w-3.5 h-3.5 text-[#BF5AF2] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Read-Aloud Voice Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Volume2 className="w-4 h-4 text-[#BF5AF2]" />
            <span>{t.voiceSettingsTitle}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeVoice('Kore')}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isFemaleVoice
                  ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                  : 'bg-black border-[#A855F7]/25 text-white/75 hover:border-[#BF5AF2]'
              }`}
            >
              Female Voice (Kore / Zephyr)
            </button>
            <button
              type="button"
              onClick={() => onChangeVoice('Charon')}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                !isFemaleVoice
                  ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                  : 'bg-black border-[#A855F7]/25 text-white/75 hover:border-[#BF5AF2]'
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
                      ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                      : 'bg-black border-[#A855F7]/25 text-white/75 hover:border-[#BF5AF2]'
                  }`}
                >
                  {v.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <Gauge className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>Voice Speed</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(['slow', 'normal', 'fast'] as VoiceSpeed[]).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => onChangeVoiceSpeed(sp)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors cursor-pointer border ${
                    voiceSpeed === sp
                      ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                      : 'bg-black border-[#A855F7]/25 text-white/70 hover:text-white'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
