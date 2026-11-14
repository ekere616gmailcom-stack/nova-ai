import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function getGeminiApiKey(): string | undefined {
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

function createAiClient() {
  return new GoogleGenAI({
    apiKey: getGeminiApiKey(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const FAST_TEXT_MODELS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
const COMPLEX_TEXT_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
const FREE_TEXT_MODELS = FAST_TEXT_MODELS;

const CHAT_REPLY_CACHE = new Map<string, { text: string; createdAt: number }>();
const CHAT_CACHE_MAX = 80;
const CHAT_CACHE_TTL_MS = 30 * 60 * 1000;

function isComplexOrDetailedPrompt(text: string, hasAttachment: boolean): boolean {
  const clean = text.trim();
  if (hasAttachment && clean.length > 180) return true;
  if (clean.length > 420 || clean.split('\n').length >= 6) return true;
  return /\b(detail|details|detailed|in[- ]depth|explain\s+fully|step[- ]by[- ]step|comprehensive|thorough|elaborate|long\s+answer|essay|article|full\s+code|complete\s+code|architecture|debug|proof|compare\s+all|analyze\s+deeply|write\s+a\s+(?:long|full|complete))\b/i.test(
    clean
  );
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

function extractReadableGeminiError(err: unknown, fallback: string): string {
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

function sanitizeSvgArtwork(rawText: string): string | null {
  const match = rawText.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '');
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

function ratioDimensions(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case '3:4':
      return { width: 768, height: 1024 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '16:9':
      return { width: 1280, height: 720 };
    default:
      return { width: 1024, height: 1024 };
  }
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  ar: 'Arabic',
  hi: 'Hindi',
  zh: 'Chinese (Simplified)',
};

const VALID_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'nova-ai', aiConfigured: Boolean(getGeminiApiKey()) });
  });

  // Streaming Multilingual Chat Route (SSE, supports optional uploaded image + Memory)
  app.post('/api/chat', async (req, res) => {
    const { messages, uiLanguage, attachment, memory, pastChatTitles } = req.body as {
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
      uiLanguage?: string;
      attachment?: { base64: string; mimeType: string };
      memory?: {
        name?: string;
        school?: string;
        business?: string;
        favouriteStyle?: string;
        preferredLanguage?: string;
        pastNotes?: string[];
      };
      pastChatTitles?: string[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required.' });
      return;
    }

    if (!getGeminiApiKey()) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(
        `data: ${JSON.stringify({
          text: 'Your free Gemini API key is not set in **Settings > Secrets** yet. Add `GEMINI_API_KEY` there to enable live AI responses.',
        })}\n\n`
      );
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setNoDelay?.(true);
    res.flushHeaders?.();

    const uiLangLabel = LANGUAGE_LABELS[uiLanguage ?? 'en'] || 'English';

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

    const latestRawPrompt = messages[messages.length - 1]?.content || '';
    const isDetailedRequest = isComplexOrDetailedPrompt(
      latestRawPrompt,
      Boolean(attachment?.base64)
    );

    const concisenessRule = isDetailedRequest
      ? 'Provide a clear, thorough, well-structured explanation in clean Markdown.'
      : 'BREVITY RULE: Keep replies short, sharp, and direct by default (1 to 4 crisp sentences or up to 4 concise bullet points). Answer immediately with zero filler or long intros. Only give a long answer if the user asks for details.';

    const systemInstruction = [
      'You are Nova, a fast, sharp AI assistant.',
      'CRITICAL LANGUAGE RULE: Automatically detect the language of the user\'s latest message and reply fluently and naturally in that exact same language—including English, Nigerian Pidgin (Naija Pidgin), Yoruba, Igbo, Hausa, Spanish, French, Portuguese, Arabic, Hindi, Chinese, or any other language—unless the user explicitly asks for a different language.',
      `If the user writes an ambiguous greeting or single symbol, default to ${memory?.preferredLanguage?.trim() || uiLangLabel}.`,
      concisenessRule,
      memoryBlock,
      'STRICT NO-ASCII-ART RULE: NEVER generate ASCII art, text drawings, box-drawing characters, or slash/backslash diagrams.',
      'Format responses cleanly using Markdown.',
    ]
      .filter(Boolean)
      .join(' ');

    const cleanedHistory = messages
      .map((m) => ({
        role: m.role,
        content: (m.content || '')
          .replace(/\[\[NOVA_BUILDER_START\]\][\s\S]*?\[\[NOVA_BUILDER_END\]\]/g, '[Built interactive website/app preview]')
          .replace(/\[\[NOVA_BUILDER_CATEGORIES\]\]/g, '')
          .replace(/\[\[NOVA_MEMORY_USED\]\]/g, '')
          .trim(),
      }))
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

    if (normalizedTurns.length === 0) {
      res.write(`data: ${JSON.stringify({ error: 'Please enter a message to ask Gemini.' })}\n\n`);
      res.end();
      return;
    }

    const baseCacheKey = isCacheablePrompt(
      normalizedTurns,
      Boolean(attachment?.base64),
      memoryLines.length > 0
    );
    const fullCacheKey = baseCacheKey ? `${uiLanguage ?? 'en'}:${baseCacheKey}` : null;
    if (fullCacheKey) {
      const cached = getCachedReply(fullCacheKey);
      if (cached) {
        res.write(`data: ${JSON.stringify({ text: cached, cached: true })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }
    }

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

    const ai = createAiClient();
    const modelPriority = isDetailedRequest ? COMPLEX_TEXT_MODELS : FAST_TEXT_MODELS;
    let streamedAny = false;
    let fullReplyText = '';
    let lastError: unknown = null;

    for (const modelName of modelPriority) {
      try {
        const thinkingConfig =
          modelName === 'gemini-4-hydrogen'
            ? { thinkingLevel: isDetailedRequest ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW }
            : undefined;

        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        });

        for await (const chunk of stream) {
          const delta = chunk.text;
          if (delta) {
            streamedAny = true;
            fullReplyText += delta;
            res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
          }
        }
        if (fullCacheKey && fullReplyText.trim()) {
          setCachedReply(fullCacheKey, fullReplyText.trim());
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      } catch (err: unknown) {
        lastError = err;
        console.warn(`Chat model ${modelName} fallback:`, err instanceof Error ? err.message : err);
        if (streamedAny) break;
      }
    }

    const msg = extractReadableGeminiError(lastError, 'Failed to generate Gemini chat response.');
    console.error('Chat API error:', msg);
    if (!streamedAny) {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
    res.end();
  });

  // Image Generation & Editing Route (Tries Paid Image Model, Seamlessly Falls Back to Free-Key AI Vector Artwork & Labeled Diagrams)
  app.post('/api/image', async (req, res) => {
    const { prompt, aspectRatio, style, count, sourceImage } = req.body as {
      prompt?: string;
      aspectRatio?: string;
      style?: string;
      count?: number;
      sourceImage?: { base64: string; mimeType: string };
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'A prompt is required for image generation.' });
      return;
    }

    if (!getGeminiApiKey()) {
      res.status(500).json({ error: 'Gemini API key is not configured in Settings > Secrets.' });
      return;
    }

    const validRatios = new Set(['1:1', '3:4', '4:3', '9:16', '16:9']);
    const safeRatio = aspectRatio && validRatios.has(aspectRatio) ? aspectRatio : '1:1';
    const numImages = count === 4 ? 4 : 1;

    const isEducationalDiagram =
      /\b(diagram|labeled|labelled|cross[- ]section|continental shelf|water cycle|solar system|food chain|anatomy|parts of|layers of|chart|infographic|educational|geography|biology|physics|chemistry|volcano|ecosystem|cell structure)\b/i.test(
        prompt
      );

    const styleHints: Record<string, string> = {
      Realistic: isEducationalDiagram
        ? 'colorful, high-resolution, realistic educational scientific illustration and textbook diagram with crystal-clear legible English labels and clean pointer lines identifying each major feature, vivid natural colors, polished educational graphic style'
        : 'photorealistic, ultra-detailed photography, natural lighting, crisp 8k textures',
      Anime: 'high-craft Japanese anime illustration, expressive cel shading, vibrant studio lighting',
      '3D Cartoon': 'stylized 3D animated character render, Pixar-grade soft subsurface lighting, clean shapes',
      Logo: 'minimalist modern vector brand logo mark on a clean dark background, sharp geometry',
      Poster: 'editorial graphic design poster composition, bold framing, rich contrast and typography-ready layout',
      Cinematic: 'cinematic film still, anamorphic lens bokeh, dramatic chiaroscuro lighting, rich color grade',
    };

    const diagramBoost =
      isEducationalDiagram && style !== 'Realistic'
        ? ', educational labeled diagram with crisp readable English text labels and clean pointer lines'
        : '';

    const styleSuffix = style && styleHints[style] ? `, ${styleHints[style]}` : '';
    const basePrompt = `${prompt.trim()}${styleSuffix}${diagramBoost}`;
    const dims = ratioDimensions(safeRatio);

    const generateFreeSvgArtwork = async (variationIndex: number) => {
      const ai = createAiClient();
      const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
      if (sourceImage?.base64 && sourceImage?.mimeType) {
        parts.push({
          inlineData: {
            data: sourceImage.base64,
            mimeType: sourceImage.mimeType,
          },
        });
      }

      const svgInstruction = [
        `Generate a rich, colorful, high-detail SVG artwork matching: "${prompt.trim()}"`,
        style ? `Visual style: ${style}.` : '',
        numImages > 1 ? `Make creative visual variation #${variationIndex + 1} with a distinct palette and layout.` : '',
        isEducationalDiagram
          ? 'This is an educational diagram: include accurate cross-section layers/shapes, bright contrasting colors, clean pointer lines, a clear title header, and legible English labels.'
          : 'Include rich gradients (<linearGradient>, <radialGradient>), layered shapes, atmospheric glow, foreground details, and clean typography if appropriate (such as for logos or posters).',
        `Use exact root tag: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.width} ${dims.height}" width="${dims.width}" height="${dims.height}">`,
        'Return ONLY raw valid <svg>...</svg> markup with no markdown fences and no <script> tags.',
      ]
        .filter(Boolean)
        .join('\n');

      parts.push({ text: svgInstruction });

      for (const modelName of FREE_TEXT_MODELS) {
        try {
          const svgRes = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
          });
          const cleanedSvg = sanitizeSvgArtwork(svgRes.text ?? '');
          if (cleanedSvg) {
            const b64 = Buffer.from(cleanedSvg, 'utf-8').toString('base64');
            return {
              imageUrl: `data:image/svg+xml;base64,${b64}`,
              caption: prompt.trim(),
            };
          }
        } catch (svgErr) {
          console.warn(`Free SVG model ${modelName} fallback:`, svgErr instanceof Error ? svgErr.message : svgErr);
        }
      }
      throw new Error('Unable to render visual.');
    };

    const generateSingle = async (variationIndex: number) => {
      const ai = createAiClient();
      const variationPrompt =
        numImages > 1
          ? `${basePrompt}. Creative variation #${variationIndex + 1} with a distinct composition and lighting angle.`
          : basePrompt;

      const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
      if (sourceImage?.base64 && sourceImage?.mimeType) {
        parts.push({
          inlineData: {
            data: sourceImage.base64,
            mimeType: sourceImage.mimeType,
          },
        });
      }
      parts.push({ text: variationPrompt });

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: safeRatio,
            },
          },
        });

        let imageUrl: string | null = null;
        let caption = '';

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType ?? 'image/png';
            imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          } else if (part.text) {
            caption += part.text;
          }
        }

        if (imageUrl) {
          return { imageUrl, caption: caption.trim() };
        }
      } catch (err) {
        console.info(
          'Switching to free-key vector illustration mode:',
          err instanceof Error ? err.message : err
        );
      }

      return generateFreeSvgArtwork(variationIndex);
    };

    try {
      const results = await Promise.all(
        Array.from({ length: numImages }, (_, idx) => generateSingle(idx))
      );

      res.json({
        imageUrl: results[0].imageUrl,
        imageUrls: results.map((r) => r.imageUrl),
        caption: results[0].caption,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Image API error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // Daily Wallpaper Route
  app.post('/api/wallpaper', async (req, res) => {
    const { style, seed } = req.body as { style?: string; seed?: number };
    const safeStyle = style || 'Nature';

    const fallbackQuotes: Record<string, { title: string; quote: string }> = {
      Nature: {
        title: 'Midnight Horizon',
        quote: 'In every quiet dawn, the earth renews its promise.',
      },
      Anime: {
        title: 'Starlight Sky',
        quote: 'Look up at the drifting constellations—every step forward glows.',
      },
      City: {
        title: 'Violet Metropolis',
        quote: 'Neon reflections over rain-kissed avenues at 7:00 AM.',
      },
      Abstract: {
        title: 'Velvet Singularity',
        quote: 'Form follows stillness inside infinite violet geometry.',
      },
      'Bible Verse': {
        title: 'Psalm 46:5',
        quote: 'God is within her, she will not fall; God will help her at break of day.',
      },
      Motivation: {
        title: 'Daily Focus',
        quote: 'Small disciplined mornings build extraordinary years.',
      },
    };

    let title = fallbackQuotes[safeStyle]?.title || safeStyle;
    let quote = fallbackQuotes[safeStyle]?.quote || 'Begin today with clarity and calm.';
    let visualPrompt = `Ultra-clean vertical 9:16 mobile wallpaper in ${safeStyle} aesthetic, deep obsidian and radiant purple glow, minimalist luxury`;

    if (getGeminiApiKey()) {
      try {
        const ai = createAiClient();
        let textResText = '';
        for (const modelName of FREE_TEXT_MODELS) {
          try {
            const textRes = await ai.models.generateContent({
              model: modelName,
              contents: `Create a fresh daily mobile wallpaper concept for style "${safeStyle}" (variation seed ${seed ?? Date.now()}). Reply in strict JSON with 3 short string fields: "title" (2-4 words), "quote" (if style is "Bible Verse", give an inspiring authentic Bible verse with reference; if "Motivation", give an uplifting quote; otherwise a poetic 1-line caption), and "visualPrompt" (a rich 20-word visual prompt for a 9:16 dark-purple luxury phone wallpaper).`,
              config: { responseMimeType: 'application/json' },
            });
            textResText = (textRes.text ?? '{}').trim();
            if (textResText && textResText !== '{}') break;
          } catch {
            // try next free model
          }
        }
        const parsed = JSON.parse(textResText || '{}') as {
          title?: string;
          quote?: string;
          visualPrompt?: string;
        };
        if (parsed.title) title = parsed.title;
        if (parsed.quote) quote = parsed.quote;
        if (parsed.visualPrompt) visualPrompt = parsed.visualPrompt;

        // Attempt AI image generation
        try {
          const imgRes = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-image',
            contents: { parts: [{ text: visualPrompt }] },
            config: { imageConfig: { aspectRatio: '9:16' } },
          });
          for (const part of imgRes.candidates?.[0]?.content?.parts ?? []) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType ?? 'image/png';
              res.json({
                imageUrl: `data:${mime};base64,${part.inlineData.data}`,
                title,
                quote,
                style: safeStyle,
                source: 'ai',
              });
              return;
            }
          }
        } catch {
          // Fall back cleanly to generative canvas payload below
        }
      } catch (err) {
        console.warn('Wallpaper text gen fallback:', err instanceof Error ? err.message : err);
      }
    }

    res.json({
      imageUrl: null,
      title,
      quote,
      style: safeStyle,
      source: 'generative-canvas',
    });
  });

  // Website & Interactive Mini-App Builder Route
  app.post('/api/build-app', async (req, res) => {
    const { prompt, previousHtml, editInstruction } = req.body as {
      prompt?: string;
      previousHtml?: string;
      editInstruction?: string;
    };

    const userRequest = (editInstruction || prompt || '').trim();
    if (!userRequest) {
      res.status(400).json({ error: 'Please describe the website or app you want to build.' });
      return;
    }

    if (!getGeminiApiKey()) {
      res.status(500).json({ error: 'Builder is temporarily unavailable right now.' });
      return;
    }

    const isEditMode = Boolean(previousHtml && editInstruction);

    const builderSystemInstruction = [
      'You are Nova App & Website Builder. You generate complete, production-quality, single-file responsive HTML5 websites and interactive mini-apps.',
      'Return valid JSON matching the requested schema: { "title": string, "appType": "website" | "app", "summary": string, "html": string }.',
      'REQUIREMENTS FOR "html":',
      '1. Must be a complete self-contained HTML5 document starting with <!DOCTYPE html> with clean responsive <style> and working vanilla <script> inside.',
      '2. Mobile-first responsive design with modern typography, attractive dark or vibrant luxury color palettes, smooth CSS transitions/animations, and clean spacing.',
      '3. Keep total "html" compact and clean (under 30,000 characters) so it loads fast and saves cleanly.',
      '4. NEVER use window.alert(), window.confirm(), window.prompt(), or window.open() in the generated JavaScript—show sleek inline status banners or confirmation messages inside the page instead.',
      '5. FOR WEBSITES (Shop, Portfolio, School, Church, Restaurant, Landing Page, Business, etc.):',
      '   - Include a crisp navbar with working mobile toggle or section links/pages (e.g., Home, Services/Menu/Products, About, Contact tabs or smooth-scroll sections).',
      '   - Use real high-resolution Unsplash photo URLs (https://images.unsplash.com/photo-...) paired with an onerror fallback that swaps to a tasteful CSS gradient box so images never look broken.',
      '   - Include working interactive controls appropriate to the site (e.g., Shop: add-to-cart drawer/counter & category filter; Restaurant: menu filter & table booking confirmation; School: admissions inquiry & programs tabs; Church: service times, sermon player card & prayer request form; Portfolio: filterable projects & modal preview).',
      '   - Always include a working Contact Form (shows an inline success confirmation card on submit) AND a floating green WhatsApp chat button linking to https://wa.me/2348000000000?text=Hello.',
      '6. FOR MINI-APPS (Calculator, To-Do App, Quiz App, Music Player, Weather App, Timer, Budget Tracker, etc.):',
      '   - Build a genuinely working, tactile interactive app with full JavaScript logic, live state updates, animations, and clear buttons (never fake static text).',
      '   - For Music Player: include built-in Web Audio API synthesizer tracks/beats so Play/Pause/Next actually plays real pleasant audio in the browser!',
      '   - For Weather App: include interactive city switching (Lagos, Abuja, Port Harcourt, London, New York), search, °C/°F toggle, hourly & 5-day cards.',
      '   - For Calculator: full working arithmetic, %, clear, backspace, keyboard/tap feedback.',
      '   - For To-Do App: add tasks, check complete, filter All/Active/Done, delete, counter.',
      '   - For Quiz App: real multi-question quiz with interactive options, instant score feedback, progress bar, and restart.',
    ].join('\n');

    const contentsPayload = isEditMode
      ? `Apply this edit instruction to the existing HTML app:\nEDIT INSTRUCTION: ${editInstruction}\n\nEXISTING HTML:\n${String(previousHtml).slice(0, 32000)}\n\nKeep all working interactive features intact and return updated JSON.`
      : `Build a real, working, mobile-friendly website or interactive mini-app for this request:\n"${userRequest}"`;

    try {
      const ai = createAiClient();
      let rawText = '';
      let buildError: unknown = null;

      for (const modelName of FREE_TEXT_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: contentsPayload,
            config: {
              systemInstruction: builderSystemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  appType: { type: Type.STRING, enum: ['website', 'app'] },
                  summary: { type: Type.STRING },
                  html: { type: Type.STRING },
                },
                required: ['title', 'appType', 'summary', 'html'],
              },
            },
          });
          rawText = (response.text ?? '').trim();
          if (rawText) break;
        } catch (err) {
          buildError = err;
          console.warn(`Builder model ${modelName} fallback:`, err instanceof Error ? err.message : err);
        }
      }

      if (!rawText && buildError) {
        throw buildError;
      }

      const parsed = JSON.parse(rawText) as {
        title?: string;
        appType?: string;
        summary?: string;
        html?: string;
      };

      const safeHtml = typeof parsed.html === 'string' ? parsed.html.trim() : '';
      if (!safeHtml) {
        throw new Error('Empty build output');
      }

      res.json({
        title: (parsed.title || 'Nova App').slice(0, 80),
        appType: parsed.appType === 'app' ? 'app' : 'website',
        summary: (parsed.summary || 'Your live website/app is ready!').slice(0, 400),
        html: safeHtml.slice(0, 36000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to build app right now.';
      console.error('Build App API error:', msg);
      res.status(500).json({ error: 'Could not build that right now. Try describing it in a short sentence.' });
    }
  });

  // Audio Transcription Route (Mic Dictation using valid free-tier Gemini multimodal models, quiet fallback)
  app.post('/api/transcribe', async (req, res) => {
    const { audioBase64, mimeType } = req.body as {
      audioBase64?: string;
      mimeType?: string;
    };

    if (!audioBase64 || !getGeminiApiKey()) {
      res.json({ text: '', unavailable: true });
      return;
    }

    try {
      const ai = createAiClient();
      for (const modelName of FREE_TEXT_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'audio/webm',
                    data: audioBase64,
                  },
                },
                {
                  text: 'Transcribe this spoken audio accurately in its original language (English, Nigerian Pidgin, Yoruba, Igbo, Hausa, or other). Return ONLY the transcribed text without quotes or commentary.',
                },
              ],
            },
          });

          const transcript = (response.text ?? '').trim();
          if (transcript) {
            res.json({ text: transcript });
            return;
          }
        } catch (modelErr) {
          console.warn(`Transcribe ${modelName} fallback:`, modelErr instanceof Error ? modelErr.message : modelErr);
        }
      }
      res.json({ text: '', unavailable: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transcription unavailable.';
      console.warn('Transcribe fallback:', msg);
      res.json({ text: '', unavailable: true });
    }
  });

  // Gemini Built-in Text-to-Speech Route (No external API key needed)
  app.post('/api/tts', async (req, res) => {
    const { text, voiceName } = req.body as {
      text?: string;
      voiceName?: string;
    };

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required for speech generation.' });
      return;
    }

    if (!getGeminiApiKey()) {
      res.status(500).json({ error: 'Gemini API key is not configured in Settings > Secrets.' });
      return;
    }

    const cleanText = text
      .replace(/\[\[NOVA_MEMORY_USED\]\]/g, '')
      .replace(/\[\[NOVA_BUILDER_CATEGORIES\]\]/g, '')
      .replace(/\[\[NOVA_BUILDER_START\]\][\s\S]*?\[\[NOVA_BUILDER_END\]\]/g, '')
      .replace(/\[\[NOVA_CALL:([^|\]]+)\|([^\]]+)\]\]/g, 'Call $1 at $2.')
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/[#*_`~>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);

    if (!cleanText) {
      res.status(400).json({ error: 'No readable text provided.' });
      return;
    }

    const safeVoice = voiceName && VALID_VOICES.has(voiceName) ? voiceName : 'Kore';

    try {
      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: 'Clear, natural, warm AI assistant reading the answer aloud',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(500).json({ error: 'Gemini TTS did not return audio data.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        provider: 'gemini',
        voiceName: safeVoice,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gemini TTS request failed.';
      console.error('Gemini TTS error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // Vite Dev Middleware or Production Static Files
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // Real-time Gemini Live Voice Chat WebSocket Bridge (/live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket, request) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const requestedVoice = reqUrl.searchParams.get('voice') || 'Kore';
    const voiceName = VALID_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
    const uiLang = reqUrl.searchParams.get('lang') || 'en';
    const speechLang = reqUrl.searchParams.get('speechLang') || 'auto';
    const speed = reqUrl.searchParams.get('speed') || 'normal';
    const memParam = reqUrl.searchParams.get('mem') || '';
    const uiLangName = LANGUAGE_LABELS[uiLang] || 'English';

    if (!getGeminiApiKey()) {
      clientWs.send(JSON.stringify({ error: 'Voice not available, type instead' }));
      clientWs.close();
      return;
    }

    const speedInstruction =
      speed === 'slow'
        ? 'Speak calmly at a slightly slower, very clear pace.'
        : speed === 'fast'
          ? 'Speak briskly, energetically, and concisely.'
          : 'Speak at a natural conversational pace.';

    const langInstruction =
      speechLang !== 'auto'
        ? `Respond naturally in ${speechLang} unless the user clearly switches languages.`
        : `Always understand and reply naturally in whatever language the user speaks to you—including English, Nigerian Pidgin, Yoruba, Igbo, Hausa, or any other world language (defaulting to ${uiLangName} if unclear).`;

    const memInstruction = memParam.trim()
      ? ` Remember this user context naturally when helpful: ${memParam.slice(0, 400)}.`
      : '';

    let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

    try {
      const ai = createAiClient();
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: `You are Nova, a warm, articulate, real-time AI voice assistant. ${langInstruction} ${speedInstruction}${memInstruction} Never generate or read out ASCII art or text-character drawings. Keep spoken answers clear, natural, and concise.`,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }

            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (e: unknown) => {
            const msg = e instanceof Error ? e.message : 'Live voice connection error';
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ error: msg }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to start live voice session.';
      console.error('Live API connection error:', msg);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: msg }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session) return;
      try {
        const parsed = JSON.parse(raw.toString()) as { audio?: string; text?: string };
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          session.sendRealtimeInput({ text: parsed.text });
        }
      } catch (e) {
        console.error('Invalid WS message from client:', e);
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // ignore close errors
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Nova server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Nova server:', err);
  process.exit(1);
});
