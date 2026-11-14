import { Type } from '@google/genai';
import {
  FAST_TEXT_MODELS,
  GEMINI_MODELS,
  VALID_IMAGE_MODELS,
  classifyGeminiError,
  createGeminiClient,
  extractReadableGeminiError,
  generateChatJsonReply,
  isGeminiConfigured,
  isQuotaOrBillingError,
  streamChatReply,
  testGeminiConnection,
  type ChatAttachmentInput,
  type ChatMemoryInput,
  type ChatTurnInput,
} from './geminiClient';

export interface ApiRequest {
  method?: string;
  body?: unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface ApiResponse {
  statusCode?: number;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  write: (chunk: string) => unknown;
  end: (chunk?: string) => void;
  flushHeaders?: () => void;
  socket?: { setNoDelay?: (noDelay?: boolean) => void } | null;
}

const VALID_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);
const IMAGE_UNAVAILABLE_ERROR =
  'Image generation is currently unavailable. Configure a billing-enabled Gemini API key with image quota in Settings > Secrets.';

async function parseJsonBody<T>(req: ApiRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }
  if (typeof req.body === 'string') {
    return (req.body.trim() ? JSON.parse(req.body) : {}) as T;
  }
  if (!req.on) return {} as T;
  return await new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on?.('data', (chunk: unknown) => {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    });
    req.on?.('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({} as T);
      try {
        resolve(JSON.parse(raw) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on?.('error', reject);
  });
}

function rejectWrongMethod(req: ApiRequest, res: ApiResponse, allowed: 'GET' | 'POST'): boolean {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (req.method && req.method.toUpperCase() !== allowed) {
    res.setHeader('Allow', allowed);
    res.status(405).json({ success: false, error: `Method ${req.method} not allowed.` });
    return true;
  }
  return false;
}

export async function handleHealth(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'GET')) return;
  res.status(200).json({ ok: true, service: 'nova-ai', aiConfigured: isGeminiConfigured() });
}

export async function handleGeminiTest(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'GET')) return;
  const result = await testGeminiConnection();
  res.status(result.ok ? 200 : 503).json(result);
}

