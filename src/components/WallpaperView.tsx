import React, { useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Camera,
  Check,
  Crown,
  Download,
  Flame,
  Flashlight,
  Gift,
  Home,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Lock,
  Pause,
  Play,
  ShieldCheck,
  Smartphone,
  Trash2,
  Video,
  Wallpaper,
  Wifi,
} from 'lucide-react';
import {
  PREMIUM_WALLPAPER_CATEGORIES,
  SavedWallpaperEntry,
  WallpaperState,
} from '../types';
import { cleanSafeImagePrompt } from '../utils/fastImage';
import { PremiumStatus } from '../utils/premiumUnlock';
import { PremiumModal } from './PremiumModal';
import {
  LiveEffectType,
  LiveSpeedType,
  LiveWallpaperCanvas,
  downloadLiveWallpaperVideo,
} from './LiveWallpaperCanvas';

const MY_WALLPAPERS_STORAGE_KEY = 'nova_my_wallpapers_v1';

const LIVE_CATEGORIES = [
  'Rain',
  'Fire',
  'Neon City',
  'Ocean Waves',
  'Galaxy',
  'Anime',
  'Football',
  'Luxury',
  'Nature',
  'Bible',
] as const;

const LIVE_EFFECTS: LiveEffectType[] = ['Rain', 'Snow', 'Fire', 'Stars', 'Waves'];
const LIVE_SPEEDS: LiveSpeedType[] = ['Slow', 'Normal', 'Fast'];

const TRENDING_LIVE_WALLPAPERS: Array<{
  title: string;
  prompt: string;
  effect: LiveEffectType;
  speed: LiveSpeedType;
}> = [
  {
    title: 'Lagos Rain Night',
    prompt: 'Lagos rain night, street lights glowing on wet avenue, realistic',
    effect: 'Rain',
    speed: 'Normal',
  },
  {
    title: 'Tokyo Storm',
    prompt: 'City dark rain rooftop skyline reflections',
    effect: 'Rain',
    speed: 'Fast',
  },
  {
    title: 'Volcanic Ember Night',
    prompt: 'Glowing embers dark mountain night dramatic cinema',
    effect: 'Fire',
    speed: 'Normal',
  },
  {
    title: 'Deep Night Horizon',
    prompt: 'Deep night mountain horizon crisp clear sky',
    effect: 'Stars',
    speed: 'Slow',
  },
  {
    title: 'Ocean Waves',
    prompt: 'Dark ocean waves shoreline moonlit tropical night',
    effect: 'Waves',
    speed: 'Normal',
  },
  {
    title: 'Alpine Snowfall Dusk',
    prompt: 'Snowy pine forest dusk cozy cabin warm window glow',
    effect: 'Snow',
    speed: 'Slow',
  },
];

function buildVerticalWallpaperUrl(rawPrompt: string, seed?: number): string {
  const safe = cleanSafeImagePrompt(rawPrompt);
  const seedQuery = seed !== undefined ? `&seed=${seed}` : '';
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${safe} wallpaper 9:16 vertical`
  )}?width=720&height=1280&model=turbo&nologo=true${seedQuery}`;
}

function mapCategoryToEffect(category: string): LiveEffectType {
  if (category === 'Rain' || category === 'Neon City' || category === 'Anime') return 'Rain';
  if (category === 'Fire' || category === 'Luxury') return 'Fire';
  if (category === 'Ocean Waves' || category === 'Nature') return 'Waves';
  if (category === 'Galaxy' || category === 'Bible') return 'Stars';
  return 'Rain';
}

