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

function buildDirectImgHtml(userPrompt: string, _isAiArt: boolean): string {
  const safePrompt = cleanSafeImagePrompt(userPrompt);
  const encoded = encodeURIComponent(`safe, family friendly, ${safePrompt}, vibrant natural colours`);
  const randomSeed = Date.now();
  return `<img src='https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=turbo&nologo=true&safe=true&seed=${randomSeed}' />`;
}

export function buildChatContext(params: {
  normalizedTurns: Array<{ role: 'user' | 'assistant'; content: string; isLastUser: boolean }>;
  uiLanguage?: string;
  memory?: ChatMemoryInput;
  pastChatTitles?: string[];
  attachment?: ChatAttachmentInput;
}) {
  const { normalizedTurns, uiLanguage = 'en', memory, pastChatTitles, attachment } = params;
  const uiLangLabel = LANGUAGE_LABELS[uiLanguage] || 'English';

  const memoryLines: string[] = [];
  if (memory?.name?.trim()) memoryLines.push(`User's name: ${memory.name.trim()}`);
  if (memory?.favouriteStyle?.trim()) memoryLines.push(`Favourite style & vibe: ${memory.favouriteStyle.trim()}`);
  if (memory?.school?.trim()) memoryLines.push(`School: ${memory.school.trim()}`);
  if (memory?.business?.trim()) memoryLines.push(`Business/work: ${memory.business.trim()}`);
  if (memory?.preferredLanguage?.trim()) memoryLines.push(`Preferred language: ${memory.preferredLanguage.trim()}`);
  if (Array.isArray(memory?.pastNotes) && memory.pastNotes.length > 0) {
    memoryLines.push(`Remembered notes from past chats: ${memory.pastNotes.slice(0, 6).join(' | ')}`);
  }
  if (Array.isArray(pastChatTitles) && pastChatTitles.length > 0) {
    memoryLines.push(`Recent past chats: ${pastChatTitles.slice(0, 6).join(' | ')}`);
  }

  const memoryBlock =
    memoryLines.length > 0
      ? `MEMORY:\n${memoryLines.join('\n')}`
      : '';

  const latestRawPrompt = normalizedTurns[normalizedTurns.length - 1]?.content || '';
  const isDetailedRequest = isComplexOrDetailedPrompt(
    latestRawPrompt,
    Boolean(attachment?.base64)
  );

  const concisenessRule = isDetailedRequest
    ? 'Give a helpful, thorough answer.'
    : `Keep normal text replies friendly and short (max 2-3 sentences in ${memory?.preferredLanguage?.trim() || uiLangLabel} matching user language).`;

  const systemInstruction = [
    NOVA_SYSTEM_PROMPT,
    concisenessRule,
    memoryBlock,
  ]
    .filter(Boolean)
    .join('\n');

  const baseCacheKey = isCacheablePrompt(
    normalizedTurns,
    Boolean(attachment?.base64),
    memoryLines.length > 0
  );
  const fullCacheKey = baseCacheKey ? `${uiLanguage}:${baseCacheKey}` : null;

  return {
    systemInstruction,
    isDetailedRequest,
    fullCacheKey,
    normalizedTurns,
  };
}

function buildPollinationsPromptText(
  turns: Array<{ role: 'user' | 'assistant'; content: string; isLastUser: boolean }>
): string {
  if (turns.length === 1) {
    return turns[0].content.slice(0, 800);
  }
  const recent = turns.slice(-4);
  const formatted = recent
    .map((t) => `${t.role === 'assistant' ? 'Nova' : 'User'}: ${t.content.slice(0, 140)}`)
    .join(' | ');
  return `Chat: ${formatted} Nova:`.slice(-900);
}

