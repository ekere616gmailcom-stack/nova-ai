import crypto from 'node:crypto';
import {
  PollinationsRateLimitError,
  blockOpenAI,
  callPollinationsText,
  checkCreatorPromptOverride,
  classifyAiError,
  extractReadableError,
  generateChatJsonReply,
  streamChatReply,
  testAiConnection,
  type ChatAttachmentInput,
  type ChatMemoryInput,
  type ChatTurnInput,
} from './geminiClient';

export interface ApiRequest {
  method?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface ApiResponse {
  statusCode?: number;
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  write: (chunk: string) => unknown;
  end: (chunk?: string | Buffer) => void;
  redirect?: (status: number, url: string) => void;
  flushHeaders?: () => void;
  socket?: { setNoDelay?: (noDelay?: boolean) => void } | null;
}

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

function buildPollinationsDirectImageUrl(
  prompt: string,
  width: number,
  height: number,
  seed: number
): string {
  const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  url.searchParams.set('model', 'turbo');
  url.searchParams.set('nologo', 'true');
  url.searchParams.set('seed', String(seed));
  return url.toString();
}

const IMAGE_BUFFER_CACHE = new Map<string, { buffer: Buffer; contentType: string; createdAt: number }>();
const IMAGE_BUFFER_CACHE_MAX = 50;

function saveCachedImageBuffer(buffer: Buffer, contentType: string): string {
  const id = crypto.randomBytes(8).toString('hex');
  if (IMAGE_BUFFER_CACHE.size >= IMAGE_BUFFER_CACHE_MAX) {
    const oldest = IMAGE_BUFFER_CACHE.keys().next().value;
    if (oldest) IMAGE_BUFFER_CACHE.delete(oldest);
  }
  IMAGE_BUFFER_CACHE.set(id, { buffer, contentType, createdAt: Date.now() });
  return id;
}

function buildPicsumFallbackUrl(width: number, height: number, seed: number): string {
  const safeW = Math.max(256, Math.min(1280, Math.round(width) || 512));
  const safeH = Math.max(256, Math.min(1280, Math.round(height) || 512));
  return `https://picsum.photos/${safeW}/${safeH}?random=${seed}`;
}

async function tryGeminiImageGeneration(prompt: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    } | null;
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
        return {
          buffer: Buffer.from(part.inlineData.data, 'base64'),
          contentType: part.inlineData.mimeType,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchVerifiedPollinationsImage(
  pollinationsUrl: string
): Promise<
  | { ok: true; buffer: Buffer; contentType: string }
  | { ok: false; rateLimited: boolean; retryAfter: number }
> {
  try {
    const res = await fetch(pollinationsUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json, image/jpeg;q=0.9, image/png;q=0.8',
      },
      signal: AbortSignal.timeout(25000),
    });

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const retryHeader = Number(res.headers.get('retry-after') || '0');
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // Pollinations sends 402/429 JSON OR 400 yellow error JPEG when rate limited
    if (res.status === 402 || res.status === 429) {
      let retryAfter = retryHeader || 45;
      if (ct.includes('json')) {
        const txt = buffer.toString('utf8');
        const m = txt.match(/wait\s+(\d+)\s+seconds/i);
        if (m) retryAfter = Math.max(retryAfter, Number(m[1]));
      }
      return { ok: false, rateLimited: true, retryAfter: Math.max(45, retryAfter) };
    }

    if (res.status === 400) {
      const textHead = ct.includes('json') || ct.includes('text') ? buffer.toString('utf8').toLowerCase() : '';
      const isLimit =
        textHead.includes('limit') ||
        textHead.includes('45 seconds') ||
        textHead.includes('free_limit') ||
        ct.startsWith('image/'); // Pollinations sends 400 yellow banner as image/jpeg
      return { ok: false, rateLimited: isLimit, retryAfter: 45 };
    }

    if (!res.ok || !ct.startsWith('image/') || buffer.length < 22000) {
      return { ok: false, rateLimited: false, retryAfter: 0 };
    }

    return { ok: true, buffer, contentType: ct.split(';')[0] || 'image/jpeg' };
  } catch {
    return { ok: false, rateLimited: false, retryAfter: 0 };
  }
}

