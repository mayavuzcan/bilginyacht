/* =========================================================
   BILGIN YACHT — Cinematic Scroll Experience
   ─────────────────────────────────────────────────────────
   Components:
     ScrollVideoHero       — pins hero, drives video/frame
                             canvas and chapter transitions
     initParallaxImages    — depth parallax on section images
     initCinematicSections — blur/scale/clip reveals
     initSpecCards         — spec tile glow + hover
     initLuxuryCTA         — CTA ambient + shimmer
   =========================================================

   Rendering priority (falls back down the chain):
     1. FrameSequencePlayer on <canvas#heroFrameCanvas>
        (Apple-style pre-decoded JPEG sequence — zero decoder lag)
     2. video.currentTime scrubbing on <video#heroVideo>
        (smooth on most devices, minor stutter on slow seeks)
     3. Static hero image in #heroFallback
   ──────────────────────────────────────────────────────── */
class ScrollVideoHero {
  static SCROLL_VH = 560; /* pinned scroll distance in vh */

  /*
   * Chapter timing: [fadeInStart, peakIn, peakOut, fadeOutEnd]
   * All values on a 0–100 scale mapping to the scrubbed timeline.
   * Chapter 0 starts visible (CSS opacity:1); only needs fade-OUT.
   */
  static CHAPTER_RANGES = [
    [0,   0,  10,  14],   // 0 – Intro
    [14,  17,  24,  28],  // 1 – Exterior orbit
    [28,  31,  38,  42],  // 2 – Deck approach
    [42,  45,  52,  56],  // 3 – Interior luxury
    [56,  59,  66,  70],  // 4 – Craftsmanship
    [70,  73,  80,  84],  // 5 – Engineering
    [84,  87, 100, 100],  // 6 – Private viewing
  ];

  constructor() {
    this.section      = document.querySelector('.scroll-hero');
    this.video        = document.getElementById('heroVideo');
    this.frameCanvas  = document.getElementById('heroFrameCanvas');
    this.chapters     = [...document.querySelectorAll('.chapter')];
    this.dots         = [...document.querySelectorAll('.chapter-dot')];
    this.progressFill = document.getElementById('heroProgressFill');
    this.curLabel     = document.getElementById('chapterCur');

    /* State */
    this.st           = null;     /* GSAP ScrollTrigger */
    this.framePlayer  = null;     /* FrameSequencePlayer instance */
    this.useFrames    = false;    /* true once frame player is initialised */
    this.videoReady   = false;    /* true once video metadata loads */
    this.activeIdx    = 0;

    this.isMobile      = window.matchMedia('(max-width: 767px)').matches;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Mobile gets a shorter pin distance — less fatigue, same chapters */
    this.scrollVh = this.isMobile ? 420 : ScrollVideoHero.SCROLL_VH;

    if (!this.section) return;
    this.init();
    this.buildDotListeners();
  }

  /* ════════════════════════════════════════════════════════
     PUBLIC API — called by asset-loader
     ════════════════════════════════════════════════════════ */

