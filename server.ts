import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import {
  GEMINI_MODELS,
  LANGUAGE_LABELS,
  createGeminiClient,
  isGeminiConfigured,
} from './geminiClient';
import {
  handleBuildApp,
  handleChat,
  handleGeminiTest,
  handleHealth,
  handleImage,
  handleTranscribe,
  handleTts,
  handleWallpaper,
} from './geminiHandlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const VALID_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (req, res) => void handleHealth(req, res));
  app.get(['/api/gemini/test', '/api/test-gemini'], (req, res) => void handleGeminiTest(req, res));
  app.post('/api/chat', (req, res) => void handleChat(req, res));
  app.post('/api/image', (req, res) => void handleImage(req, res));
  app.post('/api/wallpaper', (req, res) => void handleWallpaper(req, res));
  app.post('/api/build-app', (req, res) => void handleBuildApp(req, res));
  app.post('/api/transcribe', (req, res) => void handleTranscribe(req, res));
  app.post('/api/tts', (req, res) => void handleTts(req, res));

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

    if (!isGeminiConfigured()) {
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
      const ai = createGeminiClient();
      session = await ai.live.connect({
        model: GEMINI_MODELS.live,
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
