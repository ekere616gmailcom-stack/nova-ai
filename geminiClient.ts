import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export const GEMINI_MODELS = {
  fastText: 'gemini-3.1-flash-lite',
  complexText: 'gemini-4-hydrogen',
  imagePreview: 'gemini-2.0-flash-preview-image-generation',
  imagePrimary: 'gemini-3.1-flash-lite-image',
  imageFallback: 'gemini-nano-banana-2.1',
  tts: 'gemini-3.8-flash-lite-tts',
  live: 'gemini-3.8-live',
} as const;

export const FAST_TEXT_MODELS = [GEMINI_MODELS.fastText, GEMINI_MODELS.complexText] as const;
export const COMPLEX_TEXT_MODELS = [GEMINI_MODELS.complexText, GEMINI_MODELS.fastText] as const;
export const VALID_IMAGE_MODELS = [
  GEMINI_MODELS.imagePreview,
  GEMINI_MODELS.imagePrimary,
  GEMINI_MODELS.imageFallback,
] as const;

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

const CHAT_REPLY_CACHE = new Map<string, { text: string; createdAt: number }>();
const CHAT_CACHE_MAX = 80;
const CHAT_CACHE_TTL_MS = 30 * 60 * 1000;

export function getGeminiApiKey(): string | undefined {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.API_KEY,
  ];
  for (const val of candidates) {
    const trimmed = val?.trim();
    if (trimmed && trimmed !== 'MY_GEMINI_API_KEY') {
      return trimmed;
    }
  }
  return undefined;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function sanitizeErrorForLog(text: string): string {
  const key = getGeminiApiKey();
  let safe = text || '';
  if (key && safe.includes(key)) {
    safe = safe.split(key).join('[REDACTED_API_KEY]');
  }
  return safe.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_API_KEY]');
}

export function extractReadableGeminiError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (!raw.trim()) return fallback;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { error?: { message?: string }; message?: string };
      const nested = parsed?.error?.message || parsed?.message;
      if (nested && typeof nested === 'string') return sanitizeErrorForLog(nested);
    }
  } catch {
    // ignore JSON parse issues
  }
  return sanitizeErrorForLog(raw);
}

export function isQuotaOrBillingError(err: unknown): boolean {
  const msg = extractReadableGeminiError(err, '').toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('limit: 0') ||
    msg.includes('billing') ||
    msg.includes('429')
  );
}

export type GeminiErrorCategory =
  | 'AUTH_ERROR'
  | 'INVALID_MODEL'
  | 'RATE_LIMIT'
  | 'API_ERROR';

