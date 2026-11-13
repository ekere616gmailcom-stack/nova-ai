import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  AudioLines,
  Check,
  Crown,
  Download,
  Globe,
  Image as ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Search,
  Settings,
  Share2,
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
  ContactItem,
  FREE_DAILY_LIMIT,
  FREE_IMAGE_LIMIT,
  IMAGE_RATIOS,
  IMAGE_STUDIO_MODES,
  IMAGE_STYLES,
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
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import { NovaLogo } from './components/NovaLogo';
import { ChatMessageItem } from './components/ChatMessageItem';
import { VoiceChatModal } from './components/VoiceChatModal';
import { UserProfileView } from './components/UserProfileView';
import { SettingsModal } from './components/SettingsModal';
import { ContactsView } from './components/ContactsView';
import { WallpaperView } from './components/WallpaperView';
import { RightMenuDrawer } from './components/RightMenuDrawer';
import { ImagesGalleryView } from './components/ImagesGalleryView';
import { SpaceUploadedFile, SpaceView } from './components/SpaceView';
import { LoginScreen } from './components/LoginScreen';
import { ShareNovaModal } from './components/ShareNovaModal';
import { renderGenerativeWallpaperDataUrl } from './lib/wallpaperCanvas';

const GUEST_STORAGE_KEY = 'nova_guest_workspace_v2';
const GUEST_CONTACTS_KEY = 'nova_guest_contacts_v1';
const GUEST_SESSION_KEY = 'nova_guest_session_v1';
const VOICE_SPEED_KEY = 'nova_voice_speed_v1';
const MEMORY_PREFIX = 'nova_memory_v1_';
const CONTACTS_PERMISSION_PREFIX = 'nova_contacts_permission_v1_';
const WALLPAPER_STATE_PREFIX = 'nova_wallpaper_state_v1_';

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

  const nameMatch = clean.match(/\b(?:my name is|call me|i am called)\s+([A-Za-z][A-Za-z\s'-]{1,30})(?:[.!,]|$)/i);
  if (nameMatch?.[1]) {
    next.name = nameMatch[1].trim();
    changed = true;
  }

  const schoolMatch = clean.match(/\b(?:my school is|i attend|i study at|i go to)\s+([A-Za-z0-9\s.&'-]{2,50})(?:[.!,]|$)/i);
  if (schoolMatch?.[1] && !/^(bed|sleep|home|work|church|mosque|market)$/i.test(schoolMatch[1].trim())) {
    next.school = schoolMatch[1].trim();
    changed = true;
  }

  const bizMatch = clean.match(/\b(?:my business is|i run|my company is|i sell|i own)\s+([A-Za-z0-9\s.&'-]{2,60})(?:[.!,]|$)/i);
  if (bizMatch?.[1]) {
    next.business = bizMatch[1].trim();
    changed = true;
  }

  const styleMatch = clean.match(/\b(?:favourite style|favorite style|i prefer|i love)\s+(anime|realistic|3d cartoon|cinematic|poster|logo|minimalist|dark)\b/i);
  if (styleMatch?.[1]) {
    next.favouriteStyle = styleMatch[1].trim();
    changed = true;
  }

  const langMatch = clean.match(/\b(nigerian pidgin|pidgin|yoruba|igbo|hausa|english|french|spanish|arabic|hindi)\b/i);
  if (langMatch?.[1] && /\b(speak|reply|talk|prefer|language|in)\b/i.test(clean)) {
    next.preferredLanguage = langMatch[1].trim();
    changed = true;
  }

  if (clean.length >= 16 && !/^call\s+/i.test(clean)) {
    const snippet = clean.slice(0, 90);
    if (!next.pastNotes.includes(snippet)) {
      next.pastNotes = [snippet, ...next.pastNotes].slice(0, 8);
      changed = true;
    }
  }

  if (changed) {
    next.updatedAtMs = Date.now();
  }
  return changed ? next : prev;
}

function formatMemorySummary(mem: NovaMemory): string {
  const parts: string[] = [];
  if (mem.name) parts.push(`Name: ${mem.name}`);
  if (mem.school) parts.push(`School: ${mem.school}`);
  if (mem.business) parts.push(`Business: ${mem.business}`);
  if (mem.favouriteStyle) parts.push(`Favourite style: ${mem.favouriteStyle}`);
  if (mem.preferredLanguage) parts.push(`Preferred language: ${mem.preferredLanguage}`);
  if (mem.pastNotes.length > 0) parts.push(`Recent topics: ${mem.pastNotes.slice(0, 3).join('; ')}`);
  return parts.join(' | ');
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

function loadContactsPermission(uidKey: string): boolean {
  try {
    return localStorage.getItem(`${CONTACTS_PERMISSION_PREFIX}${uidKey}`) === 'true';
  } catch {
    return false;
  }
}

function loadGuestContacts(): ContactItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CONTACTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore
  }
  return [];
}

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

function detectCallIntent(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(?:please\s+)?call\s+([a-zA-Z0-9\u00C0-\u024F\s'-]{1,40})[.!?]*$/i);
  if (!match) return null;
  const target = match[1].trim();
  const lower = target.toLowerCase();
  const wordCount = target.split(/\s+/).length;
  if (wordCount > 3) return null;
  if (/^(a|an|the|this|that|it|back|stack|api|function|method|me|out)\b/i.test(lower)) {
    return null;
  }
  return target;
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
        savedImages: Array.isArray(parsed.savedImages) ? parsed.savedImages : [],
      };
    }
  } catch {
    // ignore
  }
  return { chats: [], messagesByChat: {}, savedImages: [] };
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
    /^(?:please\s+)?(?:generate|create|draw|make|sketch|illustrate|design|paint|render|show(?:\s+me)?|give\s+me)\s+(?:an?\s+)?(?:labeled\s+|labelled\s+|colourful\s+|colorful\s+|educational\s+|scientific\s+|3d\s+|realistic\s+|detailed\s+|beautiful\s+)?(?:image|picture|photo|logo|poster|illustration|diagram|drawing|sketch|infographic|artwork|visual)(?:\s+(?:of|for|showing|with))?\b/i.test(
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
    /\b(?:labeled\s+diagram|labelled\s+diagram|educational\s+diagram|diagram\s+of|illustration\s+of|picture\s+of|infographic\s+of|drawing\s+of|sketch\s+of)\b/i.test(
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
  const [guestSessionActive, setGuestSessionActive] = useState<boolean>(false);
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

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [historyTab, setHistoryTab] = useState<'chats' | 'images'>('chats');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [inputText, setInputText] = useState('');
  const [imageMode, setImageMode] = useState(false);
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
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [rightMenuOpen, setRightMenuOpen] = useState(false);
  const [voiceSpeed, setVoiceSpeed] = useState<VoiceSpeed>(() => loadVoiceSpeed());
  const [memory, setMemory] = useState<NovaMemory>(() => loadMemory('guest'));

  const [contactsPermission, setContactsPermission] = useState<boolean>(() =>
    loadContactsPermission('guest')
  );
  const [guestContacts, setGuestContacts] = useState<ContactItem[]>(() => loadGuestContacts());
  const [firestoreContacts, setFirestoreContacts] = useState<ContactItem[]>([]);
  const [callPermissionPrompt, setCallPermissionPrompt] = useState<{
    pendingPrompt: string;
  } | null>(null);

  const [wallpaperState, setWallpaperState] = useState<WallpaperState>(() =>
    loadWallpaperState('guest')
  );
  const [isGeneratingWallpaper, setIsGeneratingWallpaper] = useState(false);

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
    const unsub = onAuthStateChanged(auth, async (user) => {
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
        setFirestoreContacts([]);
        setContactsPermission(loadContactsPermission('guest'));
        setWallpaperState(loadWallpaperState('guest'));
        setMemory(loadMemory('guest'));
        setActiveChatId(null);
        return;
      }

      setContactsPermission(loadContactsPermission(user.uid));
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

      const today = getTodayDateKey();
      const userDocPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);

      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const initialProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'Nova User',
            email: user.email || '',
            photoURL: user.photoURL || '',
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
          setProfile(initialProfile);
        } else {
          const data = snap.data();
          const isSameDay = data.lastUsageDate === today;
          if (!isSameDay) {
            await updateDoc(userRef, {
              dailyChatCount: 0,
              dailyImageCount: 0,
              lastUsageDate: today,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, userDocPath);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to Firestore user profile & chats (verified users only)
  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified) return;

    const uid = authUser.uid;
    const today = getTodayDateKey();
    const userPath = `users/${uid}`;
    const userRef = doc(db, 'users', uid);

    void getDoc(userRef)
      .then((snap) => {
        if (!snap.exists()) {
          return setDoc(userRef, {
            uid,
            displayName: authUser.displayName || authUser.email?.split('@')[0] || 'Nova User',
            email: authUser.email || '',
            photoURL: authUser.photoURL || '',
            plan: 'free',
            language: profile.language || 'en',
            voiceName: profile.voiceName || 'Kore',
            dailyChatCount: 0,
            dailyImageCount: 0,
            lastUsageDate: today,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        return undefined;
      })
      .catch(() => undefined);
    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
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
      (error) => handleFirestoreError(error, OperationType.GET, userPath)
    );

    const chatsPath = `users/${uid}/chats`;
    const chatsQuery = query(collection(db, 'users', uid, 'chats'), where('userId', '==', uid));
    const unsubChats = onSnapshot(
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
      (error) => handleFirestoreError(error, OperationType.LIST, chatsPath)
    );

    const contactsPath = `users/${uid}/contacts`;
    const contactsQuery = query(
      collection(db, 'users', uid, 'contacts'),
      where('userId', '==', uid)
    );
    const unsubContacts = onSnapshot(
      contactsQuery,
      (snapshot) => {
        const loaded: ContactItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          const createdAtMs =
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? data.createdAt.toMillis()
              : Date.now();
          return {
            id: d.id,
            name: String(data.name || ''),
            phone: String(data.phone || ''),
            createdAtMs,
          };
        });
        loaded.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setFirestoreContacts(loaded);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, contactsPath)
    );

    return () => {
      unsubUser();
      unsubChats();
      unsubContacts();
    };
  }, [authReady, authUser]);

  // Subscribe to Firestore messages for active chat & populate savedImages
  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified || !activeChatId) {
      setFirestoreMessages([]);
      return;
    }

    const uid = authUser.uid;
    const messagesPath = `users/${uid}/chats/${activeChatId}/messages`;
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
      (error) => handleFirestoreError(error, OperationType.LIST, messagesPath)
    );

    return () => unsub();
  }, [authReady, authUser, activeChatId]);

  const activeMessages = useMemo(() => {
    if (!activeChatId) return [];
    if (canUseFirestore) return firestoreMessages;
    return guestMessagesByChat[activeChatId] || [];
  }, [activeChatId, canUseFirestore, firestoreMessages, guestMessagesByChat]);

  const activeContacts = canUseFirestore ? firestoreContacts : guestContacts;

  // Persist guest contacts when Firestore isn't active
  useEffect(() => {
    if (canUseFirestore) return;
    try {
      localStorage.setItem(GUEST_CONTACTS_KEY, JSON.stringify(guestContacts));
    } catch {
      // ignore
    }
  }, [canUseFirestore, guestContacts]);

  // Collect saved images from current messages as well
  const allHistoryImages = useMemo(() => {
    const map = new Map<string, SavedImageEntry>();
    savedImages.forEach((img) => map.set(img.id, img));
    activeMessages.forEach((m) => {
      if (m.role === 'assistant' && m.kind === 'image' && m.imageDataUrl) {
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

  const spaceUploadedFiles = useMemo(() => {
    const map = new Map<string, SpaceUploadedFile>();
    const allMsgs = canUseFirestore
      ? activeMessages
      : Object.values(guestMessagesByChat).flat();
    allMsgs.forEach((m) => {
      if (m.role === 'user' && m.imageDataUrl) {
        map.set(m.id, {
          id: m.id,
          chatId: m.chatId,
          name: m.content.slice(0, 60) || 'Uploaded file',
          dataUrl: m.imageDataUrl,
          createdAtMs: m.createdAtMs,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [canUseFirestore, activeMessages, guestMessagesByChat]);

  const todayKey = getTodayDateKey();
  const dailyUsed = profile.lastUsageDate === todayKey ? profile.dailyChatCount : 0;
  const dailyImageUsed = profile.lastUsageDate === todayKey ? profile.dailyImageCount : 0;
  const remainingFreeChats = Math.max(0, FREE_DAILY_LIMIT - dailyUsed);
  const isChatLimitReached = profile.plan === 'free' && dailyUsed >= FREE_DAILY_LIMIT;
  const isImageLimitReached = profile.plan === 'free' && dailyImageUsed >= FREE_IMAGE_LIMIT;

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeChatId, activeMessages.length, streamingContent, isGeneratingImage, isSending]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleViewportResize = () => {
      if (activeMessages.length > 0) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 80);
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
    const path = `users/${authUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
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
    const path = `users/${authUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        dailyChatCount: nextChatCount,
        dailyImageCount: nextImageCount,
        lastUsageDate: today,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setActiveView('chat');
    setVoiceHint(null);
    setStreamingContent('');
    setMobileDrawerOpen(false);
    setTimeout(() => heroInputRef.current?.focus(), 50);
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

  const handleGrantContactsPermission = () => {
    setContactsPermission(true);
    try {
      localStorage.setItem(`${CONTACTS_PERMISSION_PREFIX}${storageUidKey}`, 'true');
    } catch {
      // ignore
    }
    if (callPermissionPrompt?.pendingPrompt) {
      const promptToRun = callPermissionPrompt.pendingPrompt;
      setCallPermissionPrompt(null);
      void sendPrompt(promptToRun, false, true);
    }
  };

  const handleAddContact = async (name: string, phone: string) => {
    const cleanName = name.trim().slice(0, 120);
    const cleanPhone = phone.trim().slice(0, 40);
    if (!canUseFirestore || !authUser) {
      const item: ContactItem = {
        id: createId('ct'),
        name: cleanName,
        phone: cleanPhone,
        createdAtMs: Date.now(),
      };
      setGuestContacts((prev) => [item, ...prev]);
      return;
    }
    const uid = authUser.uid;
    const contactId = createId('ct');
    const contactPath = `users/${uid}/contacts/${contactId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'contacts', contactId), {
        userId: uid,
        name: cleanName,
        phone: cleanPhone,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, contactPath);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!canUseFirestore || !authUser) {
      setGuestContacts((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    const uid = authUser.uid;
    const contactPath = `users/${uid}/contacts/${id}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'contacts', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, contactPath);
    }
  };

  const updateWallpaperState = (patch: Partial<WallpaperState>) => {
    setWallpaperState((prev) => {
      const next = { ...prev, ...patch };
      saveWallpaperStateToStorage(storageUidKey, next);
      return next;
    });
  };

  const handleGenerateWallpaper = async (style: WallpaperStyle) => {
    if (isGeneratingWallpaper) return;
    setIsGeneratingWallpaper(true);
    try {
      const res = await fetch('/api/wallpaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, seed: Date.now() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        imageUrl?: string | null;
        title?: string;
        quote?: string;
      };

      const title = data.title || `${style} Horizon`;
      const quote = data.quote || 'Begin today with clarity and calm.';
      let finalImageUrl = data.imageUrl || '';
      if (!finalImageUrl) {
        finalImageUrl = renderGenerativeWallpaperDataUrl(style, title, quote);
      }

      updateWallpaperState({
        style,
        currentImageUrl: finalImageUrl,
        currentTitle: title,
        currentQuote: quote,
        lastGeneratedDate: getTodayDateKey(),
      });
    } catch {
      const fallbackTitle = `${style} Horizon`;
      const fallbackQuote = 'Keep shining with clarity and purpose.';
      const fallbackUrl = renderGenerativeWallpaperDataUrl(
        style,
        fallbackTitle,
        fallbackQuote
      );
      updateWallpaperState({
        style,
        currentImageUrl: fallbackUrl,
        currentTitle: fallbackTitle,
        currentQuote: fallbackQuote,
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
      if (isGeneratingWallpaper) return;
      const nowHour = new Date().getHours();
      const targetHour = getScheduleHour(wallpaperState.scheduleTime);
      const today = getTodayDateKey();
      if (nowHour >= targetHour && wallpaperState.lastGeneratedDate !== today) {
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
    isGeneratingWallpaper,
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
    const chatPath = `users/${uid}/chats/${chatId}`;
    try {
      const msgSnap = await getDocs(
        query(collection(db, 'users', uid, 'chats', chatId, 'messages'), where('userId', '==', uid))
      );
      const batch = writeBatch(db);
      msgSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'users', uid, 'chats', chatId));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, chatPath);
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
    const chatsPath = `users/${uid}/chats`;
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
      handleFirestoreError(err, OperationType.DELETE, chatsPath);
    }
  };

  const ensureChatSession = async (firstPrompt: string): Promise<string> => {
    if (activeChatId) return activeChatId;

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
      return newChatId;
    }

    const uid = authUser.uid;
    const chatPath = `users/${uid}/chats/${newChatId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'chats', newChatId), {
        userId: uid,
        title,
        lastMessagePreview: preview,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveChatId(newChatId);
      return newChatId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, chatPath);
    }
  };

  const saveMessage = async (
    chatId: string,
    msg: Omit<ChatMessage, 'id' | 'chatId' | 'createdAtMs'>
  ): Promise<string> => {
    const messageId = createId('msg');
    if (!canUseFirestore || !authUser) {
      const created: ChatMessage = {
        id: messageId,
        chatId,
        ...msg,
        createdAtMs: Date.now(),
      };
      setGuestMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), created],
      }));
      setChats((prev) =>
        prev
          .map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  lastMessagePreview: msg.content.slice(0, 120),
                  updatedAtMs: Date.now(),
                }
              : c
          )
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
      return messageId;
    }

    const uid = authUser.uid;
    const msgPath = `users/${uid}/chats/${chatId}/messages/${messageId}`;
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
      await updateDoc(doc(db, 'users', uid, 'chats', chatId), {
        lastMessagePreview: msg.content.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
      return messageId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, msgPath);
    }
  };

  const runImageGeneration = async (
    chatId: string,
    promptText: string,
    count: 1 | 4,
    sourceAttachment: typeof attachedImage,
    overrides?: { styleOverride?: ImageStyle; ratioOverride?: AspectRatio }
  ) => {
    setIsGeneratingImage(true);
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          aspectRatio: overrides?.ratioOverride || aspectRatio,
          style: overrides?.styleOverride || imageStyle,
          count,
          sourceImage: sourceAttachment
            ? { base64: sourceAttachment.base64, mimeType: sourceAttachment.mimeType }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image generation failed.');
      }

      const urls: string[] = Array.isArray(data.imageUrls)
        ? data.imageUrls
        : data.imageUrl
          ? [data.imageUrl]
          : [];

      const msgId = await saveMessage(chatId, {
        role: 'assistant',
        kind: 'image',
        content: data.caption || promptText,
        imageDataUrl: urls[0],
        imageUrls: urls,
        imagePrompt: promptText,
      });

      if (urls[0]) {
        const compressedThumb = await compressDataUrlForStorage(urls[0]);
        setSavedImages((prev) => [
          {
            id: msgId,
            chatId,
            prompt: promptText,
            imageUrl: compressedThumb,
            createdAtMs: Date.now(),
          },
          ...prev.slice(0, 29),
        ]);
      }
    } finally {
      setIsGeneratingImage(false);
    }
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
      : `Build a modern ${category} website with contact form and WhatsApp button`;
    void sendPrompt(nextPrompt);
  };

  const handleEditBuiltApp = async (editInstruction: string, currentHtml: string) => {
    if (isSending || isBuildingApp || !editInstruction.trim()) return;
    if (isChatLimitReached) return;
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
    forceImageMode?: boolean,
    bypassPermissionCheck?: boolean
  ) => {
    const currentAttachment = attachedImage;
    const raw = rawPrompt.trim();
    if (!raw || isSending) return;

    const callTarget =
      !forceImageMode && !imageMode && !currentAttachment ? detectCallIntent(raw) : null;

    if (callTarget) {
      if (!contactsPermission && !bypassPermissionCheck) {
        setCallPermissionPrompt({ pendingPrompt: raw });
        return;
      }

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

        const lowerTarget = callTarget.toLowerCase();
        const exactMatch = activeContacts.find((c) => c.name.toLowerCase() === lowerTarget);
        const partialMatch =
          exactMatch ||
          activeContacts.find(
            (c) =>
              c.name.toLowerCase().includes(lowerTarget) ||
              lowerTarget.includes(c.name.toLowerCase())
          );

        if (partialMatch) {
          await saveMessage(chatId, {
            role: 'assistant',
            kind: 'text',
            content: `[[NOVA_CALL:${partialMatch.name}|${partialMatch.phone}]]\n\nTap the green **Call** button when you're ready to call **${partialMatch.name}**.`,
          });
        } else {
          await saveMessage(chatId, {
            role: 'assistant',
            kind: 'text',
            content: `I couldn't find **${callTarget}** in your saved Contacts yet. Open **Contacts** in the sidebar to save their phone number, then say "Call ${callTarget}" again.`,
          });
        }
      } catch {
        // quiet recovery
      } finally {
        setIsSending(false);
        setTimeout(() => bottomInputRef.current?.focus(), 60);
      }
      return;
    }

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
      if (isChatLimitReached) return;
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
        setTimeout(() => bottomInputRef.current?.focus(), 60);
      }
      return;
    }

    const detected = detectImageIntent(raw, Boolean(currentAttachment));
    const useImage = forceImageMode ?? (imageMode || detected.isImage);
    const effectivePrompt = detected.cleanPrompt || raw;

    if (useImage && isImageLimitReached) {
      return;
    }
    if (!useImage && isChatLimitReached) {
      return;
    }

    setVoiceHint(null);
    setInputText('');
    setAttachedImage(null);
    setIsSending(true);
    setActiveView('chat');

    let activeSessionId: string | null = activeChatId;

    try {
      const chatId = await ensureChatSession(effectivePrompt);
      activeSessionId = chatId;
      const historyBefore = canUseFirestore
        ? firestoreMessages
        : guestMessagesByChat[chatId] || [];

      await saveMessage(chatId, {
        role: 'user',
        kind: useImage ? 'image' : 'text',
        content: raw,
        imageDataUrl: currentAttachment?.previewUrl,
      });

      if (useImage) {
        await incrementUsage('image');
        await runImageGeneration(chatId, effectivePrompt, 1, currentAttachment);
        setImageMode(false);
      } else {
        const updatedMem = extractMemoryFromPrompt(raw, memory);
        if (updatedMem !== memory) {
          setMemory(updatedMem);
          saveMemoryToStorage(storageUidKey, updatedMem);
        }

        await incrementUsage('chat');
        setStreamingContent('');
        const conversationPayload = [
          ...historyBefore.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: raw },
        ];

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversationPayload,
            uiLanguage: profile.language,
            memory: updatedMem,
            pastChatTitles: chats.slice(0, 6).map((c) => c.title),
            attachment: currentAttachment
              ? { base64: currentAttachment.base64, mimeType: currentAttachment.mimeType }
              : undefined,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('chat_unavailable');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            const parsed = JSON.parse(jsonStr) as {
              text?: string;
              done?: boolean;
              error?: string;
            };
            if (parsed.error) throw new Error('chat_unavailable');
            if (parsed.text) {
              accumulated += parsed.text;
              setStreamingContent(accumulated);
            }
          }
        }

        setStreamingContent('');
        if (accumulated.trim()) {
          await saveMessage(chatId, {
            role: 'assistant',
            kind: 'text',
            content: accumulated.trim(),
          });
        }
      }
    } catch {
      setStreamingContent('');
      setIsGeneratingImage(false);
      if (activeSessionId) {
        await saveMessage(activeSessionId, {
          role: 'assistant',
          kind: 'text',
          content: useImage
            ? "I couldn't create that image right now. Please try a different prompt or style."
            : "Sorry, I couldn't respond right now. Please try again in a moment.",
        }).catch(() => undefined);
      }
    } finally {
      setIsSending(false);
      setTimeout(() => bottomInputRef.current?.focus(), 60);
    }
  };

  const handleGenerateStudioImage = async ({
    mode,
    prompt,
    style,
    aspectRatio: studioRatio,
    sourceAttachment,
  }: {
    mode: ImageStudioMode;
    prompt: string;
    style: ImageStyle;
    aspectRatio: AspectRatio;
    sourceAttachment: typeof attachedImage;
  }) => {
    if (isSending || isGeneratingImage) return;
    if (isImageLimitReached) return;

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

    try {
      const chatId = await ensureChatSession(prompt.trim());
      await saveMessage(chatId, {
        role: 'user',
        kind: 'image',
        content: fullPrompt,
        imageDataUrl: sourceAttachment?.previewUrl,
      });
      await incrementUsage('image');
      await runImageGeneration(chatId, fullPrompt, 1, sourceAttachment, {
        styleOverride: style,
        ratioOverride: studioRatio,
      });
    } catch {
      // calm recovery without raw JSON banner
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateVariations = async (promptText: string) => {
    if (isSending) return;
    if (isImageLimitReached) return;
    setIsSending(true);
    try {
      const chatId = await ensureChatSession(promptText);
      await incrementUsage('image');
      await runImageGeneration(chatId, promptText, 4, null);
    } catch {
      // calm recovery
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
      {/* Limit Banner */}
      {(isChatLimitReached || (imageMode && isImageLimitReached)) && (
        <div className="rounded-2xl bg-[#1A1A22] border border-purple-500/40 px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white">
              {imageMode && isImageLimitReached ? t.imageLimitReachedTitle : t.limitReachedTitle}
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              {imageMode && isImageLimitReached ? t.imageLimitReachedDesc : t.limitReachedDesc}
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateUserPreferences({ plan: 'premium' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>{t.upgradeToPremium}</span>
          </button>
        </div>
      )}

      {/* Image Studio Controls above Chat Box when Image Mode is Active */}
      {imageMode && (
        <div className="rounded-2xl bg-[#14141C] border border-purple-500/25 p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {IMAGE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setImageStyle(style)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  imageStyle === style
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white'
                    : 'bg-[#1A1A22] text-slate-300 hover:text-white'
                }`}
              >
                {style}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/8">
            <div className="flex items-center gap-1.5 flex-wrap">
              {IMAGE_RATIOS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setAspectRatio(r.value)}
                  className={`px-2 py-0.5 rounded-xl text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    aspectRatio === r.value
                      ? 'bg-purple-500/25 border border-purple-400 text-purple-100'
                      : 'bg-[#1A1A22] border border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              {profile.plan === 'premium'
                ? t.unlimitedChats
                : `${Math.max(0, FREE_IMAGE_LIMIT - dailyImageUsed)}/${FREE_IMAGE_LIMIT} ${t.imagesLeftToday}`}
            </span>
          </div>
        </div>
      )}

      {/* Compact Rounded Bottom Chat Box */}
      <div className="rounded-3xl bg-[#12121A] nova-glow-box px-2.5 py-1.5 sm:px-3 sm:py-2 transition-all">
        {/* Attached Image Preview */}
        {attachedImage && (
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-xl bg-[#1A1A22] border border-purple-500/30 p-1.5 pe-2.5">
            <img
              src={attachedImage.previewUrl}
              alt={attachedImage.name}
              className="w-8 h-8 rounded-lg object-cover"
            />
            <div className="text-xs text-slate-200 max-w-[160px] truncate">
              {attachedImage.name}
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              aria-label="Remove attachment"
              className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Builder Action Strip inside Chat Input Area */}
        <div className="flex items-center justify-between gap-2 pb-1.5 mb-1 border-b border-white/6">
          <button
            type="button"
            onClick={() => void handleStartWebsiteBuilder()}
            disabled={isSending || isBuildingApp}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[#1A1A22] hover:bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Globe className="w-3 h-3 text-sky-300 shrink-0" />
            <span>🌐 Build Website / App</span>
          </button>
          {voiceHint && (
            <span className="text-[11px] text-slate-400 truncate">{voiceHint}</span>
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
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#1A1A22] border border-white/10 text-slate-200 hover:text-white hover:border-purple-400 transition-colors cursor-pointer shrink-0"
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
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
              }, 160);
            }}
            disabled={isChatLimitReached && !imageMode}
            placeholder={
              voiceHint
                ? voiceHint
                : isTranscribing
                  ? t.transcribing
                  : imageMode
                    ? t.imageInputPlaceholder
                    : t.inputPlaceholder
            }
            className="flex-1 min-w-0 resize-none bg-transparent text-sm sm:text-[15px] text-white placeholder:text-slate-400 focus:outline-none leading-5 py-2 px-1 max-h-28 overflow-y-auto disabled:opacity-50"
          />

          {/* Image Button */}
          <button
            type="button"
            onClick={() => setImageMode((v) => !v)}
            title={t.generateImage}
            aria-label={t.generateImage}
            className={`inline-flex items-center justify-center gap-1 h-9 px-2.5 sm:px-3 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
              imageMode
                ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] border-purple-400 text-white nova-btn-glow'
                : 'bg-[#1A1A22] border-white/10 text-slate-200 hover:text-white hover:border-purple-500/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
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
                ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                : 'bg-[#1A1A22] border-white/10 text-slate-200 hover:text-white hover:border-purple-500/40'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            ) : isRecording ? (
              <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          {/* Send Button: Purple Arrow Right */}
          <button
            type="button"
            onClick={() => void sendPrompt(inputText)}
            disabled={!inputText.trim() || isSending}
            aria-label={t.send}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] disabled:bg-white/10 disabled:from-white/10 disabled:to-white/10 disabled:text-slate-500 text-white nova-btn-glow disabled:shadow-none transition-all shrink-0 cursor-pointer"
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
      <p className="text-center text-[10px] text-slate-500 leading-none">{t.disclaimer}</p>
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0A0A0F] border-e border-white/8 w-[272px] shrink-0">
      {/* Top: Nova Logo + Collapse */}
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <NovaLogo size={30} />
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
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4 hidden md:block" />
          <X className="w-4 h-4 md:hidden" />
        </button>
      </div>

      {/* Purple Gradient New Chat Button */}
      <div className="px-3.5 pb-3 space-y-2.5">
        <button
          type="button"
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.newChat}</span>
        </button>

        {/* Chats / Images History Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#12121A] border border-white/8">
          <button
            type="button"
            onClick={() => setHistoryTab('chats')}
            className={`py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              historyTab === 'chats'
                ? 'bg-[#1A1A22] text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.chatsTab}
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab('images')}
            className={`py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              historyTab === 'images'
                ? 'bg-[#1A1A22] text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.imagesTab}
          </button>
        </div>

        {historyTab === 'chats' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchHistory}
              className="w-full rounded-2xl bg-[#12121A] border border-white/8 ps-8 pe-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50"
            />
          </div>
        )}
      </div>

      {/* History List OR Saved Images Gallery */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-2.5 py-1 space-y-1">
        {historyTab === 'chats' ? (
          filteredChats.length === 0 ? (
            <div className="px-3 py-6 text-xs text-slate-500 leading-relaxed">
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
                  className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#1A1A22] text-white border border-purple-500/35'
                      : 'text-slate-300 hover:bg-[#14141C] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-purple-400' : 'text-slate-500'
                      }`}
                    />
                    <span className="truncate font-medium">{chat.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteChat(chat.id, e)}
                    aria-label={t.deleteChat}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-400 transition-opacity shrink-0 cursor-pointer"
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
            <div className="rounded-2xl bg-[#12121A] border border-purple-500/20 p-2 space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-purple-300">Image Studio</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('images');
                    setMobileDrawerOpen(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
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
                    className={`px-2 py-1.5 rounded-xl text-[11px] font-medium text-start truncate transition-colors cursor-pointer ${
                      activeView === 'images' && studioMode === m
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white'
                        : 'bg-[#1A1A22] text-slate-300 hover:text-white hover:bg-[#22222C]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {allHistoryImages.length === 0 ? (
              <div className="px-2 py-4 text-xs text-slate-500 leading-relaxed">
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
                    className="relative group rounded-xl overflow-hidden border border-white/10 bg-[#1A1A22] cursor-pointer aspect-square"
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
                      className="opacity-0 group-hover:opacity-100 absolute bottom-1.5 end-1.5 p-1.5 rounded-lg bg-black/75 text-white transition-opacity"
                      aria-label={t.downloadImage}
                    >
                      <Download className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Smart Features Nav: Contacts & Daily Wallpaper */}
      <div className="px-3.5 py-2 border-t border-white/8 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            setActiveView('contacts');
            setMobileDrawerOpen(false);
          }}
          className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-2xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
            activeView === 'contacts'
              ? 'bg-[#1A1A22] border-purple-500/50 text-white'
              : 'bg-[#12121A] border-white/8 text-slate-300 hover:text-white hover:border-purple-500/35'
          }`}
        >
          <Phone className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Contacts</span>
        </button>

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
              ? 'bg-[#1A1A22] border-purple-500/50 text-white'
              : 'bg-[#12121A] border-white/8 text-slate-300 hover:text-white hover:border-purple-500/35'
          }`}
        >
          <Wallpaper className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Wallpaper</span>
        </button>
      </div>

      {/* Bottom: User Profile + Sign Out + Upgrade to Premium Button */}
      <div className="p-3.5 border-t border-white/8 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveView('profile');
              setMobileDrawerOpen(false);
            }}
            className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-2xl border transition-colors min-w-0 cursor-pointer ${
              activeView === 'profile'
                ? 'bg-[#1A1A22] border-purple-500/50 text-white'
                : 'bg-[#12121A] border-white/8 text-slate-200 hover:border-purple-500/35'
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
              <div className="w-8 h-8 rounded-xl bg-purple-600/25 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4 text-purple-300" />
              </div>
            )}
            <div className="min-w-0 text-start">
              <div className="text-xs font-semibold text-white truncate">
                {authUser
                  ? authUser.displayName || profile.displayName || authUser.email?.split('@')[0] || 'Nova User'
                  : 'Guest'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
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
            className="p-2.5 rounded-2xl bg-[#12121A] border border-white/8 text-slate-300 hover:text-white hover:border-purple-500/35 transition-colors shrink-0 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!authUser && (
            <button
              type="button"
              onClick={handleSignInGoogle}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-medium bg-[#1A1A22] hover:bg-[#22222C] border border-white/10 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 text-purple-300" />
              <span>Google Sign In</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-medium bg-[#12121A] hover:bg-[#1E1E28] border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>{authUser ? t.signOut : 'Exit Guest'}</span>
          </button>
        </div>

        {profile.plan === 'free' && (
          <button
            type="button"
            onClick={() => updateUserPreferences({ plan: 'premium' })}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all whitespace-nowrap cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>{t.upgradeToPremium}</span>
          </button>
        )}
      </div>
    </div>
  );

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#06070B] text-white flex flex-col items-center justify-center gap-5">
        <div className="relative flex items-center justify-center w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-sky-400/30 blur-2xl animate-pulse" />
          <div
            className="relative w-20 h-20 rounded-full border border-white/70 shadow-[0_0_50px_rgba(56,189,248,0.8)] flex items-center justify-center"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #E0F2FE 25%, #38BDF8 60%, #2563EB 86%, #1E3A8A 100%)',
            }}
          >
            <NovaLogo size={28} glow={false} />
          </div>
        </div>
        <p className="text-xs text-sky-200/80 tracking-wide">Starting Nova...</p>
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
    <div className="flex h-[100dvh] w-full bg-[#0A0A0F] text-white overflow-hidden relative">
      {wallpaperState.appliedAsBackground && wallpaperState.currentImageUrl && (
        <img
          src={wallpaperState.currentImageUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="fixed inset-0 w-full h-full object-cover opacity-20 pointer-events-none z-0"
        />
      )}

      {/* Desktop Sidebar */}
      {sidebarOpen && <aside className="hidden md:flex h-full min-h-0 z-20">{sidebarContent}</aside>}

      {/* Mobile Drawer Sidebar */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative z-50 flex h-full min-h-0">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative z-10 ${
          wallpaperState.appliedAsBackground && wallpaperState.currentImageUrl
            ? 'bg-[#0A0A0F]/80'
            : 'bg-[#0A0A0F]'
        }`}
      >
        {/* Top Bar: Left = Nova name + Star icon | Right = Share + Voice + Premium */}
        <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 border-b border-white/8 bg-[#0A0A0F]/90 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 md:hidden cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Expand sidebar"
                className="hidden md:inline-flex p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer shrink-0"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-2 cursor-pointer shrink-0"
            >
              <NovaLogo size={26} glow={false} />
              <span className="text-base font-semibold text-white whitespace-nowrap">
                {t.appName}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium bg-[#1A1A22] border border-white/10 text-white hover:border-purple-500/45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-purple-300" />
              <span>Share Nova</span>
            </button>

            <button
              type="button"
              onClick={() => setVoiceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium bg-[#1A1A22] border border-purple-500/35 text-white hover:border-purple-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <AudioLines className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.voiceShort}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                profile.plan === 'premium'
                  ? setActiveView('profile')
                  : updateUserPreferences({ plan: 'premium' })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>{t.premiumShort}</span>
            </button>

            <button
              type="button"
              onClick={() => setRightMenuOpen(true)}
              aria-label="Open Nova menu"
              title="Open Nova menu"
              className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-[#1A1A22] border border-white/10 text-slate-200 hover:text-white hover:border-purple-500/45 transition-colors shrink-0 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Welcome Toast after Google/Email Login */}
        {welcomeBanner && (
          <div className="mx-auto mt-2 px-4 w-full max-w-[800px] shrink-0">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-sky-500/15 border border-sky-400/40 px-4 py-2 text-xs text-sky-100">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sky-300 shrink-0" />
                <span className="font-medium">{welcomeBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setWelcomeBanner(null)}
                className="p-1 text-sky-200 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Active View: Profile, Contacts, Wallpaper, Images Studio, Space, OR Chat */}
        {activeView === 'profile' ? (
          <UserProfileView
            isSignedIn={Boolean(authUser)}
            profile={profile}
            dailyUsed={dailyUsed}
            dailyImageUsed={dailyImageUsed}
            onBackToChat={() => setActiveView('chat')}
            onSignInGoogle={handleSignInGoogle}
            onSignOut={handleSignOut}
            onChangeLanguage={(lang) => updateUserPreferences({ language: lang })}
            onChangeVoice={(voice) => updateUserPreferences({ voiceName: voice })}
            onChangePlan={(plan) => updateUserPreferences({ plan })}
            onClearHistory={handleClearAllHistory}
            t={t}
          />
        ) : activeView === 'contacts' ? (
          <ContactsView
            contacts={activeContacts}
            permissionGranted={contactsPermission}
            onGrantPermission={handleGrantContactsPermission}
            onAddContact={handleAddContact}
            onDeleteContact={handleDeleteContact}
            onAskCallInChat={(contact) => {
              setActiveView('chat');
              setMobileDrawerOpen(false);
              void sendPrompt(`Call ${contact.name}`);
            }}
            onBackToChat={() => setActiveView('chat')}
          />
        ) : activeView === 'wallpaper' ? (
          <WallpaperView
            state={wallpaperState}
            onUpdateState={updateWallpaperState}
            onGenerateWallpaper={handleGenerateWallpaper}
            isGenerating={isGeneratingWallpaper}
            onBackToChat={() => setActiveView('chat')}
          />
        ) : activeView === 'images' ? (
          <ImagesGalleryView
            images={allHistoryImages}
            activeMode={studioMode}
            onSelectMode={setStudioMode}
            onGenerateStudioImage={handleGenerateStudioImage}
            onCreateVariations={handleCreateVariations}
            isGenerating={isGeneratingImage || isSending}
            onOpenChat={(chatId) => {
              setActiveChatId(chatId);
              setActiveView('chat');
            }}
            onBackToChat={() => setActiveView('chat')}
          />
        ) : activeView === 'space' ? (
          <SpaceView
            chats={chats}
            images={allHistoryImages}
            uploadedFiles={spaceUploadedFiles}
            onOpenChat={(chatId) => {
              setActiveChatId(chatId);
              setActiveView('chat');
            }}
            onDeleteChat={handleDeleteChat}
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
                      <NovaLogo size={52} />
                      <h1
                        className="text-2xl sm:text-4xl font-semibold text-white tracking-tight max-w-xl"
                        style={{ textWrap: 'balance' }}
                      >
                        {t.heroTitle}
                      </h1>
                      <p className="text-sm sm:text-base text-slate-400 max-w-lg">
                        {t.heroSubtitle}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                      {starterCards.map((card, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => void sendPrompt(card.prompt, card.isImage)}
                          className="group rounded-2xl bg-[#12121A] border border-white/8 hover:border-purple-500/45 px-4 py-3.5 text-start transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-white">
                              {card.title}
                            </span>
                            {card.isImage && (
                              <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">
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
                      isEditingBuiltApp={isBuildingApp}
                      onCreateVariations={(prompt) => void handleCreateVariations(prompt)}
                      onEditBuiltApp={(instruction, html) => void handleEditBuiltApp(instruction, html)}
                      onQuickPickBuilderCategory={handleQuickPickBuilderCategory}
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
                    />
                  )}

                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </main>

            <footer className="shrink-0 border-t border-white/8 bg-[#0A0A0F]/95 backdrop-blur-sm px-3 sm:px-6 pt-2 pb-2.5 z-20">
              {renderComposer()}
            </footer>
          </>
        )}
      </div>

      {/* Live Voice Chat Modal */}
      <VoiceChatModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        voiceName={profile.voiceName}
        voiceSpeed={voiceSpeed}
        onChangeVoice={(voice) => updateUserPreferences({ voiceName: voice })}
        onChangeSpeed={handleChangeVoiceSpeed}
        memorySummary={formatMemorySummary(memory)}
        language={profile.language}
        t={t}
      />

      {/* Quick Customize & Memory Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        profile={profile}
        voiceSpeed={voiceSpeed}
        memory={memory}
        onChangeLanguage={(lang) => updateUserPreferences({ language: lang })}
        onChangeVoice={(voice) => updateUserPreferences({ voiceName: voice })}
        onChangeVoiceSpeed={handleChangeVoiceSpeed}
        onChangePlan={(plan) => updateUserPreferences({ plan })}
        onUpdateMemory={handleUpdateMemory}
        onClearMemory={handleClearMemory}
        t={t}
      />

      {/* Chat-triggered Contacts Permission Popup */}
      {callPermissionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1A1A22] border border-purple-500/35 p-6 shadow-[0_0_60px_-15px_rgba(168,85,247,0.6)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-600/25 border border-purple-500/40 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-purple-300" />
              </div>
              <h2 className="text-base font-semibold text-white">
                Allow Nova to access contacts to make calls?
              </h2>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Nova only checks your saved contacts to display a Call Card with a green Call button. Nova will never place a call automatically without your tap.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCallPermissionPrompt(null)}
                className="px-4 py-2 rounded-2xl text-xs font-medium bg-white/8 hover:bg-white/14 text-slate-200 cursor-pointer"
              >
                Not Now
              </button>
              <button
                type="button"
                onClick={handleGrantContactsPermission}
                className="px-4 py-2 rounded-2xl text-xs font-semibold bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white nova-btn-glow cursor-pointer"
              >
                Allow Access
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Right ChatGPT-Style Sidebar Menu */}
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
        onOpenCustomize={() => setSettingsModalOpen(true)}
        chats={chats}
        images={allHistoryImages}
        onOpenChat={(chatId) => {
          setActiveChatId(chatId);
          setActiveView('chat');
        }}
      />

      {/* Share & Grow Nova Modal */}
      <ShareNovaModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        isPremium={profile.plan === 'premium'}
        onUnlockFreePremium={() => void updateUserPreferences({ plan: 'premium' })}
      />
    </div>
  );
}
