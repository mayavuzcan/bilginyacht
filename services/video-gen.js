/**
 * Kling video generation service.
 * Server-side only — FAL API key never exposed to browser.
 *
 * Confirmed API:
 *   Primary:  fal-ai/kling-video/v3/standard/text-to-video  (user-preferred)
 *   Fallback: fal-ai/kling-video/v2/master/text-to-video    (confirmed available)
 *   Fallback: fal-ai/kling-video/v1.6/pro/text-to-video     (confirmed available)
 *
 *   Input:  prompt, aspect_ratio, duration, negative_prompt, cfg_scale
 *   Output: { video: { url, content_type, file_name, file_size } }
 */
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { configureFal, fal } from './fal-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR = join(__dirname, '..', 'assets', 'generated', 'videos');

// ── Model fallback chain ──────────────────────────────────────────────────────
const VIDEO_MODELS = [
  'fal-ai/kling-video/v3/standard/text-to-video',
  'fal-ai/kling-video/v2/master/text-to-video',
  'fal-ai/kling-video/v1.6/pro/text-to-video',
];

// ── Hero cinematic prompt ─────────────────────────────────────────────────────
export const HERO_VIDEO_PROMPT = `Ultra-realistic cinematic luxury superyacht commercial. One unbroken Steadicam shot. Slow, elegant, premium pacing throughout.

A massive 72-meter white superyacht fills the frame at all times — close, dominant, grand. Mediterranean Sea, late afternoon golden hour. Glassy calm water with warm golden reflections.

SEQUENCE: Camera begins hovering low at water level on the port (left) side of the yacht. The entire hull and superstructure towers overhead. Camera glides smoothly forward, hugging the hull, then gently rises to main deck height. The polished glass salon entrance comes into view — chrome handles, teak deck, steel railings. Camera pushes slowly through the open glass doors into the grand salon interior. Inside: soft amber indirect lighting, floor-to-ceiling book-matched walnut panels, polished Carrara marble, cream leather sofas, crystal decanters, gold hardware, panoramic windows showing the Mediterranean beyond. Camera drifts forward slowly through the opulent space, lingering on details. Then the camera smoothly pulls back — retreating through the salon, back through the glass entrance doors, gliding back over the teak deck, descending to the port waterline. Camera continues forward alongside the port hull toward the bow. The bow passes slowly overhead. Camera arcs around to the starboard side. The full starboard profile of the superyacht is revealed in the final frame — glowing in warm sunset gold, long reflections rippling on the calm sea, atmospheric haze on the horizon.

Cinematic depth of field. Soft bloom. Warm golden tones throughout. No cuts. No shake.`;


export const GALLERY_VIDEO_PROMPTS = {
  'exterior-flyby': `Ultra-luxury 72m superyacht aerial flyby, Mediterranean Sea, golden hour.
Smooth drone trajectory from stern to bow at deck height, then rising to aerial view.
Deep blue water, golden light, realistic water wake, cinematic pacing.
Luxury yacht commercial quality. Apple-style smooth motion.`,

  'interior-walkthrough': `Cinematic walkthrough of ultra-luxury superyacht interior.
Smooth slow-motion reveal: grand salon → formal dining → master stateroom corridor.
Warm indirect lighting, book-matched walnut, marble, premium leather.
Luxury interior photography in motion. Elegant, cinematic.`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function downloadVideo(url, destPath) {
  await mkdir(dirname(destPath), { recursive: true });

  console.log(`  Downloading video (may be large) ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const buffer = await res.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));
  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
  console.log(`  Download complete: ${sizeMB} MB`);
}

function extractVideoUrl(data) {
  if (data?.video?.url) return data.video.url;
  if (data?.video_url) return data.video_url;
  throw new Error('Unexpected video response shape: ' + JSON.stringify(data).slice(0, 200));
}

// ── Core generation (blocking — use in CLI scripts) ───────────────────────────
export async function generateVideo(type = 'hero', options = {}) {
  configureFal();

  const prompt = options.prompt || HERO_VIDEO_PROMPT;

  const input = {
    prompt,
    aspect_ratio:    '16:9',
    duration:        options.duration        || '10',
    negative_prompt: options.negative_prompt || 'blur, distortion, low quality, fast movement, shaky camera, cartoon, CGI artifacts, jump cut, teleportation, oversaturated, unrealistic, cheap production, small yacht, distant yacht, wide shot',
    cfg_scale:       options.cfg_scale       || 0.7,
  };

  let lastError;

  for (const model of VIDEO_MODELS) {
    try {
      console.log(`\n  Using model: ${model}`);
      console.log('  Submitting to queue (video generation takes 4-15 minutes)...\n');

      const startTime = Date.now();
      let lastStatus  = '';

      const result = await fal.subscribe(model, {
        input,
        logs: true,
        onQueueUpdate(update) {
          if (update.status !== lastStatus) {
            lastStatus = update.status;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            process.stdout.write(`\r  Status: ${update.status.padEnd(20)} elapsed: ${elapsed}s   `);
          }
          if (update.status === 'IN_PROGRESS' && update.logs?.length) {
            const msg = update.logs.slice(-1)[0]?.message;
            if (msg) process.stdout.write(`\r  ${msg.slice(0, 70).padEnd(70)}`);
          }
        },
      });

      console.log('');
      const remoteUrl = extractVideoUrl(result.data);
      const filename  = `${type}-${Date.now()}.mp4`;
      const localPath = join(VIDEOS_DIR, filename);

      await downloadVideo(remoteUrl, localPath);

      return {
        type,
        model,
        remoteUrl,
        localPath,
        publicPath: `/assets/generated/videos/${filename}`,
      };
    } catch (err) {
      console.log(`\n  Model ${model} failed: ${err.message.slice(0, 80)}`);
      lastError = err;
    }
  }

  throw new Error(`All video models failed for "${type}". Last: ${lastError?.message}`);
}

// ── Queue-based (non-blocking, for Express endpoints) ─────────────────────────
export async function submitVideoJob(type = 'hero', options = {}) {
  configureFal();
  const prompt = options.prompt || HERO_VIDEO_PROMPT;
  const model  = VIDEO_MODELS[0];

  const { request_id } = await fal.queue.submit(model, {
    input: {
      prompt,
      aspect_ratio:    '16:9',
      duration:        '10',
      negative_prompt: 'blur, distortion, low quality, fast movement, shaky camera, cartoon, CGI artifacts, jump cut, teleportation, oversaturated, unrealistic, cheap production',
      cfg_scale:       0.5,
    },
  });

  return { requestId: request_id, model, type };
}

export async function getVideoJobResult(model, requestId, type) {
  configureFal();
  const result    = await fal.queue.result(model, { requestId });
  const remoteUrl = extractVideoUrl(result.data);
  const filename  = `${type}-${Date.now()}.mp4`;
  const localPath = join(VIDEOS_DIR, filename);

  await downloadVideo(remoteUrl, localPath);

  return {
    type,
    remoteUrl,
    localPath,
    publicPath: `/assets/generated/videos/${filename}`,
  };
}

export async function getJobStatus(model, requestId) {
  configureFal();
  return fal.queue.status(model, { requestId, logs: false });
}
