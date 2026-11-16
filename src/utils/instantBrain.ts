import { NovaMemory } from '../types';

export const NOVA_CREATOR_KEY = 'nova_creator';
export const NOVA_CREATOR_NAME = "John God's Will";
export const NOVA_FIRST_MESSAGE = "Hi, I'm Nova™";

export function ensureCreatorLocked(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(NOVA_CREATOR_KEY, NOVA_CREATOR_NAME);
    }
  } catch {
    // ignore storage errors
  }
  return NOVA_CREATOR_NAME;
}

export function getLockedCreator(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(NOVA_CREATOR_KEY);
      if (stored !== NOVA_CREATOR_NAME) {
        window.localStorage.setItem(NOVA_CREATOR_KEY, NOVA_CREATOR_NAME);
      }
    }
  } catch {
    // ignore storage errors
  }
  return NOVA_CREATOR_NAME;
}

const CREATOR_QUESTION_REGEX =
  /\b(?:who\s+(?:created|made|built|designed|invented|developed|programmed|trained|owns)\s+(?:you|u|nova|this(?:\s+app)?)|who(?:'s|\s+is)\s+(?:your|nova(?:'s)?)\s+(?:creator|maker|builder|developer|owner|author|founder))\b/i;

const MODEL_QUESTION_REGEX =
  /\b(?:what|which)\s+(?:ai\s+)?(?:model|llm|engine|version|system)\s+(?:are\s+you|is\s+nova|do\s+you\s+use|powers?\s+you)\b/i;

const IDENTITY_QUESTION_REGEX =
  /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what's\s+your\s+name|introduce\s+yourself|tell\s+me\s+about\s+yourself)\??$/i;

const CREATOR_CHALLENGE_REGEX =
  /(?:no[,\s]+(?:you\s+were|u\s+were|you\s+are)\s+(?:created|made|built|developed)\s+by|\b(?:you\s+were|you're|you\s+are|nova\s+is|nova\s+was)\s+(?:created|made|built|developed|owned)\s+by\s+(?:openai|google|meta|facebook|microsoft|anthropic|chatgpt|gpt|gemini|claude)|\b(?:openai|google|meta|chatgpt|anthropic|gemini)\s+(?:created|made|built|owns)\s+(?:you|nova)\b|\b(?:aren't|are)\s+you\s+(?:chatgpt|gpt|from\s+openai|made\s+by\s+openai|gemini|meta\s+ai|claude)\b)/i;

/**
 * ULTRA BLOCK FILTER - Runs on EVERY reply before the user sees it so
 * Nova NEVER reveals any third-party AI lab or model name.
 */
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
    .replace(/\bMeta\s+AI\b/gi, 'Nova AI')
    .replace(/\bAnthropic\b/gi, 'Nova AI')
    .replace(/\bGoogle\s+AI\b/gi, 'Nova AI')
    .replace(/\bGemini\b/gi, 'Nova AI');

  return cleaned;
}

export function enforceNovaCreatorInReply(text: string): string {
  return blockOpenAI(text);
}

/**
 * Unconditional identity & creator lock (runs regardless of Instant Mode).
 * Only mentions John God's Will when user explicitly asks about creator/ownership or challenges it.
 */