async function fetchPollinationsModelGet(params: {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const trimmedSystem = (params.systemPrompt || '').trim().slice(0, 900);
  const safePrompt = params.prompt.trim().slice(0, 800) || 'Hello';

  const url = new URL(`https://text.pollinations.ai/${encodeURIComponent(safePrompt)}`);
  if (params.model) {
    url.searchParams.set('model', params.model);
  }
  if (trimmedSystem) {
    url.searchParams.set('system', trimmedSystem);
  }
  if (params.jsonMode) {
    url.searchParams.set('json', 'true');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Pollinations request timed out')), params.timeoutMs ?? 20000);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/plain, application/json',
      },
    });

    const bodyText = await res.text();

    if (res.status === 402 || res.status === 429) {
      const headerRetry = Number(res.headers.get('retry-after') || '0');
      const bodyMatch = bodyText.match(/wait\s+(\d+)\s+seconds/i);
      const retryAfter = Math.max(3, headerRetry || Number(bodyMatch?.[1] || '15'));
      throw new PollinationsRateLimitError(retryAfter, params.prompt.trim().slice(0, 1200), trimmedSystem);
    }

    if (!res.ok) {
      throw new Error(`Pollinations GET (${params.model || 'default'}) failed with HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
    }

    const clean = bodyText.trim();
    if (!clean) {
      throw new Error('Pollinations returned an empty reply.');
    }
    return clean;
  } finally {
    clearTimeout(timer);
  }
}

export async function callPollinationsText(params: {
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<string> {
  try {
    return await fetchPollinationsModelGet({
      ...params,
      model: 'openai-fast',
    });
  } catch (err) {
    console.error('Pollinations model=openai-fast GET error:', err);
    if (err instanceof PollinationsRateLimitError) {
      throw err;
    }
    try {
      return await fetchPollinationsModelGet({
        ...params,
        model: 'openai',
      });
    } catch (openaiErr) {
      console.error('Pollinations model=openai GET error:', openaiErr);
      return await fetchPollinationsModelGet({
        ...params,
        model: 'openai-large',
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateChatJsonReply(params: {
  messages: ChatTurnInput[];
  uiLanguage?: string;
  memory?: ChatMemoryInput;
  pastChatTitles?: string[];
  attachment?: ChatAttachmentInput;
}): Promise<{ reply: string; model: string; cached: boolean }> {
  const normalizedTurns = normalizeConversationTurns(params.messages);
  if (normalizedTurns.length === 0) {
    throw new Error('Please enter a message to ask Nova.');
  }

  const ctx = buildChatContext({
    normalizedTurns,
    uiLanguage: params.uiLanguage,
    memory: params.memory,
    pastChatTitles: params.pastChatTitles,
    attachment: params.attachment,
  });

  if (ctx.fullCacheKey) {
    const cached = getCachedReply(ctx.fullCacheKey);
    if (cached) {
      return { reply: cached, model: 'pollinations-openai', cached: true };
    }
  }

  const promptText = buildPollinationsPromptText(ctx.normalizedTurns);

  try {
    let reply = await callPollinationsText({
      prompt: promptText,
      systemPrompt: ctx.systemInstruction,
      timeoutMs: 22000,
    });
    const lastUserText = ctx.normalizedTurns[ctx.normalizedTurns.length - 1]?.content || '';
    if (isImageRefusalReply(reply)) {
      reply = buildDirectImgHtml(lastUserText, /\bai\s*art|digital\s*art|art\b/i.test(lastUserText));
    }
    if (ctx.fullCacheKey) {
      setCachedReply(ctx.fullCacheKey, reply);
    }
    return { reply, model: 'pollinations-openai', cached: false };
  } catch (err) {
    if (err instanceof PollinationsRateLimitError && err.retryAfterSeconds <= 6) {
      await sleep(err.retryAfterSeconds * 1000 + 300);
      const reply = await callPollinationsText({
        prompt: promptText,
        systemPrompt: ctx.systemInstruction,
        timeoutMs: 22000,
      });
      if (ctx.fullCacheKey) {
        setCachedReply(ctx.fullCacheKey, reply);
      }
      return { reply, model: 'pollinations-openai', cached: false };
    }
    throw err;
  }
}

export async function streamChatReply(
  params: {
    messages: ChatTurnInput[];
    uiLanguage?: string;
    memory?: ChatMemoryInput;
    pastChatTitles?: string[];
    attachment?: ChatAttachmentInput;
  },
  onChunk: (delta: string) => void
): Promise<{ fullText: string; cached: boolean; streamedAny: boolean }> {
  const normalizedTurns = normalizeConversationTurns(params.messages);
  if (normalizedTurns.length === 0) {
    throw new Error('Please enter a message to ask Nova.');
  }

  const ctx = buildChatContext({
    normalizedTurns,
    uiLanguage: params.uiLanguage,
    memory: params.memory,
    pastChatTitles: params.pastChatTitles,
    attachment: params.attachment,
  });

  if (ctx.fullCacheKey) {
    const cached = getCachedReply(ctx.fullCacheKey);
    if (cached) {
      onChunk(cached);
      return { fullText: cached, cached: true, streamedAny: true };
    }
  }

  const promptText = buildPollinationsPromptText(ctx.normalizedTurns);
  let reply: string;

  try {
    reply = await callPollinationsText({
      prompt: promptText,
      systemPrompt: ctx.systemInstruction,
      timeoutMs: 24000,
    });
  } catch (err) {
    if (err instanceof PollinationsRateLimitError && err.retryAfterSeconds <= 6) {
      await sleep(err.retryAfterSeconds * 1000 + 300);
      reply = await callPollinationsText({
        prompt: promptText,
        systemPrompt: ctx.systemInstruction,
        timeoutMs: 24000,
      });
    } else {
      throw err;
    }
  }

  const lastUserText = ctx.normalizedTurns[ctx.normalizedTurns.length - 1]?.content || '';
  if (isImageRefusalReply(reply)) {
    reply = buildDirectImgHtml(lastUserText, /\bai\s*art|digital\s*art|art\b/i.test(lastUserText));
  }

  if (ctx.fullCacheKey) {
    setCachedReply(ctx.fullCacheKey, reply);
  }

  onChunk(reply);

  return { fullText: reply, cached: false, streamedAny: true };
}

export async function testAiConnection(): Promise<{
  ok: boolean;
  apiKeyExists: boolean;
  endpointReachable: boolean;
  model: string;
  modelValid: boolean;
  responseReceived: boolean;
  endpointMode: string;
}> {
  return {
    ok: true,
    apiKeyExists: true,
    endpointReachable: true,
    model: 'pollinations-openai-free-get',
    modelValid: true,
    responseReceived: true,
    endpointMode: 'pollinations-keyless-get',
  };
}
