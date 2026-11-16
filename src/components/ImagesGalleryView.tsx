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
import { FastImage } from './FastImage';

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
  'Edit My Photo': 'Upload your photo and describe the edit (e.g. "Change background to architectural studio")...',
  'Make Wallpaper': 'Describe your phone wallpaper (e.g. "Minimalist dark mountain ridge at dusk")...',
  'Make Logo': 'Describe your brand logo (e.g. "Minimalist geometric monochrome wordmark")...',
  'Make Poster': 'Describe your poster (e.g. "Architectural exhibition minimalist poster")...',
  'Make Thumbnail': 'Describe your video thumbnail (e.g. "Clean studio product shot, dramatic lighting")...',
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 sm:px-8 py-6 sm:py-10 bg-[#0f0f0f]">
      <div className="max-w-[960px] mx-auto space-y-6 pb-8">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          <span className="text-xs font-mono tabular-nums text-neutral-400">
            {realImages.length} {realImages.length === 1 ? 'image' : 'images'} generated
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Nova Image Studio
            </h1>
            <p className="text-sm text-neutral-400 mt-1.5">
              Switch between Real Photo and AI Art, edit photos, and design logos, posters, and thumbnails.
            </p>
          </div>

          <div
            role="group"
            aria-label="Image generation mode"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#171717] border border-[#2a2a2a] shrink-0 self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => onChangeGenMode('real-photo')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border ${
                genMode === 'real-photo'
                  ? 'bg-white border-white text-black'
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              Real Photo
            </button>
            <button
              type="button"
              onClick={() => onChangeGenMode('ai-art')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border ${
                genMode === 'ai-art'
                  ? 'bg-white border-white text-black'
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              AI Art
            </button>
          </div>
        </div>

        {/* Full Image Studio Mode Buttons */}
        <section className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {IMAGE_STUDIO_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeClick(m)}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center border ${
                  mode === m
                    ? 'bg-white border-white text-black'
                    : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
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
              <div className="inline-flex items-center gap-2.5 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-2 pe-3">
                <img
                  src={photo.previewUrl}
                  alt={photo.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
                <span className="text-xs text-white max-w-[200px] truncate">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="p-1 text-neutral-400 hover:text-white cursor-pointer"
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
              className="w-full rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 resize-none"
            />

            {/* Style & Size selectors */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {IMAGE_STYLES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStyle(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                      style === st
                        ? 'bg-[#262626] border-neutral-400 text-white'
                        : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:text-white hover:border-neutral-500'
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
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                      aspectRatio === r.value
                        ? 'bg-[#262626] border-neutral-400 text-white'
                        : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:text-white'
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
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] text-white hover:border-neutral-500 transition-colors cursor-pointer"
              >
                {photo ? <Plus className="w-3.5 h-3.5 text-neutral-300" /> : <Upload className="w-3.5 h-3.5 text-neutral-300" />}
                <span>{photo ? 'Change Photo' : 'Upload Photo'}</span>
              </button>

              <button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-white hover:bg-neutral-200 text-black transition-colors disabled:opacity-50 cursor-pointer"
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
                    <ImageIcon className="w-4 h-4" />
                    <span>{mode}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {isGenerating && (
            <div className="flex items-center gap-3 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] px-4 py-3 text-xs text-white">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-300 shrink-0" />
              <span>
                {genMode === 'real-photo' ? 'Generating real photo...' : 'Generating AI art...'}
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start justify-between gap-3 rounded-lg bg-[#0f0f0f] border border-neutral-500 px-4 py-3 text-xs text-white">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-neutral-300 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Image Generation Error</div>
                  <div className="text-neutral-300 mt-0.5">{errorMessage}</div>
                </div>
              </div>
              {onClearError && (
                <button
                  type="button"
                  onClick={onClearError}
                  aria-label="Dismiss error"
                  className="p-1 text-neutral-400 hover:text-white cursor-pointer shrink-0"
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
            <Search className="w-4 h-4 text-neutral-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter gallery..."
              className="w-full rounded-lg bg-[#171717] border border-[#2a2a2a] ps-10 pe-4 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-10 text-center space-y-2.5">
            <div className="w-11 h-11 mx-auto rounded-lg bg-[#212121] border border-[#2a2a2a] flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-neutral-300" />
            </div>
            <div className="text-sm font-medium text-white">No generated images yet</div>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              Only real generated images appear here. Choose a mode above, describe your image, and click Generate.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((img) => (
              <div
                key={img.id}
                className="rounded-lg bg-[#171717] border border-[#2a2a2a] overflow-hidden flex flex-col justify-between group"
              >
                <div className="relative aspect-square bg-[#141414] overflow-hidden">
                  <FastImage
                    src={img.imageUrl}
                    alt={img.prompt || 'Nova generated artwork'}
                    cachePrompt={img.prompt || undefined}
                    wrapperClassName="h-full w-full"
                    className="h-full w-full group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-neutral-200 line-clamp-2 leading-relaxed">
                    {img.prompt || 'Nova generated artwork'}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a
                        href={img.imageUrl}
                        download={`nova-image-${img.id.slice(0, 6)}.png`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-neutral-300" />
                        <span>Download</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => void handleCopyPrompt(img.id, img.prompt)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0f0f0f] border border-[#2a2a2a] hover:border-neutral-500 text-white transition-colors cursor-pointer"
                      >
                        {copiedId === img.id ? (
                          <Check className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-neutral-400" />
                        )}
                        <span>{copiedId === img.id ? 'Copied' : 'Prompt'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void onCreateVariations(img.prompt)}
                        disabled={isGenerating}
                        title="Create 4 variations"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-neutral-200 text-black transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenChat(img.chatId)}
                      title="Open in chat"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
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
