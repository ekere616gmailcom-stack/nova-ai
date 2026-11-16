const IMAGE_CACHE_STORAGE_KEY = 'nova_image_cache_v1';
const IMAGE_CACHE_LIMIT = 60;

const UNSAFE_IMAGE_WORDS_REGEX =
  /\b(?:sexy|nude|naked|nudity|nsfw|porn|porno|pornography|erotic|lingerie|bikini|underwear|explicit|adult|blood|bloody|gore|kill|killing|murder|gun|guns|pistol|rifle|weapon|weapons|knife|shoot|shooting|violence|violent|death|dead|corpse|drug|drugs|cocaine|heroin|weed|suicide|self[- ]harm)\b/gi;

const memoryImageCache = new Map<string, string>();
const loadedImageUrls = new Set<string>();

function loadStoredImageCache(): void {
  if (memoryImageCache.size > 0 || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(IMAGE_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && (v.startsWith('https://') || v.startsWith('http://'))) {
        memoryImageCache.set(k, v);
      }
    }
  } catch {
    // ignore storage errors
  }
}

function persistStoredImageCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of memoryImageCache.entries()) {
      obj[k] = v;
    }
    window.localStorage.setItem(IMAGE_CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore storage quota errors
  }
}

export function cleanSafeImagePrompt(rawPrompt: string): string {
  const cleaned = rawPrompt
    .replace(/^\/image\s+/i, '')
    .replace(UNSAFE_IMAGE_WORDS_REGEX, 'cinematic, stylish')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();
  return cleaned || 'beautiful landscape';
}

export function normalizeImageCacheKey(promptText: string): string {
  return cleanSafeImagePrompt(promptText).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildFastPollinationsUrl(promptText: string, seed?: number): string {
  const cleanThing = cleanSafeImagePrompt(promptText);
  const seedValue = seed ?? Date.now();
  const promptWithNaturalColours = `safe, family friendly, ${cleanThing}, vibrant natural colours`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    promptWithNaturalColours
  )}?width=512&height=512&model=turbo&nologo=true&seed=${seedValue}`;
}

export function buildVerticalWallpaperBackupUrl(promptText: string, seed?: number): string {
  const cleanThing = cleanSafeImagePrompt(promptText);
  const seedPart = seed !== undefined ? `&seed=${seed}` : '';
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${cleanThing} wallpaper 9:16 vertical`
  )}?width=720&height=1280&model=turbo&nologo=true${seedPart}`;
}

export function buildFastFallbackUrl(seed?: number): string {
  return `https://picsum.photos/512/512?random=${seed ?? Date.now()}`;
}

export function getCachedImageUrl(promptText: string): string | null {
  loadStoredImageCache();
  const key = normalizeImageCacheKey(promptText);
  return memoryImageCache.get(key) || null;
}

export function cacheImageUrl(promptText: string, imageUrl: string): void {
  if (!promptText.trim() || !imageUrl.trim()) return;
  loadStoredImageCache();
  const key = normalizeImageCacheKey(promptText);
  memoryImageCache.delete(key);
  memoryImageCache.set(key, imageUrl);
  while (memoryImageCache.size > IMAGE_CACHE_LIMIT) {
    const oldestKey = memoryImageCache.keys().next().value;
    if (oldestKey === undefined) break;
    memoryImageCache.delete(oldestKey);
  }
  persistStoredImageCache();
}

export function markImageUrlLoaded(imageUrl: string): void {
  if (imageUrl) loadedImageUrls.add(imageUrl);
}

export function isImageUrlLoaded(imageUrl: string): boolean {
  return Boolean(imageUrl && loadedImageUrls.has(imageUrl));
}

export function preloadImageUrl(imageUrl: string): void {
  if (typeof window === 'undefined' || !imageUrl) return;
  try {
    const img = new window.Image();
    img.referrerPolicy = 'no-referrer';
    img.loading = 'eager';
    img.onload = () => {
      loadedImageUrls.add(imageUrl);
    };
    img.src = imageUrl;
  } catch {
    // ignore preload errors
  }
}

export function getOrCreateFastImageUrl(
  promptText: string,
  seed?: number,
  bypassCache = false
): string {
  if (!bypassCache) {
    const cached = getCachedImageUrl(promptText);
    if (cached) {
      preloadImageUrl(cached);
      return cached;
    }
  }
  const url = buildFastPollinationsUrl(promptText, seed);
  cacheImageUrl(promptText, url);
  preloadImageUrl(url);
  return url;
}
