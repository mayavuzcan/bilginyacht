/**
 * Bilgin Yacht — Express Backend
 *
 * Responsibilities:
 *  - Serve the static frontend (index.html, css/, js/)
 *  - Serve AI-generated assets (assets/generated/)
 *  - Expose secure FAL AI generation API endpoints
 *  - Never expose FAL_KEY to client-side code
 *
 * Start: npm start  |  Dev: npm run dev
 */
import 'dotenv/config';
import express           from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFile }      from 'fs/promises';
import { existsSync }    from 'fs';

import { configureFal, fal } from './services/fal-client.js';
import { submitImageJob, getImageJobResult } from './services/image-gen.js';
import { submitVideoJob,  getVideoJobResult,  getJobStatus } from './services/video-gen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 3000;

// ── Configure FAL (server-side only) ─────────────────────────────────────────
let falReady = false;
try {
  configureFal();
  falReady = true;
  console.log('  FAL AI configured ✓');
} catch (err) {
  console.warn(`  FAL AI not configured: ${err.message}`);
  console.warn('  Generation endpoints will return 503. Run: cp .env.example .env');
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve only specific frontend directories (not the entire project root)
app.use('/css',    express.static(join(__dirname, 'css')));
app.use('/js',     express.static(join(__dirname, 'js')));
app.use('/assets', express.static(join(__dirname, 'assets')));

// Root → index.html
app.get('/', (req, res) => res.sendFile(join(__dirname, 'index.html')));

// ── In-memory job store (request_id → { model, type, submitted }) ─────────────
const jobs = new Map();

// ── API: Asset manifest ───────────────────────────────────────────────────────
app.get('/api/assets', async (req, res) => {
  const manifestPath = join(__dirname, 'assets', 'generated', 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const data = await readFile(manifestPath, 'utf-8');
      res.json(JSON.parse(data));
    } catch {
      res.json({ images: {}, videos: {} });
    }
  } else {
    res.json({ images: {}, videos: {} });
  }
});

// ── Middleware: FAL check ─────────────────────────────────────────────────────
function requireFal(req, res, next) {
  if (!falReady) {
    return res.status(503).json({
      error: 'FAL_KEY is not configured. Add it to .env and restart the server.',
    });
  }
  next();
}

// ── API: Submit image generation job ─────────────────────────────────────────
app.post('/api/generate/image', requireFal, async (req, res) => {
  const { type = 'hero', prompt, model } = req.body;
  try {
    const job = await submitImageJob(type, { prompt, model });
    jobs.set(job.requestId, { ...job, submitted: Date.now() });
    res.json({ success: true, requestId: job.requestId, model: job.model, type });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: Submit video generation job ─────────────────────────────────────────
app.post('/api/generate/video', requireFal, async (req, res) => {
  const { type = 'hero', prompt } = req.body;
  try {
    const job = await submitVideoJob(type, { prompt });
    jobs.set(job.requestId, { ...job, submitted: Date.now() });
    res.json({
      success: true,
      requestId: job.requestId,
      model: job.model,
      type,
      message: 'Video generation started. Poll /api/generate/status/:requestId for progress.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: Job status ───────────────────────────────────────────────────────────
app.get('/api/generate/status/:requestId', requireFal, async (req, res) => {
  const job = jobs.get(req.params.requestId);
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  try {
    const status = await getJobStatus(job.model, job.requestId);

    if (status.status === 'COMPLETED') {
      // Collect result and save asset
      try {
        const getter = job.type === 'hero' && job.model.includes('kling')
          ? getVideoJobResult
          : getImageJobResult;
        const result = await getter(job.model, job.requestId, job.type);

        // Update manifest
        const manifestPath = join(__dirname, 'assets', 'generated', 'manifest.json');
        let manifest = { images: {}, videos: {} };
        if (existsSync(manifestPath)) {
          manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        }
        const bucket = job.model.includes('kling') ? 'videos' : 'images';
        manifest[bucket][job.type] = result.publicPath;
        manifest.generated = new Date().toISOString();
        const { writeFile } = await import('fs/promises');
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

        jobs.delete(job.requestId);
        return res.json({ status: 'COMPLETED', asset: result.publicPath });
      } catch (err) {
        return res.status(500).json({ status: 'COMPLETED', error: 'Result download failed: ' + err.message });
      }
    }

    res.json({
      status: status.status,
      queuePosition: status.queue_position,
      elapsed: Math.round((Date.now() - job.submitted) / 1000) + 's',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: List active jobs ─────────────────────────────────────────────────────
app.get('/api/generate/jobs', (req, res) => {
  const list = [...jobs.entries()].map(([id, j]) => ({
    requestId: id,
    model: j.model,
    type: j.type,
    elapsed: Math.round((Date.now() - j.submitted) / 1000) + 's',
  }));
  res.json({ count: list.length, jobs: list });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  BILGIN YACHT`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Server:     http://localhost:${PORT}`);
  console.log(`  FAL AI:     ${falReady ? 'Ready ✓' : 'Not configured ✗'}`);
  console.log(`\n  Generate assets:   npm run generate`);
  console.log(`  API docs:          http://localhost:${PORT}/api/assets\n`);
});