function loadMyWallpapers(): SavedWallpaperEntry[] {
  try {
    const raw = localStorage.getItem(MY_WALLPAPERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedWallpaperEntry[];
      if (Array.isArray(parsed)) {
        return parsed.filter((w) => w && typeof w.imageUrl === 'string').slice(0, 10);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function persistMyWallpapers(list: SavedWallpaperEntry[]): void {
  try {
    localStorage.setItem(MY_WALLPAPERS_STORAGE_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    // ignore storage errors
  }
}

interface WallpaperViewProps {
  state: WallpaperState;
  premiumStatus: PremiumStatus;
  themeMode: 'normal' | 'premium';
  earthEnabled: boolean;
  onSelectThemeMode: (mode: 'normal' | 'premium') => void;
  onToggleEarth: () => void;
  onPremiumStatusUpdated: (next: PremiumStatus, celebration?: string) => void;
  onUpdateState: (patch: Partial<WallpaperState>) => void;
  onSaveToGallery: (prompt: string, imageUrl: string) => void;
  onBackToChat: () => void;
}

export const WallpaperView: React.FC<WallpaperViewProps> = ({
  state,
  premiumStatus,
  onPremiumStatusUpdated,
  onUpdateState,
  onSaveToGallery,
  onBackToChat,
}) => {
  const isPremium = premiumStatus.isPremium;

  const [activeTab, setActiveTab] = useState<'home' | 'lock' | 'live'>('lock');
  const [promptInput, setPromptInput] = useState('Minimalist dark architectural skyline at dusk');
  const [selectedCategory, setSelectedCategory] = useState<string>('Luxury');

  const [livePromptInput, setLivePromptInput] = useState('Lagos rain night, street lights moving');
  const [liveCategory, setLiveCategory] = useState<string>('Rain');
  const [liveEffect, setLiveEffect] = useState<LiveEffectType>('Rain');
  const [liveSpeed, setLiveSpeed] = useState<LiveSpeedType>('Normal');
  const [isLivePlaying, setIsLivePlaying] = useState(true);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [liveDownloadInstruction, setLiveDownloadInstruction] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string>(
    () =>
      state.currentImageUrl ||
      buildVerticalWallpaperUrl('Minimalist dark architectural skyline at dusk')
  );
  const [previewTitle, setPreviewTitle] = useState<string>(
    () => state.currentTitle || 'Minimalist dark architectural skyline at dusk'
  );
  const [isImageLoading, setIsImageLoading] = useState(false);

  React.useEffect(() => {
    if (!isImageLoading) return;
    const timer = window.setTimeout(() => {
      setIsImageLoading(false);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [isImageLoading, previewUrl]);

  const [myWallpapers, setMyWallpapers] = useState<SavedWallpaperEntry[]>(() =>
    loadMyWallpapers()
  );

  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [downloadInstruction, setDownloadInstruction] = useState(false);
  const [gallerySavedToast, setGallerySavedToast] = useState(false);
  const [appliedBackdropToast, setAppliedBackdropToast] = useState(false);

  const addWallpaperToHistory = (promptLabel: string, url: string, cat?: string) => {
    const entry: SavedWallpaperEntry = {
      id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prompt: promptLabel,
      category: cat,
      imageUrl: url,
      screenTab: activeTab === 'home' ? 'home' : 'lock',
      createdAtMs: Date.now(),
    };
    setMyWallpapers((prev) => {
      const deduped = prev.filter((item) => item.imageUrl !== url);
      const next = [entry, ...deduped].slice(0, 10);
      persistMyWallpapers(next);
      return next;
    });
  };

  const handleGenerateStatic = (customPrompt?: string, categoryOverride?: string) => {
    if (!isPremium) {
      setShowPremiumModal(true);
      return;
    }
    const targetPrompt = (customPrompt ?? promptInput).trim() || selectedCategory;
    const activeCat = categoryOverride || selectedCategory;
    const url = buildVerticalWallpaperUrl(targetPrompt, Date.now());

    setIsImageLoading(true);
    setDownloadInstruction(false);
    setPreviewUrl(url);
    setPreviewTitle(targetPrompt);
    onUpdateState({
      currentImageUrl: url,
      currentTitle: targetPrompt,
    });
    addWallpaperToHistory(targetPrompt, url, activeCat);
  };

  const handleGenerateLive = (
    customPrompt?: string,
    effectOverride?: LiveEffectType,
    speedOverride?: LiveSpeedType,
    categoryOverride?: string
  ) => {
    if (!isPremium) {
      setShowPremiumModal(true);
      return;
    }
    const targetPrompt = (customPrompt ?? livePromptInput).trim() || liveCategory;
    const nextEffect = effectOverride || liveEffect;
    const nextSpeed = speedOverride || liveSpeed;
    const url = buildVerticalWallpaperUrl(targetPrompt, Date.now());

    setLiveEffect(nextEffect);
    setLiveSpeed(nextSpeed);
    setIsLivePlaying(true);
    setIsImageLoading(true);
    setLiveDownloadInstruction(false);
    setPreviewUrl(url);
    setPreviewTitle(targetPrompt);
    onUpdateState({
      currentImageUrl: url,
      currentTitle: targetPrompt,
    });
    addWallpaperToHistory(targetPrompt, url, categoryOverride || liveCategory);
  };

  const handleCategoryClick = (category: string) => {
    setSelectedCategory(category);
    const presetPrompts: Record<string, string> = {
      Anime: 'Minimalist Tokyo city street dusk monochrome reflections',
      Nature: 'Lush mountain valley sunrise misty pines',
      Football: 'Stadium floodlights dramatic football pitch night',
      Luxury: 'Sleek dark architectural marble penthouse night',
      Bible: 'Golden sunrise light beams over peaceful clouds',
      Cars: 'Sleek sports car dark studio lighting',
      Aesthetic: 'Minimalist serene ocean horizon dusk',
    };
    const nextPrompt = presetPrompts[category] || category;
    setPromptInput(nextPrompt);
    if (isPremium) {
      handleGenerateStatic(nextPrompt, category);
    } else {
      setShowPremiumModal(true);
    }
  };

  const handleLiveCategoryClick = (category: string) => {
    setLiveCategory(category);
    const presetPrompts: Record<string, string> = {
      Rain: 'Lagos rain night, street lights on wet asphalt',
      Fire: 'Warm fire embers dark mountain night',
      'Neon City': 'City skyline rain reflections night',
      'Ocean Waves': 'Dark ocean waves moonlit shoreline',
      Galaxy: 'Dark mountain ridge clear night sky',
      Anime: 'Rooftop skyline dusk rain',
      Football: 'Night stadium floodlights rain falling over football pitch',
      Luxury: 'Dark marble penthouse city skyline night',
      Nature: 'Misty mountain waterfall morning sunrise',
      Bible: 'Dawn clouds radiant morning sunlight',
    };
    const nextPrompt = presetPrompts[category] || category;
    setLivePromptInput(nextPrompt);
    handleGenerateLive(nextPrompt, mapCategoryToEffect(category), liveSpeed, category);
  };

  const handleDownloadStatic = async () => {
    if (!previewUrl) return;
    const fileName = `nova-wallpaper-${activeTab}-${Date.now()}.png`;
    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setDownloadInstruction(true);
  };

  const handleDownloadLiveVideo = async () => {
    if (!previewUrl || isExportingVideo) return;
    setIsExportingVideo(true);
    try {
      await downloadLiveWallpaperVideo({
        imageUrl: previewUrl,
        effect: liveEffect,
        speed: liveSpeed,
        title: previewTitle || 'Nova Live Wallpaper',
      });
      setLiveDownloadInstruction(true);
    } finally {
      setIsExportingVideo(false);
    }
  };

  const handleSaveGallery = () => {
    if (!previewUrl) return;
    onSaveToGallery(previewTitle || 'Nova Wallpaper 9:16', previewUrl);
    setGallerySavedToast(true);
    window.setTimeout(() => setGallerySavedToast(false), 2400);
  };

  const handleApplyToNovaBackdrop = () => {
    if (!previewUrl) return;
    onUpdateState({
      currentImageUrl: previewUrl,
      currentTitle: previewTitle,
      appliedAsBackground: true,
    });
    setAppliedBackdropToast(true);
    window.setTimeout(() => setAppliedBackdropToast(false), 2400);
  };

  const handleDeleteSavedWallpaper = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMyWallpapers((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistMyWallpapers(next);
      return next;
    });
  };

  const speedDurationSec = liveSpeed === 'Slow' ? '16s' : liveSpeed === 'Fast' ? '5s' : '10s';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-8 bg-[#0f0f0f]">
      <div className="max-w-[980px] mx-auto space-y-6 pb-10">
        {/* Top Back + Status Bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          <div className="flex items-center gap-2.5 flex-wrap">
            {state.appliedAsBackground && (
              <button
                type="button"
                onClick={() => onUpdateState({ appliedAsBackground: false })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] hover:border-neutral-500 text-white cursor-pointer"
              >
                <Wallpaper className="w-3.5 h-3.5 text-neutral-300" />
                <span>Reset Background</span>
              </button>
            )}

            {isPremium ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300">
                <Crown className="w-3.5 h-3.5 text-neutral-300" />
                <span>
                  {premiumStatus.source === 'share'
                    ? `Premium - Free via Sharing (${premiumStatus.daysRemaining}d left)`
                    : 'Premium Unlocked'}
                </span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#171717] border border-[#2a2a2a] text-white hover:border-neutral-500 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-neutral-300" />
                <span>Unlock Premium ({premiumStatus.shares}/5 shares)</span>
              </button>
            )}
          </div>
        </div>

        {/* Title & 3 Tabs: Home Screen / Lock Screen / Live Wallpapers */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Wallpapers
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Create 9:16 mobile wallpapers &amp; animated Live Wallpapers, preview Home or Lock Screen, and download.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Wallpaper modes"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#171717] border border-[#2a2a2a] self-start md:self-auto flex-wrap"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'home'}
              onClick={() => setActiveTab('home')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border ${
                activeTab === 'home'
                  ? 'bg-white border-white text-black'
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home Screen</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lock'}
              onClick={() => setActiveTab('lock')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border ${
                activeTab === 'lock'
                  ? 'bg-white border-white text-black'
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock Screen</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'live'}
              onClick={() => setActiveTab('live')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border ${
                activeTab === 'live'
                  ? 'bg-white border-white text-black'
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Live Wallpapers</span>
            </button>
          </div>
        </div>

        {/* Expired Notice */}
        {premiumStatus.expired && !isPremium && (
          <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] px-4 py-3 text-xs text-white flex items-center justify-between gap-3 flex-wrap">
            <span>
              Your 30-day Free Premium via Sharing expired. Share with 5 friends again or upgrade to continue.
            </span>
            <button
              type="button"
              onClick={() => setShowPremiumModal(true)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold cursor-pointer"
            >
              Renew Free / Pay
            </button>
          </div>
        )}

        {/* PREMIUM LOCK SCREEN WHEN NOT PREMIUM */}
        {!isPremium ? (
          <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-6 sm:p-10 text-center space-y-6">
            <div className="w-14 h-14 mx-auto rounded-lg bg-[#212121] border border-[#2a2a2a] flex items-center justify-center">
              <Lock className="w-7 h-7 text-neutral-200" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h2 className="text-xl sm:text-2xl font-semibold text-white">
                {activeTab === 'live'
                  ? 'Premium Feature - Unlock Live Wallpapers'
                  : 'Premium Feature - Unlock Wallpapers'}
              </h2>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Unlock custom 9:16 Home &amp; Lock Screen wallpapers and animated Live Wallpapers — or unlock free for 30 days by sharing with 5 friends.
              </p>
            </div>

            <div className="max-w-sm mx-auto space-y-1.5">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>You have shared to {premiumStatus.shares}/5 people</span>
                <span className="font-mono tabular-nums text-white">
                  {Math.round((premiumStatus.shares / 5) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${(premiumStatus.shares / 5) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer"
              >
                <Gift className="w-4 h-4" />
                <span>Share to 5 Friends FREE</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors cursor-pointer"
              >
                <Crown className="w-4 h-4 text-neutral-300" />
                <span>Go Premium - ₦2,000/month</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-neutral-300" />
                <span>Unlock with Code</span>
              </button>
            </div>
          </section>
        ) : activeTab === 'live' ? (
          /* ===================== LIVE WALLPAPERS TAB (PREMIUM) ===================== */
          <>
            <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Flame className="w-4 h-4 text-neutral-300" />
                  <span>Live Wallpaper Generator</span>
                </div>
                <span className="text-xs text-neutral-400">
                  Animated 9:16 · Video Export
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {LIVE_CATEGORIES.map((category) => {
                  const active = liveCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleLiveCategoryClick(category)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        active
                          ? 'bg-white border-white text-black'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGenerateLive();
                }}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <input
                  type="text"
                  value={livePromptInput}
                  onChange={(e) => setLivePromptInput(e.target.value)}
                  placeholder="Lagos rain night, street lights moving"
                  className="flex-1 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer shrink-0"
                >
                  <Video className="w-4 h-4" />
                  <span>Generate Live Wallpaper</span>
                </button>
              </form>
            </section>

            {/* Trending Live Wallpapers */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">
                  Trending Live Wallpapers
                </h2>
                <span className="text-xs text-neutral-400">Tap any preset to preview live</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {TRENDING_LIVE_WALLPAPERS.map((preset) => {
                  const url = buildVerticalWallpaperUrl(preset.prompt);
                  const isCurrent = previewUrl === url;
                  return (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => {
                        setLivePromptInput(preset.prompt);
                        handleGenerateLive(preset.prompt, preset.effect, preset.speed, preset.title);
                      }}
                      className={`group relative aspect-[9/16] rounded-lg overflow-hidden bg-[#141414] border text-start transition-colors cursor-pointer ${
                        isCurrent
                          ? 'border-white'
                          : 'border-[#2a2a2a] hover:border-neutral-500'
                      }`}
                    >
                      <img
                        src={url}
                        alt={preset.title}
                        loading="eager"
                        referrerPolicy="no-referrer"
                        style={{ filter: 'none', mixBlendMode: 'normal', opacity: 1 }}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 start-2 px-2 py-0.5 rounded-lg bg-black/75 border border-[#2a2a2a] text-[10px] font-semibold text-white">
                        {preset.effect}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-black/80">
                        <div className="text-[11px] font-semibold text-white truncate">
                          {preset.title}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Live Preview Phone + Live Controls + Video Download */}
            <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
                {/* Live Phone Frame */}
                <div className="relative w-[270px] sm:w-[290px] aspect-[9/19] rounded-lg border-4 border-[#2a2a2a] bg-black overflow-hidden shrink-0 select-none">
                  <img
                    src={previewUrl}
                    alt={previewTitle || 'Live Wallpaper'}
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onLoad={() => setIsImageLoading(false)}
                    onError={(e) => {
                      setIsImageLoading(false);
                      const imgEl = e.currentTarget;
                      if (!imgEl.src.includes('picsum.photos')) {
                        imgEl.src = `https://picsum.photos/512/512?random=${Date.now()}`;
                      }
                    }}
                    style={{
                      filter: 'none',
                      mixBlendMode: 'normal',
                      opacity: 1,
                      animationDuration: speedDurationSec,
                      animationPlayState: isLivePlaying ? 'running' : 'paused',
                    }}
                    className="absolute inset-0 w-full h-full object-cover nova-live-bg-anim"
                  />

                  <LiveWallpaperCanvas
                    effect={liveEffect}
                    speed={liveSpeed}
                    isPlaying={isLivePlaying}
                  />

                  {isImageLoading && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                      <span className="text-xs font-medium text-white">Loading live scene...</span>
                    </div>
                  )}

                  <div className="absolute inset-0 z-20 flex flex-col justify-between p-5 pt-8 text-white pointer-events-none">
                    <div className="flex items-center justify-between text-[10px] font-semibold px-1">
                      <span>9:41</span>
                      <span className="px-1.5 py-0.5 rounded-lg bg-black/60 border border-[#2a2a2a] text-[9px]">
                        LIVE · {liveEffect}
                      </span>
                    </div>

                    <div
                      className="flex-1 flex flex-col items-center pt-5 text-center nova-live-clock-anim"
                      style={{
                        animationPlayState: isLivePlaying ? 'running' : 'paused',
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-black/50 border border-white/25 flex items-center justify-center mb-2">
                        <Lock className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-[11px] font-medium text-white/95">
                        Monday, November 16
                      </div>
                      <div className="text-5xl font-bold tracking-tight text-white mt-0.5">
                        9:41
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-2">
                        <div className="w-9 h-9 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center">
                          <Flashlight className="w-4 h-4 text-white" />
                        </div>
                        <div className="w-9 h-9 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center">
                          <Camera className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="w-24 h-1 rounded-lg bg-white/85 mx-auto" />
                    </div>
                  </div>
                </div>

                {/* Live Wallpaper Controls + Download */}
                <div className="flex-1 w-full space-y-5">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                      <Flame className="w-3.5 h-3.5" />
                      <span>Live Lock Screen Preview</span>
                    </div>
                    <h2 className="text-xl font-semibold text-white mt-1 break-words">
                      {previewTitle}
                    </h2>
                  </div>

                  {/* Play / Pause & Speed */}
                  <div className="space-y-3 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setIsLivePlaying((p) => !p)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black cursor-pointer"
                      >
                        {isLivePlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pause Live</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Play Live</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-neutral-400 me-1">Speed:</span>
                        {LIVE_SPEEDS.map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => setLiveSpeed(sp)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                              liveSpeed === sp
                                ? 'bg-[#262626] border-neutral-400 text-white'
                                : 'bg-[#171717] border-[#2a2a2a] text-neutral-400 hover:text-white'
                            }`}
                          >
                            {sp}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Effect Selector */}
                    <div className="space-y-2 pt-2 border-t border-[#2a2a2a]">
                      <span className="text-xs font-medium text-neutral-300">Effect:</span>
                      <div className="flex flex-wrap gap-2">
                        {LIVE_EFFECTS.map((ef) => (
                          <button
                            key={ef}
                            type="button"
                            onClick={() => setLiveEffect(ef)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                              liveEffect === ef
                                ? 'bg-white border-white text-black'
                                : 'bg-[#171717] border-[#2a2a2a] text-neutral-300 hover:text-white'
                            }`}
                          >
                            {ef}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Download Live Wallpaper (Video) */}
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleDownloadLiveVideo()}
                      disabled={isExportingVideo || !previewUrl}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isExportingVideo ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Rendering Live Video...</span>
                        </>
                      ) : (
                        <>
                          <Video className="w-4 h-4" />
                          <span>Download Live Wallpaper (Video)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveGallery}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors cursor-pointer"
                    >
                      {gallerySavedToast ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Saved to Gallery</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-4 h-4 text-neutral-300" />
                          <span>Save to Gallery</span>
                        </>
                      )}
                    </button>
                  </div>

                  {liveDownloadInstruction && (
                    <div
                      role="status"
                      className="rounded-lg bg-[#0f0f0f] border border-neutral-500 px-4 py-3.5 text-xs text-white leading-relaxed space-y-1"
                    >
                      <div className="font-semibold text-white">
                        Live Wallpaper Ready
                      </div>
                      <p className="text-neutral-300">
                        1. Video downloaded. 2. Open a Video Wallpaper app on your phone, select the video, and apply it to your Home or Lock Screen.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          /* ===================== HOME SCREEN / LOCK SCREEN TABS (PREMIUM) ===================== */
          <>
            <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <ImageIcon className="w-4 h-4 text-neutral-300" />
                  <span>Wallpaper Generator</span>
                </div>
                <span className="text-xs text-neutral-400">9:16 Vertical · 720×1280</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {PREMIUM_WALLPAPER_CATEGORIES.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleCategoryClick(category)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                        active
                          ? 'bg-white border-white text-black'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGenerateStatic();
                }}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Minimalist dark architectural skyline"
                  className="flex-1 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer shrink-0"
                >
                  <Wallpaper className="w-4 h-4" />
                  <span>Generate Wallpaper</span>
                </button>
              </form>
            </section>

            {/* Phone Frame Preview */}
            <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
                <div className="relative w-[270px] sm:w-[290px] aspect-[9/19] rounded-lg border-4 border-[#2a2a2a] bg-black overflow-hidden shrink-0 select-none">
                  <img
                    src={previewUrl}
                    alt={previewTitle || 'Nova 9:16 Wallpaper'}
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onLoad={() => setIsImageLoading(false)}
                    onError={(e) => {
                      setIsImageLoading(false);
                      const imgEl = e.currentTarget;
                      if (!imgEl.src.includes('picsum.photos')) {
                        imgEl.src = `https://picsum.photos/512/512?random=${Date.now()}`;
                      }
                    }}
                    style={{ filter: 'none', mixBlendMode: 'normal', opacity: 1 }}
                    className="absolute inset-0 w-full h-full object-cover"
                  />

                  {isImageLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                      <span className="text-xs font-medium text-white">Generating 9:16...</span>
                    </div>
                  )}

                  <div className="absolute inset-0 z-20 flex flex-col justify-between p-5 pt-8 text-white pointer-events-none">
                    <div className="flex items-center justify-between text-[10px] font-semibold px-1">
                      <span>9:41</span>
                      <div className="flex items-center gap-1">
                        <Wifi className="w-3 h-3" />
                        <span className="inline-block w-4 h-2 rounded-lg border border-white/80 p-[1px]">
                          <span className="block h-full w-3/4 bg-white" />
                        </span>
                      </div>
                    </div>

                    {activeTab === 'lock' ? (
                      <>
                        <div className="flex-1 flex flex-col items-center pt-5 text-center">
                          <div className="w-8 h-8 rounded-lg bg-black/50 border border-white/25 flex items-center justify-center mb-2">
                            <Lock className="w-4 h-4 text-white" />
                          </div>
                          <div className="text-[11px] font-medium text-white/95">
                            Monday, November 16
                          </div>
                          <div className="text-5xl font-bold tracking-tight text-white mt-0.5">
                            9:41
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-2">
                            <div className="w-9 h-9 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center">
                              <Flashlight className="w-4 h-4 text-white" />
                            </div>
                            <div className="w-9 h-9 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center">
                              <Camera className="w-4 h-4 text-white" />
                            </div>
                          </div>
                          <div className="w-24 h-1 rounded-lg bg-white/85 mx-auto" />
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col justify-between pt-4 pb-1">
                        <div className="rounded-lg bg-black/55 border border-white/20 px-3.5 py-2.5 text-start">
                          <div className="text-[10px] text-white/80 uppercase tracking-wider">
                            Home Screen · 9:41
                          </div>
                          <div className="text-sm font-semibold text-white truncate">
                            {previewTitle || 'Nova Wallpaper'}
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2.5 px-1 my-auto">
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex flex-col items-center gap-1">
                              <div className="w-10 h-10 rounded-lg bg-white/20 border border-white/25" />
                              <div className="w-6 h-1 rounded-lg bg-white/60" />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2.5">
                          <div className="grid grid-cols-4 gap-2.5 rounded-lg bg-black/55 border border-white/20 p-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-10 h-10 mx-auto rounded-lg bg-white/25 border border-white/30"
                              />
                            ))}
                          </div>
                          <div className="w-24 h-1 rounded-lg bg-white/85 mx-auto" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 w-full space-y-5">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>
                        {activeTab === 'home'
                          ? 'Home Screen Preview (9:41)'
                          : 'Lock Screen Preview (9:41)'}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold text-white mt-1 break-words">
                      {previewTitle || 'Custom 9:16 Wallpaper'}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('home')}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        activeTab === 'home'
                          ? 'bg-white border-white text-black'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] hover:border-neutral-500 text-white'
                      }`}
                    >
                      <Home className="w-4 h-4" />
                      <span>Preview as Home Screen</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('lock')}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        activeTab === 'lock'
                          ? 'bg-white border-white text-black'
                          : 'bg-[#0f0f0f] border-[#2a2a2a] hover:border-neutral-500 text-white'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      <span>Preview as Lock Screen</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDownloadStatic()}
                      disabled={!previewUrl}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Wallpaper</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveGallery}
                      disabled={!previewUrl}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {gallerySavedToast ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>Saved to Gallery</span>
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-4 h-4 text-neutral-300" />
                          <span>Save to Gallery</span>
                        </>
                      )}
                    </button>
                  </div>

                  {downloadInstruction && (
                    <div
                      role="status"
                      className="rounded-lg bg-[#0f0f0f] border border-neutral-500 px-4 py-3 text-xs text-white flex items-start gap-2.5"
                    >
                      <ShieldCheck className="w-4 h-4 text-neutral-300 shrink-0 mt-0.5" />
                      <span>
                        Downloaded. Open Settings &gt; Wallpaper and select this image to set as Home or Lock Screen.
                      </span>
                    </div>
                  )}

                  <div className="pt-1 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={handleApplyToNovaBackdrop}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-neutral-200 hover:text-white transition-colors cursor-pointer"
                    >
                      {appliedBackdropToast ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Applied as Nova Background</span>
                        </>
                      ) : (
                        <>
                          <Wallpaper className="w-3.5 h-3.5 text-neutral-300" />
                          <span>Also Use as Nova Background</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('live')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] text-white hover:border-neutral-500 transition-colors cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5 text-neutral-300" />
                      <span>Animate in Live Wallpapers</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* My Wallpapers */}
        {isPremium && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-white">
                My Wallpapers ({myWallpapers.length}/10)
              </h2>
              <span className="text-xs text-neutral-400">Saved locally on this device</span>
            </div>

            {myWallpapers.length === 0 ? (
              <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-8 text-center text-xs text-neutral-400">
                Generate your first wallpaper above — your last 10 wallpapers will appear here automatically.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {myWallpapers.map((item) => {
                  const isCurrent = previewUrl === item.imageUrl;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setPreviewUrl(item.imageUrl);
                        setPreviewTitle(item.prompt);
                        setDownloadInstruction(false);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setPreviewUrl(item.imageUrl);
                          setPreviewTitle(item.prompt);
                        }
                      }}
                      className={`group relative aspect-[9/16] rounded-lg overflow-hidden bg-[#141414] border transition-colors cursor-pointer ${
                        isCurrent
                          ? 'border-white'
                          : 'border-[#2a2a2a] hover:border-neutral-500'
                      }`}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.prompt}
                        loading="eager"
                        referrerPolicy="no-referrer"
                        style={{ filter: 'none', mixBlendMode: 'normal', opacity: 1 }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-black/80 flex items-center justify-between gap-1.5">
                        <span className="text-[11px] text-white truncate">{item.prompt}</span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSavedWallpaper(item.id, e)}
                          aria-label="Remove saved wallpaper"
                          className="p-1 text-neutral-400 hover:text-white shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <PremiumModal
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        premiumStatus={premiumStatus}
        onStatusUpdated={onPremiumStatusUpdated}
      />
    </div>
  );
};
