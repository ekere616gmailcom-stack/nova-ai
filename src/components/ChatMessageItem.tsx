import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Brain,
  Check,
  Copy,
  Download,
  Layers,
  Phone,
  SlidersHorizontal,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { ChatMessage, VoiceName, VoiceSpeed } from '../types';
import { TranslationStrings } from '../i18n/translations';
import { NovaLogo } from './NovaLogo';
import { AppBuilderCard, BuiltAppPayload } from './AppBuilderCard';

const BUILDER_CATEGORIES = [
  'Shop',
  'Portfolio',
  'School',
  'Church',
  'Restaurant',
  'Calculator',
  'To-Do App',
  'Quiz App',
  'Music Player',
  'Weather App',
];

const TTS_RATE_STORAGE_KEY = 'nova_speech_rate_v1';
const TTS_PITCH_STORAGE_KEY = 'nova_speech_pitch_v1';
const SPEECH_START_EVENT = 'nova:speech-started';

function loadStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const num = Number(raw);
      if (Number.isFinite(num) && num >= min && num <= max) {
        return Math.round(num * 10) / 10;
      }
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

interface ChatMessageItemProps {
  message: ChatMessage;
  t: TranslationStrings;
  voiceName: VoiceName;
  voiceSpeed?: VoiceSpeed;
  isStreaming?: boolean;
  isCreatingImage?: boolean;
  isEditingBuiltApp?: boolean;
  onCreateVariations?: (prompt: string) => void;
  onEditBuiltApp?: (editInstruction: string, currentHtml: string) => void;
  onQuickPickBuilderCategory?: (category: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  t,
  voiceName,
  voiceSpeed = 'normal',
  isStreaming = false,
  isCreatingImage = false,
  isEditingBuiltApp = false,
  onCreateVariations,
  onEditBuiltApp,
  onQuickPickBuilderCategory,
}) => {
  const defaultRate = voiceSpeed === 'slow' ? 0.8 : voiceSpeed === 'fast' ? 1.3 : 1.0;

  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [reaction, setReaction] = useState<'like' | 'dislike' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVoiceControls, setShowVoiceControls] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(() =>
    loadStoredNumber(TTS_RATE_STORAGE_KEY, defaultRate, 0.5, 2.0)
  );
  const [speechPitch, setSpeechPitch] = useState<number>(() =>
    loadStoredNumber(TTS_PITCH_STORAGE_KEY, 1.0, 0.5, 2.0)
  );
  const [ttsHint, setTtsHint] = useState<string | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopAllPlayback = useCallback(() => {
    activeUtteranceRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    const handleOtherSpeechStarted = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id && detail.id !== message.id) {
        activeUtteranceRef.current = null;
        setIsPlaying(false);
      }
    };
    window.addEventListener(SPEECH_START_EVENT, handleOtherSpeechStarted);
    return () => {
      window.removeEventListener(SPEECH_START_EVENT, handleOtherSpeechStarted);
      if (activeUtteranceRef.current) {
        stopAllPlayback();
      }
    };
  }, [message.id, stopAllPlayback]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleCopyPrompt = async (promptText: string) => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1800);
    } catch {
      // ignore
    }
  };

  const cleanTextForSpeech = (rawText: string) =>
    rawText
      .replace(/\[\[NOVA_MEMORY_USED\]\]/g, '')
      .replace(/\[\[NOVA_BUILDER_CATEGORIES\]\]/g, '')
      .replace(/\[\[NOVA_BUILDER_START\]\][\s\S]*?\[\[NOVA_BUILDER_END\]\]/g, '')
      .replace(/\[\[NOVA_CALL:([^|\]]+)\|([^\]]+)\]\]/g, 'Call $1 at $2.')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const speakMessageAloud = (rateValue: number, pitchValue: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTtsHint('Voice not available, type instead');
      return;
    }

    const cleaned = cleanTextForSpeech(message.content);
    if (!cleaned) return;

    setTtsHint(null);
    window.speechSynthesis.cancel();
    window.dispatchEvent(new CustomEvent(SPEECH_START_EVENT, { detail: { id: message.id } }));

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = rateValue;
    utterance.pitch = pitchValue;

    const preferFemale = voiceName === 'Kore' || voiceName === 'Zephyr';
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const matchFemale =
        /female|samantha|victoria|karen|zira|google uk english female|google us english|moira|tessa|serena/i;
      const matchMale =
        /male|daniel|alex|david|fred|google uk english male|oliver|aaron|arthur/i;
      const preferred = voices.find((v) =>
        preferFemale ? matchFemale.test(v.name) : matchMale.test(v.name)
      );
      if (preferred) utterance.voice = preferred;
    }

    activeUtteranceRef.current = utterance;

    utterance.onend = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
        setIsPlaying(false);
      }
    };
    utterance.onerror = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
        setIsPlaying(false);
      }
    };

    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleSpeech = () => {
    if (isPlaying) {
      stopAllPlayback();
      return;
    }
    speakMessageAloud(speechRate, speechPitch);
  };

  const handleChangeRate = (nextRate: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(nextRate * 10) / 10));
    setSpeechRate(clamped);
    try {
      localStorage.setItem(TTS_RATE_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
    if (isPlaying) {
      speakMessageAloud(clamped, speechPitch);
    }
  };

  const handleChangePitch = (nextPitch: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(nextPitch * 10) / 10));
    setSpeechPitch(clamped);
    try {
      localStorage.setItem(TTS_PITCH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
    if (isPlaying) {
      speakMessageAloud(speechRate, clamped);
    }
  };

  const handleDownloadImage = (url: string, idx = 0) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `nova-image-${message.id.slice(0, 6)}-${idx + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // User Bubble: Purple gradient #7C3AED -> #A855F7 with crisp white text
  if (message.role === 'user') {
    return (
      <div className="flex justify-end w-full">
        <div className="max-w-[90%] sm:max-w-[82%] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#A855F7] px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-[0_8px_28px_-8px_rgba(124,58,237,0.65)] space-y-2">
          {message.imageDataUrl && (
            <img
              src={message.imageDataUrl}
              alt="Uploaded reference"
              referrerPolicy="no-referrer"
              className="max-h-56 w-auto rounded-xl object-cover border border-white/20"
            />
          )}
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  const galleryUrls =
    message.imageUrls && message.imageUrls.length > 0
      ? message.imageUrls
      : message.imageDataUrl
        ? [message.imageDataUrl]
        : [];
  const promptForActions = message.imagePrompt || message.content;

  const hasMemoryUsed = message.content.includes('[[NOVA_MEMORY_USED]]');
  const contentWithoutMemoryTag = message.content.replace(/\[\[NOVA_MEMORY_USED\]\]\s*/g, '');

  const hasBuilderCategories = contentWithoutMemoryTag.includes('[[NOVA_BUILDER_CATEGORIES]]');
  let workingContent = contentWithoutMemoryTag.replace(/\[\[NOVA_BUILDER_CATEGORIES\]\]\s*/g, '');

  let builtApp: BuiltAppPayload | null = null;
  const builderMatch = workingContent.match(
    /\[\[NOVA_BUILDER_START\]\]([\s\S]*?)\[\[NOVA_BUILDER_END\]\]/
  );
  if (builderMatch) {
    try {
      const parsed = JSON.parse(builderMatch[1]) as Partial<BuiltAppPayload>;
      if (parsed && typeof parsed.html === 'string' && parsed.html.trim().length > 0) {
        builtApp = {
          title: parsed.title || 'Nova App',
          appType: parsed.appType === 'app' ? 'app' : 'website',
          summary: parsed.summary || '',
          html: parsed.html,
        };
      }
    } catch {
      // ignore invalid partial builder payload
    }
    workingContent = workingContent.replace(builderMatch[0], '').trim();
  }

  const callMatch = workingContent.match(/\[\[NOVA_CALL:([^|\]]+)\|([^\]]+)\]\]/);
  const callContact = callMatch
    ? { name: callMatch[1].trim(), phone: callMatch[2].trim() }
    : null;
  const displayMarkdown = callMatch
    ? workingContent.replace(callMatch[0], '').trim()
    : workingContent;

  return (
    <div className="flex items-start gap-3.5 w-full">
      <div className="shrink-0 mt-1">
        <NovaLogo size={30} glow={false} />
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {hasMemoryUsed && !isStreaming && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-400/35 text-[11px] font-medium text-sky-200">
            <Brain className="w-3 h-3 text-sky-300" />
            <span>I remember you</span>
          </div>
        )}

        {/* AI Bubble: Dark Grey #1A1A22 with White Text */}
        <div className="rounded-2xl bg-[#1A1A22] border border-white/8 px-4 py-3.5 text-white space-y-3">
          {isCreatingImage ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-purple-200">{t.creatingImage}</p>
              <div className="relative h-64 w-full max-w-md rounded-2xl bg-[#111118] border border-purple-500/25 overflow-hidden nova-shimmer" />
            </div>
          ) : galleryUrls.length > 0 ? (
            <div className="space-y-3">
              <div
                className={`grid gap-3 ${
                  galleryUrls.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-lg'
                }`}
              >
                {galleryUrls.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-2xl overflow-hidden border border-purple-500/25 bg-[#0A0A0F]"
                  >
                    <img
                      src={url}
                      alt={promptForActions || 'Nova generated artwork'}
                      referrerPolicy="no-referrer"
                      className="w-full h-auto block object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDownloadImage(url, idx)}
                      className="absolute bottom-2.5 end-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-black/75 backdrop-blur-md text-white border border-white/15 hover:border-purple-400 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t.downloadImage}</span>
                    </button>
                  </div>
                ))}
              </div>

              {promptForActions && (
                <p className="text-xs text-slate-300 leading-relaxed">{promptForActions}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDownloadImage(galleryUrls[0], 0)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-medium bg-white/6 hover:bg-white/12 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-purple-300" />
                  <span>{t.downloadImage}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleCopyPrompt(promptForActions)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-medium bg-white/6 hover:bg-white/12 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedPrompt ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-purple-300" />
                  )}
                  <span>{copiedPrompt ? t.copied : t.copyPrompt}</span>
                </button>

                {onCreateVariations && promptForActions && (
                  <button
                    type="button"
                    onClick={() => onCreateVariations(promptForActions)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-medium bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{t.variations}</span>
                  </button>
                )}

                {message.content && (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleSpeech}
                      title={isPlaying ? t.stopAudio : t.listen}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isPlaying
                          ? 'bg-purple-500/25 border border-purple-400/50 text-white'
                          : 'bg-white/6 hover:bg-white/12 text-white'
                      }`}
                    >
                      {isPlaying ? (
                        <Square className="w-3 h-3 fill-purple-400 text-purple-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-purple-300" />
                      )}
                      <span>{isPlaying ? t.stopAudio : t.listen}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowVoiceControls((v) => !v)}
                      title="Voice pitch & speed"
                      aria-label="Voice pitch and speed settings"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-2xl text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        showVoiceControls
                          ? 'bg-purple-500/20 border-purple-400/50 text-purple-100'
                          : 'bg-white/6 border-transparent hover:bg-white/12 text-slate-300'
                      }`}
                    >
                      <SlidersHorizontal className="w-3 h-3 text-purple-300" />
                      <span className="font-mono tabular-nums">{speechRate.toFixed(1)}x</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : displayMarkdown || callContact || builtApp || hasBuilderCategories ? (
            <>
              {builtApp && (
                <AppBuilderCard
                  app={builtApp}
                  onEditApp={onEditBuiltApp}
                  isEditing={isEditingBuiltApp}
                />
              )}
              {displayMarkdown && (
                <div className="nova-prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayMarkdown}</ReactMarkdown>
                </div>
              )}
              {hasBuilderCategories && onQuickPickBuilderCategory && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {BUILDER_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => onQuickPickBuilderCategory(category)}
                      className="px-3 py-1.5 rounded-2xl text-xs font-medium bg-[#12121A] hover:bg-purple-500/25 border border-purple-500/30 hover:border-purple-400 text-purple-100 transition-colors cursor-pointer"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
              {callContact && (
                <div className="rounded-2xl bg-[#0A0A0F] border border-purple-500/30 p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-purple-600/25 border border-purple-500/40 flex items-center justify-center text-base font-semibold text-purple-200 shrink-0">
                      {callContact.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {callContact.name}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-300 mt-0.5">
                        {callContact.phone}
                      </div>
                    </div>
                  </div>
                  <a
                    href={`tel:${callContact.phone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call</span>
                  </a>
                </div>
              )}
            </>
          ) : isStreaming ? (
            /* 3-Dot Typing Animation when Nova is thinking */
            <div className="flex items-center gap-2 py-1" aria-label={t.thinking}>
              <span className="w-2 h-2 rounded-full bg-purple-400 nova-dot" />
              <span className="w-2 h-2 rounded-full bg-purple-400 nova-dot nova-dot-2" />
              <span className="w-2 h-2 rounded-full bg-purple-400 nova-dot nova-dot-3" />
            </div>
          ) : null}
        </div>

        {/* Action Row under AI Text Answer: Copy, Like, Dislike, Speaker */}
        {!isStreaming && !isCreatingImage && message.content && galleryUrls.length === 0 && (
          <div className="flex items-center gap-2 ps-1 flex-wrap">
            <button
              type="button"
              onClick={handleCopy}
              title={t.copy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/6 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">{t.copied}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t.copy}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setReaction((r) => (r === 'like' ? null : 'like'))}
              title={t.like}
              aria-label={t.like}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                reaction === 'like'
                  ? 'text-purple-300 bg-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/6'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setReaction((r) => (r === 'dislike' ? null : 'dislike'))}
              title={t.dislike}
              aria-label={t.dislike}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                reaction === 'dislike'
                  ? 'text-rose-300 bg-rose-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/6'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleToggleSpeech}
              title={isPlaying ? t.stopAudio : t.listen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isPlaying
                  ? 'bg-purple-500/25 text-purple-100 border border-purple-400/45'
                  : 'text-slate-300 hover:text-white hover:bg-white/6'
              }`}
            >
              {isPlaying ? (
                <Square className="w-3 h-3 fill-purple-400 text-purple-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-purple-300" />
              )}
              <span>{isPlaying ? t.stopAudio : t.listen}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowVoiceControls((v) => !v)}
              title="Voice pitch & speed"
              aria-label="Voice pitch and speed settings"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                showVoiceControls
                  ? 'bg-purple-500/20 border-purple-400/45 text-purple-100'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/6'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums text-[11px]">
                {speechRate.toFixed(1)}x · Pitch {speechPitch.toFixed(1)}
              </span>
            </button>

            {ttsHint && <span className="text-xs text-slate-400">{ttsHint}</span>}
          </div>
        )}

        {/* Inline Pitch & Speed Control Panel for SpeechSynthesis */}
        {!isStreaming && !isCreatingImage && showVoiceControls && message.content && (
          <div className="rounded-2xl bg-[#13141E] border border-purple-500/25 p-3.5 space-y-3 max-w-md">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">Voice Speed &amp; Pitch</span>
              <button
                type="button"
                onClick={() => {
                  handleChangeRate(1.0);
                  handleChangePitch(1.0);
                }}
                className="text-[11px] text-purple-300 hover:text-white cursor-pointer"
              >
                Reset
              </button>
            </div>

            {/* Speed Control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">Speed</span>
                <span className="font-mono tabular-nums text-purple-200">{speechRate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speechRate}
                onChange={(e) => handleChangeRate(Number(e.target.value))}
                aria-label="Voice speed"
                className="w-full accent-purple-500 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0.75, 1.0, 1.25, 1.5].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleChangeRate(preset)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-colors cursor-pointer ${
                      Math.abs(speechRate - preset) < 0.06
                        ? 'bg-purple-500/30 border border-purple-400/60 text-white'
                        : 'bg-white/6 text-slate-300 hover:text-white'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>

            {/* Pitch Control */}
            <div className="space-y-1.5 pt-1 border-t border-white/8">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium">Pitch</span>
                <span className="font-mono tabular-nums text-sky-200">{speechPitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speechPitch}
                onChange={(e) => handleChangePitch(Number(e.target.value))}
                aria-label="Voice pitch"
                className="w-full accent-sky-400 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: 'Low', val: 0.7 },
                  { label: 'Normal', val: 1.0 },
                  { label: 'High', val: 1.4 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleChangePitch(preset.val)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                      Math.abs(speechPitch - preset.val) < 0.06
                        ? 'bg-sky-500/30 border border-sky-400/60 text-white'
                        : 'bg-white/6 text-slate-300 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
