import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  Search,
  Share2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  AspectRatio,
  IMAGE_RATIOS,
  IMAGE_STUDIO_MODES,
  IMAGE_STYLES,
  ImageGenMode,
  ImageStudioMode,
  ImageStyle,
  SavedImageEntry,
} from '../types';

interface ImagesGalleryViewProps {
  images: SavedImageEntry[];
  activeMode?: ImageStudioMode;
  genMode: ImageGenMode;
  onChangeGenMode: (mode: ImageGenMode) => void;
  onSelectMode?: (mode: ImageStudioMode) => void;
  onGenerateStudioImage: (params: {
    mode: ImageStudioMode;
    prompt: string;
    style: ImageStyle;
    aspectRatio: AspectRatio;
    genMode: ImageGenMode;
    sourceAttachment: {
      previewUrl: string;
      base64: string;
      mimeType: string;
      name: string;
    } | null;
  }) => Promise<void>;
  onCreateVariations: (prompt: string) => Promise<void>;
  isGenerating: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
  onOpenChat: (chatId: string) => void;
  onBackToChat: () => void;
}

const MODE_PLACEHOLDERS: Record<ImageStudioMode, string> = {
  'Generate Image': 'Describe anything you want Nova Image Studio to create...',
  'Edit My Photo': 'Upload your photo and describe the edit (e.g. "Turn me to 3D cartoon" or "Change background to Dubai skyline")...',
  'Make Wallpaper': 'Describe your phone wallpaper (e.g. "Purple galaxy mountain night sky")...',
  'Make Logo': 'Describe your brand logo (e.g. "Minimalist luxury white and neon purple crown logo")...',
  'Make Poster': 'Describe your poster (e.g. "Afrobeats music festival neon concert poster")...',
  'Make Thumbnail': 'Describe your video thumbnail (e.g. "Creator holding glowing AI phone, dark neon studio lighting")...',
};