  /**
   * Called by asset-loader when frame sequence data exists.
   * Preferred over video scrubbing.
   */
  async initFrameSequence(frameData) {
    if (!this.frameCanvas) return false;
    if (this.isMobile || this.reducedMotion) return false;
    if (!window.FrameSequencePlayer) {
      console.warn('[Bilgin] FrameSequencePlayer not loaded');
      return false;
    }

    this.useFrames = true; /* block onVideoSrcSet from loading video */

    /* ── Create player ── */
    this.framePlayer = new FrameSequencePlayer(this.frameCanvas, {
      framesDir  : frameData.dir,
      frameCount : frameData.count,
      fps        : frameData.fps,
      duration   : frameData.duration,
      pattern    : frameData.pattern || 'frame_%04d.jpg',
    });

    /* ── Loading progress → show on progress bar ── */
    let scrollActive = false;

    this.framePlayer.addEventListener('progress', e => {
      if (scrollActive) return;
      const pct = e.detail.loaded / e.detail.total;
      if (this.progressFill) {
        /* Use a different color during loading: dimmer gold */
        this.progressFill.style.background = 'rgba(200,169,81,0.4)';
        this.progressFill.style.transform  = `scaleX(${pct})`;
      }
    });

    this.framePlayer.addEventListener('renderable', () => {
      scrollActive = true;
      /* Restore scroll-driven progress bar color */
      if (this.progressFill) {
        this.progressFill.style.background = '';
      }
      /* Hide the video element entirely — canvas takes over */
      if (this.video) {
        this.video.style.display = 'none';
      }
      /* Dim particles canvas */
      const pc = document.getElementById('heroCanvas');
      if (pc) {
        pc.style.transition = 'opacity 2s ease';
        pc.style.opacity    = '0.18';
      }
      /* Force a ScrollTrigger refresh so pinned heights are correct */
      setTimeout(() => ScrollTrigger.refresh(), 100);
    });

    this.framePlayer.addEventListener('ready', () => {
      console.log(`[Bilgin] Frame sequence complete — ${frameData.count} frames in memory`);
    });

    /* ── Start loading (returns after priority batch) ── */
    await this.framePlayer.load();

    return true;
  }

  /**
   * Called by asset-loader when video URL is available
   * but NO frame sequence exists.
   */
  onVideoSrcSet(src) {
    if (this.useFrames) return; /* frame player takes precedence */

    const v = this.video;
    if (!v || !src) return;

    /* Reduced-motion only: autoplay looping background */
    if (this.reducedMotion) {
      v.src = src;
      v.setAttribute('autoplay', '');
      v.setAttribute('loop', '');
      v.muted = true;
      v.load();
      v.play().catch(() => {});
      v.classList.add('is-ready');
      return;
    }

    /* All devices (desktop + mobile): scroll-driven currentTime scrubbing */
    v.src = src;
    v.preload = 'auto';
    v.muted = true;
    /* iOS Safari: must call load() before seeking is possible */
    v.load();

    const onMeta = () => {
      this.videoReady = true;
      v.classList.add('is-ready');
      /* Dim particles once video fades in */
      const pc = document.getElementById('heroCanvas');
      if (pc) {
        setTimeout(() => {
          pc.style.transition = 'opacity 2s ease';
          pc.style.opacity    = '0.18';
        }, 1800);
      }
      v.removeEventListener('loadedmetadata', onMeta);
    };
    v.addEventListener('loadedmetadata', onMeta);
  }

  /**
   * Called by main.js initLoader() after loader hides.
   * Plays the entrance animation for chapter 0.
   */
  enterIntro() {
    if (this.reducedMotion) return;

    const ch0    = this.chapters[0];
    const vessel = this.section.querySelector('.scroll-hero__vessel');
    const tl     = gsap.timeline({ defaults: { ease: 'power4.out' } });

    if (!this.isMobile && vessel) {
      tl.to(vessel, { opacity: 0.6, duration: 2.8 }, 0);
    }
    if (ch0) {
      const inner = ch0.querySelector('.chapter__inner');
      if (inner) tl.from(inner, { y: this.isMobile ? 30 : 50, opacity: 0, duration: 1.2 }, 0.4);
    }
  }

  /* ════════════════════════════════════════════════════════
     INTERNAL — init
     ════════════════════════════════════════════════════════ */

  init() {
    /* Reduced-motion: static fallback only */
    if (this.reducedMotion) {
      this.initMobileFallback();
      return;
    }

    /* Chapters 1-6 start hidden; chapter 0 visible via CSS */
    this.chapters.forEach((ch, i) => {
      if (i === 0) return;
      gsap.set(ch, { opacity: 0, pointerEvents: 'none' });
      const inner = ch.querySelector('.chapter__inner');
      if (inner) gsap.set(inner, { y: 48 });
    });

    this.buildChapterTimeline();
  }

