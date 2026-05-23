/**
 * Bilgin Yacht — Frame Sequence Extractor
 * ─────────────────────────────────────────────────────────
 * Converts the AI-generated hero video into a numbered JPEG
 * sequence for Apple-style canvas-based scroll rendering.
 *
 * Why: video.currentTime scrubbing is decoded frame-by-frame
 *      and can stutter under fast scroll. Pre-decoded JPEGs in
 *      memory render via ctx.drawImage() at paint speed — zero
 *      decoder lag, perfect frame accuracy.
 *
 * Requirements: ffmpeg must be installed and in PATH.
 *   Windows : winget install ffmpeg   (or scoop install ffmpeg)
 *   macOS   : brew install ffmpeg
 *   Linux   : sudo apt install ffmpeg
 *
 * Usage:
 *   node scripts/extract-frames.js             # skip if already done
 *   node scripts/extract-frames.js --force     # re-extract
 *   node scripts/extract-frames.js --fps=24    # override fps (default 20)
 *   node scripts/extract-frames.js --scale=1920 # width in px (default 1280)
 *   node scripts/extract-frames.js --quality=3  # JPEG 1(best)–31(worst), default 3
 */

import { spawn, spawnSync } from 'child_process';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

/* ── CLI arg parsing ──────────────────────────────────────── */
const argv    = process.argv.slice(2);
const FORCE   = argv.includes('--force');
const FPS     = parseInt(argv.find(a => a.startsWith('--fps='))?.split('=')[1]     ?? '20', 10);
const SCALE   = parseInt(argv.find(a => a.startsWith('--scale='))?.split('=')[1]   ?? '1280', 10);
const QUALITY = parseInt(argv.find(a => a.startsWith('--quality='))?.split('=')[1] ?? '3', 10);

/* ── Paths ────────────────────────────────────────────────── */
const VIDEOS_DIR   = path.join(ROOT, 'assets', 'generated', 'videos');
const FRAMES_DIR   = path.join(ROOT, 'assets', 'generated', 'frames');
const MANIFEST     = path.join(ROOT, 'assets', 'generated', 'manifest.json');

/* ── Helpers ─────────────────────────────────────────────── */
const log  = (...a) => console.log('  ', ...a);
const hr   = ()     => console.log('  ' + '─'.repeat(50));
const ok   = (...a) => console.log('  ✓', ...a);
const warn = (...a) => console.warn('  ⚠', ...a);
const err  = (...a) => { console.error('  ✗', ...a); process.exit(1); };

/* ── 1. Check ffmpeg ─────────────────────────────────────── */
function checkFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: false });
  if (r.status !== 0 || r.error) {
    console.error('\n  ✗ ffmpeg not found in PATH.\n');
    console.error('    Install it first:');
    console.error('      Windows : winget install ffmpeg');
    console.error('      macOS   : brew install ffmpeg');
    console.error('      Linux   : sudo apt install ffmpeg\n');
    process.exit(1);
  }
  const version = (r.stdout || '').split('\n')[0].replace('ffmpeg version ', '').split(' ')[0];
  ok(`ffmpeg ${version}`);
}

/* ── 2. Find hero video ──────────────────────────────────── */
function findHeroVideo() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    err('assets/generated/videos/ not found. Run: npm run generate:video');
  }
  const files = fs.readdirSync(VIDEOS_DIR)
    .filter(f => f.startsWith('hero-') && f.endsWith('.mp4'))
    .sort(); /* lexicographic sort on timestamp names = chronological order */

  if (!files.length) {
    err('No hero video found. Run: npm run generate:video');
  }
  /* Always use the MOST RECENT video (last after sort) */
  return path.join(VIDEOS_DIR, files[files.length - 1]);
}

/* ── 3. Probe video duration via ffprobe ─────────────────── */
function probeDuration(videoPath) {
  const r = spawnSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    videoPath,
  ], { encoding: 'utf8', shell: false });

  if (r.status === 0 && r.stdout) {
    try {
      const data = JSON.parse(r.stdout);
      const stream = data.streams?.find(s => s.codec_type === 'video');
      if (stream?.duration) return parseFloat(stream.duration);
    } catch {}
  }

  /* Fallback: extract duration from ffmpeg stderr */
  const r2 = spawnSync('ffmpeg', ['-i', videoPath], { encoding: 'utf8', shell: false });
  const match = (r2.stderr || '').match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
  }
  return 10; // safe default
}

/* ── 4. Check existing frames ─────────────────────────────── */
function existingFrameCount() {
  if (!fs.existsSync(FRAMES_DIR)) return 0;
  return fs.readdirSync(FRAMES_DIR).filter(f => /^frame_\d{4}\.jpg$/.test(f)).length;
}