export const ImagesGalleryView: React.FC<ImagesGalleryViewProps> = ({
  images,
  activeMode = 'Generate Image',
  genMode,
  onChangeGenMode,
  onSelectMode,
  onGenerateStudioImage,
  onCreateVariations,
  isGenerating,
  errorMessage = null,
  onClearError,
  onOpenChat,
  onBackToChat,
}) => {
  const [mode, setMode] = useState<ImageStudioMode>(activeMode);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<ImageStyle>('Realistic');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [photo, setPhoto] = useState<{
    previewUrl: string;
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMode(activeMode);
    if (activeMode === 'Make Wallpaper') {
      setAspectRatio('9:16');
      setStyle('Cinematic');
    } else if (activeMode === 'Make Logo') {
      setAspectRatio('1:1');
      setStyle('Logo');
    } else if (activeMode === 'Make Poster') {
      setAspectRatio('9:16');
      setStyle('Poster');
    } else if (activeMode === 'Make Thumbnail') {
      setAspectRatio('16:9');
      setStyle('Cinematic');
    } else if (activeMode === 'Edit My Photo') {
      setAspectRatio('1:1');
    }
  }, [activeMode]);

  const handleModeClick = (nextMode: ImageStudioMode) => {
    setMode(nextMode);
    onSelectMode?.(nextMode);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      setPhoto({
        previewUrl: dataUrl,
        base64,
        mimeType: file.type || 'image/png',
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onClearError?.();
    await onGenerateStudioImage({
      mode,
      prompt: prompt.trim(),
      style,
      aspectRatio,
      genMode,
      sourceAttachment: photo,
    });
    setPrompt('');
  };

  const realImages = images.filter(
    (img) => img.imageUrl && !img.imageUrl.startsWith('data:image/svg+xml')
  );

  const filtered = realImages.filter((img) =>
    img.prompt.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleCopyPrompt = async (id: string, promptText: string) => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore
    }
  };

  const handleShareImage = async (img: SavedImageEntry) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        if (img.imageUrl.startsWith('data:')) {
          const blob = await (await fetch(img.imageUrl)).blob();
          const file = new File([blob], `nova-image-${img.id.slice(0, 6)}.png`, {
            type: blob.type || 'image/png',
          });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
              title: 'Nova AI Image',
              text: img.prompt || 'Created with Nova AI',
              files: [file],
            });
            setSharedId(img.id);
            setTimeout(() => setSharedId(null), 1800);
            return;
          }
        }
        await navigator.share({
          title: 'Nova AI Image',
          text: img.prompt || 'Created with Nova AI',
          url: img.imageUrl.startsWith('http') ? img.imageUrl : window.location.href,
        });
        setSharedId(img.id);
        setTimeout(() => setSharedId(null), 1800);
        return;
      }
      await navigator.clipboard.writeText(
        img.imageUrl.startsWith('http') ? img.imageUrl : window.location.href
      );
      setSharedId(img.id);
      setTimeout(() => setSharedId(null), 1800);
    } catch {
      // ignore cancel
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-black">
      <div className="max-w-[960px] mx-auto space-y-6 pb-8">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#BF5AF2] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          <span className="text-xs font-mono tabular-nums text-white/65">
            {realImages.length} {realImages.length === 1 ? 'image' : 'images'} generated
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Nova Image Studio
            </h1>
            <p className="text-sm text-white/65 mt-1.5">
              Switch between Real Photo and AI Art, edit photos, and design logos, posters, and thumbnails.
            </p>
          </div>

          {/* [ Real Photo 📸 ] [ AI Art 🎨 ] Switch at top of Images tab */}
          <div
            role="group"
            aria-label="Image generation mode"
            className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/40 shrink-0 self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => onChangeGenMode('real-photo')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border ${
                genMode === 'real-photo'
                  ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                  : 'bg-black border-transparent text-white/75 hover:text-white'
              }`}
            >
              Real Photo 📸
            </button>
            <button
              type="button"
              onClick={() => onChangeGenMode('ai-art')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border ${
                genMode === 'ai-art'
                  ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                  : 'bg-black border-transparent text-white/75 hover:text-white'
              }`}
            >
              AI Art 🎨
            </button>
          </div>
        </div>

        {/* Full Image Studio Mode Buttons */}
        <section className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {IMAGE_STUDIO_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeClick(m)}
                className={`px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer text-center border ${
                  mode === m
                    ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                    : 'bg-black border-[#A855F7]/25 text-white/80 hover:text-white hover:border-[#BF5AF2]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />

            {photo && (
              <div className="inline-flex items-center gap-2.5 rounded-xl bg-black border border-[#BF5AF2]/50 p-2 pe-3">
                <img
                  src={photo.previewUrl}
                  alt={photo.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
                <span className="text-xs text-white max-w-[200px] truncate">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="p-1 text-white/60 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={MODE_PLACEHOLDERS[mode]}
              className="w-full rounded-2xl bg-black border border-[#A855F7]/35 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#BF5AF2] resize-none"
            />

            {/* Style & Size selectors */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {IMAGE_STYLES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStyle(st)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                      style === st
                        ? 'bg-[#A855F7]/30 border-[#BF5AF2] text-white'
                        : 'bg-black border-[#A855F7]/25 text-white/75 hover:text-white hover:border-[#BF5AF2]/60'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {IMAGE_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setAspectRatio(r.value)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors cursor-pointer border ${
                      aspectRatio === r.value
                        ? 'bg-[#A855F7]/30 border-[#BF5AF2] text-white'
                        : 'bg-black border-[#A855F7]/25 text-white/70 hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-medium bg-black border border-[#A855F7]/35 text-white hover:border-[#BF5AF2] transition-colors cursor-pointer"
              >
                {photo ? <Plus className="w-3.5 h-3.5 text-[#BF5AF2]" /> : <Upload className="w-3.5 h-3.5 text-[#BF5AF2]" />}
                <span>{photo ? 'Change Photo' : 'Upload Photo'}</span>
              </button>

              <button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow transition-all disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {genMode === 'real-photo' ? 'Generating real photo...' : 'Generating AI art...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{mode}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {isGenerating && (
            <div className="flex items-center gap-3 rounded-2xl bg-black border border-[#BF5AF2]/50 px-4 py-3 text-xs text-white">
              <Loader2 className="w-4 h-4 animate-spin text-[#BF5AF2] shrink-0" />
              <span>
                {genMode === 'real-photo' ? 'Generating real photo...' : 'Generating AI art...'}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start justify-between gap-3 rounded-2xl bg-black border border-[#BF5AF2] px-4 py-3 text-xs text-white">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#BF5AF2] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Image Generation Error</div>
                  <div className="text-white/80 mt-0.5">{errorMessage}</div>
                </div>
              </div>
              {onClearError && (
                <button
                  type="button"
                  onClick={onClearError}
                  aria-label="Dismiss error"
                  className="p-1 text-white/60 hover:text-white cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </section>

        {/* Gallery Header + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <h2 className="text-base font-semibold text-white">Generated Images</h2>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#A855F7] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter gallery..."
              className="w-full rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/30 ps-10 pe-4 py-2 text-xs text-white placeholder:text-white/45 focus:outline-none focus:border-[#BF5AF2]"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/30 p-10 text-center space-y-2.5">
            <div className="w-11 h-11 mx-auto rounded-2xl bg-[#A855F7]/15 border border-[#BF5AF2]/40 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-[#BF5AF2]" />
            </div>
            <div className="text-sm font-medium text-white">No generated images yet</div>
            <p className="text-xs text-white/65 max-w-md mx-auto">
              Only real generated images appear here. Choose a mode above, describe your image, and click Generate.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((img) => (
              <div
                key={img.id}
                className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 overflow-hidden flex flex-col justify-between group"
              >
                <div className="relative aspect-square bg-black overflow-hidden flex items-center justify-center">
                  {failedIds[img.id] ? (
                    <div className="p-4 text-center text-xs text-white/80">
                      Image failed to load.
                    </div>
                  ) : (
                    <img
                      src={img.imageUrl}
                      alt={img.prompt}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedIds((prev) => ({ ...prev, [img.id]: true }))}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-white/85 line-clamp-2 leading-relaxed">
                    {img.prompt || 'Nova generated artwork'}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a
                        href={img.imageUrl}
                        download={`nova-image-${img.id.slice(0, 6)}.png`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-[#BF5AF2]" />
                        <span>Download</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => void handleShareImage(img)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer"
                      >
                        {sharedId === img.id ? (
                          <Check className="w-3.5 h-3.5 text-[#BF5AF2]" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5 text-[#A855F7]" />
                        )}
                        <span>{sharedId === img.id ? 'Shared' : 'Share'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCopyPrompt(img.id, img.prompt)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-black border border-[#A855F7]/30 hover:border-[#BF5AF2] text-white transition-colors cursor-pointer"
                      >
                        {copiedId === img.id ? (
                          <Check className="w-3.5 h-3.5 text-[#BF5AF2]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#A855F7]" />
                        )}
                        <span>{copiedId === img.id ? 'Copied' : 'Prompt'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void onCreateVariations(img.prompt)}
                        disabled={isGenerating}
                        title="Create 4 variations"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenChat(img.chatId)}
                      title="Open in chat"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#BF5AF2] hover:text-white hover:bg-[#A855F7]/20 transition-colors cursor-pointer"
                    >
                      <span>Chat</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
