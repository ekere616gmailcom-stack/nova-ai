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
}) => {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden bg-[#171717] border border-[#2a2a2a] rounded-lg shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
      }}
      aria-label="Nova Logo"
    >
      <img
        src={APP_LOGO_SRC}
        alt="Nova Logo"
        draggable={false}
        className="w-full h-full object-cover"
      />
    </span>
  );
};
