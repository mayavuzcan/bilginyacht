#!/usr/bin/env node
/**
 * Bilgin Yacht — AI Asset Generation Script
 *
 * Usage:
 *   npm run generate              # Generate all assets
 *   npm run generate:images       # Images only
 *   npm run generate:video        # Video only
 *   npm run generate:dry          # Dry run (preview what would be generated)
 *
 * Assets saved to: assets/generated/
 * Manifest saved to: assets/generated/manifest.json
 *
 * Cost estimates:
 *   Images (×14): ~$0.05–0.15 each  →  ~$1–2 total
 *   Video  (×1):  ~$2.80 (10s)      →  ~$3 total
 */
import 'dotenv/config';
import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateImage, IMAGE_PROMPTS } from '../services/image-gen.js';
import { generateVideo }                from '../services/video-gen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const OUT_DIR   = join(ROOT, 'assets', 'generated');
const MANIFEST  = join(OUT_DIR, 'manifest.json');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const imagesOnly  = args.includes('--images-only');
const videoOnly   = args.includes('--video-only');
const dryRun      = args.includes('--dry-run');
const skipExisting= !args.includes('--force');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { generated: null, images: {}, videos: {} };
  }
}

async function saveManifest(manifest) {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
}

async function fileExists(p) {
  try { await access(p); return true; }
  catch { return false; }
}

function banner(text) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(` ${text}`);
  console.log(line);
}

function tick(label, detail = '') {
  console.log(`  ✓ ${label}${detail ? '  →  ' + detail : ''}`);
}

function skip(label) {
  console.log(`  ↷ SKIP ${label} (already exists — use --force to regenerate)`);
}

function fail(label, err) {
  console.error(`  ✗ FAIL ${label}: ${err.message}`);
}

// ── Image generation ──────────────────────────────────────────────────────────
const IMAGE_TYPES = Object.keys(IMAGE_PROMPTS);

async function runImages(manifest) {
  banner('Generating Cinematic Yacht Images  (Nano Banana Pro)');
  console.log(`  Models: fal-ai/nano-banana-pro → fallback chain`);
  console.log(`  Count: ${IMAGE_TYPES.length} images at 2K 16:9 JPEG`);

  if (dryRun) {
    IMAGE_TYPES.forEach(t => console.log(`  [DRY] Would generate: ${t}`));
    return;
  }

  for (const type of IMAGE_TYPES) {
    if (skipExisting && manifest.images[type]) {
      skip(type);
      continue;
    }

    try {
      console.log(`\n  Generating: ${type}`);
      const result = await generateImage(type);
      manifest.images[type] = result.publicPath;
      tick(type, result.publicPath);
      await saveManifest(manifest); // save after each success
    } catch (err) {
      fail(type, err);
    }
  }
}

// ── Video generation ──────────────────────────────────────────────────────────
async function runVideo(manifest) {
  banner('Generating Cinematic Hero Video  (Kling v3 → v2 Master → v1.6 Pro)');
  console.log(`  Duration: 10 seconds · Aspect: 16:9`);
  console.log(`  Estimated time: 5–15 minutes`);
  console.log(`  Note: Video files are large (~50–200MB) and are gitignored.`);
  console.log(`        They are served directly by the Node server.`);

  if (dryRun) {
    console.log(`  [DRY] Would generate: hero video`);
    return;
  }

  if (skipExisting && manifest.videos.hero) {
    skip('hero video');
    return;
  }

  try {
    console.log('');
    const result = await generateVideo('hero');
    manifest.videos.hero = result.publicPath;
    tick('hero video', result.publicPath);
    await saveManifest(manifest);
  } catch (err) {
    fail('hero video', err);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  BILGIN YACHT — AI Asset Generation');
  console.log('  =====================================');
  if (dryRun)   console.log('  MODE: Dry run — no API calls will be made.\n');
  if (!dryRun)  console.log('  API key loaded from .env ✓\n');

  await mkdir(join(OUT_DIR, 'images'), { recursive: true });
  await mkdir(join(OUT_DIR, 'videos'), { recursive: true });

  const manifest = await loadManifest();

  if (!videoOnly) await runImages(manifest);
  if (!imagesOnly) await runVideo(manifest);

  manifest.generated = new Date().toISOString();
  await saveManifest(manifest);

  banner('Generation complete');
  const imgCount = Object.keys(manifest.images).length;
  const vidCount = Object.keys(manifest.videos).length;
  console.log(`  Images: ${imgCount}/${IMAGE_TYPES.length}`);
  console.log(`  Videos: ${vidCount}/1`);
  console.log(`  Manifest: assets/generated/manifest.json`);
  console.log(`\n  Start the server:  npm start`);
  console.log(`  Open:              http://localhost:3000\n`);
}

main().catch(err => {
  console.error('\n  Fatal error:', err.message);
  process.exit(1);
});