export async function handleGenerateImage(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;

  let body: {
    prompt?: string;
    width?: number;
    height?: number;
    seed?: number;
    allowFallback?: boolean;
  };
  try {
    body = await parseJsonBody(req);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid JSON request body.' });
    return;
  }

  const rawPrompt = (body.prompt || '').trim() || 'minimal dark landscape';
  const width = typeof body.width === 'number' && Number.isFinite(body.width) ? body.width : 512;
  const height = typeof body.height === 'number' && Number.isFinite(body.height) ? body.height : 512;
  const seed = typeof body.seed === 'number' && Number.isFinite(body.seed) ? Math.floor(body.seed) : Date.now();
  const allowFallback = body.allowFallback === true;
  const picsumUrl = buildPicsumFallbackUrl(width, height, seed);

  // 1. Try Gemini Image (if GEMINI_API_KEY is configured)
  const geminiResult = await tryGeminiImageGeneration(rawPrompt);
  if (geminiResult) {
    const id = saveCachedImageBuffer(geminiResult.buffer, geminiResult.contentType);
    const imageUrl = `/api/image/cached/${id}?w=${width}&h=${height}&seed=${seed}`;
    res.status(200).json({ ok: true, imageUrl, source: 'gemini' });
    return;
  }

  // 2. Try Pollinations (checked server-side so yellow banner is NEVER forwarded)
  const safePrompt = `safe, family friendly, ${rawPrompt}, vibrant natural colours`;
  const pollinationsUrl = buildPollinationsDirectImageUrl(safePrompt, width, height, seed);
  const pollResult = await fetchVerifiedPollinationsImage(pollinationsUrl);

  if (pollResult.ok) {
    const id = saveCachedImageBuffer(pollResult.buffer, pollResult.contentType);
    const imageUrl = `/api/image/cached/${id}?w=${width}&h=${height}&seed=${seed}`;
    res.status(200).json({ ok: true, imageUrl, source: 'pollinations' });
    return;
  }

  if (pollResult.rateLimited && !allowFallback) {
    res.status(429).json({
      ok: false,
      rateLimited: true,
      retryAfter: 45,
      error: 'Image limit reached. Wait 45s.',
    });
    return;
  }

  // 3. Picsum fallback
  res.status(200).json({ ok: true, imageUrl: picsumUrl, source: 'picsum' });
}

export async function handleCachedImage(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'GET')) return;
  const id = req.params?.id || '';
  const entry = id ? IMAGE_BUFFER_CACHE.get(id) : undefined;
  if (entry) {
    res.setHeader('Content-Type', entry.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200);
    res.end(entry.buffer);
    return;
  }
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const w = Number(parsedUrl.searchParams.get('w') || '512') || 512;
  const h = Number(parsedUrl.searchParams.get('h') || '512') || 512;
  const seed = Number(parsedUrl.searchParams.get('seed') || String(Date.now())) || Date.now();
  const fallback = buildPicsumFallbackUrl(w, h, seed);
  res.setHeader('Location', fallback);
  res.status(302).end();
}

export async function handleSafeImageProxy(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'GET')) return;
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const targetUrl = parsedUrl.searchParams.get('url') || '';
  const w = Number(parsedUrl.searchParams.get('w') || '512') || 512;
  const h = Number(parsedUrl.searchParams.get('h') || '512') || 512;
  const seed = Number(parsedUrl.searchParams.get('seed') || String(Date.now())) || Date.now();
  const fallback = buildPicsumFallbackUrl(w, h, seed);

  if (targetUrl.startsWith('https://image.pollinations.ai/')) {
    const result = await fetchVerifiedPollinationsImage(targetUrl);
    if (result.ok) {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200);
      res.end(result.buffer);
      return;
    }
  }

  res.setHeader('Location', fallback);
  res.status(302).end();
}

export async function handleHealth(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'GET')) return;
  res.status(200).json({
    ok: true,
    service: 'nova-ai',
    aiConfigured: true,
    mode: 'keyless-pollinations',
  });
}

export async function handleGeminiTest(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'GET')) return;
  const result = await testAiConnection();
  res.status(200).json(result);
}

