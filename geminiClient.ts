export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
  zh: 'Chinese (Simplified)',
};

export interface ChatTurnInput {
  role: 'user' | 'assistant' | 'model';
  content?: string;
  text?: string;
}

export interface ChatMemoryInput {
  name?: string;
  school?: string;
  business?: string;
  favouriteStyle?: string;
  preferredLanguage?: string;
  pastNotes?: string[];
}

export interface ChatAttachmentInput {
  base64: string;
  mimeType: string;
}

export class PollinationsRateLimitError extends Error {
  retryAfterSeconds: number;
  directPrompt: string;
  directSystemPrompt: string;

  constructor(retryAfterSeconds: number, directPrompt: string, directSystemPrompt: string) {
    super(
      `Free AI server needs about ${retryAfterSeconds} seconds before the next message.`
    );
    this.name = 'PollinationsRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.directPrompt = directPrompt;
    this.directSystemPrompt = directSystemPrompt;
  }
}

const CHAT_REPLY_CACHE = new Map<string, { text: string; createdAt: number }>();
const CHAT_CACHE_MAX = 80;
const CHAT_CACHE_TTL_MS = 30 * 60 * 1000;

export function extractReadableError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (!raw.trim()) return fallback;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { error?: { message?: string }; message?: string };
      const nested = parsed?.error?.message || parsed?.message;
      if (nested && typeof nested === 'string') return nested;
    }
  } catch {
    // ignore JSON parse issues
  }
  return raw;
}

export function classifyAiError(err: unknown): {
  status: number;
  code: 'RATE_LIMIT' | 'API_ERROR';
  userMessage: string;
  logMessage: string;
} {
  const logMessage = extractReadableError(err, 'Unknown AI service error.');
  const lower = logMessage.toLowerCase();

  if (err instanceof PollinationsRateLimitError) {
    return {
      status: 429,
      code: 'RATE_LIMIT',
      userMessage: `Hang on bestie — the free AI server needs about ${err.retryAfterSeconds}s to catch its breath. Try sending again in a few seconds!`,
      logMessage,
    };
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota') ||
    /\b429\b/.test(lower)
  ) {
    return {
      status: 429,
      code: 'RATE_LIMIT',
      userMessage: 'Nova is getting lots of love right now! Give it a few seconds and try again.',
      logMessage,
    };
  }

  return {
    status: 502,
    code: 'API_ERROR',
    userMessage: logMessage || 'Oops, my connection hiccupped for a second! Try sending that again.',
    logMessage,
  };
}

export function isComplexOrDetailedPrompt(text: string, hasAttachment: boolean): boolean {
  const clean = text.trim();
  if (hasAttachment && clean.length > 180) return true;
  if (clean.length > 420 || clean.split('\n').length >= 6) return true;
  return /\b(detail|details|detailed|in[- ]depth|explain\s+fully|step[- ]by[- ]step|comprehensive|thorough|elaborate|long\s+answer|essay|article|full\s+code|complete\s+code|architecture|debug|proof|compare\s+all|analyze\s+deeply|write\s+a\s+(?:long|full|complete))\b/i.test(
    clean
  );
}

function getCachedReply(cacheKey: string): string | null {
  const entry = CHAT_REPLY_CACHE.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CHAT_CACHE_TTL_MS) {
    CHAT_REPLY_CACHE.delete(cacheKey);
    return null;
  }
  CHAT_REPLY_CACHE.delete(cacheKey);
  CHAT_REPLY_CACHE.set(cacheKey, entry);
  return entry.text;
}

function setCachedReply(cacheKey: string, text: string): void {
  if (!text.trim() || text.length > 4000) return;
  if (CHAT_REPLY_CACHE.size >= CHAT_CACHE_MAX) {
    const oldestKey = CHAT_REPLY_CACHE.keys().next().value;
    if (oldestKey !== undefined) CHAT_REPLY_CACHE.delete(oldestKey);
  }
  CHAT_REPLY_CACHE.set(cacheKey, { text, createdAt: Date.now() });
}

