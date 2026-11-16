import React from 'react';

interface RotatingEarthWallpaperProps {
  themeMode?: 'normal' | 'premium';
  earthEnabled?: boolean;
}

export const RotatingEarthWallpaper: React.FC<RotatingEarthWallpaperProps> = () => (
  <div id="galaxy-bg" aria-hidden="true">
    <div className="nova-mature-rotator flex items-center justify-center">
      <svg
        viewBox="0 0 1000 1000"
        className="w-[82%] h-[82%] opacity-60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="500"
          cy="500"
          r="210"
          stroke="rgba(255,255,255,0.035)"
          strokeWidth="1"
        />
        <circle
          cx="500"
          cy="500"
          r="330"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth="1"
          strokeDasharray="6 10"
        />
        <circle
          cx="500"
          cy="500"
          r="450"
          stroke="rgba(255,255,255,0.025)"
          strokeWidth="1"
        />
        <line
          x1="500"
          y1="50"
          x2="500"
          y2="950"
          stroke="rgba(255,255,255,0.02)"
          strokeWidth="1"
        />
        <line
          x1="50"
          y1="500"
          x2="950"
          y2="500"
          stroke="rgba(255,255,255,0.02)"
          strokeWidth="1"
        />
      </svg>
    </div>
  </div>
);
