import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowUp,
  Check,
  Download,
  Globe,
  History,
  Image as ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Square,
  Trash2,
  User as UserIcon,
  Wallpaper,
  X,
} from 'lucide-react';
import {
  ActiveView,
  AspectRatio,
  ChatMessage,
  ChatSession,
  IMAGE_RATIOS,
  IMAGE_STUDIO_MODES,
  IMAGE_STYLES,
  ImageGenMode,
  ImageStudioMode,
  ImageStyle,
  LanguageCode,
  NovaMemory,
  SavedImageEntry,
  SUPPORTED_LANGUAGES,
  UserProfile,
  VoiceName,
  VoiceSpeed,
  WallpaperState,
  WallpaperStyle,
  WallpaperTime,
} from './types';
import { TRANSLATIONS } from './i18n/translations';
import {
  auth,
  compressDataUrlForStorage,
  db,
  getTodayDateKey,
  googleProvider,
} from './lib/firebase';
import { NovaLogo } from './components/NovaLogo';
import { ChatMessageItem } from './components/ChatMessageItem';
import { UserProfileView } from './components/UserProfileView';
import { SettingsModal } from './components/SettingsModal';
import { WallpaperView } from './components/WallpaperView';
import { RightMenuDrawer } from './components/RightMenuDrawer';
import { ImagesGalleryView } from './components/ImagesGalleryView';
import { LoginScreen } from './components/LoginScreen';
import { RotatingEarthWallpaper } from './components/RotatingEarthWallpaper';
import { HistoryView } from './components/HistoryView';

const GUEST_STORAGE_KEY = 'nova_guest_workspace_v2';
const GUEST_SESSION_KEY = 'nova_guest_session_v1';
const VOICE_SPEED_KEY = 'nova_voice_speed_v1';
const MEMORY_PREFIX = 'nova_memory_v1_';
const WALLPAPER_STATE_PREFIX = 'nova_wallpaper_state_v1_';
const REPLY_CACHE_KEY = 'nova_reply_cache_v1';
const REPLY_CACHE_LIMIT = 30;

function loadReplyCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REPLY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) clean[k] = v;
      }
      return clean;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

function getClientReplyCacheKey(
  prompt: string,
  language: LanguageCode,
  hasAttachment: boolean,
  hasPriorHistory: boolean
): string | null {
  if (hasAttachment || hasPriorHistory) return null;
  const clean = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!clean || clean.length > 220) return null;
  if (
    /\b(today|now|current|time|date|weather|news|random|roll|flip|remember|my\s+name|my\s+school|my\s+business)\b/i.test(
      clean
    )
  ) {
    return null;
  }
  return `${language}:${clean}`;
}

const DEFAULT_MEMORY: NovaMemory = {
  name: '',
  school: '',
  business: '',
  favouriteStyle: '',
  preferredLanguage: '',
  pastNotes: [],
  updatedAtMs: 0,
};

function loadVoiceSpeed(): VoiceSpeed {
  try {
    const val = localStorage.getItem(VOICE_SPEED_KEY);
    if (val === 'slow' || val === 'fast' || val === 'normal') return val;
  } catch {
    // ignore
  }
  return 'normal';
}

function loadMemory(uidKey: string): NovaMemory {
  try {
    const raw = localStorage.getItem(`${MEMORY_PREFIX}${uidKey}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NovaMemory>;
      return {
        ...DEFAULT_MEMORY,
        ...parsed,
        pastNotes: Array.isArray(parsed.pastNotes) ? parsed.pastNotes.map(String) : [],
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_MEMORY };
}

function saveMemoryToStorage(uidKey: string, mem: NovaMemory): void {
  try {
    localStorage.setItem(`${MEMORY_PREFIX}${uidKey}`, JSON.stringify(mem));
  } catch {
    // ignore
  }
}

function extractMemoryFromPrompt(prompt: string, prev: NovaMemory): NovaMemory {
  const clean = prompt.trim();
  if (!clean) return prev;
  const next: NovaMemory = { ...prev, pastNotes: [...prev.pastNotes] };
  let changed = false;

  const nameMatch =
    clean.match(/\b(?:my name is|call me|i am called|remember my name is)\s+([A-Za-z][A-Za-z\s'-]{1,30})(?:[.!,?]|$)/i) ||
    clean.match(/\b(?:i'm|im|i am)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)(?:[.!,?]|$)/);
  const ignoredNames = new Set([
    'Good', 'Fine', 'Great', 'Happy', 'Sad', 'Tired', 'Ready', 'Here', 'Back',
    'Sorry', 'Okay', 'Ok', 'New', 'Asking', 'Looking', 'Trying', 'Going', 'Doing',
  ]);
  if (nameMatch?.[1] && !ignoredNames.has(nameMatch[1].trim())) {
    next.name = nameMatch[1].trim();
    changed = true;
  }

  const schoolMatch = clean.match(/\b(?:my school is|i attend|i study at|i go to)\s+([A-Za-z0-9\s.&'-]{2,50})(?:[.!,?]|$)/i);
  if (schoolMatch?.[1] && !/^(bed|sleep|home|work|church|mosque|market)$/i.test(schoolMatch[1].trim())) {
    next.school = schoolMatch[1].trim();
    changed = true;
  }

  const bizMatch = clean.match(/\b(?:my business is|i run|my company is|i sell|i own)\s+([A-Za-z0-9\s.&'-]{2,60})(?:[.!,?]|$)/i);
  if (bizMatch?.[1]) {
    next.business = bizMatch[1].trim();
    changed = true;
  }

  const styleMatch =
    clean.match(/\b(?:my\s+(?:favourite|favorite)\s+style\s+is|favourite\s+style\s+is|favorite\s+style\s+is|my\s+style\s+is|my\s+vibe\s+is)\s+([A-Za-z0-9\s,&'-]{2,50})(?:[.!,?]|$)/i) ||
    clean.match(/\b(?:favourite style|favorite style|i prefer|i love|talk to me like|keep replies)\s+(anime|realistic|3d cartoon|cinematic|poster|logo|minimalist|dark|casual|funny|chill|short|detailed|friendly|neon purple)\b/i);
  if (styleMatch?.[1]) {
    next.favouriteStyle = styleMatch[1].trim();
    changed = true;
  }

  const langMatch = clean.match(/\b(nigerian pidgin|pidgin|yoruba|igbo|hausa|english|french|spanish|arabic|hindi)\b/i);
  if (langMatch?.[1] && /\b(speak|reply|talk|prefer|language|in)\b/i.test(clean)) {
    next.preferredLanguage = langMatch[1].trim();
    changed = true;
  }

  if (clean.length >= 16 && !/^call\s+/i.test(clean) && !/\bwhat(?:'s| is) my name\b/i.test(clean)) {
    const snippet = clean.slice(0, 90);
    if (!next.pastNotes.includes(snippet)) {
      next.pastNotes = [snippet, ...next.pastNotes].slice(0, 10);
      changed = true;
    }
  }

  if (changed) {
    next.updatedAtMs = Date.now();
  }
  return changed ? next : prev;
}

const DEFAULT_WALLPAPER_STATE: WallpaperState = {
  autoEnabled: false,
  permissionGranted: false,
  scheduleTime: '7AM',
  style: 'Nature',
  currentImageUrl: '',
  currentTitle: '',
  currentQuote: '',
  lastGeneratedDate: '',
  appliedAsBackground: false,
};

function loadWallpaperState(uidKey: string): WallpaperState {
  try {
    const raw = localStorage.getItem(`${WALLPAPER_STATE_PREFIX}${uidKey}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WallpaperState>;
      return {
        ...DEFAULT_WALLPAPER_STATE,
        ...parsed,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_WALLPAPER_STATE };
}

function saveWallpaperStateToStorage(uidKey: string, next: WallpaperState): void {
  try {
    localStorage.setItem(`${WALLPAPER_STATE_PREFIX}${uidKey}`, JSON.stringify(next));
  } catch {
    // Fallback if image data URL exceeds localStorage quota: persist preferences without image
    try {
      localStorage.setItem(
        `${WALLPAPER_STATE_PREFIX}${uidKey}`,
        JSON.stringify({ ...next, currentImageUrl: '' })
      );
    } catch {
      // ignore
    }
  }
}

function getScheduleHour(time: WallpaperTime): number {
  if (time === '6AM') return 6;
  if (time === '8AM') return 8;
  return 7;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getDefaultGuestProfile(): UserProfile {
  const today = getTodayDateKey();
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { profile?: Partial<UserProfile> };
      if (parsed.profile) {
        const isSameDay = parsed.profile.lastUsageDate === today;
        return {
          uid: 'guest',
          displayName: 'Guest',
          email: '',
          photoURL: '',
          plan: parsed.profile.plan === 'premium' ? 'premium' : 'free',
          language: parsed.profile.language || 'en',
          voiceName: parsed.profile.voiceName || 'Kore',
          dailyChatCount: isSameDay ? Number(parsed.profile.dailyChatCount || 0) : 0,
          dailyImageCount: isSameDay ? Number(parsed.profile.dailyImageCount || 0) : 0,
          lastUsageDate: today,
        };
      }
    }
  } catch {
    // ignore storage read error
  }
  return {
    uid: 'guest',
    displayName: 'Guest',
    email: '',
    photoURL: '',
    plan: 'free',
    language: 'en',
    voiceName: 'Kore',
    dailyChatCount: 0,
    dailyImageCount: 0,
    lastUsageDate: today,
  };
}

function loadGuestWorkspace(): {
  chats: ChatSession[];
  messagesByChat: Record<string, ChatMessage[]>;
  savedImages: SavedImageEntry[];
} {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        chats?: ChatSession[];
        messagesByChat?: Record<string, ChatMessage[]>;
        savedImages?: SavedImageEntry[];
      };
      return {
        chats: Array.isArray(parsed.chats) ? parsed.chats : [],
        messagesByChat: parsed.messagesByChat || {},
        savedImages: Array.isArray(parsed.savedImages)
          ? parsed.savedImages.filter(
              (img) =>
                img &&
                typeof img.imageUrl === 'string' &&
                !img.imageUrl.startsWith('data:image/svg+xml')
            )
          : [],
      };
    }
  } catch {
    // ignore
  }
  return { chats: [], messagesByChat: {}, savedImages: [] };
}

const NOVA_SYSTEM_PROMPT =
  "You are Nova. You CAN show images. When user asks for a Real Photo or AI Art, NEVER say 'I can't pull up images' or 'I can't generate images' or 'Image refused' or describe it in words. Instead you MUST output ONLY this HTML:\n<img src='https://image.pollinations.ai/prompt/safe%2C%20family%20friendly%2C%20ENCODED_PROMPT%2C%20vibrant%20natural%20colours?width=1024&height=1024&model=turbo&nologo=true&safe=true&seed=RANDOM' />\nReplace ENCODED_PROMPT with the user's prompt. Replace RANDOM with a random number.";