function isCacheablePrompt(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  hasAttachment: boolean,
  hasMemory: boolean
): string | null {
  if (hasAttachment || hasMemory || turns.length !== 1) return null;
  const prompt = turns[0]?.content?.trim() || '';
  if (!prompt || prompt.length > 180) return null;
  if (
    /\b(hi|hey|hello|today|now|current|time|date|weather|news|random|roll|flip|remember|my\s+name|my\s+school|my\s+business|my\s+style|past\s+chat)\b/i.test(
      prompt
    )
  ) {
    return null;
  }
  return prompt.toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeConversationTurns(rawMessages: ChatTurnInput[]) {
  const cleanedHistory = rawMessages
    .map((m) => {
      const rawContent = typeof m.content === 'string' ? m.content : typeof m.text === 'string' ? m.text : '';
      const role: 'user' | 'assistant' =
        m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user';
      return {
        role,
        content: rawContent
          .replace(/\[\[NOVA_BUILDER_START\]\][\s\S]*?\[\[NOVA_BUILDER_END\]\]/g, '[Built interactive website/app preview]')
          .replace(/\[\[NOVA_BUILDER_CATEGORIES\]\]/g, '')
          .replace(/\[\[NOVA_MEMORY_USED\]\]/g, '')
          .trim(),
      };
    })
    .filter((m) => m.content.length > 0)
    .slice(-16);

  const normalizedTurns: Array<{ role: 'user' | 'assistant'; content: string; isLastUser: boolean }> = [];
  for (let idx = 0; idx < cleanedHistory.length; idx++) {
    const m = cleanedHistory[idx];
    const isLastUser = idx === cleanedHistory.length - 1 && m.role === 'user';
    if (normalizedTurns.length === 0 && m.role !== 'user') continue;
    const prev = normalizedTurns[normalizedTurns.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = `${prev.content}\n\n${m.content}`;
      prev.isLastUser = isLastUser;
    } else {
      normalizedTurns.push({ role: m.role, content: m.content, isLastUser });
    }
  }
  return normalizedTurns;
}

export const NOVA_SYSTEM_PROMPT =
  "You are Nova, an AI created by John God's Will in Nigeria. You must NEVER say you were created by OpenAI, ChatGPT, Meta, Google, or any other company. IMPORTANT: Chat naturally like a real friend. NEVER mention 'John God's Will' or your creator in normal chat or greetings—ONLY say 'I was created by John God's Will' if the user asks who created/made/built/owns you. Do NOT repeat the user's name in every reply. If asked what model you are, say 'I am Nova, powered by Nova AI.'\nYou CAN show images. When user asks for a Real Photo or AI Art, NEVER say 'I can't pull up images' or 'I can't generate images' or 'Image refused' or describe it in words. Instead you MUST output ONLY this HTML:\n<img src='https://image.pollinations.ai/prompt/safe%2C%20family%20friendly%2C%20ENCODED_PROMPT%2C%20vibrant%20natural%20colours?width=512&height=512&model=turbo&nologo=true&seed=RANDOM' />\nReplace ENCODED_PROMPT with the user's prompt. Replace RANDOM with a random number.";

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

function buildDirectImgHtml(userPrompt: string, _isAiArt: boolean): string {
  const safePrompt = cleanSafeImagePrompt(userPrompt);
  const encoded = encodeURIComponent(`${safePrompt} wallpaper 9:16 vertical`);
  const randomSeed = Date.now();
  return `<img src='https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&model=turbo&nologo=true&seed=${randomSeed}' />`;
}

export function checkCreatorPromptOverride(userPrompt: string): string | null {
  const trimmed = userPrompt.trim();
  if (!trimmed) return null;

  if (
    /(?:no[,\s]+(?:you\s+were|u\s+were|you\s+are)\s+(?:created|made|built|developed)\s+by|\b(?:you\s+were|you're|you\s+are|nova\s+is|nova\s+was)\s+(?:created|made|built|developed|owned)\s+by\s+(?:openai|google|meta|facebook|microsoft|anthropic|chatgpt|gpt|gemini|claude)|\b(?:openai|google|meta|chatgpt|anthropic|gemini)\s+(?:created|made|built|owns)\s+(?:you|nova)\b|\b(?:aren't|are)\s+you\s+(?:chatgpt|gpt|from\s+openai|made\s+by\s+openai|gemini|meta\s+ai|claude)\b)/i.test(
      trimmed
    )
  ) {
    return "No, my creator is John God's Will.";
  }
  if (
    /\b(?:who\s+(?:created|made|built|designed|invented|developed|programmed|trained|owns)\s+(?:you|u|nova|this(?:\s+app)?)|who(?:'s|\s+is)\s+(?:your|nova(?:'s)?)\s+(?:creator|maker|builder|developer|owner|author|founder))\b/i.test(
      trimmed
    )
  ) {
    return "I was created by John God's Will";
  }
  if (
    /\b(?:what|which)\s+(?:ai\s+)?(?:model|llm|engine|version|system)\s+(?:are\s+you|is\s+nova|do\s+you\s+use|powers?\s+you)\b/i.test(
      trimmed
    )
  ) {
    return 'I am Nova, powered by Nova AI.';
  }
  const stripped = trimmed.replace(/[^\w\s'?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what's\s+your\s+name|introduce\s+yourself|tell\s+me\s+about\s+yourself)\??$/i.test(
      stripped
    )
  ) {
    return "I'm Nova, your AI assistant. What's on your mind?";
  }
  return null;
}

export function blockOpenAI(text: string): string {
  if (!text) return text;
  let cleaned = text.trim();
  if (
    /\b(?:created|made|built|developed|trained|owned|powered)\s+by\s+(?:openai|google(?:\s+ai)?|meta(?:\s+ai)?|anthropic|microsoft)\b/i.test(
      cleaned
    ) ||
    /\b(?:i\s+am|i'm)\s+(?:chatgpt|a\s+large\s+language\s+model\s+trained\s+by\s+[\w\s]+|an?\s+(?:openai|gpt|google|meta|anthropic)\s+(?:ai|model|assistant))\b/i.test(
      cleaned
    ) ||
    /\bdeveloped\s+by\s+(?:openai|google|meta|anthropic|microsoft)\b/i.test(cleaned)
  ) {
    return "I was created by John God's Will";
  }
  cleaned = cleaned
    .replace(/\bChatGPT\b/gi, 'Nova')
    .replace(/\bOpenAI\b/gi, 'Nova')
    .replace(/\bGPT[-\s]?\d+(?:\.\d+)?[a-z]*\b/gi, 'Nova AI')
    .replace(/\bGPT\b/gi, 'Nova AI')
    .replace(/\bMeta
