import React, { useEffect, useRef } from 'react';

export type LiveEffectType = 'Rain' | 'Snow' | 'Fire' | 'Stars' | 'Waves';
export type LiveSpeedType = 'Slow' | 'Normal' | 'Fast';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
}

function createParticles(
  effect: LiveEffectType,
  width: number,
  height: number
): Particle[] {
  const count =
    effect === 'Rain'
      ? 75
      : effect === 'Snow'
        ? 55
        : effect === 'Fire'
          ? 65
          : effect === 'Stars'
            ? 70
            : 40;

  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx:
      effect === 'Rain'
        ? -1.2 - Math.random() * 0.8
        : effect === 'Snow'
          ? (Math.random() - 0.5) * 0.9
          : effect === 'Fire'
            ? (Math.random() - 0.5) * 0.8
            : effect === 'Waves'
              ? 0.8 + Math.random() * 1.1
              : 0,
    vy:
      effect === 'Rain'
        ? 7 + Math.random() * 5
        : effect === 'Snow'
          ? 0.8 + Math.random() * 1.3
          : effect === 'Fire'
            ? -(1.4 + Math.random() * 2.2)
            : effect === 'Waves'
              ? 0
              : 0.12 + Math.random() * 0.2,
    size:
      effect === 'Rain'
        ? 10 + Math.random() * 14
        : effect === 'Snow'
          ? 1.5 + Math.random() * 2.8
          : effect === 'Fire'
            ? 2 + Math.random() * 4.5
            : effect === 'Stars'
              ? 1 + Math.random() * 2.2
              : 2 + Math.random() * 3,
    alpha: 0.35 + Math.random() * 0.65,
    phase: Math.random() * Math.PI * 2,
  }));
}