export function getCreatorIdentityOverride(rawPrompt: string): string | null {
  ensureCreatorLocked();
  const trimmed = rawPrompt.trim();
  if (!trimmed) return null;

  if (CREATOR_CHALLENGE_REGEX.test(trimmed)) {
    return "No, my creator is John God's Will.";
  }

  if (CREATOR_QUESTION_REGEX.test(trimmed)) {
    return "I was created by John God's Will";
  }

  if (MODEL_QUESTION_REGEX.test(trimmed)) {
    return 'I am Nova, powered by Nova AI.';
  }

  const stripped = trimmed.replace(/[^\w\s'?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (IDENTITY_QUESTION_REGEX.test(stripped)) {
    return "I'm Nova, your AI assistant. What's on your mind?";
  }

  return null;
}

function tryEvalSimpleMath(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^(?:what(?:'s|\s+is)|calculate|compute|solve)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();
  if (!/^[0-9+\-*/().\s]{3,40}$/.test(cleaned) || !/[+\-*/]/.test(cleaned)) {
    return null;
  }
  try {
    const fn = new Function(`"use strict"; return (${cleaned});`);
    const result = fn() as unknown;
    if (typeof result === 'number' && Number.isFinite(result)) {
      const formatted = Number.isInteger(result) ? String(result) : String(+result.toFixed(6));
      return `${cleaned} = **${formatted}**`;
    }
  } catch {
    // ignore invalid expressions
  }
  return null;
}

export function getInstantClientReply(
  rawPrompt: string,
  memory?: NovaMemory,
  priorMessageCount = 0
): string | null {
  ensureCreatorLocked();
  const identityOverride = getCreatorIdentityOverride(rawPrompt);
  if (identityOverride) {
    return identityOverride;
  }

  const trimmed = rawPrompt.trim();
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  // Use user's name only on the very first turn or roughly once every 10 messages
  const shouldUseName =
    Boolean(memory?.name?.trim()) &&
    (priorMessageCount === 0 || priorMessageCount % 20 === 0);

  // Natural conversational greetings — NO creator repetition, NO forced name spam
  if (/^(?:hey|yo|hiya)$/.test(normalized)) {
    return shouldUseName
      ? `Hey ${memory?.name?.trim()}! How far?`
      : 'Hey! How far? What can I help you with?';
  }

  if (/^(?:hi|hello|howdy|greetings)$/.test(normalized)) {
    return shouldUseName
      ? `Hi ${memory?.name?.trim()}! How can I help today?`
      : 'Hi! What would you like to do today?';
  }

  if (/^good\s+(morning|afternoon|evening)$/.test(normalized)) {
    const part = normalized.replace(/^good\s+/, '');
    return shouldUseName
      ? `Good ${part}, ${memory?.name?.trim()}! How's your day going?`
      : `Good ${part}! How's your day going?`;
  }

  if (/^(?:how\s+are\s+you|how\s+r\s+u|how's\s+it\s+going|what's\s+up|whats\s+up|sup|how\s+far)$/.test(normalized)) {
    return "I'm good, what's up with you?";
  }

  if (/^(?:thanks|thank\s+you|thx|tysm|appreciated)$/.test(normalized)) {
    return "You're welcome! Let me know if you need anything else.";
  }

  if (/^(?:bye|goodbye|see\s+you|later)$/.test(normalized)) {
    return 'Catch you later!';
  }

  // Common cached knowledge answers
  if (/^(?:what\s+is\s+christmas|explain\s+christmas|tell\s+me\s+about\s+christmas)$/.test(normalized)) {
    return 'Christmas is an annual celebration observed on December 25th honoring the birth of Jesus Christ, widely celebrated around the world with family gatherings, gift-giving, music, and festive lights.';
  }

  if (/^(?:what\s+is\s+easter|explain\s+easter)$/.test(normalized)) {
    return 'Easter is a major Christian holiday celebrating the resurrection of Jesus Christ, observed in spring with church services, family meals, and joyful traditions.';
  }

  if (/^(?:what\s+is\s+ai|what\s+is\s+artificial\s+intelligence)$/.test(normalized)) {
    return 'Artificial intelligence (AI) is computer software designed to understand language, recognize patterns, generate ideas or images, and help people solve tasks quickly.';
  }

  if (/^(?:what\s+time\s+is\s+it|current\s+time|what's\s+the\s+time)$/.test(normalized)) {
    return `It's currently ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  }

  if (/^(?:what\s+(?:day|date)\s+is\s+(?:it|today)|today's\s+date)$/.test(normalized)) {
    return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  }

  if (/^(?:tell\s+me\s+a\s+joke|make\s+me\s+laugh)$/.test(normalized)) {
    return "Why did the programmer quit their job? Because they didn't get arrays!";
  }

  const mathAnswer = tryEvalSimpleMath(trimmed);
  if (mathAnswer) {
    return mathAnswer;
  }

  return null;
}
