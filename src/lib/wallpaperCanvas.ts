import { WallpaperStyle } from '../types';

export function renderGenerativeWallpaperDataUrl(
  style: WallpaperStyle,
  title: string,
  quote: string
): string {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const palettes: Record<WallpaperStyle, [string, string, string, string]> = {
    Nature: ['#060A14', '#161130', '#4C1D95', '#34D399'],
    Anime: ['#09071A', '#2B1055', '#7C3AED', '#F472B6'],
    City: ['#07070D', '#160E2E', '#6D28D9', '#38BDF8'],
    Abstract: ['#0A0A0F', '#200D3A', '#9333EA', '#C084FC'],
    'Bible Verse': ['#080612', '#1B1136', '#7C3AED', '#FDE68A'],
    Motivation: ['#0A0A0F', '#1A0F2E', '#8B5CF6', '#E879F9'],
  };

  const [c0, c1, c2, accent] = palettes[style] || palettes.Abstract;

  // Deep atmospheric background gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, c0);
  bg.addColorStop(0.5, c1);
  bg.addColorStop(1, '#07060B');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Radiant celestial glow orbs
  const orb1 = ctx.createRadialGradient(width * 0.72, height * 0.28, 20, width * 0.72, height * 0.28, 560);
  orb1.addColorStop(0, `${c2}AA`);
  orb1.addColorStop(1, 'transparent');
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, width, height);

  const orb2 = ctx.createRadialGradient(width * 0.25, height * 0.68, 20, width * 0.25, height * 0.68, 520);
  orb2.addColorStop(0, `${accent}55`);
  orb2.addColorStop(1, 'transparent');
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, width, height);

  // Style-specific geometric motifs
  if (style === 'Nature' || style === 'Anime') {
    // Layered mountain / horizon silhouettes
    ctx.fillStyle = 'rgba(10, 10, 18, 0.72)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.76);
    ctx.quadraticCurveTo(width * 0.3, height * 0.64, width * 0.6, height * 0.74);
    ctx.quadraticCurveTo(width * 0.85, height * 0.8, width, height * 0.7);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Stars
    for (let i = 0; i < 65; i++) {
      const sx = ((i * 193) % 980) + 50;
      const sy = ((i * 271) % 920) + 80;
      const r = (i % 3) + 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + (i % 5) * 0.14})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'City') {
    // Neon skyline silhouette
    ctx.fillStyle = 'rgba(8, 8, 14, 0.86)';
    let x = 0;
    let idx = 0;
    while (x < width) {
      const bw = 65 + ((idx * 37) % 70);
      const bh = 280 + ((idx * 97) % 440);
      ctx.fillRect(x, height - bh, bw - 6, bh);
      ctx.fillStyle = `${accent}66`;
      ctx.fillRect(x + 12, height - bh + 28, bw - 30, 4);
      ctx.fillStyle = 'rgba(8, 8, 14, 0.86)';
      x += bw;
      idx++;
    }
  } else {
    // Abstract / Editorial concentric rings
    ctx.strokeStyle = `${accent}44`;
    ctx.lineWidth = 2;
    for (let r = 180; r <= 540; r += 90) {
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.38, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Editorial Title & Quote / Bible Verse Typography
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText(style.toUpperCase(), width / 2, height * 0.48);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 54px Inter, system-ui, sans-serif';
  ctx.fillText(title, width / 2, height * 0.525);

  // Word-wrap quote cleanly
  ctx.fillStyle = 'rgba(243, 240, 255, 0.9)';
  ctx.font = '400 36px Inter, system-ui, sans-serif';
  const words = quote.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > width - 200) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  lines.slice(0, 5).forEach((line, i) => {
    ctx.fillText(line, width / 2, height * 0.59 + i * 52);
  });

  // Subtle Nova signature at bottom
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '500 22px Inter, system-ui, sans-serif';
  ctx.fillText('NOVA DAILY', width / 2, height - 110);

  return canvas.toDataURL('image/png');
}