/* ── 5. Extract frames with ffmpeg ───────────────────────── */
function extractFrames(videoPath) {
  /* Clean previous frames */
  if (fs.existsSync(FRAMES_DIR)) {
    fs.readdirSync(FRAMES_DIR)
      .filter(f => f.endsWith('.jpg'))
      .forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const outPattern = path.join(FRAMES_DIR, 'frame_%04d.jpg');

  /* vf filter: fps + scale (keep aspect ratio, ensure even height) */
  const vf = `fps=${FPS},scale=${SCALE}:-2:flags=lanczos`;

  log(`Settings : fps=${FPS}  scale=${SCALE}px  quality=${QUALITY}`);
  log(`Output   : assets/generated/frames/frame_XXXX.jpg`);
  log('');

  return new Promise((resolve, reject) => {
    const args = [
      '-i',  videoPath,
      '-vf', vf,
      '-q:v', String(QUALITY),
      '-compression_level', '0',   // fastest JPEG encoder
      '-y',                        // overwrite
      outPattern,
    ];

    const proc = spawn('ffmpeg', args, {
      stdio : ['ignore', 'ignore', 'pipe'],
      shell : false,
    });

    let stderrBuf = '';
    proc.stderr.on('data', chunk => {
      stderrBuf += chunk.toString();
      /* Print ffmpeg progress lines */
      const lines = stderrBuf.split('\r');
      stderrBuf = lines.pop();
      for (const line of lines) {
        const m = line.match(/frame=\s*(\d+)/);
        if (m) process.stdout.write(`\r  ↳ Extracting frame ${m[1]}…  `);
      }
    });

    proc.on('close', code => {
      process.stdout.write('\n');
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}\n${stderrBuf.slice(-500)}`));
      } else {
        const count = existingFrameCount();
        resolve(count);
      }
    });

    proc.on('error', e => reject(new Error(`Failed to start ffmpeg: ${e.message}`)));
  });
}

/* ── 6. Update manifest ────────────────────────────────────── */
function updateManifest(frameCount, duration) {
  let manifest = { images: {}, videos: {} };
  if (fs.existsSync(MANIFEST)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch {}
  }

  manifest.frames = {
    hero: {
      dir      : '/assets/generated/frames',
      count    : frameCount,
      fps      : FPS,
      duration : Math.round(duration * 1000) / 1000,
      quality  : QUALITY,
      scale    : SCALE,
      pattern  : 'frame_%04d.jpg',
      generated: new Date().toISOString(),
    },
  };

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  ok('Manifest updated (frames.hero)');
}

/* ── 7. Size report ─────────────────────────────────────────── */
function sizeReport(frameCount) {
  const files  = fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.jpg'));
  const bytes  = files.reduce((s, f) => s + fs.statSync(path.join(FRAMES_DIR, f)).size, 0);
  const avgKB  = (bytes / frameCount / 1024).toFixed(1);
  const totalMB= (bytes / 1024 / 1024).toFixed(1);

  hr();
  log(`Frames extracted : ${frameCount}`);
  log(`Average size     : ${avgKB} KB / frame`);
  log(`Total size       : ${totalMB} MB`);
  log(`Scroll smoothness: ${FPS} fps  (${(1000/FPS).toFixed(0)} ms/frame)`);
  hr();
  ok('Frame sequence ready. Restart the server and reload the page.\n');
}

/* ── Main ────────────────────────────────────────────────────── */
(async () => {
  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║   Bilgin Yacht — Frame Sequence Extractor   ║');
  console.log('  ╚══════════════════════════════════════════════╝\n');

  checkFfmpeg();

  const videoPath = findHeroVideo();
  ok(`Hero video : ${path.basename(videoPath)}`);

  const duration = probeDuration(videoPath);
  ok(`Duration   : ${duration.toFixed(2)}s  →  ~${Math.ceil(duration * FPS)} frames`);

  const existing = existingFrameCount();
  if (existing > 10 && !FORCE) {
    warn(`${existing} frames already exist in assets/generated/frames/`);
    warn('Use --force to re-extract.\n');
    process.exit(0);
  }

  log('');
  log('Extracting… (this takes 10–60 seconds)');

  let frameCount;
  try {
    frameCount = await extractFrames(videoPath);
  } catch (e) {
    err('Extraction failed:', e.message);
  }

  ok(`Extracted ${frameCount} frames`);
  updateManifest(frameCount, duration);
  sizeReport(frameCount);
})();