const UNSAFE_IMAGE_WORDS_REGEX =
  /\b(?:sexy|nude|naked|nudity|nsfw|porn|porno|pornography|erotic|lingerie|bikini|underwear|explicit|adult|blood|bloody|gore|kill|killing|murder|gun|guns|pistol|rifle|weapon|weapons|knife|shoot|shooting|violence|violent|death|dead|corpse|drug|drugs|cocaine|heroin|weed|suicide|self[- ]harm)\b/gi;

function cleanSafeImagePrompt(rawPrompt: string): string {
  const cleaned = rawPrompt
    .replace(/^\/image\s+/i, '')
    .replace(UNSAFE_IMAGE_WORDS_REGEX, 'cinematic, stylish')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();
  return cleaned || 'beautiful landscape';
}

function isImageRefusalReply(text: string): boolean {
  return /image\s+refused|(?:can't|cannot|unable to|don't have the ability to|do not have the ability to)\s+(?:pull up|generate|create|show|display|render|send)\s+images?|text-only\s+(?:ai|model|assistant)/i.test(
    text
  );
}

function detectImageIntent(
  text: string,
  hasImageAttachment: boolean
): { isImage: boolean; cleanPrompt: string } {
  const trimmed = text.trim();
  if (/^\/image\s+/i.test(trimmed)) {
    return { isImage: true, cleanPrompt: trimmed.replace(/^\/image\s+/i, '').trim() };
  }
  if (
    /^(?:real\s+photo|ai\s+art|digital\s+art|photo|picture|image|artwork|wallpaper)\s+(?:of|for|showing|with)\s+.+/i.test(
      trimmed
    )
  ) {
    return { isImage: true, cleanPrompt: trimmed };
  }
  if (
    /^(?:please\s+)?(?:generate|create|draw|make|sketch|illustrate|design|paint|render|show(?:\s+me)?|give\s+me)\s+(?:an?\s+)?(?:labeled\s+|labelled\s+|colourful\s+|colorful\s+|educational\s+|scientific\s+|3d\s+|realistic\s+|real\s+|ai\s+|digital\s+|detailed\s+|beautiful\s+)?(?:image|picture|photo|logo|poster|illustration|diagram|drawing|sketch|infographic|artwork|art|visual)(?:\s+(?:of|for|showing|with))?\b/i.test(
      trimmed
    )
  ) {
    return { isImage: true, cleanPrompt: trimmed };
  }
  if (
    /^(?:please\s+)?(?:draw|sketch|illustrate|paint)\s+(?:me\s+)?(?:a|an|the)?\s*(?!conclusion\b|attention\b|the\s+line\b).+/i.test(
      trimmed
    )
  ) {
    return { isImage: true, cleanPrompt: trimmed };
  }
  if (
    /\b(?:labeled\s+diagram|labelled\s+diagram|educational\s+diagram|diagram\s+of|illustration\s+of|picture\s+of|photo\s+of|real\s+photo\s+of|ai\s+art\s+of|infographic\s+of|drawing\s+of|sketch\s+of)\b/i.test(
      trimmed
    )
  ) {
    return { isImage: true, cleanPrompt: trimmed };
  }
  if (/^[a-z0-9\s,'-]{2,65}\s+diagram[.!?]*$/i.test(trimmed)) {
    return { isImage: true, cleanPrompt: trimmed };
  }
  if (
    hasImageAttachment &&
    /\b(turn\s+me|cartoon|anime|change\s+background|edit\s+this|make\s+me|style\s+this|remove\s+background)\b/i.test(
      trimmed
    )
  ) {
    return { isImage: true, cleanPrompt: trimmed };
  }
  return { isImage: false, cleanPrompt: trimmed };
}

function sanitizeFriendlyError(raw: unknown, fallback: string): string {
  const str = raw instanceof Error ? raw.message : String(raw || '');
  if (!str || str.includes('{') || str.includes('error') && str.length > 140) {
    return fallback;
  }
  if (/popup-closed-by-user/i.test(str)) {
    return 'Google sign-in was cancelled. Tap Continue with Google to try again.';
  }
  if (/network-request-failed/i.test(str)) {
    return 'Network unavailable. Please check your connection and try again.';
  }
  return str.length > 120 ? fallback : str;
}

function extractLatestBuiltHtml(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant' || !m.content) continue;
    const match = m.content.match(/\[\[NOVA_BUILDER_START\]\]([\s\S]*?)\[\[NOVA_BUILDER_END\]\]/);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]) as { html?: string };
        if (parsed?.html && parsed.html.trim().length > 0) {
          return parsed.html;
        }
      } catch {
        // ignore invalid json
      }
    }
  }
  return null;
}

