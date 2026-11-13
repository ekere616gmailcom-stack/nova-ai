import React from 'react';

interface NovaLogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

const APP_LOGO_SRC = '/assets/aistudio/IMG-20261113-WA4434_cf333abf.jpg';

export const NovaLogo: React.FC<NovaLogoProps> = ({
  size = 32,
  className = '',
  glow = true,
}) => {
  const radius = Math.max(8, Math.round(size * 0.25));

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden bg-white border border-white/25 shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        boxShadow: glow
          ? '0 0 18px rgba(168, 85, 247, 0.55), 0 0 8px rgba(56, 189, 248, 0.35)'
          : '0 2px 8px rgba(0, 0, 0, 0.45)',
      }}
      aria-label="Nova Logo"
    >
      <img
        src={APP_LOGO_SRC}
        alt="Nova Logo"
        draggable={false}
        className="w-full h-full object-cover scale-105"
      />
    </span>
  );
};
