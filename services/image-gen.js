/**
 * Nano Banana Pro image generation service.
 * Server-side only — FAL API key never exposed to browser.
 *
 * Confirmed API:
 *   Model:  fal-ai/nano-banana-pro
 *   Input:  prompt, aspect_ratio, resolution, output_format, num_images
 *   Output: { images: [{ url, content_type, file_name, file_size, width, height }] }
 */
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { configureFal, fal } from './fal-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'assets', 'generated', 'images');

// ── Models with fallback chain ────────────────────────────────────────────────
const IMAGE_MODELS = [
  'fal-ai/nano-banana-pro',
  'fal-ai/nano-banana-2',
  'fal-ai/nano-banana',
  'fal-ai/flux-pro',
];

// ── Per-section cinematic prompts ─────────────────────────────────────────────
export const IMAGE_PROMPTS = {
  hero: `Ultra-premium luxury superyacht "Bilgin Yacht" hero cinematic visual.
A magnificent 72-meter custom steel superyacht gliding on perfectly calm Mediterranean waters at golden hour sunset.
Deep navy ocean surface, champagne gold sunlight reflections dancing on the water, atmospheric warm haze on the horizon.
The yacht has elegant naval architecture — clean superstructure lines, panoramic windows, three decks, helipad aft.
Dramatic wide editorial composition, cinematic depth of field, luxury marine photography.
Visual reference: Lürssen brochure photography meets Apple hero imagery.
Aspect 16:9. Ultra-detailed. 8K quality. Production ready.`,

  'exterior-bow': `Ultra-luxury 72m superyacht bow perspective, Mediterranean Sea, late afternoon golden light.
Steel hull cutting through glassy calm azure water, elegant flare, polished surfaces.
Elevated three-quarter angle showing full yacht length, three-deck superstructure.
Atmospheric depth, cinematic shadows, magazine luxury yacht photography.
Deep navy water with champagne light reflection, editorial composition. Ultra-realistic.`,

  'exterior-profile': `Ultra-luxury superyacht full port-side profile, Mediterranean waters at golden hour.
Entire 72-meter silhouette visible — hull, superstructure, flybridge, mast.
Calm deep blue sea, warm golden horizontal light, subtle atmospheric haze.
Luxury yacht editorial photography, Lurssen / Feadship brochure quality. Ultra-realistic.`,

  'exterior-aft': `Ultra-luxury superyacht aft deck view from water level, Mediterranean golden sunset.
Swimming platform, tender garage with black carbon-fiber tender visible.
Aft deck entertaining area, teak decking, sunbeds, premium outdoor furniture.
Golden reflections on flat calm water, cinematic warm light, atmospheric.
Luxury marine photography, editorial quality. Ultra-realistic.`,

  'interior-salon': `Ultra-luxury superyacht grand salon interior — 72 square meters of curated living.
Book-matched American black walnut wall panels, Italian Carrara marble floors.
Floor-to-ceiling panoramic windows framing Mediterranean sea view and golden sky.
Hand-stitched oyster leather seating, bespoke low coffee table, curated art.
Warm indirect LED ambient lighting, sophisticated atmosphere, no people.
Editorial luxury interior photography, Architectural Digest quality.`,

  'interior-master': `Ultra-luxury superyacht master stateroom with private deck terrace.
King-size bespoke bed, silk hand-embroidered headboard, premium 1000-thread linen.
Panoramic full-width windows with Mediterranean sea view at dawn, soft golden light.
Walk-in wardrobe, his-and-hers Carrara marble bathrooms partially visible.
Warm amber ambient lighting, sophisticated luxury, no people.
Luxury interior photography, editorial quality.`,

  'interior-dining': `Ultra-luxury superyacht formal dining salon, seats 12 guests.
Custom handcrafted dining table in book-matched walnut, 12 bespoke chairs.
Crystal Riedel stemware, silver cutlery place settings, single white orchid centerpiece.
Climate-controlled wine cellar visible through glass floor panel below.
Panoramic ocean view windows, candle ambient lighting, luxury atmosphere, no people.
Editorial luxury interior photography.`,

  craftsmanship: `Master craftsman hand-fitting book-matched walnut interior panels in Istanbul luxury shipyard.
Artisan in 60s, focused expression, precision hand tools, wood shavings on floor.
Warm workshop lighting, morning golden rays through industrial windows.
Shallow depth of field, documentary editorial style, artisanal luxury atmosphere.
Celebrates Turkish maritime craftsmanship heritage. Cinematic, authentic.`,

  'gallery-1': `Aerial drone photograph — ultra-luxury 72m superyacht underway at sea, Mediterranean.
Perfect bird's-eye vertical view showing full yacht length, brilliant white wake trail, deep cobalt blue water.
Cinematic drone photography, editorial composition, luxury yacht at sea. Ultra-realistic.`,

  'gallery-2': `Ultra-luxury superyacht flybridge at sea — infinity pool, sunbeds, helm station visible.
Stunning Mediterranean panorama, clear blue sky, calm sea, passengers absent.
Lifestyle luxury photography, bright afternoon light, editorial quality.`,

  'gallery-3': `Ultra-luxury superyacht at anchor in secluded Mediterranean cove at dusk.
Dramatic limestone cliffs backdrop, turquoise-to-navy gradient water, calm.
Tender at swim platform, golden-pink sky reflection on water, cinematic wide angle.
Luxury travel photography. Ultra-realistic. Atmospheric.`,

  'gallery-4': `Panoramic view from ultra-luxury yacht bow deck looking forward at sunset.
Teak deck, polished stainless steel railings, Mediterranean sea horizon.
Dramatic golden-orange sky, warm cinematic light, no people.
Editorial luxury lifestyle photography. Wide angle. Ultra-realistic.`,

  'gallery-5': `Ultra-luxury superyacht spa and hammam interior.
Traditional marble hammam basin, treatment beds with premium linens, ambient candlelight.
Small round window framing Mediterranean sea view, warm amber indirect glow.
Premium wellness atmosphere, no people, editorial interior photography.`,

  'gallery-6': `Ultra-luxury superyacht dramatic silhouette at sea during sunset.
Deep orange and purple sky, yacht silhouette dark against glowing horizon.
Calm mirror-like water reflecting the sky colors, minimal and cinematic.
Fine art luxury maritime photography. Dramatic composition. Ultra-realistic.`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function downloadFile(url, destPath) {
  await mkdir(dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  const { writeFile } = await import('fs/promises');
  await writeFile(destPath, Buffer.from(buffer));
}

function extractImageUrl(data) {
  if (data?.images?.[0]?.url) return data.images[0].url;
  if (data?.image?.url) return data.image.url;
  if (typeof data?.images?.[0] === 'string') return data.images[0];
  throw new Error('Unexpected image response shape: ' + JSON.stringify(data).slice(0, 200));
}

// ── Core generation ───────────────────────────────────────────────────────────
export async function generateImage(type, options = {}) {
  configureFal();

  const prompt  = options.prompt || IMAGE_PROMPTS[type];
  const modelId = options.model  || IMAGE_MODELS[0];

  if (!prompt) throw new Error(`No prompt for image type: ${type}`);

  const input = {
    prompt,
    aspect_ratio:  options.aspect_ratio  || '16:9',
    resolution:    options.resolution    || '2K',
    output_format: options.output_format || 'jpeg',
    num_images: 1,
  };

  let lastError;
  const models = options.model ? [options.model, ...IMAGE_MODELS] : IMAGE_MODELS;

  for (const model of models) {
    try {
      process.stdout.write(`  Trying ${model} ... `);

      const result = await fal.subscribe(model, {
        input,
        logs: false,
        onQueueUpdate(update) {
          if (update.status === 'IN_PROGRESS') {
            const msg = update.logs?.slice(-1)[0]?.message;
            if (msg) process.stdout.write(`\r  [${model}] ${msg.slice(0, 60).padEnd(60)}`);
          }
        },
      });

      const remoteUrl = extractImageUrl(result.data);
      const filename  = `${type}-${Date.now()}.jpg`;
      const localPath = join(IMAGES_DIR, filename);

      process.stdout.write('downloading... ');
      await downloadFile(remoteUrl, localPath);

      console.log('done.');
      return {
        type,
        model,
        remoteUrl,
        localPath,
        publicPath: `/assets/generated/images/${filename}`,
      };
    } catch (err) {
      console.log(`failed (${err.message.slice(0, 60)})`);
      lastError = err;
    }
  }

  throw new Error(`All models failed for "${type}". Last error: ${lastError?.message}`);
}

// ── Queue-based (non-blocking, for Express endpoints) ─────────────────────────
export async function submitImageJob(type, options = {}) {
  configureFal();
  const prompt = options.prompt || IMAGE_PROMPTS[type];
  const model  = options.model  || IMAGE_MODELS[0];

  const { request_id } = await fal.queue.submit(model, {
    input: {
      prompt,
      aspect_ratio:  '16:9',
      resolution:    '2K',
      output_format: 'jpeg',
      num_images: 1,
    },
  });

  return { requestId: request_id, model, type };
}

export async function getImageJobResult(model, requestId, type) {
  configureFal();
  const result = await fal.queue.result(model, { requestId });
  const remoteUrl = extractImageUrl(result.data);

  const filename  = `${type}-${Date.now()}.jpg`;
  const localPath = join(IMAGES_DIR, filename);
  await downloadFile(remoteUrl, localPath);

  return {
    type,
    remoteUrl,
    localPath,
    publicPath: `/assets/generated/images/${filename}`,
  };
}