function detectBuilderIntent(
  text: string,
  latestBuiltHtml: string | null,
  lastAssistantAskedCategory: boolean
): { mode: 'none' | 'build' | 'edit'; prompt: string } {
  const trimmed = text.trim();
  if (!trimmed) return { mode: 'none', prompt: '' };

  if (
    /\b(?:create|build|make|design|generate|develop|code)\s+(?:a\s+|an\s+|me\s+(?:a|an)\s+|my\s+)?(?:[a-z0-9\s'-]{0,30}\s+)?(?:website|web\s*app|webapp|landing\s*page|portfolio(?:\s*page|\s*site)?|shop\s*(?:website|site)|store\s*(?:website|site)|e-?commerce(?:\s*site|\s*website)?|calculator(?:\s*app)?|to-?do\s*(?:app|list)|quiz\s*app|music\s*player|weather\s*app)\b/i.test(
      trimmed
    )
  ) {
    return { mode: 'build', prompt: trimmed };
  }

  if (
    /^(?:calculator|to-?do\s*app|quiz\s*app|music\s*player|weather\s*app|shop\s*website|portfolio\s*website|school\s*website|church\s*website|restaurant\s*website)[.!?]*$/i.test(
      trimmed
    )
  ) {
    return { mode: 'build', prompt: `Build a working ${trimmed}` };
  }

  if (
    lastAssistantAskedCategory &&
    trimmed.length <= 90 &&
    !/^(?:no|cancel|nevermind|stop)\b/i.test(trimmed)
  ) {
    return { mode: 'build', prompt: `Build a ${trimmed}` };
  }

  if (
    latestBuiltHtml &&
    /^(?:please\s+)?(?:change|update|edit|modify|make|set|switch|add|remove|replace|put|include)\b/i.test(
      trimmed
    ) &&
    /\b(?:colou?r|theme|blue|red|green|purple|dark|light|gold|pink|orange|teal|contact\s*form|form|page|section|about|services|menu|price|pricing|phone|number|name|whatsapp|logo|footer|header|navbar|button|font|background|hero)\b/i.test(
      trimmed
    )
  ) {
    return { mode: 'edit', prompt: trimmed };
  }

  return { mode: 'none', prompt: '' };
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestSessionActive, setGuestSessionActive] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [welcomeBanner, setWelcomeBanner] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile>(() => getDefaultGuestProfile());
  const [chats, setChats] = useState<ChatSession[]>(() => loadGuestWorkspace().chats);
  const [guestMessagesByChat, setGuestMessagesByChat] = useState<Record<string, ChatMessage[]>>(
    () => loadGuestWorkspace().messagesByChat
  );
  const [savedImages, setSavedImages] = useState<SavedImageEntry[]>(
    () => loadGuestWorkspace().savedImages
  );
  const [firestoreMessages, setFirestoreMessages] = useState<ChatMessage[]>([]);
  const [optimisticMessagesByChat, setOptimisticMessagesByChat] = useState<
    Record<string, ChatMessage[]>
  >({});

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [historyTab, setHistoryTab] = useState<'chats' | 'images'>('chats');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [inputText, setInputText] = useState('');
  const [imageMode, setImageMode] = useState(false);
  const [imageGenMode, setImageGenMode] = useState<ImageGenMode>(() => {
    try {
      const saved = localStorage.getItem('nova_image_gen_mode_v1');
      if (saved === 'ai-art' || saved === 'real-photo') return saved;
    } catch {
      // ignore storage access issues
    }
    return 'real-photo';
  });
  const handleChangeImageGenMode = useCallback((mode: ImageGenMode) => {
    setImageGenMode(mode);
    setImageMode(true);
    try {
      localStorage.setItem('nova_image_gen_mode_v1', mode);
    } catch {
      // ignore storage access issues
    }
  }, []);
  const [studioMode, setStudioMode] = useState<ImageStudioMode>('Generate Image');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('Realistic');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [attachedImage, setAttachedImage] = useState<{
    previewUrl: string;
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isBuildingApp, setIsBuildingApp] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const replyCacheRef = useRef<Record<string, string>>(loadReplyCache());

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [rightMenuOpen, setRightMenuOpen] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState<VoiceSpeed>(() => loadVoiceSpeed());
  const [memory, setMemory] = useState<NovaMemory>(() => loadMemory('guest'));

  const [wallpaperState, setWallpaperState] = useState<WallpaperState>(() =>
    loadWallpaperState('guest')
  );
  const [isGeneratingWallpaper, setIsGeneratingWallpaper] = useState(false);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [imageStudioError, setImageStudioError] = useState<string | null>(null);

  const canUseFirestore = Boolean(authUser && authUser.emailVerified);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const heroInputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomInputRef = useRef<HTMLTextAreaElement | null>(null);

  const t = TRANSLATIONS[profile.language] || TRANSLATIONS.en;
  const langMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === profile.language) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    document.documentElement.lang = profile.language;
    document.documentElement.dir = langMeta.dir;
  }, [profile.language, langMeta.dir]);

  // Persist local/guest workspace when Firestore isn't active
  useEffect(() => {
    if (canUseFirestore) return;
    try {
      localStorage.setItem(
        GUEST_STORAGE_KEY,
        JSON.stringify({
          profile,
          chats,
          messagesByChat: guestMessagesByChat,
          savedImages: savedImages.slice(0, 24),
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [canUseFirestore, profile, chats, guestMessagesByChat, savedImages]);

  useEffect(() => {
    if (!welcomeBanner) return;
    const timer = window.setTimeout(() => setWelcomeBanner(null), 4500);
    return () => window.clearTimeout(timer);
  }, [welcomeBanner]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const readyFallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 1500);

    const unsub = onAuthStateChanged(auth, async (user) => {
      window.clearTimeout(readyFallbackTimer);
      setAuthUser(user);
      setAuthReady(true);

      if (!user) {
        const guest = getDefaultGuestProfile();
        const stored = loadGuestWorkspace();
        setProfile(guest);
        setChats(stored.chats);
        setGuestMessagesByChat(stored.messagesByChat);
        setSavedImages(stored.savedImages);
        setFirestoreMessages([]);
        setWallpaperState(loadWallpaperState('guest'));
        setMemory(loadMemory('guest'));
        setActiveChatId(null);
        return;
      }

      setWallpaperState(loadWallpaperState(user.uid));
      const userMem = loadMemory(user.uid);
      if (!userMem.name && user.displayName) {
        const seeded = { ...userMem, name: user.displayName, updatedAtMs: Date.now() };
        saveMemoryToStorage(user.uid, seeded);
        setMemory(seeded);
      } else {
        setMemory(userMem);
      }

      if (!user.emailVerified) {
        const stored = loadGuestWorkspace();
        const base = getDefaultGuestProfile();
        setProfile({
          ...base,
          uid: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || 'Nova User',
          email: user.email || '',
          photoURL: user.photoURL || '',
        });
        setChats(stored.chats);
        setGuestMessagesByChat(stored.messagesByChat);
        setSavedImages(stored.savedImages);
        return;
      }

      setProfile((prev) => ({
        ...prev,
        uid: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Nova User',
        email: user.email || '',
        photoURL: user.photoURL || '',
      }));
    });

    return () => {
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userDocReadyPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Ensure user doc exists and subscribe to Firestore user profile & chats (verified users only)
  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified) return;

    let cancelled = false;
    let unsubUser: (() => void) | undefined;
    let unsubChats: (() => void) | undefined;

    const uid = authUser.uid;
    const today = getTodayDateKey();
    const userRef = doc(db, 'users', uid);

    const initAndSubscribe = async () => {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const initialProfile: UserProfile = {
            uid,
            displayName: (authUser.displayName || authUser.email?.split('@')[0] || 'Nova User').slice(0, 120),
            email: (authUser.email || 'user@nova.app').slice(0, 200),
            photoURL: (authUser.photoURL || '').slice(0, 500),
            plan: 'free',
            language: profile.language || 'en',
            voiceName: profile.voiceName || 'Kore',
            dailyChatCount: 0,
            dailyImageCount: 0,
            lastUsageDate: today,
          };
          await setDoc(userRef, {
            ...initialProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (!cancelled) setProfile(initialProfile);
        } else {
          const data = snap.data();
          if (data.lastUsageDate !== today) {
            await updateDoc(userRef, {
              dailyChatCount: 0,
              dailyImageCount: 0,
              lastUsageDate: today,
              updatedAt: serverTimestamp(),
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn('Firestore user profile sync skipped:', err);
      }

      if (cancelled) return;

      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          const isSameDay = data.lastUsageDate === today;
          setProfile({
            uid,
            displayName: String(authUser.displayName || data.displayName || authUser.email?.split('@')[0] || 'Nova User'),
            email: String(authUser.email || data.email || ''),
            photoURL: String(authUser.photoURL || data.photoURL || ''),
            plan: data.plan === 'premium' ? 'premium' : 'free',
            language: (data.language as LanguageCode) || 'en',
            voiceName: (data.voiceName as VoiceName) || 'Kore',
            dailyChatCount: isSameDay ? Number(data.dailyChatCount || 0) : 0,
            dailyImageCount: isSameDay ? Number(data.dailyImageCount || 0) : 0,
            lastUsageDate: isSameDay ? String(data.lastUsageDate) : today,
          });
        },
        (error) => console.warn('Firestore user listener warning:', error)
      );

      const chatsQuery = query(collection(db, 'users', uid, 'chats'), where('userId', '==', uid));
      unsubChats = onSnapshot(
        chatsQuery,
        (snapshot) => {
          const loaded: ChatSession[] = snapshot.docs.map((d) => {
            const data = d.data();
            const updatedAtMs =
              data.updatedAt && typeof data.updatedAt.toMillis === 'function'
                ? data.updatedAt.toMillis()
                : Date.now();
            return {
              id: d.id,
              userId: String(data.userId || uid),
              title: String(data.title || 'New Chat'),
              lastMessagePreview: String(data.lastMessagePreview || ''),
              updatedAtMs,
            };
          });
          loaded.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
          setChats(loaded);
        },
        (error) => console.warn('Firestore chats listener warning:', error)
      );
    };

    userDocReadyPromiseRef.current = initAndSubscribe();

    return () => {
      cancelled = true;
      unsubUser?.();
      unsubChats?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser]);

  // Subscribe to Firestore messages for active chat & populate savedImages
  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified || !activeChatId) {
      setFirestoreMessages([]);
      return;
    }

    const uid = authUser.uid;
    const msgQuery = query(
      collection(db, 'users', uid, 'chats', activeChatId, 'messages'),
      where('userId', '==', uid)
    );

    const unsub = onSnapshot(
      msgQuery,
      (snapshot) => {
        const list: ChatMessage[] = snapshot.docs.map((d) => {
          const data = d.data();
          const createdAtMs =
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? data.createdAt.toMillis()
              : Date.now();
          return {
            id: d.id,
            chatId: String(data.chatId || activeChatId),
            role: data.role === 'assistant' ? 'assistant' : 'user',
            kind:
              data.kind === 'image' || data.kind === 'voice' ? data.kind : 'text',
            content: String(data.content || ''),
            imageDataUrl: data.imageDataUrl ? String(data.imageDataUrl) : undefined,
            imageUrls: Array.isArray(data.imageUrls)
              ? data.imageUrls.map(String)
              : undefined,
            imagePrompt: data.imagePrompt ? String(data.imagePrompt) : undefined,
            createdAtMs,
          };
        });
        list.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setFirestoreMessages(list);
      },
      (error) => console.warn('Firestore messages listener warning:', error)
    );

    return () => unsub();
  }, [authReady, authUser, activeChatId]);

  const activeMessages = useMemo(() => {
    if (!activeChatId) return [];
    const base = canUseFirestore
      ? firestoreMessages
      : guestMessagesByChat[activeChatId] || [];
    const pending = optimisticMessagesByChat[activeChatId] || [];
    if (pending.length === 0) return base;
    const seen = new Set(base.map((m) => m.id));
    const merged = [...base];
    for (const p of pending) {
      if (!seen.has(p.id)) merged.push(p);
    }
    return merged.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }, [
    activeChatId,
    canUseFirestore,
    firestoreMessages,
    guestMessagesByChat,
    optimisticMessagesByChat,
  ]);

  // Collect saved real images from current messages as well (exclude legacy SVG placeholders)
  const allHistoryImages = useMemo(() => {
    const map = new Map<string, SavedImageEntry>();
    savedImages.forEach((img) => {
      if (img.imageUrl && !img.imageUrl.startsWith('data:image/svg+xml')) {
        map.set(img.id, img);
      }
    });
    activeMessages.forEach((m) => {
      if (
        m.role === 'assistant' &&
        m.kind === 'image' &&
        m.imageDataUrl &&
        !m.imageDataUrl.startsWith('data:image/svg+xml')
      ) {
        map.set(m.id, {
          id: m.id,
          chatId: m.chatId,
          prompt: m.imagePrompt || m.content,
          imageUrl: m.imageDataUrl,
          createdAtMs: m.createdAtMs,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [savedImages, activeMessages]);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q)
    );
  }, [chats, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [activeChatId, activeMessages.length, streamingContent, isGeneratingImage, isSending]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleViewportResize = () => {
      if (activeMessages.length > 0) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    };
    vv.addEventListener('resize', handleViewportResize);
    return () => vv.removeEventListener('resize', handleViewportResize);
  }, [activeMessages.length]);

  useEffect(() => {
    if (!voiceHint) return;
    const timer = window.setTimeout(() => setVoiceHint(null), 5000);
    return () => window.clearTimeout(timer);
  }, [voiceHint]);

  const handleSignInGoogle = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setGuestSessionActive(false);
      try {
        localStorage.removeItem(GUEST_SESSION_KEY);
      } catch {
        // ignore
      }
      const userName = cred.user.displayName || cred.user.email?.split('@')[0] || 'Nova User';
      setProfile((prev) => ({
        ...prev,
        uid: cred.user.uid,
        displayName: userName,
        email: cred.user.email || prev.email,
        photoURL: cred.user.photoURL || prev.photoURL,
      }));
      setWelcomeBanner(`Welcome, ${userName}`);
    } catch (err) {
      setAuthError(sanitizeFriendlyError(err, 'Google sign-in could not be completed.'));
    }
  };

  const handleContinueAsGuest = () => {
    setAuthError(null);
    setGuestSessionActive(true);
  };

  const handleSignOut = async () => {
    await signOut(auth).catch(() => undefined);
    setGuestSessionActive(false);
    try {
      localStorage.removeItem(GUEST_SESSION_KEY);
    } catch {
      // ignore
    }
    setWelcomeBanner(null);
    setActiveChatId(null);
    setActiveView('chat');
    setMobileDrawerOpen(false);
  };

  const handleChangeVoiceSpeed = (speed: VoiceSpeed) => {
    setVoiceSpeed(speed);
    try {
      localStorage.setItem(VOICE_SPEED_KEY, speed);
    } catch {
      // ignore
    }
  };

  const updateUserPreferences = async (
    patch: Partial<Pick<UserProfile, 'language' | 'voiceName' | 'plan'>>
  ) => {
    setProfile((prev) => ({ ...prev, ...patch }));
    if (!canUseFirestore || !authUser) return;
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Preference update skipped:', err);
    }
  };

  const incrementUsage = async (type: 'chat' | 'image') => {
    const today = getTodayDateKey();
    const isToday = profile.lastUsageDate === today;
    const nextChatCount = (isToday ? profile.dailyChatCount : 0) + (type === 'chat' ? 1 : 0);
    const nextImageCount = (isToday ? profile.dailyImageCount : 0) + (type === 'image' ? 1 : 0);

    setProfile((prev) => ({
      ...prev,
      dailyChatCount: nextChatCount,
      dailyImageCount: nextImageCount,
      lastUsageDate: today,
    }));

    if (!canUseFirestore || !authUser) return;
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        dailyChatCount: nextChatCount,
        dailyImageCount: nextImageCount,
        lastUsageDate: today,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Usage counter sync skipped:', err);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setActiveView('chat');
    setVoiceHint(null);
    setStreamingContent('');
    setMobileDrawerOpen(false);
    heroInputRef.current?.focus();
  };

  const storageUidKey = authUser ? authUser.uid : 'guest';

  const handleUpdateMemory = (patch: Partial<NovaMemory>) => {
    setMemory((prev) => {
      const next: NovaMemory = {
        ...prev,
        ...patch,
        updatedAtMs: Date.now(),
      };
      saveMemoryToStorage(storageUidKey, next);
      return next;
    });
  };

  const handleClearMemory = () => {
    const cleared = { ...DEFAULT_MEMORY };
    setMemory(cleared);
    saveMemoryToStorage(storageUidKey, cleared);
  };

  const updateWallpaperState = (patch: Partial<WallpaperState>) => {
    setWallpaperState((prev) => {
      const next = { ...prev, ...patch };
      saveWallpaperStateToStorage(storageUidKey, next);
      return next;
    });
  };

  const wallpaperAttemptedDateRef = useRef<string>('');

  const handleGenerateWallpaper = async (style: WallpaperStyle) => {
    if (isGeneratingWallpaper) return;
    setIsGeneratingWallpaper(true);
    setWallpaperError(null);
    const seed = Date.now();
    try {
      const res = await fetch('/api/wallpaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, seed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        imageUrl?: string | null;
        title?: string;
        quote?: string;
      };

      const title = data.title || `${style} Horizon`;
      const quote = data.quote || 'Begin today with clarity and calm.';
      const directFallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        `safe, family friendly, ${style} serene luxury vertical 9:16 mobile wallpaper, vibrant natural colours`
      )}?width=720&height=1280&model=turbo&nologo=true&safe=true&seed=${seed}`;

      updateWallpaperState({
        style,
        currentImageUrl: data.imageUrl || directFallbackUrl,
        currentTitle: title,
        currentQuote: quote,
        lastGeneratedDate: getTodayDateKey(),
      });
    } catch {
      const directFallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        `safe, family friendly, ${style} serene luxury vertical 9:16 mobile wallpaper, vibrant natural colours`
      )}?width=720&height=1280&model=turbo&nologo=true&safe=true&seed=${seed}`;
      updateWallpaperState({
        style,
        currentImageUrl: directFallbackUrl,
        currentTitle: `${style} Horizon`,
        currentQuote: 'Begin today with clarity and calm.',
        lastGeneratedDate: getTodayDateKey(),
      });
    } finally {
      setIsGeneratingWallpaper(false);
    }
  };

  // Daily Wallpaper auto-scheduler (6AM, 7AM, 8AM)
  useEffect(() => {
    const checkSchedule = () => {
      if (!wallpaperState.autoEnabled || !wallpaperState.permissionGranted) return;
      const nowHour = new Date().getHours();
      const targetHour = getScheduleHour(wallpaperState.scheduleTime);
      const today = getTodayDateKey();
      if (
        nowHour >= targetHour &&
        wallpaperState.lastGeneratedDate !== today &&
        wallpaperAttemptedDateRef.current !== today
      ) {
        wallpaperAttemptedDateRef.current = today;
        void handleGenerateWallpaper(wallpaperState.style);
      }
    };

    checkSchedule();
    const timer = window.setInterval(checkSchedule, 60000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallpaperState.autoEnabled,
    wallpaperState.permissionGranted,
    wallpaperState.scheduleTime,
    wallpaperState.lastGeneratedDate,
    wallpaperState.style,
  ]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      setAttachedImage({
        previewUrl: dataUrl,
        base64,
        mimeType: file.type || 'image/png',
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeChatId === chatId) setActiveChatId(null);

    if (!canUseFirestore || !authUser) {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setGuestMessagesByChat((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      setSavedImages((prev) => prev.filter((img) => img.chatId !== chatId));
      return;
    }

    const uid = authUser.uid;
    try {
      const msgSnap = await getDocs(
        query(collection(db, 'users', uid, 'chats', chatId, 'messages'), where('userId', '==', uid))
      );
      const batch = writeBatch(db);
      msgSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'users', uid, 'chats', chatId));
      await batch.commit();
    } catch (err) {
      console.warn('Delete chat failed:', err);
    }
  };

  const handleClearAllHistory = async () => {
    setActiveChatId(null);
    setSavedImages([]);
    if (!canUseFirestore || !authUser) {
      setChats([]);
      setGuestMessagesByChat({});
      return;
    }
    const uid = authUser.uid;
    try {
      const chatSnap = await getDocs(
        query(collection(db, 'users', uid, 'chats'), where('userId', '==', uid))
      );
      for (const chatDoc of chatSnap.docs) {
        const msgSnap = await getDocs(
          query(
            collection(db, 'users', uid, 'chats', chatDoc.id, 'messages'),
            where('userId', '==', uid)
          )
        );
        const batch = writeBatch(db);
        msgSnap.docs.forEach((m) => batch.delete(m.ref));
        batch.delete(chatDoc.ref);
        await batch.commit();
      }
    } catch (err) {
      console.warn('Clear history failed:', err);
    }
  };

  const saveClientReplyCache = useCallback((cacheKey: string, replyText: string) => {
    if (!replyText.trim() || replyText.length > 4000) return;
    const next = { ...replyCacheRef.current };
    delete next[cacheKey];
    next[cacheKey] = replyText;
    const keys = Object.keys(next);
    if (keys.length > REPLY_CACHE_LIMIT) {
      for (const oldKey of keys.slice(0, keys.length - REPLY_CACHE_LIMIT)) {
        delete next[oldKey];
      }
    }
    replyCacheRef.current = next;
    try {
      localStorage.setItem(REPLY_CACHE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const appendOptimisticMessage = useCallback(
    (chatId: string, msg: ChatMessage) => {
      setOptimisticMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));
    },
    []
  );

  const removeOptimisticMessage = useCallback((chatId: string, msgId: string) => {
    setOptimisticMessagesByChat((prev) => {
      const list = prev[chatId];
      if (!list || list.length === 0) return prev;
      const filtered = list.filter((m) => m.id !== msgId);
      if (filtered.length === 0) {
        const next = { ...prev };
        delete next[chatId];
        return next;
      }
      return { ...prev, [chatId]: filtered };
    });
  }, []);

  const ensureChatSessionSync = (
    firstPrompt: string
  ): { chatId: string; persistPromise: Promise<void> } => {
    if (activeChatId) {
      return { chatId: activeChatId, persistPromise: Promise.resolve() };
    }

    const newChatId = createId('chat');
    const title = firstPrompt.trim().slice(0, 64) || t.newChat;
    const preview = firstPrompt.trim().slice(0, 120);

    if (!canUseFirestore || !authUser) {
      const session: ChatSession = {
        id: newChatId,
        userId: authUser ? authUser.uid : 'guest',
        title,
        lastMessagePreview: preview,
        updatedAtMs: Date.now(),
      };
      setChats((prev) => [session, ...prev]);
      setActiveChatId(newChatId);
      return { chatId: newChatId, persistPromise: Promise.resolve() };
    }

    const uid = authUser.uid;
    setActiveChatId(newChatId);
    const persistPromise = userDocReadyPromiseRef.current
      .catch(() => undefined)
      .then(() =>
        setDoc(doc(db, 'users', uid, 'chats', newChatId), {
          userId: uid,
          title,
          lastMessagePreview: preview,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
      .catch((err) => {
        console.warn('Chat session persistence skipped:', err);
      });
    return { chatId: newChatId, persistPromise };
  };

  const ensureChatSession = async (firstPrompt: string): Promise<string> => {
    const { chatId, persistPromise } = ensureChatSessionSync(firstPrompt);
    await persistPromise;
    return chatId;
  };

  const saveMessage = async (
    chatId: string,
    msg: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'>,
    customId?: string,
    customCreatedAtMs?: number
  ): Promise<string> => {
    const messageId = customId || createId('msg');
    const createdAtMs = customCreatedAtMs ?? Date.now();
    if (!canUseFirestore || !authUser) {
      const created: ChatMessage = {
        id: messageId,
        chatId,
        ...msg,
        createdAtMs,
      };
      setGuestMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), created],
      }));
      const previewText = /<img\b/i.test(msg.content)
        ? (msg.imagePrompt || 'Generated image').slice(0, 120)
        : msg.content.slice(0, 120);
      setChats((prev) =>
        prev
          .map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  lastMessagePreview: previewText,
                  updatedAtMs: createdAtMs,
                }
              : c
          )
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
      return messageId;
    }

    const uid = authUser.uid;
    try {
      const payload: Record<string, unknown> = {
        userId: uid,
        chatId,
        role: msg.role,
        kind: msg.kind,
        content: msg.content.slice(0, 49000),
        createdAt: serverTimestamp(),
      };
      if (msg.imageDataUrl) {
        payload.imageDataUrl = await compressDataUrlForStorage(msg.imageDataUrl);
      }
      if (msg.imageUrls && msg.imageUrls.length > 0) {
        const compressedList = await Promise.all(
          msg.imageUrls.slice(0, 4).map((u) => compressDataUrlForStorage(u))
        );
        // Keep combined doc payload comfortably under Firestore 1MB limit
        const totalSize = compressedList.reduce((acc, s) => acc + s.length, 0);
        if (totalSize < 820000) {
          payload.imageUrls = compressedList;
        }
      }
      if (msg.imagePrompt) {
        payload.imagePrompt = msg.imagePrompt.slice(0, 1900);
      }
      await setDoc(doc(db, 'users', uid, 'chats', chatId, 'messages', messageId), payload);
      removeOptimisticMessage(chatId, messageId);
      const previewText = /<img\b/i.test(msg.content)
        ? (msg.imagePrompt || 'Generated image').slice(0, 120)
        : msg.content.slice(0, 120);
      await updateDoc(doc(db, 'users', uid, 'chats', chatId), {
        lastMessagePreview: previewText,
        updatedAt: serverTimestamp(),
      });
      return messageId;
    } catch (err) {
      console.warn('Message persistence skipped:', err);
      return messageId;
    }
  };

  const buildPollinationsImageUrl = (
    promptText: string,
    _genMode: ImageGenMode,
    _style?: ImageStyle,
    seed?: number
  ): string => {
    const cleanThing = cleanSafeImagePrompt(promptText);
    const seedValue = seed ?? Date.now();
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `safe, family friendly, ${cleanThing}, vibrant natural colours`
    )}?width=1024&height=1024&model=turbo&nologo=true&safe=true&seed=${seedValue}`;
  };

  const runImageGeneration = async (
    chatId: string,
    promptText: string,
    count: 1 | 4,
    _sourceAttachment: typeof attachedImage,
    overrides?: { styleOverride?: ImageStyle; ratioOverride?: AspectRatio; genModeOverride?: ImageGenMode },
    afterPromise: Promise<unknown> = Promise.resolve()
  ) => {
    setImageStudioError(null);
    const activeGenMode = overrides?.genModeOverride || imageGenMode;
    const activeStyle = overrides?.styleOverride || imageStyle;

    const baseSeed = Date.now();
    const urls: string[] =
      count === 4
        ? Array.from({ length: 4 }, (_, idx) =>
            buildPollinationsImageUrl(promptText, activeGenMode, activeStyle, baseSeed + idx)
          )
        : [buildPollinationsImageUrl(promptText, activeGenMode, activeStyle, baseSeed)];

    const assistantMsgId = createId('msg');
    const assistantCreatedAtMs = Date.now();
    const assistantMsgPayload: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'> = {
      role: 'assistant',
      kind: 'image',
      content: `<img src='${urls[0]}' />`,
      imageDataUrl: urls[0],
      imageUrls: urls,
      imagePrompt: promptText,
    };

    if (canUseFirestore) {
      appendOptimisticMessage(chatId, {
        id: assistantMsgId,
        chatId,
        ...assistantMsgPayload,
        createdAtMs: assistantCreatedAtMs,
      });
      void afterPromise
        .catch(() => undefined)
        .then(() =>
          saveMessage(chatId, assistantMsgPayload, assistantMsgId, assistantCreatedAtMs)
        )
        .catch(() => undefined);
    } else {
      void saveMessage(chatId, assistantMsgPayload, assistantMsgId, assistantCreatedAtMs).catch(
        () => undefined
      );
    }

    if (urls[0]) {
      setSavedImages((prev) => [
        {
          id: assistantMsgId,
          chatId,
          prompt: promptText,
          imageUrl: urls[0],
          createdAtMs: assistantCreatedAtMs,
        },
        ...prev.filter((item) => !item.imageUrl.startsWith('data:image/svg+xml')).slice(0, 29),
      ]);
    }
    setIsGeneratingImage(false);
  };

  const runBuildApp = async (
    chatId: string,
    promptText: string,
    previousHtml?: string,
    editInstruction?: string
  ) => {
    setIsBuildingApp(true);
    try {
      const res = await fetch('/api/build-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          previousHtml,
          editInstruction,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        title?: string;
        appType?: 'website' | 'app';
        summary?: string;
        html?: string;
      };

      if (!res.ok || !data.html) {
        await saveMessage(chatId, {
          role: 'assistant',
          kind: 'text',
          content:
            "I couldn't generate that preview right now. Try a clear prompt like **Build a modern blue restaurant website** or **Build a calculator app**.",
        });
        return;
      }

      const payloadJson = JSON.stringify({
        title: data.title || 'Nova App',
        appType: data.appType === 'app' ? 'app' : 'website',
        summary: data.summary || 'Your live interactive website/app is ready.',
        html: data.html.slice(0, 38000),
      });

      const assistantReply = `[[NOVA_BUILDER_START]]${payloadJson}[[NOVA_BUILDER_END]]\n\n${
        data.summary || 'Your live website/app is ready!'
      }\n\nYou want me change colour? Add page? Add your name and phone?`;

      await saveMessage(chatId, {
        role: 'assistant',
        kind: 'text',
        content: assistantReply,
      });
    } catch {
      await saveMessage(chatId, {
        role: 'assistant',
        kind: 'text',
        content:
          "I couldn't finish building that preview right now. Please try again in a moment.",
      });
    } finally {
      setIsBuildingApp(false);
    }
  };

  const handleStartWebsiteBuilder = async () => {
    if (isSending || isBuildingApp) return;
    setActiveView('chat');
    setVoiceHint(null);
    try {
      const chatId = await ensureChatSession('Build Website / App');
      await saveMessage(chatId, {
        role: 'assistant',
        kind: 'text',
        content:
          'What kind of website/app you want? Shop, Portfolio, School, Church, Restaurant?\n[[NOVA_BUILDER_CATEGORIES]]',
      });
      setTimeout(() => bottomInputRef.current?.focus(), 60);
    } catch {
      // ignore
    }
  };

  const handleQuickPickBuilderCategory = (category: string) => {
    const isMiniApp = /^(calculator|to-do app|quiz app|music player|weather app)$/i.test(category);
    const nextPrompt = isMiniApp
      ? `Build a working interactive ${category}`
      : `Build a modern ${category} website with contact form`;
    void sendPrompt(nextPrompt);
  };

  const handleEditBuiltApp = async (editInstruction: string, currentHtml: string) => {
    if (isSending || isBuildingApp || !editInstruction.trim()) return;
    setIsSending(true);
    setActiveView('chat');
    try {
      const chatId = await ensureChatSession(editInstruction);
      await saveMessage(chatId, {
        role: 'user',
        kind: 'text',
        content: editInstruction.trim(),
      });
      await incrementUsage('chat');
      await runBuildApp(chatId, editInstruction.trim(), currentHtml, editInstruction.trim());
    } finally {
      setIsSending(false);
    }
  };

  const sendPrompt = async (
    rawPrompt: string,
    forceImageMode?: boolean
  ) => {
    const currentAttachment = attachedImage;
    const raw = rawPrompt.trim();
    if (!raw || isSending) return;

    const lastAssistantMsg = [...activeMessages].reverse().find((m) => m.role === 'assistant');
    const lastAssistantAskedCategory = Boolean(
      lastAssistantMsg?.content.includes('[[NOVA_BUILDER_CATEGORIES]]')
    );
    const latestBuiltHtml = extractLatestBuiltHtml(activeMessages);
    const builderIntent =
      !forceImageMode && !imageMode && !currentAttachment
        ? detectBuilderIntent(raw, latestBuiltHtml, lastAssistantAskedCategory)
        : { mode: 'none' as const, prompt: '' };

    if (builderIntent.mode !== 'none') {
      setVoiceHint(null);
      setInputText('');
      setIsSending(true);
      setActiveView('chat');

      try {
        const chatId = await ensureChatSession(raw);
        await saveMessage(chatId, {
          role: 'user',
          kind: 'text',
          content: raw,
        });
        await incrementUsage('chat');
        if (builderIntent.mode === 'edit' && latestBuiltHtml) {
          await runBuildApp(chatId, builderIntent.prompt, latestBuiltHtml, raw);
        } else {
          await runBuildApp(chatId, builderIntent.prompt);
        }
      } finally {
        setIsSending(false);
        bottomInputRef.current?.focus();
      }
      return;
    }

    const detected = detectImageIntent(raw, Boolean(currentAttachment));
    const useImage = forceImageMode ?? (imageMode || detected.isImage);
    const effectivePrompt = detected.cleanPrompt || raw;

    setVoiceHint(null);
    setInputText('');
    setAttachedImage(null);
    setStreamingContent('');
    setIsSending(true);
    setActiveView('chat');

    const { chatId, persistPromise: chatPersistPromise } = ensureChatSessionSync(effectivePrompt);
    const activeSessionId: string | null = chatId;
    const historyBefore = canUseFirestore ? activeMessages : guestMessagesByChat[chatId] || [];

    const userMsgId = createId('msg');
    const userCreatedAtMs = Date.now();
    const userMsgPayload: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'> = {
      role: 'user',
      kind: useImage ? 'image' : 'text',
      content: raw,
      imageDataUrl: currentAttachment?.previewUrl,
    };

    let persistUserMsgPromise: Promise<unknown> = Promise.resolve();
    if (canUseFirestore) {
      appendOptimisticMessage(chatId, {
        id: userMsgId,
        chatId,
        ...userMsgPayload,
        createdAtMs: userCreatedAtMs,
      });
      persistUserMsgPromise = chatPersistPromise.then(() =>
        saveMessage(chatId, userMsgPayload, userMsgId, userCreatedAtMs)
      );
    } else {
      void saveMessage(chatId, userMsgPayload, userMsgId, userCreatedAtMs);
    }

    try {
      if (useImage) {
        void incrementUsage('image').catch(() => undefined);
        await runImageGeneration(
          chatId,
          effectivePrompt,
          1,
          currentAttachment,
          undefined,
          persistUserMsgPromise
        );
        setImageMode(false);
      } else {
        const updatedMem = extractMemoryFromPrompt(raw, memory);
        if (updatedMem !== memory) {
          setMemory(updatedMem);
          saveMemoryToStorage(storageUidKey, updatedMem);
        }

        // Non-blocking usage & cache check
        void incrementUsage('chat').catch(() => undefined);

        const clientCacheKey = getClientReplyCacheKey(
          raw,
          profile.language,
          Boolean(currentAttachment),
          historyBefore.length > 0
        );
        const cachedAnswer = clientCacheKey ? replyCacheRef.current[clientCacheKey] : undefined;

        if (cachedAnswer) {
          const assistantMsgId = createId('msg');
          const assistantCreatedAtMs = Date.now();
          if (canUseFirestore) {
            appendOptimisticMessage(chatId, {
              id: assistantMsgId,
              chatId,
              role: 'assistant',
              kind: 'text',
              content: cachedAnswer,
              createdAtMs: assistantCreatedAtMs,
            });
            void persistUserMsgPromise.then(() =>
              saveMessage(
                chatId,
                { role: 'assistant', kind: 'text', content: cachedAnswer },
                assistantMsgId,
                assistantCreatedAtMs
              )
            );
          } else {
            void saveMessage(
              chatId,
              { role: 'assistant', kind: 'text', content: cachedAnswer },
              assistantMsgId,
              assistantCreatedAtMs
            );
          }
          setStreamingContent('');
          return;
        }

        const wantsLongReply =
          /\b(long|detailed|detail|details|essay|in[- ]depth|explain\s+fully|step[- ]by[- ]step|comprehensive|elaborate|full\s+guide|everything\s+about)\b/i.test(
            raw
          );

        const recentFour = historyBefore
          .slice(-4)
          .map((m) => `${m.role === 'assistant' ? 'Nova' : 'User'}: ${m.content.slice(0, 140)}`)
          .join(' | ');

        const memorySnippet = [
          updatedMem.name ? `Name: ${updatedMem.name}` : '',
          updatedMem.favouriteStyle ? `Style: ${updatedMem.favouriteStyle}` : '',
          updatedMem.preferredLanguage ? `Language: ${updatedMem.preferredLanguage}` : '',
        ]
          .filter(Boolean)
          .join(', ');

        const lengthRule = wantsLongReply ? 'Give a detailed reply.' : 'Keep normal text replies friendly and short (max 2-3 sentences).';
        const modeHint = `Current image mode: ${imageGenMode === 'ai-art' ? 'digital art' : 'real photo'}.`;
        const systemInstruction = `${NOVA_SYSTEM_PROMPT}\n${lengthRule} ${modeHint}${memorySnippet ? ` [${memorySnippet}]` : ''}`;
        const userTurnPrompt = [
          recentFour ? `Chat: ${recentFour}` : '',
          `User: ${raw}`,
          'Nova:',
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 750);

        const runPollinationsGet = async (
          promptText: string,
          modelName: string,
          systemText?: string
        ): Promise<string> => {
          const url = new URL(`https://text.pollinations.ai/${encodeURIComponent(promptText)}`);
          url.searchParams.set('model', modelName);
          if (systemText) {
            url.searchParams.set('system', systemText);
          }
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(new Error('Request timed out')), 14000);
          try {
            const res = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
            const textBody = await res.text();
            if (!res.ok) {
              const retryAfter = Number(res.headers.get('retry-after') || '0');
              const detail = textBody.trim().slice(0, 180) || res.statusText || 'Request failed';
              const err = new Error(`HTTP ${res.status} (${modelName}): ${detail}`) as Error & {
                status?: number;
                retryAfter?: number;
              };
              err.status = res.status;
              err.retryAfter = retryAfter;
              throw err;
            }
            const clean = textBody.trim();
            if (!clean) {
              throw new Error(`Empty response from ${modelName}`);
            }
            return clean;
          } finally {
            window.clearTimeout(timer);
          }
        };

        const runSameOriginChatGet = async (
          promptText: string,
          systemText?: string
        ): Promise<string> => {
          const apiUrl = new URL('/api/chat', window.location.origin);
          apiUrl.searchParams.set('prompt', promptText);
          if (systemText) {
            apiUrl.searchParams.set('system', systemText);
          }
          const res = await fetch(apiUrl.toString(), {
            method: 'GET',
          });
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            reply?: string;
            error?: string;
          };
          if (!res.ok || !data.reply) {
            throw new Error(data.error || `Chat GET proxy failed (HTTP ${res.status})`);
          }
          return data.reply.trim();
        };

        let replyText = '';
        try {
          replyText = await runSameOriginChatGet(userTurnPrompt, systemInstruction);
        } catch (proxyErr) {
          console.warn('Same-origin chat GET proxy fallback triggered:', proxyErr);
          try {
            replyText = await runPollinationsGet(userTurnPrompt, 'openai-fast', systemInstruction);
          } catch {
            replyText = await runPollinationsGet(raw, 'openai', systemInstruction);
          }
        }

        let finalReply = replyText.trim();
        if (isImageRefusalReply(finalReply)) {
          const safePrompt = cleanSafeImagePrompt(raw);
          const randomSeed = Date.now();
          finalReply = `<img src='https://image.pollinations.ai/prompt/${encodeURIComponent(
            `safe, family friendly, ${safePrompt}, vibrant natural colours`
          )}?width=1024&height=1024&model=turbo&nologo=true&safe=true&seed=${randomSeed}' />`;
        }
        if (finalReply && clientCacheKey) {
          saveClientReplyCache(clientCacheKey, finalReply);
        }

        const assistantMsgId = createId('msg');
        const assistantCreatedAtMs = Date.now();
        if (canUseFirestore) {
          appendOptimisticMessage(chatId, {
            id: assistantMsgId,
            chatId,
            role: 'assistant',
            kind: 'text',
            content: finalReply,
            createdAtMs: assistantCreatedAtMs,
          });
          void persistUserMsgPromise.then(() =>
            saveMessage(
              chatId,
              { role: 'assistant', kind: 'text', content: finalReply },
              assistantMsgId,
              assistantCreatedAtMs
            )
          );
        } else {
          void saveMessage(
            chatId,
            { role: 'assistant', kind: 'text', content: finalReply },
            assistantMsgId,
            assistantCreatedAtMs
          );
        }
        setStreamingContent('');
      }
    } catch (err) {
      setStreamingContent('');
      setIsGeneratingImage(false);
      console.error('Nova sendMessage error:', err);
      const realError =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : 'Unable to reach Pollinations AI right now. Please try again.';
      if (activeSessionId) {
        const errMsgId = createId('msg');
        const errCreatedAtMs = Date.now();
        if (canUseFirestore) {
          appendOptimisticMessage(activeSessionId, {
            id: errMsgId,
            chatId: activeSessionId,
            role: 'assistant',
            kind: 'text',
            content: realError,
            createdAtMs: errCreatedAtMs,
          });
          void persistUserMsgPromise
            .then(() =>
              saveMessage(
                activeSessionId,
                { role: 'assistant', kind: 'text', content: realError },
                errMsgId,
                errCreatedAtMs
              )
            )
            .catch(() => undefined);
        } else {
          void saveMessage(
            activeSessionId,
            { role: 'assistant', kind: 'text', content: realError },
            errMsgId,
            errCreatedAtMs
          ).catch(() => undefined);
        }
      }
    } finally {
      setIsSending(false);
      bottomInputRef.current?.focus();
    }
  };

  const handleGenerateStudioImage = async ({
    mode,
    prompt,
    style,
    aspectRatio: studioRatio,
    genMode: studioGenMode,
    sourceAttachment,
  }: {
    mode: ImageStudioMode;
    prompt: string;
    style: ImageStyle;
    aspectRatio: AspectRatio;
    genMode: ImageGenMode;
    sourceAttachment: typeof attachedImage;
  }) => {
    if (isSending || isGeneratingImage) return;

    const modePrefixMap: Record<ImageStudioMode, string> = {
      'Generate Image': '',
      'Edit My Photo': 'Edit photo: ',
      'Make Wallpaper': 'Smartphone wallpaper artwork: ',
      'Make Logo': 'Professional brand logo design: ',
      'Make Poster': 'High-impact graphic poster design: ',
      'Make Thumbnail': 'Eye-catching high-contrast video thumbnail: ',
    };

    const fullPrompt = `${modePrefixMap[mode]}${prompt.trim()}`;
    setIsSending(true);
    setImageStudioError(null);

    try {
      const chatId = await ensureChatSession(prompt.trim());
      const persistUserPromise = saveMessage(chatId, {
        role: 'user',
        kind: 'image',
        content: fullPrompt,
        imageDataUrl: sourceAttachment?.previewUrl,
      });
      void incrementUsage('image').catch(() => undefined);
      await runImageGeneration(
        chatId,
        fullPrompt,
        1,
        sourceAttachment,
        {
          styleOverride: style,
          ratioOverride: studioRatio,
          genModeOverride: studioGenMode,
        },
        persistUserPromise
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateVariations = async (promptText: string) => {
    if (isSending) return;
    setIsSending(true);
    setImageStudioError(null);
    try {
      const chatId = await ensureChatSession(promptText);
      void incrementUsage('image').catch(() => undefined);
      await runImageGeneration(chatId, promptText, 4, null);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleDictation = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    setVoiceHint(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const result = String(reader.result || '');
              resolve(result.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            text?: string;
            unavailable?: boolean;
          };
          if (!res.ok || data.unavailable || !data.text) {
            setVoiceHint('Voice not available, type instead');
            return;
          }
          setInputText((prev) => (prev ? `${prev} ${data.text}` : data.text || ''));
        } catch {
          setVoiceHint('Voice not available, type instead');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setVoiceHint('Voice not available, type instead');
    }
  };

  const stableMessageActionsRef = useRef({
    onCreateVariations: (_prompt: string) => {},
    onEditBuiltApp: (_instruction: string, _html: string) => {},
    onQuickPickBuilderCategory: (_category: string) => {},
  });
  stableMessageActionsRef.current.onCreateVariations = (p: string) => {
    void handleCreateVariations(p);
  };
  stableMessageActionsRef.current.onEditBuiltApp = (inst: string, html: string) => {
    void handleEditBuiltApp(inst, html);
  };
  stableMessageActionsRef.current.onQuickPickBuilderCategory = handleQuickPickBuilderCategory;

  const memoizedCreateVariations = useCallback((prompt: string) => {
    stableMessageActionsRef.current.onCreateVariations(prompt);
  }, []);
  const memoizedEditBuiltApp = useCallback((instruction: string, html: string) => {
    stableMessageActionsRef.current.onEditBuiltApp(instruction, html);
  }, []);
  const memoizedQuickPickBuilderCategory = useCallback((category: string) => {
    stableMessageActionsRef.current.onQuickPickBuilderCategory(category);
  }, []);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt(inputText);
    }
  };

  const starterCards = [
    { title: t.starter1Title, prompt: t.starter1Prompt, isImage: false },
    { title: t.starter2Title, prompt: t.starter2Prompt, isImage: false },
    { title: t.starter3Title, prompt: t.starter3Prompt, isImage: false },
    { title: t.starter4Title, prompt: t.starter4Prompt, isImage: true },
  ];

  const renderComposer = () => (
    <div className="w-full max-w-5xl mx-auto space-y-1.5">
      {/* Image Studio Controls above Chat Box when Image Mode is Active */}
      {imageMode && (
        <div className="rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/40 p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {IMAGE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setImageStyle(style)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  imageStyle === style
                    ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                    : 'bg-black border-[#A855F7]/25 text-white/75 hover:text-white hover:border-[#BF5AF2]'
                }`}
              >
                {style}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[#A855F7]/20">
            <div className="flex items-center gap-1.5 flex-wrap">
              {IMAGE_RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setAspectRatio(r.value)}
                  className={`px-2 py-0.5 rounded-xl text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    aspectRatio === r.value
                      ? 'bg-[#A855F7]/30 border-[#BF5AF2] text-white'
                      : 'bg-black border-[#A855F7]/25 text-white/70 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-[#BF5AF2]">
              {imageGenMode === 'real-photo' ? 'Real Photo 📸' : 'AI Art 🎨'}
            </span>
          </div>
        </div>
      )}

      {/* Compact Rounded Bottom Chat Box */}
      <div className="rounded-3xl bg-[#0A0A0A] nova-glow-box px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all">
        {/* Attached Image Preview */}
        {attachedImage && (
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-xl bg-black border border-[#BF5AF2]/45 p-1.5 pe-2.5">
            <img
              src={attachedImage.previewUrl}
              alt={attachedImage.name}
              className="w-8 h-8 rounded-lg object-cover"
            />
            <div className="text-xs text-white max-w-[160px] truncate">
              {attachedImage.name}
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              aria-label="Remove attachment"
              className="p-1 rounded-lg text-white/65 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Builder Action Strip + [ Real Photo 📸 ] [ AI Art 🎨 ] Switch inside Chat Input Area */}
        <div className="flex items-center justify-between gap-2 pb-1.5 mb-1 border-b border-[#A855F7]/20 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => void handleStartWebsiteBuilder()}
              disabled={isSending || isBuildingApp}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium bg-black hover:bg-[#A855F7]/20 border border-[#A855F7]/40 hover:border-[#BF5AF2] text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Globe className="w-3 h-3 text-[#BF5AF2] shrink-0" />
              <span>Build Website / App</span>
            </button>

            <div
              role="group"
              aria-label="Image generation mode"
              className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-black border border-[#A855F7]/35"
            >
              <button
                type="button"
                onClick={() => handleChangeImageGenMode('real-photo')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap border ${
                  imageGenMode === 'real-photo'
                    ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                    : 'bg-transparent border-transparent text-white/70 hover:text-white'
                }`}
              >
                Real Photo 📸
              </button>
              <button
                type="button"
                onClick={() => handleChangeImageGenMode('ai-art')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap border ${
                  imageGenMode === 'ai-art'
                    ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                    : 'bg-transparent border-transparent text-white/70 hover:text-white'
                }`}
              >
                AI Art 🎨
              </button>
            </div>
          </div>

          {voiceHint && (
            <span className="text-[11px] text-white/70 truncate">{voiceHint}</span>
          )}
        </div>

        <div className="flex items-end gap-1.5 sm:gap-2">
          {/* + Button Left for Upload Image/File */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title={t.uploadImage}
            aria-label={t.uploadImage}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black border border-[#A855F7]/35 text-white hover:border-[#BF5AF2] transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-[#BF5AF2]" />
          </button>

          <textarea
            ref={bottomInputRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (voiceHint) setVoiceHint(null);
            }}
            onKeyDown={handleTextareaKeyDown}
            onFocus={() => {
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
              }, 160);
            }}
            placeholder={
              voiceHint
                ? voiceHint
                : isTranscribing
                  ? t.transcribing
                  : imageMode
                    ? t.imageInputPlaceholder
                    : t.inputPlaceholder
            }
            className="flex-1 min-w-0 resize-none bg-transparent text-sm sm:text-[15px] text-white placeholder:text-white/45 focus:outline-none leading-5 py-2 px-1 max-h-28 overflow-y-auto"
          />

          {/* Image Button */}
          <button
            type="button"
            onClick={() => setImageMode((v) => !v)}
            title={t.generateImage}
            aria-label={t.generateImage}
            className={`inline-flex items-center justify-center gap-1 h-9 px-2.5 sm:px-3 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
              imageMode
                ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white nova-btn-glow'
                : 'bg-black border-[#A855F7]/35 text-white hover:border-[#BF5AF2]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#BF5AF2] shrink-0" />
            <span className="hidden sm:inline">{t.generateImage}</span>
          </button>

          {/* Mic Button */}
          <button
            type="button"
            onClick={handleToggleDictation}
            disabled={isTranscribing}
            title={isRecording ? t.stopDictation : t.dictate}
            aria-label={isRecording ? t.stopDictation : t.dictate}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-all shrink-0 cursor-pointer border ${
              isRecording
                ? 'bg-[#BF5AF2]/25 border-[#BF5AF2] text-white nova-active-glow'
                : 'bg-black border-[#A855F7]/35 text-white hover:border-[#BF5AF2]'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#BF5AF2]" />
            ) : isRecording ? (
              <Square className="w-3.5 h-3.5 fill-[#BF5AF2] text-[#BF5AF2]" />
            ) : (
              <Mic className="w-4 h-4 text-[#BF5AF2]" />
            )}
          </button>

          {/* Send Button: Neon Purple with Glow */}
          <button
            type="button"
            onClick={() => void sendPrompt(inputText)}
            disabled={!inputText.trim() || isSending}
            aria-label={t.send}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] disabled:bg-white/10 disabled:from-white/10 disabled:to-white/10 disabled:text-white/35 text-white nova-btn-glow disabled:shadow-none transition-all shrink-0 cursor-pointer"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Tiny Disclaimer below chat box */}
      <p className="text-center text-[10px] text-white/50 leading-none">{t.disclaimer}</p>
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0A0A0A]/92 backdrop-blur-md border-e border-[#A855F7]/35 w-[300px] sm:w-[340px] max-w-[88vw] shrink-0">
      {/* Top: Nova Logo + Collapse */}
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 shrink-0">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <NovaLogo size={30} glow={true} />
          <span className="text-lg font-semibold tracking-tight text-white">
            {t.appName}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            setMobileDrawerOpen(false);
          }}
          aria-label="Collapse sidebar"
          className="p-2 rounded-xl text-white/65 hover:text-white hover:bg-black transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4 hidden md:block" />
          <X className="w-4 h-4 md:hidden" />
        </button>
      </div>

      {/* Neon Purple New Chat + Big History Buttons */}
      <div className="px-3.5 pb-2.5 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl text-sm font-semibold bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] text-white nova-btn-glow transition-all whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.newChat}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('history');
              setMobileDrawerOpen(false);
            }}
            title="Open Full History"
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
              activeView === 'history'
                ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                : 'bg-black border-[#A855F7]/35 text-white/85 hover:text-white hover:border-[#BF5AF2]'
            }`}
          >
            <History className="w-4 h-4 text-[#BF5AF2]" />
            <span>Big View</span>
          </button>
        </div>

        {/* Chats / Images History Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black border border-[#A855F7]/30">
          <button
            type="button"
            onClick={() => setHistoryTab('chats')}
            className={`py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              historyTab === 'chats'
                ? 'bg-[#A855F7]/25 border border-[#BF5AF2]/60 text-white'
                : 'text-white/65 hover:text-white border border-transparent'
            }`}
          >
            {t.chatsTab} ({chats.length})
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab('images')}
            className={`py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              historyTab === 'images'
                ? 'bg-[#A855F7]/25 border border-[#BF5AF2]/60 text-white'
                : 'text-white/65 hover:text-white border border-transparent'
            }`}
          >
            {t.imagesTab} ({allHistoryImages.length})
          </button>
        </div>

        {historyTab === 'chats' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#A855F7] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchHistory}
              className="w-full rounded-2xl bg-black border border-[#A855F7]/30 ps-8 pe-3 py-2 text-xs text-white placeholder:text-white/45 focus:outline-none focus:border-[#BF5AF2]"
            />
          </div>
        )}
      </div>

      {/* Big Scrollable History List OR Saved Images Gallery */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-1.5 space-y-2">
        {historyTab === 'chats' ? (
          filteredChats.length === 0 ? (
            <div className="px-3 py-6 text-sm text-white/55 leading-relaxed">
              {t.historyEmpty}
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isSelected = activeView === 'chat' && activeChatId === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setActiveView('chat');
                    setMobileDrawerOpen(false);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveChatId(chat.id);
                      setActiveView('chat');
                      setMobileDrawerOpen(false);
                    }
                  }}
                  className={`group flex items-start justify-between gap-2.5 px-3.5 py-3 rounded-2xl transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-black text-white border-[#BF5AF2] nova-active-glow'
                      : 'bg-black/50 text-white/85 hover:bg-black hover:text-white border-[#A855F7]/15 hover:border-[#A855F7]/45'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isSelected ? 'text-[#BF5AF2]' : 'text-[#A855F7]/75'
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-sm font-medium truncate text-white">
                        {chat.title}
                      </div>
                      {chat.lastMessagePreview && (
                        <div className="text-xs text-white/55 truncate">
                          {chat.lastMessagePreview}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteChat(chat.id, e)}
                    aria-label={t.deleteChat}
                    className="opacity-70 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-lg text-white/55 hover:text-[#BF5AF2] transition-opacity shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )
        ) : (
          <div className="space-y-3 px-1 py-1">
            {/* Image Studio Quick Buttons under Sidebar Images */}
            <div className="rounded-2xl bg-black border border-[#A855F7]/30 p-2 space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-[#BF5AF2]">Image Studio</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('images');
                    setMobileDrawerOpen(false);
                  }}
                  className="text-[10px] text-white/70 hover:text-white cursor-pointer"
                >
                  Open Studio
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {IMAGE_STUDIO_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setStudioMode(m);
                      setActiveView('images');
                      setMobileDrawerOpen(false);
                    }}
                    className={`px-2 py-1.5 rounded-xl text-[11px] font-medium text-start truncate transition-colors cursor-pointer border ${
                      activeView === 'images' && studioMode === m
                        ? 'bg-gradient-to-r from-[#A855F7] to-[#BF5AF2] border-[#BF5AF2] text-white'
                        : 'bg-[#0A0A0A] border-[#A855F7]/25 text-white/80 hover:text-white hover:border-[#BF5AF2]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {allHistoryImages.length === 0 ? (
              <div className="px-2 py-4 text-xs text-white/55 leading-relaxed">
                {t.imagesEmpty}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {allHistoryImages.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      setActiveChatId(img.chatId);
                      setActiveView('chat');
                      setMobileDrawerOpen(false);
                    }}
                    className="relative group rounded-xl overflow-hidden border border-[#A855F7]/35 bg-black cursor-pointer aspect-square"
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.prompt}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <a
                      href={img.imageUrl}
                      download={`nova-${img.id.slice(0, 6)}.png`}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 absolute bottom-1.5 end-1.5 p-1.5 rounded-lg bg-black/85 border border-[#BF5AF2]/50 text-white transition-opacity"
                      aria-label={t.downloadImage}
                    >
                      <Download className="w-3 h-3 text-[#BF5AF2]" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Core Features Nav: Ekere Wallpaper & Settings */}
      <div className="px-3.5 py-2 border-t border-[#A855F7]/25 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            setActiveView('wallpaper');
            setMobileDrawerOpen(false);
            if (!wallpaperState.currentImageUrl && !isGeneratingWallpaper) {
              void handleGenerateWallpaper(wallpaperState.style);
            }
          }}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-2xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
            activeView === 'wallpaper'
              ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
              : 'bg-black border-[#A855F7]/25 text-white/80 hover:text-white hover:border-[#BF5AF2]'
          }`}
        >
          <Wallpaper className="w-3.5 h-3.5 text-[#BF5AF2] shrink-0" />
          <span className="truncate">Ekere Wallpaper</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsModalOpen(true);
            setMobileDrawerOpen(false);
          }}
          className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-2xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap bg-black border-[#A855F7]/25 text-white/80 hover:text-white hover:border-[#BF5AF2]"
        >
          <Settings className="w-3.5 h-3.5 text-[#BF5AF2] shrink-0" />
          <span>{t.settings}</span>
        </button>
      </div>

      {/* Bottom: User Profile + Sign Out */}
      <div className="p-3.5 border-t border-[#A855F7]/25 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveView('profile');
              setMobileDrawerOpen(false);
            }}
            className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-2xl border transition-colors min-w-0 cursor-pointer ${
              activeView === 'profile'
                ? 'bg-black border-[#BF5AF2] text-white nova-active-glow'
                : 'bg-black border-[#A855F7]/25 text-white hover:border-[#BF5AF2]'
            }`}
          >
            {(authUser?.photoURL || profile.photoURL) ? (
              <img
                src={authUser?.photoURL || profile.photoURL}
                alt={authUser?.displayName || profile.displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-[#A855F7]/20 border border-[#BF5AF2]/40 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-[#BF5AF2]" />
              </div>
            )}
            <div className="min-w-0 text-start">
              <div className="text-xs font-semibold text-white truncate">
                {authUser
                  ? authUser.displayName || profile.displayName || authUser.email?.split('@')[0] || 'Nova User'
                  : 'Guest'}
              </div>
              <div className="text-[11px] text-white/60 truncate">
                {authUser
                  ? authUser.email || profile.email || 'Google Account'
                  : 'Guest mode'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            aria-label={t.settings}
            title={t.settings}
            className="p-2.5 rounded-2xl bg-black border border-[#A855F7]/30 text-white/80 hover:text-white hover:border-[#BF5AF2] transition-colors shrink-0 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#BF5AF2]" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!authUser && (
            <button
              type="button"
              onClick={handleSignInGoogle}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-medium bg-black hover:border-[#BF5AF2] border border-[#A855F7]/30 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>Google Sign In</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-medium bg-black hover:border-[#BF5AF2] border border-[#A855F7]/30 text-white/80 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 text-[#BF5AF2]" />
            <span>{authUser ? t.signOut : 'Exit Guest'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] w-full bg-black text-white flex flex-col items-center justify-center gap-5">
        <div className="relative flex items-center justify-center w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-[#BF5AF2]/35 blur-2xl animate-pulse" />
          <div
            className="relative w-20 h-20 rounded-full border border-[#BF5AF2]/75 shadow-[0_0_52px_rgba(191,90,242,0.85)] flex items-center justify-center"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #E9D5FF 24%, #BF5AF2 58%, #A855F7 84%, #000000 100%)',
            }}
          >
            <NovaLogo size={28} glow={false} />
          </div>
        </div>
        <p className="text-xs text-white/80 tracking-wide">Starting Nova...</p>
      </div>
    );
  }

  if (!authUser && !guestSessionActive) {
    return (
      <LoginScreen
        onGoogleLogin={handleSignInGoogle}
        onContinueAsGuest={handleContinueAsGuest}
        authError={authError}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-black text-white overflow-hidden relative">
      {wallpaperState.appliedAsBackground && wallpaperState.currentImageUrl ? (
        <img
          src={wallpaperState.currentImageUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="fixed inset-0 w-full h-full object-cover opacity-25 pointer-events-none z-0"
        />
      ) : (
        <RotatingEarthWallpaper />
      )}

      {/* Desktop Sidebar */}
      {sidebarOpen && <aside className="hidden md:flex h-full min-h-0 z-20">{sidebarContent}</aside>}

      {/* Mobile Drawer Sidebar */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative z-50 flex h-full min-h-0">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative z-10 ${
          wallpaperState.appliedAsBackground && wallpaperState.currentImageUrl
            ? 'bg-black/75'
            : 'bg-black/35'
        }`}
      >
        {/* Top Bar: Left = Nova name + Glowing Logo + Connection Dot | Right = Settings + Menu */}
        <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 border-b border-[#A855F7]/30 bg-black/65 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu"
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-[#0A0A0A] md:hidden cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Expand sidebar"
                className="hidden md:inline-flex p-2 rounded-xl text-white/80 hover:text-white hover:bg-[#0A0A0A] cursor-pointer shrink-0"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-2 cursor-pointer shrink-0"
            >
              <NovaLogo size={26} glow={true} />
              <span className="text-base font-semibold text-white whitespace-nowrap">
                {t.appName}
              </span>
              <span
                title="Nova Online · Free Keyless AI"
                aria-label="Nova Online"
                className="w-2 h-2 rounded-full shrink-0 bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.85)]"
              />
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView((v) => (v === 'history' ? 'chat' : 'history'))}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'history'
                  ? 'bg-[#A855F7]/25 border-[#BF5AF2] text-white'
                  : 'bg-[#0A0A0A] border-[#A855F7]/40 text-white hover:border-[#BF5AF2]'
              }`}
            >
              <History className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span>History</span>
              {chats.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#A855F7]/25 text-[10px] font-mono tabular-nums text-white">
                  {chats.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium bg-[#0A0A0A] border border-[#A855F7]/40 text-white hover:border-[#BF5AF2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-[#BF5AF2]" />
              <span className="hidden sm:inline">{t.settings}</span>
            </button>

            <button
              type="button"
              onClick={() => setRightMenuOpen(true)}
              aria-label="Open Nova menu"
              title="Open Nova menu"
              className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/35 text-white hover:border-[#BF5AF2] transition-colors shrink-0 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Welcome Toast after Google/Email Login */}
        {welcomeBanner && (
          <div className="mx-auto mt-2 px-4 w-full max-w-[800px] shrink-0">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#0A0A0A] border border-[#BF5AF2]/60 nova-glow-box px-4 py-2 text-xs text-white">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#BF5AF2] shrink-0" />
                <span className="font-medium">{welcomeBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setWelcomeBanner(null)}
                className="p-1 text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Active View: Profile/Account, Ekere Wallpaper, Images Studio, Big History, OR Chat/Build */}
        {activeView === 'profile' ? (
          <UserProfileView
            isSignedIn={Boolean(authUser)}
            profile={profile}
            onBackToChat={() => setActiveView('chat')}
            onSignInGoogle={handleSignInGoogle}
            onSignOut={handleSignOut}
            onChangeLanguage={(lang) => updateUserPreferences({ language: lang })}
            onChangeVoice={(voice) => updateUserPreferences({ voiceName: voice })}
            onClearHistory={handleClearAllHistory}
            t={t}
          />
        ) : activeView === 'history' ? (
          <HistoryView
            chats={chats}
            images={allHistoryImages}
            activeChatId={activeChatId}
            onOpenChat={(chatId) => {
              setActiveChatId(chatId);
              setActiveView('chat');
            }}
            onDeleteChat={(chatId, e) => void handleDeleteChat(chatId, e)}
            onNewChat={handleNewChat}
            onBackToChat={() => setActiveView('chat')}
            onOpenImageStudio={() => setActiveView('images')}
          />
        ) : activeView === 'wallpaper' ? (
          <WallpaperView
            state={wallpaperState}
            onUpdateState={updateWallpaperState}
            onGenerateWallpaper={handleGenerateWallpaper}
            isGenerating={isGeneratingWallpaper}
            errorMessage={wallpaperError}
            onBackToChat={() => setActiveView('chat')}
          />
        ) : activeView === 'images' ? (
          <ImagesGalleryView
            images={allHistoryImages}
            activeMode={studioMode}
            genMode={imageGenMode}
            onChangeGenMode={handleChangeImageGenMode}
            onSelectMode={setStudioMode}
            onGenerateStudioImage={handleGenerateStudioImage}
            onCreateVariations={handleCreateVariations}
            isGenerating={isGeneratingImage || isSending}
            errorMessage={imageStudioError}
            onClearError={() => setImageStudioError(null)}
            onOpenChat={(chatId) => {
              setActiveChatId(chatId);
              setActiveView('chat');
            }}
            onBackToChat={() => setActiveView('chat')}
          />
        ) : (
          /* 3-Section Chat Layout: Header top (above) -> Tall Full-Width Scrollable Middle -> Fixed Compact Bottom Input */
          <>
            <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 sm:px-6 py-4">
              {activeMessages.length === 0 && !isSending ? (
                <div className="min-h-full flex flex-col items-center justify-center pb-8">
                  <div className="w-full max-w-4xl flex flex-col items-center text-center space-y-6">
                    <div className="space-y-3 flex flex-col items-center">
                      <NovaLogo size={54} glow={true} />
                      <h1
                        className="text-2xl sm:text-4xl font-semibold text-white tracking-tight max-w-xl"
                        style={{ textWrap: 'balance' }}
                      >
                        {memory.name
                          ? `Hey ${memory.name}! What are we creating today?`
                          : t.heroTitle}
                      </h1>
                      <p className="text-sm sm:text-base text-white/65 max-w-lg">
                        {t.heroSubtitle}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                      {starterCards.map((card, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => void sendPrompt(card.prompt, card.isImage)}
                          className="group rounded-2xl bg-[#0A0A0A] border border-[#A855F7]/30 hover:border-[#BF5AF2] hover:shadow-[0_0_24px_-10px_rgba(191,90,242,0.55)] px-4 py-3.5 text-start transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-white">
                              {card.title}
                            </span>
                            {card.isImage && (
                              <ImageIcon className="w-3.5 h-3.5 text-[#BF5AF2] shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-white/60 mt-1 line-clamp-1">
                            {card.prompt}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl mx-auto space-y-5 pb-20 sm:pb-14">
                  {activeMessages.map((msg) => (
                    <ChatMessageItem
                      key={msg.id}
                      message={msg}
                      t={t}
                      voiceName={profile.voiceName}
                      voiceSpeed={voiceSpeed}
                      imageLoadingText={
                        imageGenMode === 'real-photo'
                          ? 'Generating real photo...'
                          : 'Generating AI art...'
                      }
                      isEditingBuiltApp={isBuildingApp}
                      onCreateVariations={memoizedCreateVariations}
                      onEditBuiltApp={memoizedEditBuiltApp}
                      onQuickPickBuilderCategory={memoizedQuickPickBuilderCategory}
                    />
                  ))}

                  {isSending && (
                    <ChatMessageItem
                      message={{
                        id: 'streaming',
                        chatId: activeChatId || 'streaming',
                        role: 'assistant',
                        kind: isGeneratingImage ? 'image' : 'text',
                        content: isBuildingApp
                          ? 'Building your live website/app preview...'
                          : streamingContent,
                        createdAtMs: Date.now(),
                      }}
                      t={t}
                      voiceName={profile.voiceName}
                      voiceSpeed={voiceSpeed}
                      isStreaming={!isGeneratingImage}
                      isCreatingImage={isGeneratingImage}
                      imageLoadingText={
                        imageGenMode === 'real-photo'
                          ? 'Generating real photo...'
                          : 'Generating AI art...'
                      }
                    />
                  )}

                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </main>

            <footer className="shrink-0 border-t border-[#A855F7]/25 bg-black/65 backdrop-blur-md px-3 sm:px-6 pt-2 pb-2.5 z-20">
              {renderComposer()}
            </footer>
          </>
        )}
      </div>

      {/* Settings & Memory Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        profile={profile}
        voiceSpeed={voiceSpeed}
        memory={memory}
        onChangeLanguage={(lang) => updateUserPreferences({ language: lang })}
        onChangeVoice={(voice) => updateUserPreferences({ voiceName: voice })}
        onChangeVoiceSpeed={handleChangeVoiceSpeed}
        onUpdateMemory={handleUpdateMemory}
        onClearMemory={handleClearMemory}
        t={t}
      />

      {/* Right Navigation Drawer */}
      <RightMenuDrawer
        isOpen={rightMenuOpen}
        onClose={() => setRightMenuOpen(false)}
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          if (view === 'wallpaper' && !wallpaperState.currentImageUrl && !isGeneratingWallpaper) {
            void handleGenerateWallpaper(wallpaperState.style);
          }
        }}
        onOpenSettings={() => setSettingsModalOpen(true)}
        chats={chats}
        images={allHistoryImages}
        onOpenChat={(chatId) => {
          setActiveChatId(chatId);
          setActiveView('chat');
        }}
      />
    </div>
  );
}
