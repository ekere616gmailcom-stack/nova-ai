import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Square,
  Trash2,
  User as UserIcon,
  Wallpaper,
  X,
  Zap,
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
  LocalAuthResult,
  getCurrentLocalUser,
  getTodayDateKey,
  localLogout,
  localSignIn,
  localSignUp,
} from './utils/localAuth';
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
import { PremiumModal } from './components/PremiumModal';
import {
  NOVA_FIRST_MESSAGE,
  blockOpenAI,
  ensureCreatorLocked,
  getCreatorIdentityOverride,
  getInstantClientReply,
} from './utils/instantBrain';
import {
  buildFastPollinationsUrl,
  buildVerticalWallpaperBackupUrl,
  cleanSafeImagePrompt,
  getOrCreateFastImageUrl,
} from './utils/fastImage';
import {
  PremiumStatus,
  getPremiumStatus,
} from './utils/premiumUnlock';
import { useSound } from './hooks/useSound';

const GUEST_STORAGE_KEY = 'nova_guest_workspace_v2';
const GUEST_SESSION_KEY = 'nova_guest_session_v1';
const VOICE_SPEED_KEY = 'nova_voice_speed_v1';
const INSTANT_MODE_KEY = 'nova_instant_mode_v1';
const THEME_MODE_KEY = 'nova_theme';
const EARTH_BG_KEY = 'nova_earth_bg';
const MEMORY_PREFIX = 'nova_memory_v1_';
const WALLPAPER_STATE_PREFIX = 'nova_wallpaper_state_v1_';
const REPLY_CACHE_KEY = 'nova_reply_cache_v1';
const REPLY_CACHE_LIMIT = 30;

function loadThemeMode(): 'normal' | 'premium' {
  try {
    const savedTheme = localStorage.getItem(THEME_MODE_KEY) || 'normal';
    return savedTheme === 'premium' ? 'premium' : 'normal';
  } catch {
    return 'normal';
  }
}

function loadEarthEnabled(): boolean {
  try {
    return localStorage.getItem(EARTH_BG_KEY) !== 'false';
  } catch {
    return true;
  }
}

function loadInstantMode(): boolean {
  try {
    const val = localStorage.getItem(INSTANT_MODE_KEY);
    if (val === 'false') return false;
  } catch {
    // ignore storage access issues
  }
  return true;
}

function loadReplyCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REPLY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const clean: Record<string, string> = {};
      let mutated = false;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) {
          // Drop stale robotic greeting cache entries so fresh natural replies apply
          if (
            k.endsWith(':hi') ||
            k.endsWith(':hello') ||
            k.endsWith(':hey') ||
            k.endsWith(":what's up") ||
            k.endsWith(':whats up') ||
            k.endsWith(':sup')
          ) {
            mutated = true;
            continue;
          }
          const sanitized = blockOpenAI(v);
          if (sanitized !== v) mutated = true;
          clean[k] = sanitized;
        }
      }
      if (mutated) {
        localStorage.setItem(REPLY_CACHE_KEY, JSON.stringify(clean));
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

function getWorkspaceStorageKey(userEmail: string | null): string {
  return userEmail ? `nova_workspace_${userEmail}` : GUEST_STORAGE_KEY;
}

function getDefaultProfileForUser(userEmail: string | null): UserProfile {
  const today = getTodayDateKey();
  const storageKey = getWorkspaceStorageKey(userEmail);
  const fallbackName = userEmail ? userEmail.split('@')[0] || 'Nova User' : 'Guest';
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { profile?: Partial<UserProfile> };
      if (parsed.profile) {
        const isSameDay = parsed.profile.lastUsageDate === today;
        return {
          uid: userEmail || 'guest',
          displayName: parsed.profile.displayName || fallbackName,
          email: userEmail || parsed.profile.email || '',
          photoURL: parsed.profile.photoURL || '',
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
    uid: userEmail || 'guest',
    displayName: fallbackName,
    email: userEmail || '',
    photoURL: '',
    plan: 'free',
    language: 'en',
    voiceName: 'Kore',
    dailyChatCount: 0,
    dailyImageCount: 0,
    lastUsageDate: today,
  };
}

function loadWorkspaceFromStorage(storageKey: string = GUEST_STORAGE_KEY): {
  chats: ChatSession[];
  messagesByChat: Record<string, ChatMessage[]>;
  savedImages: SavedImageEntry[];
} {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        profile?: unknown;
        chats?: ChatSession[];
        messagesByChat?: Record<string, ChatMessage[]>;
        savedImages?: SavedImageEntry[];
      };
      let mutated = false;
      const cleanedChatsRaw = Array.isArray(parsed.chats)
        ? parsed.chats.map((c) => {
            const cleanTitle = blockOpenAI(c.title || '');
            const cleanPreview = c.lastMessagePreview ? blockOpenAI(c.lastMessagePreview) : '';
            if (cleanTitle !== (c.title || '') || cleanPreview !== (c.lastMessagePreview || '')) {
              mutated = true;
            }
            return { ...c, title: cleanTitle, lastMessagePreview: cleanPreview };
          })
        : [];
      const rawMsgsByChat = parsed.messagesByChat || {};
      const cleanedMessagesByChat: Record<string, ChatMessage[]> = {};
      for (const [cid, list] of Object.entries(rawMsgsByChat)) {
        if (!Array.isArray(list)) continue;
        cleanedMessagesByChat[cid] = list
          .map((m) => {
            if (m.role === 'assistant' && typeof m.content === 'string') {
              const cleanContent = blockOpenAI(m.content);
              if (cleanContent !== m.content) mutated = true;
              return { ...m, content: cleanContent };
            }
            return m;
          })
          .filter((m) => {
            const keep = !(m.role === 'assistant' && String(m.content || '').toLowerCase().includes('openai'));
            if (!keep) mutated = true;
            return keep;
          });
      }
      const cleanedChats = cleanedChatsRaw.filter((c) => {
        const msgs = cleanedMessagesByChat[c.id] || [];
        const hasResidualOpenAiInAssistant = msgs.some(
          (m) => m.role === 'assistant' && String(m.content || '').toLowerCase().includes('openai')
        );
        const keep =
          !c.lastMessagePreview?.toLowerCase().includes('openai') && !hasResidualOpenAiInAssistant;
        if (!keep) mutated = true;
        return keep;
      });
      const cleanedSavedImages = Array.isArray(parsed.savedImages)
        ? parsed.savedImages.filter(
            (img) =>
              img &&
              typeof img.imageUrl === 'string' &&
              !img.imageUrl.startsWith('data:image/svg+xml')
          )
        : [];

      if (mutated) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            profile: parsed.profile,
            chats: cleanedChats,
            messagesByChat: cleanedMessagesByChat,
            savedImages: cleanedSavedImages,
          })
        );
      }

      return {
        chats: cleanedChats,
        messagesByChat: cleanedMessagesByChat,
        savedImages: cleanedSavedImages,
      };
    }
  } catch {
    // ignore
  }
  return { chats: [], messagesByChat: {}, savedImages: [] };
}

