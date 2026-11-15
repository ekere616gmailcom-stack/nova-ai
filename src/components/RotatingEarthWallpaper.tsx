import React from 'react';

export const RotatingEarthWallpaper: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none bg-black flex justify-center items-start pt-[7vh] sm:pt-[9vh] overflow-hidden select-none"
    >
      <div className="relative flex items-center justify-center">
        {/* Atmospheric soft blue halo behind Earth */}
        <div className="absolute w-[82vw] h-[82vw] max-w-[430px] max-h-[430px] rounded-full nova-earth-glow" />

        {/* Rotating Earth sphere */}
        <div className="relative w-[72vw] h-[72vw] max-w-[380px] max-h-[380px] rounded-full overflow-hidden nova-earth-sphere">
          {/* Drifting cloud layer */}
          <div className="absolute inset-0 rounded-full nova-earth-clouds pointer-events-none" />
          {/* Subtle limb shading for 3D spherical depth */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow:
                'inset -34px -22px 64px rgba(0, 0, 0, 0.92), inset 12px 10px 28px rgba(147, 197, 253, 0.22)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
