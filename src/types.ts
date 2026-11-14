export type LanguageCode = 'en' | 'es' | 'fr' | 'pt' | 'ar' | 'hi' | 'zh';

export type PlanType = 'free' | 'premium';

export type VoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export type VoiceSpeed = 'slow' | 'normal' | 'fast';

export type AspectRatio = '1:1' | '16:9' | '9:16';

export type ImageGenMode = 'real-photo' | 'ai-art';

export type ImageStyle =
  | 'Realistic'
  | 'Anime'
  | '3D Cartoon'
  | 'Logo'
  | 'Poster'
  | 'Cinematic';

export type ImageStudioMode =
  | 'Generate Image'
  | 'Edit My Photo'
  | 'Make Wallpaper'
  | 'Make Logo'
  | 'Make Poster'
  | 'Make Thumbnail';

export const IMAGE_STUDIO_MODES: ImageStudioMode[] = [
  'Generate Image',
  'Edit My Photo',
  'Make Wallpaper',
  'Make Logo',
  'Make Poster',
  'Make Thumbnail',
];

export interface NovaMemory {
  name: string;
  school: string;
  business: string;
  favouriteStyle: string;
  preferredLanguage: string;
  pastNotes: string[];
  updatedAtMs: number;
}

export type ActiveView = 'chat' | 'profile' | 'contacts' | 'wallpaper' | 'images' | 'space';

export type WallpaperStyle =
  | 'Nature'
  | 'Anime'
  | 'City'
  | 'Abstract'
  | 'Bible Verse'
  | 'Motivation';

export type WallpaperTime = '6AM' | '7AM' | '8AM';

export const WALLPAPER_STYLES: WallpaperStyle[] = [
  'Nature',
  'Anime',
  'City',
  'Abstract',
  'Bible Verse',
  'Motivation',
];

export const WALLPAPER_TIMES: WallpaperTime[] = ['6AM', '7AM', '8AM'];

export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  createdAtMs: number;
}

export interface WallpaperState {
  autoEnabled: boolean;
  permissionGranted: boolean;
  scheduleTime: WallpaperTime;
  style: WallpaperStyle;
  currentImageUrl: string;
  currentTitle: string;
  currentQuote: string;
  lastGeneratedDate: string;
  appliedAsBackground: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  plan: PlanType;
  language: LanguageCode;
  voiceName: VoiceName;
  dailyChatCount: number;
  dailyImageCount: number;
  lastUsageDate: string; // YYYY-MM-DD
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  lastMessagePreview: string;
  updatedAtMs: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  kind: 'text' | 'image' | 'voice';
  content: string;
  imageDataUrl?: string;
  imageUrls?: string[];
  imagePrompt?: string;
  createdAtMs: number;
}

export interface SavedImageEntry {
  id: string;
  chatId: string;
  prompt: string;
  imageUrl: string;
  createdAtMs: number;
}

export const FREE_DAILY_LIMIT = 10;
export const FREE_IMAGE_LIMIT = 3;

export const IMAGE_STYLES: ImageStyle[] = [
  'Realistic',
  'Anime',
  '3D Cartoon',
  'Logo',
  'Poster',
  'Cinematic',
];

export const IMAGE_RATIOS: Array<{ value: AspectRatio; label: string }> = [
  { value: '1:1', label: 'Square 1:1' },
  { value: '9:16', label: 'Portrait 9:16' },
  { value: '16:9', label: 'Landscape 16:9' },
];

export const SUPPORTED_LANGUAGES: Array<{
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
}> = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese', dir: 'ltr' },
];

export const VOICE_OPTIONS: Array<{
  name: VoiceName;
  tone: string;
}> = [
  { name: 'Kore', tone: 'Female · Warm' },
  { name: 'Zephyr', tone: 'Female · Bright' },
  { name: 'Charon', tone: 'Male · Resonant' },
  { name: 'Puck', tone: 'Male · Crisp' },
  { name: 'Fenrir', tone: 'Male · Deep' },
];
