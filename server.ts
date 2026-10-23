import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { initConsoleLogger } from './src/server/logger.js';

// Modular Route Handlers
import { statsRouter } from './src/server/routes/stats.js';
import { postsRouter } from './src/server/routes/posts.js';
import { uploadRouter } from './src/server/routes/upload.js';
import { r2VideosRouter } from './src/server/routes/r2Videos.js';
import { syncRouter } from './src/server/routes/sync.js';
import { telegramBotRouter } from './src/server/routes/telegramBot.js';
import { scrapersRouter } from './src/server/routes/scrapers.js';

dotenv.config();
initConsoleLogger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

export const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.resolve(__dirname, 'public')));

// Lightweight health check endpoint
app.get(['/ping', '/api/ping'], (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Register Modular Routers
app.use(statsRouter);
app.use(postsRouter);
app.use(uploadRouter);
app.use(r2VideosRouter);
app.use(syncRouter);
app.use(telegramBotRouter);
app.use(scrapersRouter);

async function startServer() {
  // Resolve frontend distribution paths
  const candidateDistPaths = [
    path.resolve(__dirname, 'dist'),
    path.resolve(process.cwd(), 'dist'),
  ];
  const distPath = candidateDistPaths.find(p => fs.existsSync(path.resolve(p, 'index.html'))) || candidateDistPaths[0];
  const distIndexHtml = path.resolve(distPath, 'index.html');
  const hasDist = fs.existsSync(distIndexHtml);

  // Candidate public directories
  const candidatePublicPaths = [
    path.resolve(__dirname, 'public'),
    path.resolve(process.cwd(), 'public'),
  ];
  const publicPath = candidatePublicPaths.find(p => fs.existsSync(p));

  // Isolated 404 handler for unknown /api/* endpoints - never serve index.html for API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.path}`,
    });
  });

  if (isProd || hasDist) {
    console.log(`[Static] Production mode active. Serving static build from: ${distPath}`);

    // Serve hashed assets (/assets/*) with immutable long-term caching
    const assetsDir = path.resolve(distPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
      }));
    }

    // Serve public assets (e.g. plyr.svg, thumbnails)
    if (publicPath && fs.existsSync(publicPath)) {
      app.use(express.static(publicPath, { maxAge: '1h' }));
    }

    // Serve root static files (e.g. robots.txt, favicon.ico) from dist
    app.use(express.static(distPath, {
      maxAge: '1h',
      index: false,
    }));

    // Client-side routing catch-all fallback: serve index.html for all page routes
    app.get('*', (req, res) => {
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
        return res.status(404).type('text/plain').send('Static asset not found');
      }

      if (!fs.existsSync(distIndexHtml)) {
        console.error(`[Static Error] dist/index.html not found at ${distIndexHtml}`);
        return res.status(500).type('text/html').send(`
          <!doctype html>
          <html>
            <head><meta charset="utf-8"/><title>Deployment Notice</title></head>
            <body style="font-family:system-ui,sans-serif;background:#09090b;color:#f4f4f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;">
              <div style="max-width:500px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:28px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
                <h2 style="margin:0 0 8px 0;font-size:18px;color:#ef4444;">Frontend Build Missing</h2>
                <p style="margin:0 0 16px 0;font-size:13px;color:#a1a1aa;line-height:1.5;">The application is running in production mode, but <code>dist/index.html</code> was not generated. Ensure <code>npm run build</code> runs before starting the server.</p>
                <button onclick="window.location.reload()" style="background:#fff;color:#000;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Retry</button>
              </div>
            </body>
          </html>
        `);
      }

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.sendFile(distIndexHtml);
    });
  } else {
    console.log('[Static] Development mode active. Mounting Vite middleware.');
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