export async function handleChat(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: {
    message?: string;
    conversationHistory?: ChatTurnInput[];
    messages?: ChatTurnInput[];
    stream?: boolean;
    uiLanguage?: string;
    attachment?: ChatAttachmentInput;
    memory?: ChatMemoryInput;
    pastChatTitles?: string[];
  };

  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ success: false, error: 'Invalid JSON request body.' });
    return;
  }

  const {
    message,
    conversationHistory,
    messages,
    stream,
    uiLanguage,
    attachment,
    memory,
    pastChatTitles,
  } = body;

  const isSimpleJsonRequest =
    typeof message === 'string' && (!Array.isArray(messages) || messages.length === 0) && stream !== true;
  const wantsJsonOnly = isSimpleJsonRequest || stream === false;

  let inputTurns: ChatTurnInput[] = [];
  if (Array.isArray(messages) && messages.length > 0) {
    inputTurns = messages;
  } else if (typeof message === 'string' && message.trim()) {
    const historyTurns = Array.isArray(conversationHistory) ? conversationHistory : [];
    inputTurns = [...historyTurns, { role: 'user', content: message.trim() }];
  }

  if (inputTurns.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Please enter a message to ask Nova.',
    });
    return;
  }

  if (!isGeminiConfigured()) {
    console.error('Chat API error [AUTH_ERROR]: GEMINI_API_KEY is not configured in server environment.');
    const authMessage =
      "Nova couldn't authenticate with its AI service. Please verify the GEMINI_API_KEY environment variable on the server.";
    if (wantsJsonOnly) {
      res.status(503).json({
        success: false,
        code: 'AUTH_ERROR',
        error: authMessage,
      });
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ error: authMessage, code: 'AUTH_ERROR' })}\n\n`);
      res.end();
    }
    return;
  }

  if (wantsJsonOnly) {
    try {
      const result = await generateChatJsonReply({
        messages: inputTurns,
        uiLanguage,
        attachment,
        memory,
        pastChatTitles,
      });
      res.status(200).json({
        success: true,
        reply: result.reply,
      });
    } catch (err: unknown) {
      const classified = classifyGeminiError(err);
      console.error(`Chat API JSON error [${classified.code}]:`, classified.logMessage);
      res.status(classified.status).json({
        success: false,
        code: classified.code,
        error: classified.userMessage,
      });
    }
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();

  try {
    await streamChatReply(
      {
        messages: inputTurns,
        uiLanguage,
        attachment,
        memory,
        pastChatTitles,
      },
      (delta) => {
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      }
    );
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    console.error(`Chat API stream error [${classified.code}]:`, classified.logMessage);
    res.write(`data: ${JSON.stringify({ error: classified.userMessage, code: classified.code })}\n\n`);
    res.end();
  }
}

export async function handleImage(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: {
    prompt?: string;
    aspectRatio?: string;
    style?: string;
    genMode?: 'real-photo' | 'ai-art';
    count?: number;
    sourceImage?: { base64: string; mimeType: string };
  };

  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.' });
    return;
  }

  const { prompt, aspectRatio, style, genMode = 'real-photo', count, sourceImage } = body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'A prompt is required for image generation.' });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({
      error: IMAGE_UNAVAILABLE_ERROR,
      unavailable: true,
    });
    return;
  }

  const validRatios = new Set(['1:1', '3:4', '4:3', '9:16', '16:9']);
  const safeRatio = aspectRatio && validRatios.has(aspectRatio) ? aspectRatio : '1:1';
  const numImages = count === 4 ? 4 : 1;

  const isEducationalDiagram =
    /\b(diagram|labeled|labelled|cross[- ]section|continental shelf|water cycle|solar system|food chain|anatomy|parts of|layers of|chart|infographic|educational|geography|biology|physics|chemistry|volcano|ecosystem|cell structure)\b/i.test(
      prompt
    );

  const modePromptStyle =
    genMode === 'ai-art'
      ? 'stunning AI digital art, neon purple + black theme, highly detailed, cinematic, 4K'
      : 'ultra-realistic photo, natural lighting, real camera look, sharp, like iPhone 15 Pro photo';

  const styleHints: Record<string, string> = {
    Realistic: isEducationalDiagram
      ? 'colorful, high-resolution, realistic educational scientific illustration and textbook diagram with crystal-clear legible English labels and clean pointer lines identifying each major feature, vivid natural colors, polished educational graphic style'
      : modePromptStyle,
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

  const selectedStyleSuffix =
    style && style !== 'Realistic' && styleHints[style]
      ? `${modePromptStyle}, ${styleHints[style]}`
      : isEducationalDiagram
        ? styleHints.Realistic
        : modePromptStyle;

  const aspectHint = safeRatio !== '1:1' ? `, aspect ratio ${safeRatio}` : '';
  const basePrompt = `${prompt.trim()}, ${selectedStyleSuffix}${diagramBoost}${aspectHint}`;

  const generateSingle = async (variationIndex: number) => {
    const ai = createGeminiClient();
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

    let lastErr: unknown = null;

    for (const modelName of VALID_IMAGE_MODELS) {
      try {
        const isPreviewModel = modelName === GEMINI_MODELS.imagePreview;
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: isPreviewModel
            ? {
                responseModalities: ['TEXT', 'IMAGE'],
              }
            : {
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
          return { imageUrl, caption: caption.trim(), model: modelName };
        }
        lastErr = new Error(
          caption.trim() || `Gemini (${modelName}) did not return an image for this prompt.`
        );
      } catch (err) {
        lastErr = err;
        console.warn(`Image model ${modelName} error:`, extractReadableGeminiError(err, 'Unknown error'));
      }
    }

    throw lastErr ?? new Error('Image generation failed.');
  };

  try {
    const results = await Promise.all(
      Array.from({ length: numImages }, (_, idx) => generateSingle(idx))
    );

    res.status(200).json({
      imageUrl: results[0].imageUrl,
      imageUrls: results.map((r) => r.imageUrl),
      caption: results[0].caption,
      model: results[0].model,
      genMode,
    });
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    console.error(`Image API error [${classified.code}]:`, classified.logMessage);
    const isQuota = isQuotaOrBillingError(err);
    res.status(isQuota ? 503 : classified.status).json({
      error: classified.logMessage || classified.userMessage,
      unavailable: isQuota,
    });
  }
}

export async function handleWallpaper(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: { style?: string; seed?: number };
  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.' });
    return;
  }

  const { style, seed } = body;
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
  let visualPrompt = `Ultra-clean vertical 9:16 mobile wallpaper in ${safeStyle} aesthetic, pure black and neon purple accents, crisp photography`;

  if (!isGeminiConfigured()) {
    res.status(503).json({
      imageUrl: null,
      title,
      quote,
      style: safeStyle,
      unavailable: true,
      error: IMAGE_UNAVAILABLE_ERROR,
    });
    return;
  }

  const ai = createGeminiClient();
  try {
    let textResText = '';
    for (const modelName of FAST_TEXT_MODELS) {
      try {
        const textRes = await ai.models.generateContent({
          model: modelName,
          contents: `Create a fresh daily mobile wallpaper concept for style "${safeStyle}" (variation seed ${seed ?? Date.now()}). Reply in strict JSON with 3 short string fields: "title" (2-4 words), "quote" (if style is "Bible Verse", give an inspiring authentic Bible verse with reference; if "Motivation", give an uplifting quote; otherwise a poetic 1-line caption), and "visualPrompt" (a rich 20-word visual prompt for a 9:16 luxury black and neon purple phone wallpaper).`,
          config: { responseMimeType: 'application/json' },
        });
        textResText = (textRes.text ?? '{}').trim();
        if (textResText && textResText !== '{}') break;
      } catch {
        // try next text model
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
  } catch (err) {
    console.warn('Wallpaper concept gen fallback:', extractReadableGeminiError(err, 'Unknown error'));
  }

  let lastImgError: unknown = null;
  for (const modelName of VALID_IMAGE_MODELS) {
    try {
      const imgRes = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [{ text: visualPrompt }] },
        config: { imageConfig: { aspectRatio: '9:16' } },
      });
      for (const part of imgRes.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          res.status(200).json({
            imageUrl: `data:${mime};base64,${part.inlineData.data}`,
            title,
            quote,
            style: safeStyle,
            source: 'ai',
          });
          return;
        }
      }
    } catch (err) {
      lastImgError = err;
    }
  }

  const classified = classifyGeminiError(lastImgError);
  console.error(`Wallpaper API error [${classified.code}]:`, classified.logMessage);
  const isQuota = isQuotaOrBillingError(lastImgError);
  res.status(isQuota ? 503 : classified.status).json({
    imageUrl: null,
    title,
    quote,
    style: safeStyle,
    unavailable: true,
    error: isQuota
      ? IMAGE_UNAVAILABLE_ERROR
      : 'Wallpaper image generation is currently unavailable. Please try again later.',
  });
}

export async function handleBuildApp(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: { prompt?: string; previousHtml?: string; editInstruction?: string };
  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.' });
    return;
  }

  const { prompt, previousHtml, editInstruction } = body;
  const userRequest = (editInstruction || prompt || '').trim();
  if (!userRequest) {
    res.status(400).json({ error: 'Please describe the website or app you want to build.' });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: 'Builder is temporarily unavailable right now.' });
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
    const ai = createGeminiClient();
    let rawText = '';
    let buildError: unknown = null;

    for (const modelName of FAST_TEXT_MODELS) {
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
        console.warn(`Builder model ${modelName} fallback:`, extractReadableGeminiError(err, 'Unknown error'));
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

    res.status(200).json({
      title: (parsed.title || 'Nova App').slice(0, 80),
      appType: parsed.appType === 'app' ? 'app' : 'website',
      summary: (parsed.summary || 'Your live website/app is ready!').slice(0, 400),
      html: safeHtml.slice(0, 36000),
    });
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    console.error(`Build App API error [${classified.code}]:`, classified.logMessage);
    res.status(classified.status).json({
      error: 'Could not build that right now. Try describing it in a short sentence.',
    });
  }
}

export async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: { audioBase64?: string; mimeType?: string };
  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ text: '', unavailable: true });
    return;
  }

  const { audioBase64, mimeType } = body;
  if (!audioBase64 || !isGeminiConfigured()) {
    res.status(200).json({ text: '', unavailable: true });
    return;
  }

  try {
    const ai = createGeminiClient();
    for (const modelName of FAST_TEXT_MODELS) {
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
          res.status(200).json({ text: transcript });
          return;
        }
      } catch (modelErr) {
        console.warn(`Transcribe ${modelName} fallback:`, extractReadableGeminiError(modelErr, 'Unknown error'));
      }
    }
    res.status(200).json({ text: '', unavailable: true });
  } catch (err: unknown) {
    console.warn('Transcribe fallback:', extractReadableGeminiError(err, 'Transcription unavailable.'));
    res.status(200).json({ text: '', unavailable: true });
  }
}

export async function handleTts(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: { text?: string; voiceName?: string };
  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON request body.' });
    return;
  }

  const { text, voiceName } = body;
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Text is required for speech generation.' });
    return;
  }

  if (!isGeminiConfigured()) {
    res.status(503).json({ error: 'Voice playback is currently unavailable.', unavailable: true });
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
    const ai = createGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODELS.tts,
      contents: [
        {
          role: 'user',
          parts: [{ text: cleanText }],
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

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(502).json({ error: 'Voice playback did not return audio data.' });
      return;
    }

    res.status(200).json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      provider: 'gemini',
      voiceName: safeVoice,
    });
  } catch (err: unknown) {
    const classified = classifyGeminiError(err);
    console.error(`Gemini TTS error [${classified.code}]:`, classified.logMessage);
    res.status(classified.status).json({ error: 'Voice playback is temporarily unavailable.' });
  }
}
