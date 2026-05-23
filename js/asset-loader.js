/**
 * Bilgin Yacht — Generated Asset Loader
 *
 * Fetches the AI-generated asset manifest from the backend,
 * then seamlessly replaces placeholder images/video with
 * Nano Banana Pro & Kling-generated production assets.
 *
 * This module only makes a GET request to /api/assets —
 * the FAL_KEY is never touched here.
 */

const FADE_DURATION = 800; // ms for asset crossfade

// ── Utility: crossfade swap ───────────────────────────────────────────────────
function swapImageSrc(imgEl, newSrc) {
  if (!imgEl || !newSrc) return;
  const next = new Image();
  next.onload = () => {
    imgEl.style.transition = `opacity ${FADE_DURATION}ms ease`;
    imgEl.style.opacity    = '0';
    setTimeout(() => {
      imgEl.src = newSrc;
      imgEl.style.opacity = '1';
    }, FADE_DURATION / 2);
  };
  next.src = newSrc;
}

// ── Hero video setup ──────────────────────────────────────────────────────────
function activateHeroVideo(videoSrc) {
  /*
   * If the scroll-driven hero is active, delegate to its instance.
   * ScrollVideoHero handles preload-metadata, no-autoplay, and scroll timing.
   * On mobile/reduced-motion it falls back to autoplay inside the instance.
   */
  if (window.scrollHeroInstance) {
    window.scrollHeroInstance.onVideoSrcSet(videoSrc);

    /* Dim particles once video fades in */
    const canvas = document.getElementById('heroCanvas');
    if (canvas) {
      setTimeout(() => {
        canvas.style.transition = 'opacity 2s ease';
        canvas.style.opacity    = '0.18';
      }, 2000);
    }
    return;
  }

  /* Legacy fallback (no scroll hero) */
  const video = document.getElementById('heroVideo');
  if (!video) return;
  video.src = videoSrc;
  video.load();
  video.addEventListener('canplay', () => {
    video.classList.add('is-ready');
  }, { once: true });
}

// ── Hero image overlay (used if no video available) ───────────────────────────
function activateHeroBgImage(src) {
  /* Use the dedicated fallback div in scroll-hero */
  const fallback = document.getElementById('heroFallback');
  if (fallback) {
    fallback.style.backgroundImage = `url('${src}')`;
    fallback.style.filter = 'saturate(0.65) brightness(0.45)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { fallback.classList.add('is-ready'); });
    });
    return;
  }
}

// ── Exterior section ──────────────────────────────────────────────────────────
function applyExteriorImages(images) {
  const panels = document.querySelectorAll('.exterior__img');
  const keys   = ['exterior-bow', 'exterior-profile', 'exterior-aft'];
  panels.forEach((img, i) => {
    if (images[keys[i]]) swapImageSrc(img, images[keys[i]]);
  });
}

// ── Interior section ──────────────────────────────────────────────────────────
function applyInteriorImages(images) {
  const showcase = document.querySelector('.interior__showcase img');
  if (images['interior-salon']) swapImageSrc(showcase, images['interior-salon']);

  const cards = document.querySelectorAll('.interior__card-img img');
  const cardKeys = ['interior-master', 'interior-dining'];
  cards.forEach((img, i) => {
    if (images[cardKeys[i]]) swapImageSrc(img, images[cardKeys[i]]);
  });
}

// ── Craftsmanship section ─────────────────────────────────────────────────────
function applyCraftImages(images) {
  const main = document.querySelector('.craft__primary-img img');
  if (images['craftsmanship']) swapImageSrc(main, images['craftsmanship']);
}

// ── Gallery section ───────────────────────────────────────────────────────────
function applyGalleryImages(images) {
  const cells   = document.querySelectorAll('.gallery__img-wrap img');
  const galleryKeys = [
    'gallery-1','gallery-2','gallery-3',
    'gallery-4','gallery-5','gallery-6',
  ];
  cells.forEach((img, i) => {
    if (images[galleryKeys[i]]) swapImageSrc(img, images[galleryKeys[i]]);
  });
}

// ── Story background ──────────────────────────────────────────────────────────
function applyStoryImage(images) {
  // Use exterior-profile as story background if available
  const storyBg = document.querySelector('.story__bg-img img');
  const src = images['exterior-profile'] || images['exterior-bow'];
  if (storyBg && src) swapImageSrc(storyBg, src);
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function loadGeneratedAssets() {
  try {
    const res = await fetch('/api/assets');
    if (!res.ok) return; // gracefully skip if backend not running

    const { images = {}, videos = {}, frames = {} } = await res.json();

    const hasAnyImage = Object.keys(images).length > 0;
    const hasVideo    = !!videos.hero;
    const hasFrames   = !!frames.hero;

    if (!hasAnyImage && !hasVideo && !hasFrames) return; // no assets yet, keep placeholders

    // Apply hero first (most impactful).
    // Priority: frame sequence > video > static image.
    // initFrameSequence() sets this.useFrames = true which blocks onVideoSrcSet.
    if (hasFrames && window.scrollHeroInstance?.initFrameSequence) {
      // Start frame sequence player — this is async but doesn't block asset loading
      window.scrollHeroInstance.initFrameSequence(frames.hero).then(started => {
        if (!started && hasVideo) {
          // Frame player declined (mobile / reduced motion) — fall back to video
          activateHeroVideo(videos.hero);
        }
      });
    } else if (hasVideo) {
      activateHeroVideo(videos.hero);
    } else if (images.hero) {
      activateHeroBgImage(images.hero);
    }

    // Apply remaining sections
    applyExteriorImages(images);
    applyInteriorImages(images);
    applyCraftImages(images);
    applyGalleryImages(images);
    applyStoryImage(images);

    console.log(
      `[Bilgin] AI assets loaded — ${Object.keys(images).length} images, ` +
      `${Object.keys(videos).length} videos`
    );
  } catch {
    // Graceful fallback — site works perfectly with placeholder images
    console.log('[Bilgin] Using fallback assets (server not running or no assets generated yet)');
  }
}
