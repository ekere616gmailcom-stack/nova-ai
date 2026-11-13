import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { LanguageCode, VoiceName, VoiceSpeed } from '../types';
import { TranslationStrings } from '../i18n/translations';
import { NovaLogo } from './NovaLogo';

interface VoiceChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceName: VoiceName;
  voiceSpeed: VoiceSpeed;
  onChangeVoice: (voice: VoiceName) => void;
  onChangeSpeed: (speed: VoiceSpeed) => void;
  memorySummary?: string;
  language: LanguageCode;
  t: TranslationStrings;
}

interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'nova';
  text: string;
}

const VOICE_LANGUAGE_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'English', label: 'English' },
  { value: 'Nigerian Pidgin', label: 'Pidgin' },
  { value: 'Yoruba', label: 'Yoruba' },
  { value: 'Igbo', label: 'Igbo' },
  { value: 'Hausa', label: 'Hausa' },
];

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

export const VoiceChatModal: React.FC<VoiceChatModalProps> = ({
  isOpen,
  onClose,
  voiceName,
  voiceSpeed,
  onChangeVoice,
  onChangeSpeed,
  memorySummary = '',
  language,
  t,
}) => {
  const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [speechLang, setSpeechLang] = useState('auto');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  const isMutedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const speakingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setStatus('connecting');
    setErrorMessage(null);
    setTranscripts([]);
    setIsMuted(false);
    isMutedRef.current = false;

    const cleanup = () => {
      if (speakingTimerRef.current) {
        window.clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = null;
      }
      activeSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch {
          // ignore
        }
      });
      activeSourcesRef.current.clear();

      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch {
          // ignore
        }
        processorRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (inputCtxRef.current) {
        void inputCtxRef.current.close().catch(() => undefined);
        inputCtxRef.current = null;
      }
      if (outputCtxRef.current) {
        void outputCtxRef.current.close().catch(() => undefined);
        outputCtxRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };

    const startVoiceSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const inputCtx = new AudioContext({ sampleRate: 16000 });
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        inputCtxRef.current = inputCtx;
        outputCtxRef.current = outputCtx;
        nextStartTimeRef.current = outputCtx.currentTime;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const params = new URLSearchParams({
          voice: voiceName,
          lang: language,
          speechLang,
          speed: voiceSpeed,
        });
        if (memorySummary) params.set('mem', memorySummary.slice(0, 350));

        const ws = new WebSocket(`${protocol}//${window.location.host}/live?${params.toString()}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) {
              setAudioLevel(0);
              return;
            }
            const channelData = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < channelData.length; i++) {
              sum += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sum / channelData.length);
            setAudioLevel(Math.min(1, rms * 8));

            const base64 = float32ToBase64Pcm16(channelData);
            ws.send(JSON.stringify({ audio: base64 }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          const msg = JSON.parse(event.data) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            turnComplete?: boolean;
            error?: string;
          };

          if (msg.ready) {
            setStatus('listening');
          }

          if (msg.error) {
            setErrorMessage('Voice not available, type instead');
            setStatus('error');
            return;
          }

          if (msg.interrupted) {
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {
                // ignore
              }
            });
            activeSourcesRef.current.clear();
            if (outputCtxRef.current) {
              nextStartTimeRef.current = outputCtxRef.current.currentTime;
            }
            setStatus('listening');
          }

          if (msg.inputTranscript) {
            const text = msg.inputTranscript.trim();
            if (text) {
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'user') {
                  return [...prev.slice(0, -1), { ...last, text: `${last.text} ${text}` }];
                }
                return [...prev.slice(-10), { id: `${Date.now()}-u`, speaker: 'user', text }];
              });
            }
          }

          if (msg.outputTranscript) {
            const text = msg.outputTranscript.trim();
            if (text) {
              setTranscripts((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'nova') {
                  return [...prev.slice(0, -1), { ...last, text: `${last.text} ${text}` }];
                }
                return [...prev.slice(-10), { id: `${Date.now()}-n`, speaker: 'nova', text }];
              });
            }
          }

          if (msg.audio && outputCtxRef.current) {
            setStatus('speaking');
            if (speakingTimerRef.current) window.clearTimeout(speakingTimerRef.current);
            speakingTimerRef.current = window.setTimeout(() => {
              if (!cancelled) setStatus('listening');
            }, 600);

            const ctx = outputCtxRef.current;
            const samples = base64Pcm16ToFloat32(msg.audio);
            const buffer = ctx.createBuffer(1, samples.length, 24000);
            buffer.getChannelData(0).set(samples);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value =
              voiceSpeed === 'slow' ? 0.9 : voiceSpeed === 'fast' ? 1.15 : 1.0;
            source.connect(ctx.destination);

            const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
            source.start(startAt);
            nextStartTimeRef.current = startAt + buffer.duration / source.playbackRate.value;

            activeSourcesRef.current.add(source);
            source.onended = () => {
              activeSourcesRef.current.delete(source);
            };
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setErrorMessage('Voice not available, type instead');
            setStatus('error');
          }
        };
      } catch {
        if (!cancelled) {
          setErrorMessage('Voice not available, type instead');
          setStatus('error');
        }
      }
    };

    void startVoiceSession();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isOpen, voiceName, language, speechLang, voiceSpeed, memorySummary]);

  if (!isOpen) return null;

  const isTalking = status === 'speaking' || (!isMuted && audioLevel > 0.08);
  const orbScale =
    status === 'speaking'
      ? 1.16
      : isMuted
        ? 0.94
        : 1 + audioLevel * 0.3;

  const isFemaleVoice = voiceName === 'Kore' || voiceName === 'Zephyr';

  const statusText =
    status === 'error'
      ? errorMessage || 'Voice not available, type instead'
      : status === 'connecting'
        ? t.voiceConnecting
        : isMuted
          ? t.voiceMuted
          : status === 'speaking'
            ? t.voiceSpeaking
            : 'Listening — speak English, Pidgin, Yoruba, Igbo, Hausa & more';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 backdrop-blur-xl p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#090B14] border border-sky-400/25 p-6 sm:p-7 shadow-[0_0_90px_-15px_rgba(56,189,248,0.45)] flex flex-col items-center text-center my-auto">
        {/* Top Row */}
        <div className="flex items-center justify-between w-full mb-3">
          <div className="flex items-center gap-2.5">
            <NovaLogo size={26} glow={false} />
            <span className="font-display text-base font-semibold text-white">{t.voiceStudioTitle}</span>
          </div>
          <span className="text-xs text-sky-300 font-mono">
            {isFemaleVoice ? 'Female' : 'Male'} · {voiceSpeed}
          </span>
        </div>

        {/* Language Quick Chips */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-5">
          {VOICE_LANGUAGE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setSpeechLang(chip.value)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                speechLang === chip.value
                  ? 'bg-sky-500/25 border border-sky-300 text-white'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Big Glowing Blue-White Nova Orb in Center */}
        <div className="relative flex items-center justify-center w-56 h-56 mb-5">
          {/* Outer Atmosphere Halo */}
          <div
            className={`absolute inset-2 rounded-full bg-sky-400/25 blur-3xl transition-transform duration-150 ${
              isTalking ? 'animate-pulse' : ''
            }`}
            style={{ transform: `scale(${orbScale * 1.2})` }}
          />
          {/* Pulsing Ring when talking */}
          {isTalking && (
            <div
              className="absolute inset-6 rounded-full border-2 border-sky-300/45 animate-ping"
              style={{ animationDuration: '1.6s' }}
            />
          )}
          {/* Radiant Blue-White Core Orb */}
          <div
            className="relative flex items-center justify-center w-40 h-40 rounded-full border border-white/65 shadow-[0_0_65px_rgba(56,189,248,0.85),inset_0_0_32px_rgba(255,255,255,0.85)] transition-transform duration-150"
            style={{
              transform: `scale(${orbScale})`,
              background:
                'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #E0F2FE 22%, #38BDF8 55%, #2563EB 82%, #1E3A8A 100%)',
            }}
          >
            {status === 'speaking' ? (
              <Volume2 className="w-11 h-11 text-sky-950 drop-shadow" />
            ) : isMuted ? (
              <MicOff className="w-11 h-11 text-sky-950/70" />
            ) : (
              <Mic className="w-11 h-11 text-sky-950 drop-shadow" />
            )}
          </div>
        </div>

        <p className={`text-sm font-medium mb-4 ${status === 'error' ? 'text-slate-300' : 'text-sky-200'}`}>
          {statusText}
        </p>

        {/* Live Transcript Preview */}
        {transcripts.length > 0 && (
          <div className="w-full max-h-36 overflow-y-auto rounded-2xl bg-[#101526] border border-sky-400/15 p-3.5 mb-5 text-start space-y-2">
            {transcripts.map((entry) => (
              <div key={entry.id} className="text-xs leading-relaxed">
                <span className={`font-semibold ${entry.speaker === 'nova' ? 'text-sky-300' : 'text-slate-400'}`}>
                  {entry.speaker === 'nova' ? t.novaLabel : t.youLabel}:{' '}
                </span>
                <span className="text-slate-100">{entry.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Quick Voice Settings: Male/Female & Slow/Fast */}
        <div className="w-full grid grid-cols-2 gap-2.5 mb-5">
          <div className="rounded-2xl bg-[#101526] border border-white/8 p-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeVoice('Kore')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                isFemaleVoice
                  ? 'bg-sky-500/25 text-white border border-sky-400/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Female
            </button>
            <button
              type="button"
              onClick={() => onChangeVoice('Charon')}
              className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                !isFemaleVoice
                  ? 'bg-sky-500/25 text-white border border-sky-400/50'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Male
            </button>
          </div>

          <div className="rounded-2xl bg-[#101526] border border-white/8 p-1.5 flex items-center gap-1">
            {(['slow', 'normal', 'fast'] as VoiceSpeed[]).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => onChangeSpeed(sp)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors cursor-pointer ${
                  voiceSpeed === sp
                    ? 'bg-sky-500/25 text-white border border-sky-400/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sp}
              </button>
            ))}
          </div>
        </div>

        {/* Voice Controls */}
        <div className="flex items-center justify-center gap-4 w-full">
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
              isMuted
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                : 'bg-sky-500/20 border-sky-400/40 text-white hover:bg-sky-500/30'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isMuted ? t.unmuteMic : t.muteMic}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>{t.endVoiceChat}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