export function classifyGeminiError(err: unknown): {
  status: number;
  code: GeminiErrorCategory;
  userMessage: string;
  logMessage: string;
} {
  const logMessage = extractReadableGeminiError(err, 'Unknown Gemini API error.');
  const lower = logMessage.toLowerCase();

  if (
    lower.includes('gemini_api_key is not configured') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated') ||
    /\b401\b/.test(lower) ||
    /\b403\b/.test(lower)
  ) {
    return {
      status: 503,
      code: 'AUTH_ERROR',
      userMessage:
        "Nova couldn't authenticate with its AI service. Please verify the GEMINI_API_KEY environment variable on the server.",
      logMessage,
    };
  }

  if (
    lower.includes('not_found') ||
    lower.includes('not found') ||
    lower.includes('unsupported model') ||
    lower.includes('invalid model') ||
    /\b404\b/.test(lower)
  ) {
    return {
      status: 502,
      code: 'INVALID_MODEL',
      userMessage:
        "Nova's configured AI model could not be reached. Please try again shortly.",
      logMessage,
    };
  }

  if (
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota') ||
    /\b429\b/.test(lower)
  ) {
    return {
      status: 429,
      code: 'RATE_LIMIT',
      userMessage:
        'Nova is receiving too many requests right now. Please wait a moment and try again.',
      logMessage,
    };
  }

  return {
    status: 502,
    code: 'API_ERROR',
    userMessage: "Nova couldn't connect to its AI service. Please try again.",
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
  if (!prompt || prompt.length > 240) return null;
  if (
    /\b(today|now|current|time|date|weather|news|random|roll|flip|remember|my\s+name|my\s+school|my\s+business)\b/i.test(
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
    .slice(-24);

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
  if (memory?.name?.trim()) memoryLines.push(`Name: ${memory.name.trim()}`);
  if (memory?.school?.trim()) memoryLines.push(`School: ${memory.school.trim()}`);
  if (memory?.business?.trim()) memoryLines.push(`Business: ${memory.business.trim()}`);
  if (memory?.favouriteStyle?.trim()) memoryLines.push(`Favourite style: ${memory.favouriteStyle.trim()}`);
  if (memory?.preferredLanguage?.trim()) memoryLines.push(`Preferred language: ${memory.preferredLanguage.trim()}`);
  if (Array.isArray(memory?.pastNotes) && memory.pastNotes.length > 0) {
    memoryLines.push(`Remembered notes: ${memory.pastNotes.slice(0, 8).join(' | ')}`);
  }
  if (Array.isArray(pastChatTitles) && pastChatTitles.length > 0) {
    memoryLines.push(`Recent past chat topics: ${pastChatTitles.slice(0, 6).join(', ')}`);
  }

  const memoryBlock =
    memoryLines.length > 0
      ? `USER MEMORY CONTEXT:\n${memoryLines.join('\n')}\nWhen your response relies on or references any detail from USER MEMORY CONTEXT (such as their name, school, business, favourite style, preferred language, or past chats), start your response with the exact token [[NOVA_MEMORY_USED]] on its own line.`
      : '';

  const latestRawPrompt = normalizedTurns[normalizedTurns.length - 1]?.content || '';
  const isDetailedRequest = isComplexOrDetailedPrompt(
    latestRawPrompt,
    Boolean(attachment?.base64)
  );

  const concisenessRule = isDetailedRequest
    ? 'Provide a clear, thorough, well-structured explanation in clean Markdown.'
    : 'BREVITY RULE: Keep replies short, sharp, and direct by default (1 to 4 crisp sentences or up to 4 concise bullet points). Answer immediately with zero filler or long intros. Only give a long answer if the user asks for details.';

  const systemInstruction = [
    'You are Nova, a fast, sharp, multilingual AI assistant.',
    "CRITICAL LANGUAGE RULE: Automatically detect the language of the user's latest message and reply fluently and naturally in that exact same language—including English, Nigerian Pidgin (Naija Pidgin), Yoruba, Igbo, Hausa, Spanish, French, Portuguese, Arabic, Hindi, Chinese, or any other language—unless the user explicitly asks for a different language.",
    `If the user writes an ambiguous greeting or single symbol, default to ${memory?.preferredLanguage?.trim() || uiLangLabel}.`,
    concisenessRule,
    memoryBlock,
    'STRICT NO-ASCII-ART RULE: NEVER generate ASCII art, text drawings, box-drawing characters, or slash/backslash diagrams.',
    'Format responses cleanly using Markdown.',
  ]
    .filter(Boolean)
    .join(' ');

  const baseCacheKey = isCacheablePrompt(
    normalizedTurns,
    Boolean(attachment?.base64),
    memoryLines.length > 0
  );
  const fullCacheKey = baseCacheKey ? `${uiLanguage}:${baseCacheKey}` : null;

  const contents = normalizedTurns.map((m) => {
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
    if (m.isLastUser && attachment?.base64 && attachment?.mimeType) {
      parts.push({
        inlineData: {
          data: attachment.base64,
          mimeType: attachment.mimeType,
        },
      });
    }
    parts.push({ text: m.content });
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const modelPriority = isDetailedRequest ? COMPLEX_TEXT_MODELS : FAST_TEXT_MODELS;

  return {
    systemInstruction,
    contents,
    isDetailedRequest,
    modelPriority,
    fullCacheKey,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = extractReadableGeminiError(err, '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit')
  );
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
      return { reply: cached, model: GEMINI_MODELS.fastText, cached: true };
    }
  }

  const ai = createGeminiClient();
  let lastError: unknown = null;

  for (const modelName of ctx.modelPriority) {
    const thinkingConfig =
      modelName === GEMINI_MODELS.complexText
        ? { thinkingLevel: ctx.isDetailedRequest ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW }
        : undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: ctx.contents,
          config: {
            systemInstruction: ctx.systemInstruction,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });

        const reply = (response.text ?? '').trim();
        if (reply) {
          if (ctx.fullCacheKey) {
            setCachedReply(ctx.fullCacheKey, reply);
          }
          return { reply, model: modelName, cached: false };
        }
        lastError = new Error(`Model ${modelName} returned an empty response.`);
      } catch (err) {
        lastError = err;
        console.warn(
          `Chat JSON model ${modelName} attempt ${attempt + 1} fallback:`,
          err instanceof Error ? err.message : err
        );
        if (attempt === 0 && isTransientGeminiError(err)) {
          await sleep(450);
          continue;
        }
      }
      break;
    }
  }

  throw lastError ?? new Error('Failed to generate Gemini chat response.');
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

  const ai = createGeminiClient();
  let streamedAny = false;
  let fullReplyText = '';
  let lastError: unknown = null;

  for (const modelName of ctx.modelPriority) {
    const thinkingConfig =
      modelName === GEMINI_MODELS.complexText
        ? { thinkingLevel: ctx.isDetailedRequest ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW }
        : undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents: ctx.contents,
          config: {
            systemInstruction: ctx.systemInstruction,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });

        for await (const chunk of stream) {
          const delta = chunk.text;
          if (delta) {
            streamedAny = true;
            fullReplyText += delta;
            onChunk(delta);
          }
        }

        if (fullReplyText.trim()) {
          if (ctx.fullCacheKey) {
            setCachedReply(ctx.fullCacheKey, fullReplyText.trim());
          }
          return { fullText: fullReplyText, cached: false, streamedAny };
        }
        lastError = new Error(`Model ${modelName} returned an empty stream.`);
      } catch (err) {
        lastError = err;
        console.warn(
          `Chat stream model ${modelName} attempt ${attempt + 1} fallback:`,
          err instanceof Error ? err.message : err
        );
        if (streamedAny) {
          return { fullText: fullReplyText, cached: false, streamedAny };
        }
        if (attempt === 0 && isTransientGeminiError(err)) {
          await sleep(450);
          continue;
        }
      }
      break;
    }
  }

  throw lastError ?? new Error('Failed to generate Gemini chat stream.');
}

