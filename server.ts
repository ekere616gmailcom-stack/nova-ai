import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (req, res) => void handleHealth(req, res));
  app.get(['/api/gemini/test', '/api/test-gemini'], (req, res) => void handleGeminiTest(req, res));
  app.get('/api/chat', (req, res) => void handleChat(req, res));
  app.post('/api/chat', (req, res) => void handleChat(req, res));
  app.post('/api/image', (req, res) => void handleImage(req, res));
  app.post('/api/wallpaper', (req, res) => void handleWallpaper(req, res));
  app.post('/api/build-app', (req, res) => void handleBuildApp(req, res));
  app.post('/api/transcribe', (req, res) => void handleTranscribe(req, res));
  app.post('/api/tts', (req, res) => void handleTts(req, res));

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
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Nova server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Nova server:', err);
  process.exit(1);
});