  buildChapterTimeline() {
    const tl = gsap.timeline({ paused: true });
    const R  = ScrollVideoHero.CHAPTER_RANGES;

    R.forEach(([s, pIn, pOut, e], i) => {
      const ch      = this.chapters[i];
      if (!ch) return;
      const inner   = ch.querySelector('.chapter__inner');
      const btn     = ch.querySelector('.chapter__btn');
      const isFirst = i === 0;

      if (!isFirst) {
        tl.to(ch,    { opacity: 1, pointerEvents: 'auto', duration: pIn - s, ease: 'power2.out' }, s);
        if (inner) tl.to(inner, { y: 0, duration: pIn - s, ease: 'power3.out' }, s);
      }

      const outDur = e - pOut;
      if (outDur > 0) {
        tl.to(ch,    { opacity: 0, pointerEvents: 'none', duration: outDur, ease: 'power2.in' }, pOut);
        if (inner) tl.to(inner, { y: -32, duration: outDur, ease: 'power2.in' }, pOut);
      }

      if (btn) {
        tl.fromTo(btn,
          { scale: 0.88, opacity: 0 },
          { scale: 1, opacity: 1, duration: 4, ease: 'back.out(1.4)' },
          pIn + 2
        );
      }
    });

    tl.to({}, { duration: 0 }, 100); /* ensure total duration = 100 */

    const self  = this;
    this.st = ScrollTrigger.create({
      trigger   : this.section,
      start     : 'top top',
      end       : `+=${this.scrollVh}%`,
      pin       : true,
      scrub     : this.isMobile ? 0.5 : 0.9,  /* faster response on mobile touch */
      animation : tl,

      onUpdate(st) {
        const p = st.progress;

        /* ── Rendering: frame sequence → video scrub fallback ── */
        if (self.useFrames && self.framePlayer?.canRender) {
          self.framePlayer.renderProgress(p);
        } else if (self.videoReady && self.video?.duration) {
          const target = self.video.duration * p;
          /* Mobile: seek threshold 0.12s — iOS video decode is slow,
             seeking every 33ms causes frame drops and UI freeze.
             Desktop: 0.033s (1 frame at 30fps) for tight accuracy. */
          const threshold = self.isMobile ? 0.12 : 0.033;
          if (Math.abs(self.video.currentTime - target) > threshold) {
            self.video.currentTime = target;
          }
        }

        /* ── Scroll progress bar (scroll-driven mode only) ─ */
        if (self.progressFill && (self.useFrames ? self.framePlayer?.canRender : true)) {
          self.progressFill.style.transform = `scaleX(${p})`;
        }

        /* ── Chapter dot + counter ─────────────────────── */
        const idx = self._chapterAt(p * 100);
        if (idx !== self.activeIdx) {
          self.activeIdx = idx;
          self._updateDots(idx);
          if (self.curLabel) self.curLabel.textContent = String(idx + 1).padStart(2, '0');
        }
      },
    });
  }

