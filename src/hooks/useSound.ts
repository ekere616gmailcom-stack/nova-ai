import { useCallback, useEffect, useRef, useState } from 'react';

export type SoundEffectType = 'messageSend' | 'imageGenerated';

const SOUND_MUTED_STORAGE_KEY = 'nova_sound_muted_v1';

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => undefined);
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function loadInitialMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function synthesizeMessageSend(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(790, now + 0.085);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.13);
}

function synthesizeImageGenerated(ctx: AudioContext): void {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const baseTime = ctx.currentTime + 0.04;

  notes.forEach((freq, idx) => {
    const start = baseTime + idx * 0.055;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.065, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.24);
  });
}

export function useSound() {
  const [isMuted, setIsMutedState] = useState<boolean>(() => loadInitialMuted());
  const mutedRef = useRef<boolean>(isMuted);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    setIsMutedState(muted);
    try {
      window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, muted ? 'true' : 'false');
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!mutedRef.current);
  }, [setMuted]);

  const playMessageSend = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      synthesizeMessageSend(ctx);
    } catch {
      // ignore Web Audio playback restrictions
    }
  }, []);

  const playImageGenerated = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      synthesizeImageGenerated(ctx);
    } catch {
      // ignore Web Audio playback restrictions
    }
  }, []);

  const playSound = useCallback(
    (type: SoundEffectType) => {
      if (type === 'messageSend') {
        playMessageSend();
      } else if (type === 'imageGenerated') {
        playImageGenerated();
      }
    },
    [playImageGenerated, playMessageSend]
  );

  return {
    isMuted,
    setMuted,
    toggleMute,
    playMessageSend,
    playImageGenerated,
    playSound,
  };
}