export async function handleChat(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method?.toUpperCase() === 'GET') {
    let promptParam = typeof req.query?.prompt === 'string' ? req.query.prompt : '';
    let systemParam = typeof req.query?.system === 'string' ? req.query.system : '';
    if ((!promptParam || !systemParam) && req.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        if (!promptParam) promptParam = parsedUrl.searchParams.get('prompt') || '';
        if (!systemParam) systemParam = parsedUrl.searchParams.get('system') || '';
      } catch {
        // ignore invalid url
      }
    }
    const cleanPrompt = promptParam.trim();
    if (!cleanPrompt) {
      res.status(400).json({ success: false, error: 'Prompt query parameter is required.' });
      return;
    }

    const extractedUserLine =
      cleanPrompt.match(/(?:^|\s)User:\s*([\s\S]*?)(?:\s+Nova:\s*$|$)/i)?.[1]?.trim() || cleanPrompt;
    const creatorOverride = checkCreatorPromptOverride(extractedUserLine);
    if (creatorOverride) {
      res.status(200).json({ success: true, reply: creatorOverride });
      return;
    }

    try {
      const rawReply = await callPollinationsText({
        prompt: cleanPrompt,
        systemPrompt: systemParam.trim() || undefined,
      });
      res.status(200).json({ success: true, reply: blockOpenAI(rawReply) });
    } catch (err: unknown) {
      const classified = classifyAiError(err);
      console.error(`Chat GET proxy error [${classified.code}]:`, classified.logMessage);
      if (err instanceof PollinationsRateLimitError) {
        res.status(429).json({
          success: false,
          code: 'RATE_LIMIT',
          retryAfter: err.retryAfterSeconds,
          error: classified.userMessage,
        });
        return;
      }
      res.status(classified.status).json({
        success: false,
        code: classified.code,
        error: classified.logMessage || classified.userMessage,
      });
    }
    return;
  }

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
      const classified = classifyAiError(err);
      console.error(`Chat API JSON error [${classified.code}]:`, classified.logMessage);
      if (err instanceof PollinationsRateLimitError) {
        res.status(429).json({
          success: false,
          code: 'RATE_LIMIT',
          rateLimited: true,
          retryAfter: err.retryAfterSeconds,
          directPrompt: err.directPrompt,
          directSystemPrompt: err.directSystemPrompt,
          error: classified.userMessage,
        });
        return;
      }
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
    const classified = classifyAiError(err);
    console.error(`Chat API stream error [${classified.code}]:`, classified.logMessage);
    if (err instanceof PollinationsRateLimitError) {
      res.write(
        `data: ${JSON.stringify({
          error: classified.userMessage,
          code: 'RATE_LIMIT',
          rateLimited: true,
          retryAfter: err.retryAfterSeconds,
          directPrompt: err.directPrompt,
          directSystemPrompt: err.directSystemPrompt,
        })}\n\n`
      );
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ error: classified.userMessage, code: classified.code })}\n\n`);
    res.end();
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
  const numericSeed = typeof seed === 'number' && Number.isFinite(seed) ? Math.floor(seed) : Date.now();

  const stylePresets: Record<string, Array<{ title: string; quote: string; visual: string }>> = {
    Nature: [
      {
        title: 'Midnight Horizon',
        quote: 'In every quiet dawn, the earth renews its promise.',
        visual: 'serene moonlit mountain valley and reflective lake under clear twilight sky, natural colours, ultra-detailed vertical phone wallpaper',
      },
      {
        title: 'Velvet Ocean',
        quote: 'Breathe deep—waves always find their rhythm again.',
        visual: 'calm dark ocean waves reflecting silver moonlight and soft blue horizon mist, natural colours, vertical 9:16 photography wallpaper',
      },
    ],
    Anime: [
      {
        title: 'Starlight Sky',
        quote: 'Look up at the drifting constellations—every step forward glows.',
        visual: 'breathtaking anime night sky above rooftop, glowing shooting stars, vibrant natural colours, Makoto Shinkai aesthetic, vertical 9:16',
      },
      {
        title: 'Moonlit Blossom',
        quote: 'Quiet nights make room for the brightest dreams.',
        visual: 'anime cherry blossom tree glowing softly in silver moonlight over a peaceful shrine, natural colours, crisp 9:16 wallpaper art',
      },
    ],
    City: [
      {
        title: 'Midnight Metropolis',
        quote: 'City reflections over rain-kissed avenues at dawn.',
        visual: 'futuristic metropolis skyline at midnight, sleek skyscrapers and warm city reflections on wet streets, natural colours, 9:16 vertical',
      },
      {
        title: 'Skyline Glow',
        quote: 'Every light in the city belongs to someone building a dream.',
        visual: 'minimalist luxury city skyline from above with glowing city light trails, realistic colours, crisp 9:16 vertical wallpaper',
      },
    ],
    Abstract: [
      {
        title: 'Obsidian Waves',
        quote: 'Form follows stillness inside fluid geometry.',
        visual: 'luxury 3D obsidian black liquid waves with warm silver light reflections, minimalist AMOLED vertical 9:16 wallpaper',
      },
      {
        title: 'Prism Drift',
        quote: 'Clarity shines brightest against pure darkness.',
        visual: 'abstract matte black and luminous crystal glass light refractions, natural colours, sleek futuristic 9:16 AMOLED phone background',
      },
    ],
    'Bible Verse': [
      {
        title: 'Psalm 46:5',
        quote: 'God is within her, she will not fall; God will help her at break of day.',
        visual: 'peaceful golden sunrise breaking through clouds over calm mountain peaks, natural colours, heavenly 9:16 mobile wallpaper',
      },
      {
        title: 'Isaiah 40:31',
        quote: 'Those who hope in the Lord will renew their strength; they will soar on wings like eagles.',
        visual: 'majestic dawn light shining across quiet highland skies in warm golden tones, natural colours, serene inspirational 9:16 wallpaper',
      },
      {
        title: 'Jeremiah 29:11',
        quote: 'For I know the plans I have for you, plans to give you hope and a future.',
        visual: 'starlit night sky fading into hopeful golden dawn above still waters, natural colours, tranquil 9:16 mobile wallpaper',
      },
    ],
    Motivation: [
      {
        title: 'Daily Focus',
        quote: 'Small disciplined mornings build extraordinary years.',
        visual: 'dramatic dark mountain summit illuminated by golden sunrise light, natural colours, clean 9:16 motivational wallpaper',
      },
      {
        title: 'Keep Rising',
        quote: 'Consistency turns quiet effort into undeniable results.',
        visual: 'sleek minimalist black geometric staircase climbing toward radiant sunrise horizon light, realistic colours, 9:16 mobile wallpaper',
      },
    ],
  };

  const choices = stylePresets[safeStyle] || stylePresets.Nature;
  const pick = choices[Math.abs(numericSeed) % choices.length];

  const directUrl = buildPollinationsDirectImageUrl(pick.visual, 512, 512, numericSeed);
  const imageUrl = `/api/image/safe?url=${encodeURIComponent(directUrl)}&w=512&h=512&seed=${numericSeed}`;
  res.status(200).json({
    imageUrl,
    title: pick.title,
    quote: pick.quote,
    style: safeStyle,
    source: 'ai',
  });
}

function buildFallbackInteractiveHtml(userRequest: string): {
  title: string;
  appType: 'website' | 'app';
  summary: string;
  html: string;
} {
  const lower = userRequest.toLowerCase();
  const isCalc = /\bcalc|calculator\b/i.test(lower);
  const isTodo = /\bto-?do|task|checklist\b/i.test(lower);
  const isQuiz = /\bquiz|trivia\b/i.test(lower);
  const isWeather = /\bweather|forecast\b/i.test(lower);

  if (isCalc) {
    return {
      title: 'Nova Smart Calculator',
      appType: 'app',
      summary: 'Built a sleek black & neon-purple interactive calculator app ready to use!',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calculator</title><style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}body{margin:0;min-height:100vh;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;padding:16px}.card{width:100%;max-width:340px;background:#0A0A0A;border:1px solid #A855F7;border-radius:24px;padding:20px;box-shadow:0 0 36px -10px rgba(191,90,242,.6)}.disp{background:#000;border:1px solid rgba(168,85,247,.35);border-radius:16px;padding:18px;text-align:right;font-size:2rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}button{border:1px solid rgba(168,85,247,.3);background:#121212;color:#fff;font-size:1.1rem;font-weight:600;padding:16px 0;border-radius:14px;cursor:pointer;transition:.15s}button:hover{border-color:#BF5AF2;background:#1d1226}.op{color:#BF5AF2}.eq{grid-column:span 2;background:linear-gradient(135deg,#A855F7,#BF5AF2);border:none}</style></head><body><div class="card"><div id="d" class="disp">0</div><div class="grid"><button class="op" onclick="clr()">C</button><button class="op" onclick="bs()">⌫</button><button class="op" onclick="add('%')">%</button><button class="op" onclick="add('/')">÷</button><button onclick="add('7')">7</button><button onclick="add('8')">8</button><button onclick="add('9')">9</button><button class="op" onclick="add('*')">×</button><button onclick="add('4')">4</button><button onclick="add('5')">5</button><button onclick="add('6')">6</button><button class="op" onclick="add('-')">−</button><button onclick="add('1')">1</button><button onclick="add('2')">2</button><button onclick="add('3')">3</button><button class="op" onclick="add('+')">+</button><button onclick="add('0')">0</button><button onclick="add('.')">.</button><button class="eq" onclick="ev()">=</button></div></div><script>let expr='';const d=document.getElementById('d');function add(v){expr+=v;d.textContent=expr||'0'}function clr(){expr='';d.textContent='0'}function bs(){expr=expr.slice(0,-1);d.textContent=expr||'0'}function ev(){try{const res=Function('"use strict";return ('+expr.replace(/%/g,'/100')+')')();expr=String(Number.isFinite(res)?+res.toFixed(8):0);d.textContent=expr}catch{d.textContent='Error';expr=''}}</script></body></html>`,
    };
  }

  if (isTodo) {
    return {
      title: 'Nova To-Do Planner',
      appType: 'app',
      summary: 'Built a working interactive To-Do app where you can add, check off, and delete tasks!',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>To-Do App</title><style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}body{margin:0;min-height:100vh;background:#000;color:#fff;padding:24px;display:flex;justify-content:center}.wrap{width:100%;max-width:480px;background:#0A0A0A;border:1px solid #A855F7;border-radius:24px;padding:22px}h1{margin:0 0 14px;font-size:1.4rem}.row{display:flex;gap:8px;margin-bottom:16px}input{flex:1;background:#000;border:1px solid rgba(168,85,247,.4);color:#fff;border-radius:12px;padding:11px 14px;outline:none}button.add{background:linear-gradient(135deg,#A855F7,#BF5AF2);color:#fff;border:none;border-radius:12px;padding:0 18px;font-weight:600;cursor:pointer}ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}li{display:flex;align-items:center;justify-content:space-between;background:#000;border:1px solid rgba(168,85,247,.25);border-radius:12px;padding:10px 14px}.done{text-decoration:line-through;opacity:.5}.del{background:transparent;border:none;color:#BF5AF2;cursor:pointer;font-weight:600}</style></head><body><div class="wrap"><h1>My Tasks</h1><div class="row"><input id="t" placeholder="Add a new task..." onkeydown="if(event.key==='Enter')add()"><button class="add" onclick="add()">Add</button></div><ul id="list"></ul></div><script>const tasks=[{txt:'Build something awesome today',done:false}];function render(){const ul=document.getElementById('list');ul.innerHTML='';tasks.forEach((item,i)=>{const li=document.createElement('li');const span=document.createElement('span');span.textContent=item.txt;if(item.done)span.className='done';span.style.cursor='pointer';span.onclick=()=>{item.done=!item.done;render()};const b=document.createElement('button');b.className='del';b.textContent='✕';b.onclick=()=>{tasks.splice(i,1);render()};li.append(span,b);ul.append(li);});}function add(){const inp=document.getElementById('t');if(!inp.value.trim())return;tasks.unshift({txt:inp.value.trim(),done:false});inp.value='';render()}render();</script></body></html>`,
    };
  }

  if (isQuiz) {
    return {
      title: 'Interactive Quiz App',
      appType: 'app',
      summary: 'Built a fun interactive multi-question quiz with live score tracking!',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quiz App</title><style>*{box-sizing:border-box;font-family:system-ui,sans-serif}body{margin:0;min-height:100vh;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;padding:16px}.card{width:100%;max-width:480px;background:#0A0A0A;border:1px solid #A855F7;border-radius:24px;padding:24px}h2{margin:0 0 16px}.opt{display:block;width:100%;text-align:left;background:#000;border:1px solid rgba(168,85,247,.35);color:#fff;padding:12px 16px;border-radius:14px;margin-bottom:10px;cursor:pointer}.opt:hover{border-color:#BF5AF2;background:#160b21}.btn{background:linear-gradient(135deg,#A855F7,#BF5AF2);border:none;color:#fff;padding:10px 18px;border-radius:12px;font-weight:600;cursor:pointer}</style></head><body><div class="card" id="app"></div><script>const qs=[{q:'Which planet is known as the Red Planet?',a:['Mars','Venus','Jupiter'],c:0},{q:'What is 12 × 8?',a:['88','96','104'],c:1},{q:'Which ocean is the largest on Earth?',a:['Atlantic','Indian','Pacific'],c:2}];let i=0,score=0;function show(){const el=document.getElementById('app');if(i>=qs.length){el.innerHTML='<h2>All Done! Score: '+score+'/'+qs.length+'</h2><button class="btn" onclick="i=0;score=0;show()">Play Again</button>';return}const cur=qs[i];el.innerHTML='<div style="color:#BF5AF2;font-size:12px;margin-bottom:8px">Question '+(i+1)+' of '+qs.length+'</div><h2>'+cur.q+'</h2>'+cur.a.map((o,idx)=>'<button class="opt" onclick="pick('+idx+')">'+o+'</button>').join('')}function pick(idx){if(idx===qs[i].c)score++;i++;show()}show()</script></body></html>`,
    };
  }

  if (isWeather) {
    return {
      title: 'Nova Weather App',
      appType: 'app',
      summary: 'Built a responsive weather dashboard with city switching and °C / °F toggle!',
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weather</title><style>*{box-sizing:border-box;font-family:system-ui,sans-serif}body{margin:0;min-height:100vh;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;padding:16px}.card{width:100%;max-width:460px;background:#0A0A0A;border:1px solid #A855F7;border-radius:24px;padding:24px}.cities{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}button{background:#000;border:1px solid rgba(168,85,247,.35);color:#fff;padding:8px 12px;border-radius:12px;cursor:pointer;font-size:12px}button.act{background:linear-gradient(135deg,#A855F7,#BF5AF2);border:none}.temp{font-size:3rem;font-weight:700;margin:8px 0}</style></head><body><div class="card"><div class="cities" id="c"></div><div id="info"></div></div><script>const data={Lagos:{c:30,cond:'Warm & Breezy 🌤️',hum:'72%'},Abuja:{c:32,cond:'Sunny Clear Sky ☀️',hum:'48%'},London:{c:14,cond:'Light Clouds ⛅',hum:'68%'},'New York':{c:18,cond:'Crisp & Clear 🌤️',hum:'54%'}};let cur='Lagos',unit='C';function render(){document.getElementById('c').innerHTML=Object.keys(data).map(k=>'<button class="'+(k===cur?'act':'')+'" onclick="cur=\''+k+'\';render()">'+k+'</button>').join('')+'<button onclick="unit=unit===\'C\'?\'F\':\'C\';render()">°'+unit+'</button>';const d=data[cur];const t=unit==='C'?d.c:Math.round(d.c*9/5+32);document.getElementById('info').innerHTML='<h2>'+cur+'</h2><div class="temp">'+t+'°'+unit+'</div><p>'+d.cond+' · Humidity '+d.hum+'</p>'}render()</script></body></html>`,
    };
  }

  const safeHeading = userRequest.replace(/[<>&"]/g, '').slice(0, 60) || 'Modern Website';
  return {
    title: safeHeading,
    appType: 'website',
    summary: `Built a clean, mobile-friendly website preview for "${safeHeading}" with interactive tabs and contact form!`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeHeading}</title><style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}body{margin:0;background:#000;color:#fff;line-height:1.6}nav{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid rgba(168,85,247,.3);background:#0A0A0A;position:sticky;top:0}a{color:#fff;text-decoration:none;margin-left:16px;font-size:14px;opacity:.85}a:hover{color:#BF5AF2;opacity:1}.hero{max-width:900px;margin:0 auto;padding:64px 24px 48px;text-align:center}.badge{display:inline-block;padding:6px 14px;border-radius:999px;border:1px solid #BF5AF2;color:#BF5AF2;font-size:12px;margin-bottom:16px}h1{font-size:2.4rem;margin:0 0 14px;line-height:1.15}.cta{display:inline-block;background:linear-gradient(135deg,#A855F7,#BF5AF2);color:#fff;padding:12px 24px;border-radius:14px;font-weight:600;border:none;cursor:pointer;margin-top:12px}.grid{max-width:900px;margin:0 auto;padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#0A0A0A;border:1px solid rgba(168,85,247,.3);border-radius:20px;padding:20px}.contact{max-width:560px;margin:32px auto 64px;padding:24px;background:#0A0A0A;border:1px solid rgba(168,85,247,.35);border-radius:22px}input,textarea{width:100%;background:#000;border:1px solid rgba(168,85,247,.35);color:#fff;border-radius:12px;padding:11px 14px;margin-bottom:12px;outline:none}</style></head><body><nav><strong>${safeHeading}</strong><div><a href="#features">Highlights</a><a href="#contact">Contact</a></div></nav><section class="hero"><span class="badge">Live Interactive Preview</span><h1>${safeHeading}</h1><p style="color:rgba(255,255,255,.72);max-width:560px;margin:0 auto">Crafted cleanly with responsive mobile layout, modern black and neon purple styling, and interactive sections.</p><a href="#contact" class="cta">Get Started</a></section><section id="features" class="grid"><div class="card"><h3>Fast &amp; Modern</h3><p style="color:rgba(255,255,255,.7);font-size:14px">Responsive layout tailored for phones, tablets, and desktops.</p></div><div class="card"><h3>Interactive Experience</h3><p style="color:rgba(255,255,255,.7);font-size:14px">Smooth navigation and instant confirmation on actions.</p></div><div class="card"><h3>Easy to Customize</h3><p style="color:rgba(255,255,255,.7);font-size:14px">Tell Nova below if you want new colors, pages, or text.</p></div></section><section id="contact" class="contact"><h2>Contact Us</h2><form onsubmit="event.preventDefault();document.getElementById('ok').style.display='block';this.reset()"><input placeholder="Your name" required><input type="email" placeholder="Your email" required><textarea rows="3" placeholder="How can we help?" required></textarea><button class="cta" type="submit">Send Message</button></form><p id="ok" style="display:none;color:#BF5AF2;margin-top:12px;font-weight:600">Thanks! Your message has been received.</p></section></body></html>`,
  };
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

  const isEditMode = Boolean(previousHtml && editInstruction);

  const builderSystemInstruction = [
    'You are Nova App & Website Builder. Generate a complete single-file responsive HTML5 website or interactive mini-app.',
    'Reply ONLY with valid JSON: {"title":"...","appType":"website"|"app","summary":"...","html":"<!DOCTYPE html>..."}',
    'Never use alert(), confirm(), prompt(), or window.open(). Keep html compact (<24000 chars) with clean <style> and working <script> inside.',
  ].join(' ');

  const promptForAi = isEditMode
    ? `Update this HTML app with: ${editInstruction}\n\nExisting HTML:\n${String(previousHtml).slice(0, 1800)}`
    : `Build a working, stylish, responsive website or mini-app for: ${userRequest}`;

  try {
    const rawText = await callPollinationsText({
      prompt: promptForAi,
      systemPrompt: builderSystemInstruction,
      jsonMode: true,
    });

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        title?: string;
        appType?: string;
        summary?: string;
        html?: string;
      };
      if (parsed.html && parsed.html.trim().includes('<html')) {
        res.status(200).json({
          title: (parsed.title || 'Nova App').slice(0, 80),
          appType: parsed.appType === 'app' ? 'app' : 'website',
          summary: (parsed.summary || 'Your live website/app is ready!').slice(0, 400),
          html: parsed.html.trim().slice(0, 36000),
        });
        return;
      }
    }

    const htmlMatch = rawText.match(/<!DOCTYPE html[\s\S]*<\/html>/i) || rawText.match(/<html[\s\S]*<\/html>/i);
    if (htmlMatch?.[0]) {
      res.status(200).json({
        title: userRequest.slice(0, 60),
        appType: /\b(app|calc|todo|quiz|player|weather)\b/i.test(userRequest) ? 'app' : 'website',
        summary: 'Your live interactive preview is ready!',
        html: htmlMatch[0].slice(0, 36000),
      });
      return;
    }
  } catch (err) {
    console.warn('Builder Pollinations fallback:', extractReadableError(err, 'Builder fallback used'));
  }

  const fallback = buildFallbackInteractiveHtml(userRequest);
  res.status(200).json(fallback);
}

export async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;
  res.status(200).json({ text: '', unavailable: true });
}

export async function handleTts(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (rejectWrongMethod(req, res, 'POST')) return;
  res.status(200).json({ error: 'Use built-in browser read-aloud.', unavailable: true });
}