  /* ── Chapter nav dots ───────────────────────────────────── */
  buildDotListeners() {
    this.dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        if (!this.st) return;
        const progress = ScrollVideoHero.CHAPTER_RANGES[i][0] / 100;
        const targetY  = this.st.start + (this.st.end - this.st.start) * progress;

        /* Frame player: seek instantly so canvas doesn't lerp across 50+ frames */
        if (this.framePlayer?.canRender) {
          this.framePlayer.seekProgress(progress);
        }

        if (window.lenis) {
          window.lenis.scrollTo(targetY, { duration: 1.8 });
        } else {
          window.scrollTo({ top: targetY, behavior: 'smooth' });
        }
      });
    });
  }

  /* ── Reduced-motion static fallback ───────────────────────── */
  initMobileFallback() {
    /* Only reaches here when prefers-reduced-motion: reduce is set.
       Video will be set to autoplay loop via onVideoSrcSet().
       Just fade in the first chapter text. */
    const ch0 = this.chapters[0];
    if (ch0) {
      const inner = ch0.querySelector('.chapter__inner');
      if (inner) gsap.from(inner, { y: 30, opacity: 0, duration: 1.2, delay: 0.8, ease: 'power3.out' });
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  _chapterAt(t) {
    const R = ScrollVideoHero.CHAPTER_RANGES;
    for (let i = R.length - 1; i >= 0; i--) {
      if (t >= R[i][0]) return i;
    }
    return 0;
  }

  _updateDots(active) {
    this.dots.forEach((d, i) => d.classList.toggle('is-active', i === active));
  }
}


/* ── Parallax Images ────────────────────────────────────────
   [data-parallax] elements move at a different rate than
   the page, creating depth. [data-parallax-wrap] clips the
   scaled-up image via overflow:hidden.
   ──────────────────────────────────────────────────────── */
function initParallaxImages() {
  if (window.matchMedia('(max-width: 767px)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('[data-parallax]').forEach(el => {
    const speed  = parseFloat(el.dataset.parallaxSpeed || '0.12');
    const wrap   = el.closest('[data-parallax-wrap]') || el.parentElement;
    const amount = speed * 100;

    gsap.set(el, { scale: 1 + speed * 1.5, transformOrigin: 'center center' });

    gsap.fromTo(el,
      { yPercent: -amount },
      {
        yPercent : amount,
        ease     : 'none',
        scrollTrigger: {
          trigger : wrap,
          start   : 'top bottom',
          end     : 'bottom top',
          scrub   : true,
        },
      }
    );
  });
}


/* ── Cinematic Sections ─────────────────────────────────────
   Blur-in, scale, and clip-path wipe reveals for sections.
   ──────────────────────────────────────────────────────── */
function initCinematicSections() {
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const blur     = 0;
  /* On mobile skip scale transforms — compositing many layers causes
     frame drops on lower-end devices. Simple y+opacity only. */
  const scale    = (reduced || isMobile) ? 1 : 0.97;

  /* Section titles */
  gsap.utils.toArray('.section-title').forEach(el => {
    gsap.from(el, {
      scrollTrigger : { trigger: el, start: 'top 86%', once: true },
      y: 55, opacity: 0,
      duration: 1.3, ease: 'power4.out',
    });
  });

  /* Exterior image panels: clip-path wipe + scale */
  gsap.utils.toArray('.exterior__img-wrap').forEach((wrap, i) => {
    const img = wrap.querySelector('img');
    if (!img) return;
    gsap.from(wrap, {
      scrollTrigger: { trigger: wrap, start: 'top 85%', once: true },
      clipPath: 'inset(0 100% 0 0)', duration: 1.4 + i * 0.1, ease: 'power4.inOut',
    });
    gsap.from(img, {
      scrollTrigger: { trigger: wrap, start: 'top 85%', once: true },
      scale: 1.12, duration: 1.6 + i * 0.1, ease: 'power4.out',
    });
  });

  /* Interior showcase: left wipe */
  const showcaseWrap = document.querySelector('.interior__showcase-img');
  if (showcaseWrap) {
    gsap.from(showcaseWrap, {
      scrollTrigger: { trigger: showcaseWrap, start: 'top 80%', once: true },
      clipPath: 'inset(0 100% 0 0)', duration: 1.6, ease: 'power4.inOut',
    });
    const sImg = showcaseWrap.querySelector('img');
    if (sImg) {
      gsap.from(sImg, {
        scrollTrigger: { trigger: showcaseWrap, start: 'top 80%', once: true },
        scale: 1.1, duration: 2, ease: 'power4.out',
      });
    }
  }

  /* Interior cards */
  gsap.utils.toArray('.interior__card').forEach((card, i) => {
    gsap.from(card, {
      scrollTrigger: { trigger: '.interior__grid', start: 'top 80%', once: true },
      y: 70, opacity: 0, scale,
      duration: 1.1, delay: i * 0.2, ease: 'power3.out',
    });
  });
  gsap.from('.interior__body-col', {
    scrollTrigger: { trigger: '.interior__grid', start: 'top 80%', once: true },
    y: 50, opacity: 0, duration: 1, delay: 0.1, ease: 'power3.out',
  });

  /* Craft: image reveal + right content */
  const craftPrimary = document.querySelector('.craft__primary-img');
  if (craftPrimary) {
    gsap.from(craftPrimary, {
      scrollTrigger: { trigger: '.craft__layout', start: 'top 78%', once: true },
      x: -60, opacity: 0, duration: 1.6, ease: 'power3.out',
    });
    const cImg = craftPrimary.querySelector('img');
    if (cImg) {
      gsap.from(cImg, {
        scrollTrigger: { trigger: '.craft__layout', start: 'top 78%', once: true },
        scale: 1.08, duration: 2.2, ease: 'power3.out',
      });
    }
  }
  gsap.from('.craft__right', {
    scrollTrigger: { trigger: '.craft__layout', start: 'top 78%', once: true },
    x: 50, opacity: 0, duration: 1.4, delay: 0.15, ease: 'power3.out',
  });

  /* Spec tiles */
  gsap.utils.toArray('.spec-tile').forEach((tile, i) => {
    gsap.from(tile, {
      scrollTrigger: { trigger: '.specs__grid', start: 'top 80%', once: true },
      y: 40, opacity: 0, scale,
      duration: 0.9, delay: i * 0.07, ease: 'power3.out',
    });
  });

  /* Gallery: staggered with per-cell scroll scale */
  gsap.utils.toArray('.gallery__cell').forEach((cell, i) => {
    gsap.from(cell, {
      scrollTrigger: { trigger: '.gallery__grid', start: 'top 82%', once: true },
      y: isMobile ? 40 : 80, opacity: 0, scale,
      duration: isMobile ? 0.7 : 1.2, delay: isMobile ? i * 0.05 : i * 0.09, ease: 'power3.out',
    });
    if (!window.matchMedia('(max-width: 767px)').matches) {
      const img = cell.querySelector('img');
      if (img) {
        gsap.fromTo(img, { scale: 1.12 }, {
          scale: 1.0, ease: 'none',
          scrollTrigger: { trigger: cell, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }
    }
  });

  /* Story: parallax bg + content fade */
  const storyBgImg = document.querySelector('.story__bg-img img');
  if (storyBgImg) {
    gsap.fromTo(storyBgImg,
      { y: '-12%', scale: 1.2 },
      { y: '12%', ease: 'none',
        scrollTrigger: { trigger: '.story', start: 'top bottom', end: 'bottom top', scrub: true } }
    );
  }
  const storyInner = document.querySelector('.story__inner');
  if (storyInner) {
    gsap.from([...storyInner.children], {
      scrollTrigger: { trigger: storyInner, start: 'top 78%', once: true },
      y: 60, opacity: 0,
      duration: 1.2, stagger: 0.13, ease: 'power4.out',
    });
  }

  /* CTA */
  gsap.from('.cta-sec__title', {
    scrollTrigger: { trigger: '.cta-sec__title', start: 'top 83%', once: true },
    y: 60, opacity: 0, duration: 1.4, ease: 'power4.out',
  });
  gsap.from('.cta-sec__sub', {
    scrollTrigger: { trigger: '.cta-sec__sub', start: 'top 86%', once: true },
    y: 35, opacity: 0, duration: 1.1, ease: 'power3.out',
  });
  gsap.from('.cta-form', {
    scrollTrigger: { trigger: '.cta-form', start: 'top 88%', once: true },
    y: 45, opacity: 0, duration: 1.1, ease: 'power3.out',
  });
}


/* ── SpecCards ──────────────────────────────────────────────
   Gold glow on hover + perspective tilt on mousemove.
   ──────────────────────────────────────────────────────── */
function initSpecCards() {
  document.querySelectorAll('.spec-tile').forEach(tile => {
    tile.addEventListener('mouseenter', () => {
      gsap.to(tile, {
        boxShadow: '0 0 48px rgba(200,169,81,0.10), inset 0 1px 0 rgba(200,169,81,0.18)',
        borderColor: 'rgba(200,169,81,0.32)',
        duration: 0.5, ease: 'power2.out', overwrite: 'auto',
      });
    });
    tile.addEventListener('mouseleave', () => {
      gsap.to(tile, {
        boxShadow: '0 0 0px rgba(200,169,81,0)',
        borderColor: 'rgba(200,169,81,0.08)',
        duration: 0.7, ease: 'power2.out', overwrite: 'auto',
      });
      gsap.to(tile, { rotateX: 0, rotateY: 0, duration: 0.7, ease: 'elastic.out(1, 0.75)', overwrite: 'auto' });
    });
    tile.addEventListener('mousemove', e => {
      const r = tile.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - 0.5) * 7;
      const y = ((e.clientY - r.top)  / r.height - 0.5) * -7;
      gsap.to(tile, { rotateX: y, rotateY: x, duration: 0.4, ease: 'power2.out', transformPerspective: 700, overwrite: 'auto' });
    });
  });
}


/* ── LuxuryCTA ──────────────────────────────────────────────
   Breathing ambient glow on scroll + button shimmer sweep.
   ──────────────────────────────────────────────────────── */
function initLuxuryCTA() {
  const cta = document.querySelector('.cta-sec');
  if (!cta) return;

  const ambient = cta.querySelector('.cta-sec__ambient');
  if (ambient) {
    gsap.to(ambient, {
      scale: 1.35, opacity: 0.9, ease: 'none',
      scrollTrigger: { trigger: cta, start: 'top bottom', end: 'center center', scrub: true },
    });
  }

  const btn = cta.querySelector('.btn--primary');
  if (btn) {
    const shimmer = document.createElement('span');
    shimmer.className = 'btn__shimmer';
    shimmer.setAttribute('aria-hidden', 'true');
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(shimmer);
    gsap.fromTo(shimmer,
      { xPercent: -150, opacity: 0.6 },
      { xPercent: 250, opacity: 0, duration: 1.4, ease: 'power1.inOut', repeat: -1, repeatDelay: 3.5, delay: 2.5 }
    );
  }
}


/* ── Exterior panel parallax ────────────────────────────────
   Vertical parallax on horizontal-scroll images.
   Must run after initExterior() has created its ScrollTrigger.
   ──────────────────────────────────────────────────────── */
function initExteriorParallax() {
  if (window.matchMedia('(max-width: 767px)').matches) return;

  requestAnimationFrame(() => {
    const exteriorST = ScrollTrigger.getAll().find(st =>
      st.vars.trigger === document.getElementById('exteriorTrigger')
    );
    if (!exteriorST?.animation) return;

    document.querySelectorAll('.exterior__img-wrap').forEach(wrap => {
      const img = wrap.querySelector('img');
      if (!img) return;
      gsap.fromTo(img, { y: '-8%' }, {
        y: '8%', ease: 'none',
        scrollTrigger: {
          trigger: wrap.closest('.exterior__panel'),
          containerAnimation: exteriorST.animation,
          start: 'left right', end: 'right left', scrub: true,
        },
      });
    });
  });
}


/* ── Public init ────────────────────────────────────────────
   Called from main.js DOMContentLoaded.
   ──────────────────────────────────────────────────────── */
function initScrollExperience() {
  window.scrollHeroInstance = new ScrollVideoHero();
  initCinematicSections();
  initSpecCards();
  initLuxuryCTA();
}

window.initScrollExperience = initScrollExperience;