export function drawEffectFrame(
  ctx: CanvasRenderingContext2D,
  effect: LiveEffectType,
  particles: Particle[],
  width: number,
  height: number,
  speedMultiplier: number,
  timeSec: number
): void {
  if (effect === 'Rain') {
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.72)';
    ctx.lineCap = 'round';
    for (const p of particles) {
      p.x += p.vx * speedMultiplier;
      p.y += p.vy * speedMultiplier;
      if (p.y > height + 20) {
        p.y = -20;
        p.x = Math.random() * (width + 60);
      }
      if (p.x < -20) p.x = width + 10;

      ctx.lineWidth = 1.25;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 3, p.y + p.size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (effect === 'Snow') {
    for (const p of particles) {
      p.x += (p.vx + Math.sin(timeSec * 1.4 + p.phase) * 0.45) * speedMultiplier;
      p.y += p.vy * speedMultiplier;
      if (p.y > height + 8) {
        p.y = -8;
        p.x = Math.random() * width;
      }
      if (p.x > width + 8) p.x = -8;
      if (p.x < -8) p.x = width + 8;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (effect === 'Fire') {
    // Subtle warm bottom glow
    const glow = ctx.createLinearGradient(0, height * 0.6, 0, height);
    glow.addColorStop(0, 'rgba(255, 110, 20, 0)');
    glow.addColorStop(1, `rgba(255, 95, 15, ${0.22 + Math.sin(timeSec * 6) * 0.06})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);

    for (const p of particles) {
      p.x += (p.vx + Math.sin(timeSec * 3 + p.phase) * 0.5) * speedMultiplier;
      p.y += p.vy * speedMultiplier;
      if (p.y < -12) {
        p.y = height + Math.random() * 20;
        p.x = Math.random() * width;
      }
      const lifeFade = Math.max(0.15, Math.min(1, p.y / height));
      ctx.globalAlpha = p.alpha * lifeFade;
      ctx.fillStyle = p.phase > 3.1 ? '#FFD166' : '#FF6B2B';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeFade, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (effect === 'Stars') {
    for (const p of particles) {
      p.y += p.vy * 0.35 * speedMultiplier;
      if (p.y > height) p.y = 0;
      const twinkle = 0.25 + 0.75 * Math.abs(Math.sin(timeSec * 2.2 * speedMultiplier + p.phase));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = p.phase > 4.5 ? '#BFDBFE' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Periodic shooting star
    const shootCycle = (timeSec * speedMultiplier * 0.45) % 1;
    if (shootCycle < 0.22) {
      const progress = shootCycle / 0.22;
      const sx = width * (0.85 - progress * 0.7);
      const sy = height * (0.12 + progress * 0.25);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - progress;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 28, sy - 14);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Waves effect
  for (let band = 0; band < 4; band++) {
    const baseY = height * (0.64 + band * 0.085);
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 12) {
      const waveY =
        baseY +
        Math.sin(x * 0.025 + timeSec * (1.8 + band * 0.35) * speedMultiplier + band) *
          (8 + band * 2.5);
      ctx.lineTo(x, waveY);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = `rgba(56, 189, 248, ${0.14 + band * 0.04})`;
    ctx.fill();
  }
  for (const p of particles) {
    p.x += p.vx * speedMultiplier;
    if (p.x > width + 10) p.x = -10;
    ctx.globalAlpha = p.alpha * 0.6;
    ctx.fillStyle = '#E0F2FE';
    ctx.beginPath();
    ctx.arc(
      p.x,
      height * 0.72 + Math.sin(timeSec * 2 + p.phase) * 26,
      p.size * 0.65,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

interface LiveWallpaperCanvasProps {
  effect: LiveEffectType;
  speed: LiveSpeedType;
  isPlaying: boolean;
}

export const LiveWallpaperCanvas: React.FC<LiveWallpaperCanvasProps> = ({
  effect,
  speed,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 290;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    particlesRef.current = createParticles(effect, width, height);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const speedMultiplier = speed === 'Slow' ? 0.5 : speed === 'Fast' ? 1.85 : 1.0;
    let rafId = 0;
    let timeSec = 0;

    const renderLoop = () => {
      ctx.clearRect(0, 0, width, height);
      if (isPlaying) {
        timeSec += 0.016;
      }
      drawEffectFrame(
        ctx,
        effect,
        particlesRef.current,
        width,
        height,
        isPlaying ? speedMultiplier : 0,
        timeSec
      );
      if (isPlaying) {
        rafId = window.requestAnimationFrame(renderLoop);
      }
    };

    renderLoop();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [effect, speed, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 z-10 w-full h-full pointer-events-none"
    />
  );
};

async function loadDrawableImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(null);
      };
      img.src = objUrl;
    });
  } catch {
    return null;
  }
}

export async function downloadLiveWallpaperVideo(params: {
  imageUrl: string;
  effect: LiveEffectType;
  speed: LiveSpeedType;
  title: string;
}): Promise<void> {
  const { imageUrl, effect, speed, title } = params;
  const width = 540;
  const height = 960;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bgImg = await loadDrawableImage(imageUrl);
  const particles = createParticles(effect, width, height);
  const speedMultiplier = speed === 'Slow' ? 0.5 : speed === 'Fast' ? 1.85 : 1.0;

  const drawSnapshot = (elapsedSec: number) => {
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, width, height);

    if (bgImg) {
      const zoom = 1.03 + Math.sin(elapsedSec * 0.9) * 0.02;
      const drawW = width * zoom;
      const drawH = height * zoom;
      ctx.drawImage(bgImg, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#0b1021');
      grad.addColorStop(0.5, '#111827');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    drawEffectFrame(ctx, effect, particles, width, height, speedMultiplier, elapsedSec);
  };

  const canRecord =
    typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined';

  if (canRecord) {
    const mimeCandidates = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    const supportedMime =
      mimeCandidates.find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) || '';

    const stream = canvas.captureStream(24);
    const recorder = supportedMime
      ? new MediaRecorder(stream, { mimeType: supportedMime })
      : new MediaRecorder(stream);

    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const recordedBlob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: supportedMime || 'video/webm' }));
      };
      recorder.start();
      const start = performance.now();
      const durationMs = 2800;

      const step = () => {
        const elapsed = performance.now() - start;
        drawSnapshot(elapsed / 1000);
        if (elapsed < durationMs) {
          window.requestAnimationFrame(step);
        } else {
          recorder.stop();
        }
      };
      window.requestAnimationFrame(step);
    });

    const ext = (supportedMime || '').includes('mp4') ? 'mp4' : 'webm';
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'nova-live';
    const url = URL.createObjectURL(recordedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}-live-wallpaper.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  // Fallback image capture if MediaRecorder is unavailable
  drawSnapshot(0.5);
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `nova-live-wallpaper-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
