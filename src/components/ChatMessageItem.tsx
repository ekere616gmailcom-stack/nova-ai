import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AudioLines,
  Brain,
  Check,
  Copy,
  Download,
  Layers,
  Loader2,
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
import { FastImage } from './FastImage';
import { buildVerticalWallpaperBackupUrl } from '../utils/fastImage';
import { blockOpenAI } from '../utils/instantBrain';

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

const SpeakingWaveform: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <span
    aria-hidden="true"
    className={`inline-flex items-end gap-[2.5px] ${compact ? 'h-3' : 'h-3.5'}`}
  >
    <span className="nova-wave-bar nova-wave-bar-1" />
    <span className="nova-wave-bar nova-wave-bar-2" />
    <span className="nova-wave-bar nova-wave-bar-3" />
    <span className="nova-wave-bar nova-wave-bar-4" />
  </span>
);

interface ChatMessageItemProps {
  message: ChatMessage;
  t: TranslationStrings;
  voiceName: VoiceName;
  voiceSpeed?: VoiceSpeed;
  isStreaming?: boolean;
  isCreatingImage?: boolean;
  imageLoadingText?: string;
  isEditingBuiltApp?: boolean;
  onCreateVariations?: (prompt: string) => void;
  onEditBuiltApp?: (editInstruction: string, currentHtml: string) => void;
  onQuickPickBuilderCategory?: (category: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  message,
  t,
  voiceName,
  voiceSpeed = 'normal',
  isStreaming = false,
  isCreatingImage = false,
  imageLoadingText,
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
      .replace(/<[^>]+>/g, ' ')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const speakMessageAloud = (rateValue: number, pitchValue: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTtsHint('Read Aloud is not supported in this browser.');
      return;
    }

    const cleaned = cleanTextForSpeech(message.content) || cleanTextForSpeech(message.imagePrompt || '');
    if (!cleaned) {
      setTtsHint('Nothing to read aloud.');
      return;
    }

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
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
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

  // User Bubble: Clean ChatGPT-style dark surface
  if (message.role === 'user') {
    return (
      <div className="flex justify-end w-full">
        <div className="max-w-[90%] sm:max-w-[82%] rounded-lg bg-[#212121] px-4 py-2.5 text-[15px] leading-relaxed text-white border border-[#2f2f2f] space-y-2">
          {message.imageDataUrl && (
            <img
              src={message.imageDataUrl}
              alt="Uploaded reference"
              referrerPolicy="no-referrer"
              style={{ filter: 'none', mixBlendMode: 'normal', opacity: 1 }}
              className="max-h-56 w-auto rounded-lg object-cover border border-[#2a2a2a]"
            />
          )}
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

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

  // Extract any <img src="..."> or <img src='...'> tags from Nova's reply so HTML images render as real <img> elements
  const extractedHtmlImageUrls: string[] = [];
  if (!builtApp) {
    if (
      /image\s+refused|(?:can't|cannot|unable to|don't have the ability to|do not have the ability to)\s+(?:pull up|generate|create|show|display|render|send)\s+images?|text-only\s+(?:ai|model|assistant)/i.test(
        workingContent
      )
    ) {
      const backupPrompt = message.imagePrompt || 'Minimalist dark architectural study';
      workingContent = '';
      extractedHtmlImageUrls.push(buildVerticalWallpaperBackupUrl(backupPrompt, Date.now()));
    } else {
      const imgTagRegex = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*\/?>/gi;
      workingContent = workingContent
        .replace(imgTagRegex, (_full, dq, sq, uq) => {
          const src = String(dq || sq || uq || '').trim();
          if (src && (src.startsWith('https://') || src.startsWith('http://') || src.startsWith('data:image/'))) {
            extractedHtmlImageUrls.push(src);
            return '';
          }
          return _full;
        })
        .trim();
    }
  }

  const baseGalleryUrls =
    message.imageUrls && message.imageUrls.length > 0
      ? message.imageUrls
      : message.imageDataUrl
        ? [message.imageDataUrl]
        : [];
  const galleryUrls = Array.from(new Set([...baseGalleryUrls, ...extractedHtmlImageUrls]));
  const promptForActions = message.imagePrompt || (extractedHtmlImageUrls.length > 0 ? '' : message.content);

  const rawDisplayMarkdown = extractedHtmlImageUrls.length > 0 && !workingContent ? '' : workingContent;
  const displayMarkdown =
    message.role === 'assistant' && rawDisplayMarkdown
      ? blockOpenAI(rawDisplayMarkdown)
      : rawDisplayMarkdown;

  return (
    <div className="flex items-start gap-3.5 w-full">
      <div className="shrink-0 mt-1">
        <NovaLogo size={28} />
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {((hasMemoryUsed && !isStreaming) || isPlaying) && (
          <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-400">
            {hasMemoryUsed && !isStreaming && (
              <span className="inline-flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-neutral-400" />
                <span>I remember you</span>
              </span>
            )}

            {isPlaying && (
              <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-neutral-200">
                <SpeakingWaveform compact />
                <span>Reading aloud</span>
              </span>
            )}
          </div>
        )}

        {/* Nova AI Bubble: Flat dark surface */}
        <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] px-4 py-3.5 text-neutral-100 space-y-3">
          {isCreatingImage ? (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-300 shrink-0" />
              <span className="text-sm font-medium text-neutral-200">
                {imageLoadingText || 'Generating image...'}
              </span>
            </div>
          ) : galleryUrls.length > 0 ? (
            <div className="space-y-3">
              <div
                className={`grid gap-3 ${
                  galleryUrls.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-lg'
                }`}
              >
                {galleryUrls.map((url, idx) => (
                  <div key={idx} className="space-y-2">
                    <FastImage
                      src={url}
                      alt={promptForActions || 'Nova generated artwork'}
                      cachePrompt={promptForActions || undefined}
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadImage(url, idx)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-neutral-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-neutral-300" />
                        <span>{t.downloadImage}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt(promptForActions)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-neutral-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedPrompt ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                  <span>{copiedPrompt ? t.copied : t.copyPrompt}</span>
                </button>

                {onCreateVariations && promptForActions && (
                  <button
                    type="button"
                    onClick={() => onCreateVariations(promptForActions)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-neutral-200 text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                      title={isPlaying ? 'Stop reading' : 'Read Aloud'}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        isPlaying
                          ? 'bg-[#262626] border-neutral-400 text-white'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] hover:border-neutral-500 text-neutral-200'
                      }`}
                    >
                      {isPlaying ? (
                        <>
                          <Square className="w-3 h-3 fill-white text-white" />
                          <SpeakingWaveform compact />
                        </>
                      ) : (
                        <AudioLines className="w-3.5 h-3.5 text-neutral-300" />
                      )}
                      <span>{isPlaying ? t.stopAudio : 'Read Aloud'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleSpeech}
                      title={isPlaying ? t.stopAudio : t.listen}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        isPlaying
                          ? 'bg-[#262626] border-neutral-400 text-white'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] hover:border-neutral-500 text-neutral-200'
                      }`}
                    >
                      {isPlaying ? (
                        <Square className="w-3 h-3 fill-white text-white" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-neutral-300" />
                      )}
                      <span>{isPlaying ? t.stopAudio : t.listen}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowVoiceControls((v) => !v)}
                      title="Voice pitch & speed"
                      aria-label="Voice pitch and speed settings"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                        showVoiceControls
                          ? 'bg-[#262626] border-neutral-400 text-white'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] hover:border-neutral-500 text-neutral-300'
                      }`}
                    >
                      <SlidersHorizontal className="w-3 h-3 text-neutral-400" />
                      <span className="font-mono tabular-nums">{speechRate.toFixed(1)}x</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : displayMarkdown || builtApp || hasBuilderCategories ? (
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
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0f0f0f] hover:bg-[#262626] border border-[#2a2a2a] hover:border-neutral-500 text-neutral-200 transition-colors cursor-pointer"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Action Row under AI Text Answer: Copy, Like, Dislike, Speaker */}
        {!isStreaming && !isCreatingImage && message.content && galleryUrls.length === 0 && (
          <div className="flex items-center gap-1.5 ps-1 flex-wrap">
            <button
              type="button"
              onClick={handleCopy}
              title={t.copy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-[#1c1c1c] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span className="text-white">{t.copied}</span>
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
              className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                reaction === 'like'
                  ? 'text-white bg-[#262626] border-neutral-500'
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-[#1c1c1c]'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setReaction((r) => (r === 'dislike' ? null : 'dislike'))}
              title={t.dislike}
              aria-label={t.dislike}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                reaction === 'dislike'
                  ? 'text-white bg-[#262626] border-neutral-500'
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-[#1c1c1c]'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleToggleSpeech}
              title={isPlaying ? 'Stop reading' : 'Read Aloud'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                isPlaying
                  ? 'bg-[#262626] text-white border-neutral-400'
                  : 'border-[#2a2a2a] bg-[#141414] text-neutral-300 hover:text-white hover:border-neutral-500'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-3 h-3 fill-white text-white" />
                  <SpeakingWaveform compact />
                </>
              ) : (
                <AudioLines className="w-3.5 h-3.5 text-neutral-300" />
              )}
              <span>{isPlaying ? t.stopAudio : 'Read Aloud'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleSpeech}
              title={isPlaying ? t.stopAudio : t.listen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                isPlaying
                  ? 'bg-[#262626] text-white border-neutral-400'
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-[#1c1c1c]'
              }`}
            >
              {isPlaying ? (
                <Square className="w-3 h-3 fill-white text-white" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isPlaying ? t.stopAudio : t.listen}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowVoiceControls((v) => !v)}
              title="Voice pitch & speed"
              aria-label="Voice pitch and speed settings"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                showVoiceControls
                  ? 'bg-[#262626] border-neutral-400 text-white'
                  : 'border-transparent text-neutral-400 hover:text-white hover:bg-[#1c1c1c]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums text-[11px]">
                {speechRate.toFixed(1)}x · Pitch {speechPitch.toFixed(1)}
              </span>
            </button>

            {ttsHint && <span className="text-xs text-neutral-400">{ttsHint}</span>}
          </div>
        )}

        {/* Inline Pitch & Speed Control Panel for SpeechSynthesis */}
        {!isStreaming && !isCreatingImage && showVoiceControls && message.content && (
          <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-3.5 space-y-3 max-w-md">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">Voice Speed &amp; Pitch</span>
              <button
                type="button"
                onClick={() => {
                  handleChangeRate(1.0);
                  handleChangePitch(1.0);
                }}
                className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
              >
                Reset
              </button>
            </div>

            {/* Speed Control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-neutral-300 font-medium">Speed</span>
                <span className="font-mono tabular-nums text-white">{speechRate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speechRate}
                onChange={(e) => handleChangeRate(Number(e.target.value))}
                aria-label="Voice speed"
                className="w-full accent-white cursor-pointer"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0.75, 1.0, 1.25, 1.5].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleChangeRate(preset)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono transition-colors cursor-pointer border ${
                      Math.abs(speechRate - preset) < 0.06
                        ? 'bg-[#262626] border-neutral-400 text-white'
                        : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>

            {/* Pitch Control */}
            <div className="space-y-1.5 pt-1 border-t border-[#2a2a2a]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-neutral-300 font-medium">Pitch</span>
                <span className="font-mono tabular-nums text-white">{speechPitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speechPitch}
                onChange={(e) => handleChangePitch(Number(e.target.value))}
                aria-label="Voice pitch"
                className="w-full accent-white cursor-pointer"
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
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                      Math.abs(speechPitch - preset.val) < 0.06
                        ? 'bg-[#262626] border-neutral-400 text-white'
                        : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:text-white'
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
});

ChatMessageItem.displayName = 'ChatMessageItem';