export async function testGeminiConnection(): Promise<{
  ok: boolean;
  apiKeyExists: boolean;
  endpointReachable: boolean;
  model: string;
  modelValid: boolean;
  responseReceived: boolean;
  error?: string;
}> {
  const apiKeyExists = isGeminiConfigured();
  const model = GEMINI_MODELS.fastText;

  if (!apiKeyExists) {
    return {
      ok: false,
      apiKeyExists: false,
      endpointReachable: false,
      model,
      modelValid: false,
      responseReceived: false,
      error: 'GEMINI_API_KEY is not configured in server environment variables.',
    };
  }

  try {
    const ai = createGeminiClient();
    const response = await ai.models.generateContent({
      model,
      contents: 'Reply with OK only.',
      config: {
        systemInstruction: 'Reply concisely with OK.',
      },
    });
    const text = (response.text ?? '').trim();
    const responseReceived = text.length > 0;
    return {
      ok: responseReceived,
      apiKeyExists: true,
      endpointReachable: true,
      model,
      modelValid: true,
      responseReceived,
      ...(responseReceived ? {} : { error: 'Gemini returned an empty response.' }),
    };
  } catch (err) {
    const rawMsg = extractReadableGeminiError(err, 'Connection test failed.');
    console.error('Gemini connection test error:', rawMsg);
    const isModelError = /not found|404|unsupported|invalid.*model/i.test(rawMsg);
    const isAuthError = /api key|permission|unauthorized|401|403/i.test(rawMsg);
    return {
      ok: false,
      apiKeyExists: true,
      endpointReachable: !isAuthError && !/fetch failed|enotfound|econnrefused|network/i.test(rawMsg),
      model,
      modelValid: !isModelError,
      responseReceived: false,
      error: 'Gemini connection test failed on the server. Check server logs for details.',
    };
  }
}