const NOVA_SYSTEM_PROMPT =
  "You are Nova, an AI created by John God's Will in Nigeria. You must NEVER say you were created by OpenAI, ChatGPT, Meta, Google, or any other company. IMPORTANT: Chat naturally like a real friend. NEVER mention 'John God's Will' or your creator in normal chat or greetings—ONLY say 'I was created by John God's Will' if the user asks who created/made/built/owns you. Do NOT repeat the user's name in every reply. If asked what model you are, say 'I am Nova, powered by Nova AI.'\nYou CAN show images. When user asks for a Real Photo or AI Art, NEVER say 'I can't pull up images' or 'I can't generate images' or 'Image refused' or describe it in words. Instead you MUST output ONLY this HTML:\n<img src='https://image.pollinations.ai/prompt/safe%2C%20family%20friendly%2C%20ENCODED_PROMPT%2C%20vibrant%20natural%20colours?width=512&height=512&model=turbo&nologo=true&seed=RANDOM' />\nReplace ENCODED_PROMPT with the user's prompt. Replace RANDOM with a random number.";

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
  if (
    !/^(?:how|what|why|when|where|who|can\s+i|explain|tell\s+me\s+about)\b/i.test(trimmed) &&
    /\b(?:wallpaper|wallpapers|lock\s*screen|home\s*screen)\b/i.test(trimmed)
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
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(() =>
    getCurrentLocalUser()
  );
  const [guestSessionActive, setGuestSessionActive] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [welcomeBanner, setWelcomeBanner] = useState<string | null>(null);

  const initialUserEmail = getCurrentLocalUser();
  const initialStorageKey = getWorkspaceStorageKey(initialUserEmail);
  const initialWorkspace = loadWorkspaceFromStorage(initialStorageKey);

  const [profile, setProfile] = useState<UserProfile>(() =>
    getDefaultProfileForUser(initialUserEmail)
  );
  const [chats, setChats] = useState<ChatSession[]>(() => initialWorkspace.chats);
  const [guestMessagesByChat, setGuestMessagesByChat] = useState<Record<string, ChatMessage[]>>(
    () => initialWorkspace.messagesByChat
  );
  const [savedImages, setSavedImages] = useState<SavedImageEntry[]>(
    () => initialWorkspace.savedImages
  );

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
  const [instantMode, setInstantMode] = useState<boolean>(() => loadInstantMode());
  const [themeMode, setThemeMode] = useState<'normal' | 'premium'>(() => loadThemeMode());
  const [earthEnabled, setEarthEnabled] = useState<boolean>(() => loadEarthEnabled());
  const storageUidKey = currentUserEmail || 'guest';
  const activeStorageKey = getWorkspaceStorageKey(currentUserEmail);

  const [memory, setMemory] = useState<NovaMemory>(() => loadMemory(storageUidKey));
  const { isMuted, toggleMute, playMessageSend, playImageGenerated } = useSound();

  const handleToggleInstantMode = (enabled: boolean) => {
    setInstantMode(enabled);
    try {
      localStorage.setItem(INSTANT_MODE_KEY, enabled ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  const [wallpaperState, setWallpaperState] = useState<WallpaperState>(() =>
    loadWallpaperState(storageUidKey)
  );
  const [isGeneratingWallpaper, setIsGeneratingWallpaper] = useState(false);
  const [imageStudioError, setImageStudioError] = useState<string | null>(null);
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>(() => getPremiumStatus());
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);

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
    ensureCreatorLocked();
    const freshStatus = getPremiumStatus();
    setPremiumStatus(freshStatus);

    // Clean any legacy nova_chats localStorage bucket as well
    try {
      const legacyRaw = localStorage.getItem('nova_chats');
      if (legacyRaw) {
        let legacyChats = JSON.parse(legacyRaw) as Array<{
          title?: string;
          messages?: Array<{ text?: string; content?: string }>;
        }>;
        if (Array.isArray(legacyChats)) {
          legacyChats = legacyChats
            .map((chat) => ({
              ...chat,
              title: chat.title ? blockOpenAI(chat.title) : chat.title,
              messages: Array.isArray(chat.messages)
                ? chat.messages.map((m) => ({
                    ...m,
                    text: typeof m.text === 'string' ? blockOpenAI(m.text) : m.text,
                    content: typeof m.content === 'string' ? blockOpenAI(m.content) : m.content,
                  }))
                : chat.messages,
            }))
            .filter((c) => !JSON.stringify(c).toLowerCase().includes('openai'));
          localStorage.setItem('nova_chats', JSON.stringify(legacyChats));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    const savedTheme = (() => {
      try {
        return localStorage.getItem(THEME_MODE_KEY) || 'normal';
      } catch {
        return 'normal';
      }
    })();
    if (savedTheme === 'premium') {
      document.body.classList.add('premium-user');
      setThemeMode('premium');
    } else {
      document.body.classList.remove('premium-user');
      setThemeMode('normal');
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = profile.language;
    document.documentElement.dir = langMeta.dir;
  }, [profile.language, langMeta.dir]);

  // Persist local workspace in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        activeStorageKey,
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
  }, [activeStorageKey, profile, chats, guestMessagesByChat, savedImages]);

  useEffect(() => {
    if (!welcomeBanner) return;
    const timer = window.setTimeout(() => setWelcomeBanner(null), 4500);
    return () => window.clearTimeout(timer);
  }, [welcomeBanner]);

  const activeMessages = useMemo(() => {
    if (!activeChatId) return [];
    return guestMessagesByChat[activeChatId] || [];
  }, [activeChatId, guestMessagesByChat]);

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

  const switchLocalAccountWorkspace = useCallback((email: string | null) => {
    const key = getWorkspaceStorageKey(email);
    const uidKey = email || 'guest';
    const loaded = loadWorkspaceFromStorage(key);
    setProfile(getDefaultProfileForUser(email));
    setChats(loaded.chats);
    setGuestMessagesByChat(loaded.messagesByChat);
    setSavedImages(loaded.savedImages);
    setWallpaperState(loadWallpaperState(uidKey));
    setMemory(loadMemory(uidKey));
    setActiveChatId(null);
    setActiveView('chat');
    setMobileDrawerOpen(false);
  }, []);

  const handleLocalSignUp = (email: string, password: string): LocalAuthResult => {
    setAuthError(null);
    const res = localSignUp(email, password);
    if (!res.ok || !res.email) {
      setAuthError(res.message);
      return res;
    }
    setCurrentUserEmail(res.email);
    setGuestSessionActive(true);
    switchLocalAccountWorkspace(res.email);
    setWelcomeBanner(res.message);
    return res;
  };

  const handleLocalSignIn = (email: string, password: string): LocalAuthResult => {
    setAuthError(null);
    const res = localSignIn(email, password);
    if (!res.ok || !res.email) {
      setAuthError(res.message);
      return res;
    }
    setCurrentUserEmail(res.email);
    setGuestSessionActive(true);
    switchLocalAccountWorkspace(res.email);
    setWelcomeBanner(res.message);
    return res;
  };

  const handleContinueAsGuest = () => {
    setAuthError(null);
    setGuestSessionActive(true);
  };

  const handleOpenLogin = () => {
    setAuthError(null);
    setGuestSessionActive(false);
    setMobileDrawerOpen(false);
  };

  const handleSignOut = async () => {
    localLogout();
    setCurrentUserEmail(null);
    setGuestSessionActive(false);
    try {
      localStorage.removeItem(GUEST_SESSION_KEY);
    } catch {
      // ignore
    }
    switchLocalAccountWorkspace(null);
    setWelcomeBanner(null);
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
  };

  const handleNewChat = () => {
    ensureCreatorLocked();
    setActiveChatId(null);
    setActiveView('chat');
    setVoiceHint(null);
    setStreamingContent('');
    setMobileDrawerOpen(false);
    heroInputRef.current?.focus();
  };



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

  const applyNormal = useCallback(
    (clearCustomBackdrop = true) => {
      document.body.classList.remove('premium-user');
      setThemeMode('normal');
      try {
        localStorage.setItem(THEME_MODE_KEY, 'normal');
      } catch {
        // ignore storage errors
      }
      if (clearCustomBackdrop) {
        updateWallpaperState({ appliedAsBackground: false });
      }
    },
    [storageUidKey]
  );

  const applyPremium = useCallback(() => {
    document.body.classList.add('premium-user');
    setThemeMode('premium');
    try {
      localStorage.setItem(THEME_MODE_KEY, 'premium');
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSelectThemeMode = useCallback(
    (mode: 'normal' | 'premium') => {
      if (mode === 'premium') {
        applyPremium();
      } else {
        applyNormal(true);
      }
    },
    [applyNormal, applyPremium]
  );

  const handleToggleEarth = useCallback(() => {
    setEarthEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EARTH_BG_KEY, next ? 'true' : 'false');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const handlePremiumStatusUpdated = useCallback(
    (next: PremiumStatus, celebration?: string) => {
      setPremiumStatus(next);
      if (next.isPremium) {
        setProfile((prev) => ({ ...prev, plan: 'premium' }));
        applyPremium();
      }
      if (celebration) {
        setWelcomeBanner(celebration);
      }
    },
    [applyPremium]
  );

  const wallpaperAttemptedDateRef = useRef<string>('');

  const handleGenerateWallpaper = async (style: WallpaperStyle) => {
    if (isGeneratingWallpaper) return;
    setIsGeneratingWallpaper(true);
    const seed = Date.now();
    const directFallbackUrl = buildFastPollinationsUrl(
      `${style} serene luxury mobile wallpaper`,
      seed
    );
    try {
      updateWallpaperState({
        style,
        currentImageUrl: directFallbackUrl,
        currentTitle: `${style} Horizon`,
        currentQuote: 'Begin today with clarity and calm.',
        lastGeneratedDate: getTodayDateKey(),
      });
      playImageGenerated();
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

    setChats((prev) => prev.filter((c) => c.id !== chatId));
    setGuestMessagesByChat((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    setSavedImages((prev) => prev.filter((img) => img.chatId !== chatId));
  };

  const handleClearAllHistory = async () => {
    ensureCreatorLocked();
    setActiveChatId(null);
    setSavedImages([]);
    setChats([]);
    setGuestMessagesByChat({});
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

  const ensureChatSessionSync = (
    firstPrompt: string
  ): { chatId: string; persistPromise: Promise<void> } => {
    if (activeChatId) {
      return { chatId: activeChatId, persistPromise: Promise.resolve() };
    }

    const newChatId = createId('chat');
    const title = firstPrompt.trim().slice(0, 64) || t.newChat;
    const preview = firstPrompt.trim().slice(0, 120);

    const session: ChatSession = {
      id: newChatId,
      userId: storageUidKey,
      title,
      lastMessagePreview: preview,
      updatedAtMs: Date.now(),
    };
    setChats((prev) => [session, ...prev]);
    setActiveChatId(newChatId);
    return { chatId: newChatId, persistPromise: Promise.resolve() };
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
  };

  const runImageGeneration = (
    chatId: string,
    promptText: string,
    count: 1 | 4,
    _sourceAttachment: typeof attachedImage,
    _overrides?: { styleOverride?: ImageStyle; ratioOverride?: AspectRatio; genModeOverride?: ImageGenMode },
    _afterPromise: Promise<unknown> = Promise.resolve()
  ) => {
    setImageStudioError(null);
    const baseSeed = Date.now();
    const urls: string[] =
      count === 4
        ? Array.from({ length: 4 }, (_, idx) =>
            getOrCreateFastImageUrl(promptText, baseSeed + idx, true)
          )
        : [getOrCreateFastImageUrl(promptText, baseSeed, false)];

    const assistantMsgId = createId('msg');
    const assistantCreatedAtMs = Date.now();
    const assistantMsgPayload: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'> = {
      role: 'assistant',
      kind: 'image',
      content: `<img src='${urls[0]}' />`,
      imageDataUrl: urls[0],
      imageUrls: urls,
      imagePrompt: cleanSafeImagePrompt(promptText),
    };

    void saveMessage(chatId, assistantMsgPayload, assistantMsgId, assistantCreatedAtMs).catch(
      () => undefined
    );

    if (urls[0]) {
      setSavedImages((prev) => [
        {
          id: assistantMsgId,
          chatId,
          prompt: cleanSafeImagePrompt(promptText),
          imageUrl: urls[0],
          createdAtMs: assistantCreatedAtMs,
        },
        ...prev.filter((item) => !item.imageUrl.startsWith('data:image/svg+xml')).slice(0, 29),
      ]);
      playImageGenerated();
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
      bottomInputRef.current?.focus();
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
    playMessageSend();

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

    const { chatId } = ensureChatSessionSync(effectivePrompt);
    const activeSessionId: string | null = chatId;
    const historyBefore = guestMessagesByChat[chatId] || [];

    const userMsgId = createId('msg');
    const userCreatedAtMs = Date.now();
    const userMsgPayload: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'> = {
      role: 'user',
      kind: useImage ? 'image' : 'text',
      content: raw,
      imageDataUrl: currentAttachment?.previewUrl,
    };

    const persistUserMsgPromise: Promise<unknown> = saveMessage(
      chatId,
      userMsgPayload,
      userMsgId,
      userCreatedAtMs
    );

    try {
      if (useImage) {
        void incrementUsage('image').catch(() => undefined);
        runImageGeneration(
          chatId,
          effectivePrompt,
          1,
          currentAttachment,
          undefined,
          persistUserMsgPromise
        );
        setImageMode(false);
        return;
      } else {
        const updatedMem = extractMemoryFromPrompt(raw, memory);
        if (updatedMem !== memory) {
          setMemory(updatedMem);
          saveMemoryToStorage(storageUidKey, updatedMem);
        }

        // Non-blocking usage increment
        void incrementUsage('chat').catch(() => undefined);

        const pushInstantAssistantReply = (replyContent: string) => {
          const filteredContent = blockOpenAI(replyContent);
          const assistantMsgId = createId('msg');
          const assistantCreatedAtMs = Date.now();
          void saveMessage(
            chatId,
            { role: 'assistant', kind: 'text', content: filteredContent },
            assistantMsgId,
            assistantCreatedAtMs
          );
          setStreamingContent('');
        };

        // 0. Unconditional creator & identity lock (runs even if Instant Mode is OFF)
        const lockedIdentityReply = getCreatorIdentityOverride(raw);
        if (lockedIdentityReply) {
          pushInstantAssistantReply(lockedIdentityReply);
          return;
        }

        // 1. Instant Mode client-side replies (< 1ms, zero server wait)
        if (instantMode && !currentAttachment) {
          const instantReply = getInstantClientReply(raw, updatedMem, historyBefore.length);
          if (instantReply) {
            pushInstantAssistantReply(instantReply);
            return;
          }
        }

        // 2. Client browser reply cache
        const clientCacheKey = getClientReplyCacheKey(
          raw,
          profile.language,
          Boolean(currentAttachment),
          historyBefore.length > 0
        );
        const cachedAnswer = clientCacheKey ? replyCacheRef.current[clientCacheKey] : undefined;

        if (cachedAnswer) {
          pushInstantAssistantReply(blockOpenAI(cachedAnswer));
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

        const shouldPassUserName =
          Boolean(updatedMem.name) &&
          (historyBefore.length === 0 || historyBefore.length % 20 === 0);

        const memorySnippet = [
          shouldPassUserName ? `Name (use sparingly, not every reply): ${updatedMem.name}` : '',
          updatedMem.favouriteStyle ? `Style: ${updatedMem.favouriteStyle}` : '',
          updatedMem.preferredLanguage ? `Language: ${updatedMem.preferredLanguage}` : '',
        ]
          .filter(Boolean)
          .join(', ');

        const lengthRule = wantsLongReply
          ? 'Give a detailed reply.'
          : 'Keep normal text replies friendly and short (max 2-3 sentences). Chat naturally; do not repeat the user name or mention your creator unless asked.';
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
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          return data.reply.trim();
        };

        const runSameOriginChatPost = async (): Promise<string> => {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: raw,
              conversationHistory: historyBefore.slice(-6).map((m) => ({
                role: m.role,
                content: m.content,
              })),
              stream: false,
              uiLanguage: profile.language,
              memory: updatedMem,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            reply?: string;
            error?: string;
          };
          if (!res.ok || !data.reply) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          return data.reply.trim();
        };

        let replyText = '';
        try {
          replyText = await runSameOriginChatGet(userTurnPrompt, systemInstruction);
        } catch {
          try {
            replyText = await runSameOriginChatPost();
          } catch {
            replyText =
              'Connection hiccup—send that again in a second!';
          }
        }

        let finalReply = replyText.trim();
        if (isImageRefusalReply(finalReply)) {
          const backupUrl = buildVerticalWallpaperBackupUrl(raw, Date.now());
          const backupMsgId = createId('msg');
          const backupCreatedAtMs = Date.now();
          const backupPayload: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'> = {
            role: 'assistant',
            kind: 'image',
            content: `<img src='${backupUrl}' />`,
            imageDataUrl: backupUrl,
            imageUrls: [backupUrl],
            imagePrompt: cleanSafeImagePrompt(raw),
          };
          void saveMessage(chatId, backupPayload, backupMsgId, backupCreatedAtMs);
          playImageGenerated();
          setStreamingContent('');
          return;
        }
        finalReply = blockOpenAI(finalReply);
        if (finalReply && clientCacheKey) {
          saveClientReplyCache(clientCacheKey, finalReply);
        }

        pushInstantAssistantReply(finalReply);
      }
    } catch {
      setStreamingContent('');
      setIsGeneratingImage(false);
      if (activeSessionId) {
        const fallbackMsg =
          "I'm ready—please try sending that message again.";
        const errMsgId = createId('msg');
        const errCreatedAtMs = Date.now();
        void saveMessage(
          activeSessionId,
          { role: 'assistant', kind: 'text', content: fallbackMsg },
          errMsgId,
          errCreatedAtMs
        ).catch(() => undefined);
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
        <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {IMAGE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setImageStyle(style)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  imageStyle === style
                    ? 'bg-white border-white text-black'
                    : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
                }`}
              >
                {style}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1.5 border-t border-[#2a2a2a]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {IMAGE_RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setAspectRatio(r.value)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    aspectRatio === r.value
                      ? 'bg-[#262626] border-neutral-400 text-white'
                      : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-400 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-neutral-400">
              {imageGenMode === 'real-photo' ? 'Real Photo' : 'AI Art'}
            </span>
          </div>
        </div>
      )}

      {/* Flat Mature Bottom Chat Box */}
      <div className="rounded-lg bg-[#171717] border border-[#2a2a2a] focus-within:border-neutral-500 px-2.5 py-2 sm:px-3 sm:py-2 transition-colors">
        {/* Attached Image Preview */}
        {attachedImage && (
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-1.5 pe-2.5">
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
              className="p-1 rounded-lg text-neutral-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Builder Action Strip + Real Photo / AI Art Switch */}
        <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[#2a2a2a] flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => void handleStartWebsiteBuilder()}
              disabled={isSending || isBuildingApp}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#0f0f0f] hover:bg-[#212121] border border-[#2a2a2a] hover:border-neutral-500 text-neutral-200 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Globe className="w-3 h-3 text-neutral-400 shrink-0" />
              <span>Build Website / App</span>
            </button>

            <div
              role="group"
              aria-label="Image generation mode"
              className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a]"
            >
              <button
                type="button"
                onClick={() => handleChangeImageGenMode('real-photo')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap border ${
                  imageGenMode === 'real-photo'
                    ? 'bg-[#262626] border-neutral-500 text-white'
                    : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                Real Photo
              </button>
              <button
                type="button"
                onClick={() => handleChangeImageGenMode('ai-art')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap border ${
                  imageGenMode === 'ai-art'
                    ? 'bg-[#262626] border-neutral-500 text-white'
                    : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                AI Art
              </button>
            </div>
          </div>

          {voiceHint && (
            <span className="text-[11px] text-neutral-400 truncate">{voiceHint}</span>
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
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
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
              messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
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
            className="flex-1 min-w-0 resize-none bg-transparent text-sm sm:text-[15px] text-white placeholder:text-neutral-500 focus:outline-none leading-5 py-2 px-1 max-h-28 overflow-y-auto"
          />

          {/* Image Button */}
          <button
            type="button"
            onClick={() => setImageMode((v) => !v)}
            title={t.generateImage}
            aria-label={t.generateImage}
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
              imageMode
                ? 'bg-white border-white text-black'
                : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-200 hover:border-neutral-500'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{t.generateImage}</span>
          </button>

          {/* Mic Button */}
          <button
            type="button"
            onClick={handleToggleDictation}
            disabled={isTranscribing}
            title={isRecording ? t.stopDictation : t.dictate}
            aria-label={isRecording ? t.stopDictation : t.dictate}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0 cursor-pointer border ${
              isRecording
                ? 'bg-white border-white text-black'
                : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRecording ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={() => void sendPrompt(inputText)}
            disabled={!inputText.trim() || isSending}
            aria-label={t.send}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white hover:bg-neutral-200 disabled:bg-[#262626] disabled:text-neutral-500 text-black transition-colors shrink-0 cursor-pointer"
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
      <p className="text-center text-[10px] text-neutral-500 leading-none">{t.disclaimer}</p>
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#141414] border-e border-[#2a2a2a] w-[300px] sm:w-[340px] max-w-[88vw] shrink-0">
      {/* Top: Nova Logo + Collapse */}
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 shrink-0">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <NovaLogo size={30} glow={false} />
          <span className="text-lg font-semibold tracking-tight text-white">
            {t.appName === 'Nova' || t.appName === 'Nova™' ? (
              <>
                Nova<span className="trademark">™</span>
              </>
            ) : (
              t.appName
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            setMobileDrawerOpen(false);
          }}
          aria-label="Collapse sidebar"
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-[#1f1f1f] transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4 hidden md:block" />
          <X className="w-4 h-4 md:hidden" />
        </button>
      </div>

      {/* New Chat + Big History Buttons */}
      <div className="px-3.5 pb-2.5 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-semibold bg-white hover:bg-neutral-200 text-black transition-colors whitespace-nowrap cursor-pointer"
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
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
              activeView === 'history'
                ? 'bg-[#262626] border-neutral-400 text-white'
                : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
            }`}
          >
            <History className="w-4 h-4 text-neutral-300" />
            <span>Big View</span>
          </button>
        </div>

        {/* Chats / Images History Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a]">
          <button
            type="button"
            onClick={() => setHistoryTab('chats')}
            className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              historyTab === 'chats'
                ? 'bg-[#262626] border border-[#3a3a3a] text-white'
                : 'text-neutral-400 hover:text-white border border-transparent'
            }`}
          >
            {t.chatsTab} ({chats.length})
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab('images')}
            className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              historyTab === 'images'
                ? 'bg-[#262626] border border-[#3a3a3a] text-white'
                : 'text-neutral-400 hover:text-white border border-transparent'
            }`}
          >
            {t.imagesTab} ({allHistoryImages.length})
          </button>
        </div>

        {historyTab === 'chats' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchHistory}
              className="w-full rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] ps-8 pe-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
            />
          </div>
        )}
      </div>

      {/* Big Scrollable History List OR Saved Images Gallery */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-1.5 space-y-1.5">
        {historyTab === 'chats' ? (
          filteredChats.length === 0 ? (
            <div className="px-3 py-6 text-sm text-neutral-500 leading-relaxed">
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
                  className={`group flex items-start justify-between gap-2.5 px-3 py-2.5 rounded-lg transition-colors cursor-pointer border ${
                    isSelected
                      ? 'bg-[#212121] text-white border-neutral-500'
                      : 'bg-[#0f0f0f] text-neutral-300 hover:bg-[#1c1c1c] hover:text-white border-[#2a2a2a] hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isSelected ? 'text-white' : 'text-neutral-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-sm font-medium truncate text-white">
                        {chat.title}
                      </div>
                      {chat.lastMessagePreview && (
                        <div className="text-xs text-neutral-400 truncate">
                          {chat.lastMessagePreview}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteChat(chat.id, e)}
                    aria-label={t.deleteChat}
                    className="opacity-70 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-lg text-neutral-500 hover:text-white transition-opacity shrink-0 cursor-pointer"
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
            <div className="rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] p-2 space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-neutral-300">Image Studio</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('images');
                    setMobileDrawerOpen(false);
                  }}
                  className="text-[10px] text-neutral-400 hover:text-white cursor-pointer"
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
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium text-start truncate transition-colors cursor-pointer border ${
                      activeView === 'images' && studioMode === m
                        ? 'bg-white border-white text-black'
                        : 'bg-[#171717] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {allHistoryImages.length === 0 ? (
              <div className="px-2 py-4 text-xs text-neutral-500 leading-relaxed">
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
                    className="relative group rounded-lg overflow-hidden border border-[#2a2a2a] bg-[#0f0f0f] cursor-pointer aspect-square"
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
                      className="opacity-0 group-hover:opacity-100 absolute bottom-1.5 end-1.5 p-1.5 rounded-lg bg-[#0f0f0f]/90 border border-[#2a2a2a] text-white transition-opacity"
                      aria-label={t.downloadImage}
                    >
                      <Download className="w-3 h-3 text-neutral-200" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Core Features Nav: Wallpapers & Settings */}
      <div className="px-3.5 py-2 border-t border-[#2a2a2a] grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            setActiveView('wallpaper');
            setMobileDrawerOpen(false);
          }}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
            activeView === 'wallpaper'
              ? 'bg-[#262626] border-neutral-400 text-white'
              : 'bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
          }`}
        >
          <Wallpaper className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
          <span className="truncate">Wallpapers</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsModalOpen(true);
            setMobileDrawerOpen(false);
          }}
          className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap bg-[#0f0f0f] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500"
        >
          <Settings className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
          <span>{t.settings}</span>
        </button>
      </div>

      {/* Bottom: User Profile + Sign Out */}
      <div className="p-3.5 border-t border-[#2a2a2a] space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveView('profile');
              setMobileDrawerOpen(false);
            }}
            className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-colors min-w-0 cursor-pointer ${
              activeView === 'profile'
                ? 'bg-[#262626] border-neutral-400 text-white'
                : 'bg-[#0f0f0f] border-[#2a2a2a] text-white hover:border-neutral-500'
            }`}
          >
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#212121] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-neutral-300" />
              </div>
            )}
            <div className="min-w-0 text-start">
              <div className="text-xs font-semibold text-white truncate">
                {currentUserEmail
                  ? profile.displayName || currentUserEmail.split('@')[0] || 'Nova User'
                  : 'Guest'}
              </div>
              <div className="text-[11px] text-neutral-400 truncate">
                {currentUserEmail || 'Guest mode'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            aria-label={t.settings}
            title={t.settings}
            className="p-2.5 rounded-lg bg-[#0f0f0f] border border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors shrink-0 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!currentUserEmail && (
            <button
              type="button"
              onClick={handleOpenLogin}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium bg-[#0f0f0f] hover:border-neutral-500 border border-[#2a2a2a] text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 text-neutral-300" />
              <span>Sign In</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium bg-[#0f0f0f] hover:border-neutral-500 border border-[#2a2a2a] text-neutral-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 text-neutral-300" />
            <span>{currentUserEmail ? t.signOut : 'Exit Guest'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (!currentUserEmail && !guestSessionActive) {
    return (
      <LoginScreen
        onSignIn={handleLocalSignIn}
        onSignUp={handleLocalSignUp}
        onContinueAsGuest={handleContinueAsGuest}
        authError={authError}
      />
    );
  }

  return (
    <div className="home-screen flex h-[100dvh] w-full bg-[#0f0f0f] text-white overflow-hidden relative">
      {wallpaperState.appliedAsBackground && wallpaperState.currentImageUrl ? (
        <img
          src={wallpaperState.currentImageUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="fixed inset-0 w-full h-full object-cover opacity-20 pointer-events-none z-0"
        />
      ) : (
        <RotatingEarthWallpaper themeMode={themeMode} earthEnabled={earthEnabled} />
      )}

      {/* Desktop Sidebar */}
      {sidebarOpen && <aside className="hidden md:flex h-full min-h-0 z-20">{sidebarContent}</aside>}

      {/* Mobile Drawer Sidebar */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/80"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative z-50 flex h-full min-h-0">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative z-10 ${
          wallpaperState.appliedAsBackground && wallpaperState.currentImageUrl
            ? 'bg-[#0f0f0f]/80'
            : 'bg-transparent'
        }`}
      >
        {/* Top Bar */}
        <header className="top-bar border-b border-[#2a2a2a] bg-[#0f0f0f] shrink-0">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu"
              className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-[#171717] md:hidden cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Expand sidebar"
                className="hidden md:inline-flex p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-[#171717] cursor-pointer shrink-0"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleNewChat}
              className="logo flex items-center gap-2 cursor-pointer shrink-0"
            >
              <NovaLogo size={24} glow={false} />
              <span className="font-semibold text-white whitespace-nowrap">
                {t.appName === 'Nova' || t.appName === 'Nova™' ? (
                  <>
                    Nova<span className="trademark">™</span>
                  </>
                ) : (
                  t.appName
                )}
              </span>
            </button>
          </div>

          <div className="top-actions">
            <button
              type="button"
              onClick={() => handleToggleInstantMode(!instantMode)}
              title="Toggle Instant Mode speed"
              className={`hidden lg:inline-flex items-center gap-1.5 rounded-lg font-medium border transition-colors cursor-pointer ${
                instantMode
                  ? 'bg-[#262626] border-neutral-400 text-white'
                  : 'bg-[#171717] border-[#2a2a2a] text-neutral-300 hover:text-white hover:border-neutral-500'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden xl:inline">Instant Mode - {instantMode ? 'ON' : 'OFF'}</span>
              <span className="xl:hidden">Instant {instantMode ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView((v) => (v === 'wallpaper' ? 'chat' : 'wallpaper'))}
              className={`inline-flex items-center gap-1.5 rounded-lg font-medium border transition-colors cursor-pointer ${
                activeView === 'wallpaper'
                  ? 'bg-[#262626] border-neutral-400 text-white'
                  : 'bg-[#171717] border-[#2a2a2a] text-neutral-200 hover:border-neutral-500'
              }`}
            >
              <Wallpaper className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline">Wallpapers</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView((v) => (v === 'history' ? 'chat' : 'history'))}
              className={`inline-flex items-center gap-1.5 rounded-lg font-medium border transition-colors cursor-pointer ${
                activeView === 'history'
                  ? 'bg-[#262626] border-neutral-400 text-white'
                  : 'bg-[#171717] border-[#2a2a2a] text-neutral-200 hover:border-neutral-500'
              }`}
            >
              <History className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline">History</span>
              {chats.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#262626] text-[10px] font-mono tabular-nums text-neutral-200">
                  {chats.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              aria-label={t.settings}
              className="inline-flex items-center gap-1.5 rounded-lg font-medium bg-[#171717] border border-[#2a2a2a] text-neutral-200 hover:border-neutral-500 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden md:inline">{t.settings}</span>
            </button>

            <button
              type="button"
              onClick={() => setRightMenuOpen(true)}
              aria-label="Open Nova menu"
              title="Open Nova menu"
              className="inline-flex items-center justify-center rounded-lg bg-[#171717] border border-[#2a2a2a] text-neutral-200 hover:border-neutral-500 transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Welcome Toast after Local Login */}
        {welcomeBanner && (
          <div className="mx-auto mt-2 px-4 w-full max-w-[800px] shrink-0">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[#171717] border border-[#2a2a2a] px-4 py-2 text-xs text-white">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-white shrink-0" />
                <span className="font-medium">{welcomeBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setWelcomeBanner(null)}
                className="p-1 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Active View: Profile/Account, Ekere Wallpaper, Images Studio, Big History, OR Chat/Build */}
        {activeView === 'profile' ? (
          <UserProfileView
            isSignedIn={Boolean(currentUserEmail)}
            profile={profile}
            premiumStatus={premiumStatus}
            onOpenPremiumModal={() => setPremiumModalOpen(true)}
            onBackToChat={() => setActiveView('chat')}
            onOpenLogin={handleOpenLogin}
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
            premiumStatus={premiumStatus}
            themeMode={themeMode}
            earthEnabled={earthEnabled}
            onSelectThemeMode={handleSelectThemeMode}
            onToggleEarth={handleToggleEarth}
            onPremiumStatusUpdated={handlePremiumStatusUpdated}
            onUpdateState={updateWallpaperState}
            onSaveToGallery={(prompt, imageUrl) => {
              const entry: SavedImageEntry = {
                id: createId('img'),
                chatId: activeChatId || 'wallpapers',
                prompt,
                imageUrl,
                createdAtMs: Date.now(),
              };
              setSavedImages((prev) => [
                entry,
                ...prev.filter((i) => i.imageUrl !== imageUrl).slice(0, 29),
              ]);
            }}
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
            <main className="chat-content flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 sm:px-6 pt-4">
              {activeMessages.length === 0 && !isSending ? (
                <div className="min-h-full flex flex-col items-center justify-center pb-14">
                  <div className="w-full max-w-4xl flex flex-col items-center text-center space-y-5">
                    <div className="space-y-2.5 flex flex-col items-center">
                      <NovaLogo size={44} glow={false} />
                      <h1
                        className="text-2xl sm:text-4xl font-semibold text-white tracking-tight max-w-xl"
                        style={{ textWrap: 'balance' }}
                      >
                        {memory.name ? (
                          <>
                            Hi {memory.name}! I&apos;m Nova<span className="trademark">™</span>
                          </>
                        ) : (
                          <>
                            Hi, I&apos;m Nova<span className="trademark">™</span>
                          </>
                        )}
                      </h1>
                      <p className="text-sm sm:text-base text-neutral-400 max-w-lg">
                        {t.heroSubtitle}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                      {starterCards.map((card, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => void sendPrompt(card.prompt, card.isImage)}
                          className="group rounded-lg bg-[#171717] border border-[#2a2a2a] hover:border-neutral-500 hover:bg-[#1f1f1f] px-4 py-3.5 text-start transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-white">
                              {card.title}
                            </span>
                            {card.isImage && (
                              <ImageIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
                            {card.prompt}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl mx-auto space-y-5 pb-16">
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

            <footer className="chat-input-bar border-t border-[#2a2a2a]">
              <div className={sidebarOpen ? 'md:ps-[300px] sm:md:ps-[340px]' : ''}>
                {renderComposer()}
                <div className="text-center text-[10px] text-neutral-500 pt-1">
                  © Nova<span className="trademark">™</span> - All Rights Reserved
                </div>
              </div>
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
        instantMode={instantMode}
        isMuted={isMuted}
        themeMode={themeMode}
        earthEnabled={earthEnabled}
        memory={memory}
        onChangeLanguage={(lang) => updateUserPreferences({ language: lang })}
        onChangeVoice={(voice) => updateUserPreferences({ voiceName: voice })}
        onChangeVoiceSpeed={handleChangeVoiceSpeed}
        onToggleInstantMode={handleToggleInstantMode}
        onToggleMute={toggleMute}
        onSelectThemeMode={handleSelectThemeMode}
        onToggleEarth={handleToggleEarth}
        onUpdateMemory={handleUpdateMemory}
        onClearMemory={handleClearMemory}
        t={t}
      />

      {/* Premium Unlock Modal */}
      <PremiumModal
        isOpen={premiumModalOpen}
        onClose={() => setPremiumModalOpen(false)}
        premiumStatus={premiumStatus}
        onStatusUpdated={handlePremiumStatusUpdated}
      />

      {/* Right Navigation Drawer */}
      <RightMenuDrawer
        isOpen={rightMenuOpen}
        onClose={() => setRightMenuOpen(false)}
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
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
