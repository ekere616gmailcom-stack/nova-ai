import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  buildFastFallbackUrl,
  buildVerticalWallpaperBackupUrl,
  cacheImageUrl,
  isImageUrlLoaded,
  markImageUrlLoaded,
} from '../utils/fastImage';

interface FastImageProps {
  src: string;
  alt: string;
  cachePrompt?: string;
  className?: string;
  wrapperClassName?: string;
  fallbackDelayMs?: number;
}

export const FastImage: React.FC<FastImageProps> = ({
  src,
  alt,
  cachePrompt,
  className = '',
  wrapperClassName = '',
  fallbackDelayMs = 4000,
}) => {
  const [activeSrc, setActiveSrc] = useState(src);
  const [loaded, setLoaded] = useState(() => isImageUrlLoaded(src));
  const imgRef = useRef<HTMLImageElement | null>(null);
  const loadedRef = useRef(loaded);
  const stageRef = useRef<0 | 1 | 2>(0);
  loadedRef.current = loaded;

  useEffect(() => {
    setActiveSrc(src);
    stageRef.current = src.includes('picsum.photos') ? 2 : 0;
    const alreadyReady = isImageUrlLoaded(src);
    setLoaded(alreadyReady);
    loadedRef.current = alreadyReady;
  }, [src]);

  const advanceToBackup = () => {
    if (stageRef.current === 0) {
      stageRef.current = 1;
      const backupUrl = buildVerticalWallpaperBackupUrl(
        cachePrompt || alt || 'beautiful scenery',
        Date.now()
      );
      if (activeSrc !== backupUrl) {
        setActiveSrc(backupUrl);
        return;
      }
    }
    if (stageRef.current <= 1) {
      stageRef.current = 2;
      const fallbackUrl = buildFastFallbackUrl(Date.now() + Math.floor(Math.random() * 10000));
      setActiveSrc(fallbackUrl);
    }
  };

  useEffect(() => {
    const imgEl = imgRef.current;
    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      loadedRef.current = true;
      setLoaded(true);
      markImageUrlLoaded(activeSrc);
      if (cachePrompt) cacheImageUrl(cachePrompt, activeSrc);
      return;
    }

    if (loadedRef.current) return;

    const timer = window.setTimeout(() => {
      if (!loadedRef.current && !activeSrc.includes('picsum.photos')) {
        advanceToBackup();
      }
    }, fallbackDelayMs);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSrc, cachePrompt, fallbackDelayMs]);

  const handleLoad = () => {
    loadedRef.current = true;
    setLoaded(true);
    markImageUrlLoaded(activeSrc);
    if (cachePrompt) {
      cacheImageUrl(cachePrompt, activeSrc);
    }
  };

  const handleError = () => {
    advanceToBackup();
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-[#141414] min-h-[220px] ${wrapperClassName}`}
    >
      {!loaded && (
        <div
          aria-live="polite"
          className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 bg-[#171717] pointer-events-none"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] text-xs font-medium text-neutral-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-300" />
            <span>Generating...</span>
          </div>
        </div>
      )}

      <img
        ref={imgRef}
        src={activeSrc}
        alt={alt}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          width: '100%',
          borderRadius: '8px',
          filter: 'none',
          mixBlendMode: 'normal',
          opacity: 1,
        }}
        className={`relative z-10 block object-cover ${className}`}
      />
    </div>
  );
};
