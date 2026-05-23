/* =========================================================
   BILGIN YACHT — Frame Sequence Player  (v2)
   ─────────────────────────────────────────────────────────
   Renders a pre-extracted JPEG frame sequence to a canvas
   element, driven by scroll progress (0–1).

   Why canvas beats video.currentTime:
     • video.currentTime forces the decoder to seek a compressed
       H.264 stream on every scroll event → latency + stutter.
     • Pre-decoded HTMLImageElement objects live in GPU texture
       memory. ctx.drawImage() is a single GPU blit — O(1),
       zero decoder overhead, sub-millisecond.
     • Apple uses this exact technique on iPhone, AirPods, and
       Mac product pages.

   v2 improvements over v1:
     • Lerp interpolation — renderProgress() sets a TARGET;
       an internal rAF loop smoothly advances _currentProgress
       toward it. Produces physically believable inertia.
     • Proximity prefetch — while scrolling, frames within
       ±PREFETCH_RADIUS of current position are promoted to
       high-priority so they are always ready.
     • Adaptive batch sizing — yields the main thread after
       each batch to keep scroll + paint fluid.
     • seekProgress() — instant jump without lerp (for dot nav).
   ========================================================= */

class FrameSequencePlayer extends EventTarget {

  /* ── Tuning ──────────────────────────────────────────── */
  static PRIORITY_COUNT  = 40;   /* frames loaded before 'renderable' fires  */
  static BATCH_SIZE      = 15;   /* frames per background batch               */
  static MAX_DPR         = 2;    /* cap devicePixelRatio to limit VRAM usage  */
  static LERP_SPEED      = 0.14; /* 0–1: higher = snappier, lower = floatier  */
  static LERP_THRESHOLD  = 3e-4; /* stop lerping when diff is negligible      */
  static PREFETCH_RADIUS = 20;   /* frames to prefetch around current index   */

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   *   .framesDir   string  URL prefix, e.g. '/assets/generated/frames'
   *   .frameCount  number  Total number of frames
   *   .fps         number  Source fps (metadata only)
   *   .duration    number  Video duration in seconds (metadata only)
   *   .pattern     string  Filename pattern, e.g. 'frame_%04d.jpg'
   */
  constructor(canvas, opts = {}) {
    super();

    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });

    this.opts = {
      framesDir  : '/assets/generated/frames',
      frameCount : 0,
      fps        : 24,
      duration   : 10,
      pattern    : 'frame_%04d.jpg',
      ...opts,
    };

    this.total         = this.opts.frameCount;
    this.frames        = new Array(this.total + 1); /* 1-based slots */
    this.loadedCount   = 0;
    this.canRender     = false;
    this.allLoaded     = false;
    this._lastIdx      = -1;
    this._forceRedraw  = false;
    this._aborted      = false;

    /* Lerp state */
    this._currentProgress = 0;
    this._targetProgress  = 0;
    this._rafId           = null;
    this._lerpRunning     = false;

    this.dpr = Math.min(window.devicePixelRatio || 1, FrameSequencePlayer.MAX_DPR);
    this._setupCanvas();

    /* Debounced resize */
    this._onResize = this._debounce(() => {
      this._setupCanvas();
      this._forceRedraw = true;
      this.renderFrameIdx(this._lastIdx < 0 ? 0 : this._lastIdx);
    }, 200);
    window.addEventListener('resize', this._onResize);
  }

  /* ── Canvas setup / HiDPI resize ────────────────────── */
  _setupCanvas() {
    const dpr = this.dpr;
    const el  = this.canvas;
    const w   = el.offsetWidth  || window.innerWidth;
    const h   = el.offsetHeight || window.innerHeight;

    el.width  = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    this._cssW = w;
    this._cssH = h;

    /* DPR-aware transform — all drawImage coords are in CSS px */
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /* ── URL builder (1-based index) ────────────────────── */
  _url(i) {
    const padded = String(i).padStart(4, '0');
    return `${this.opts.framesDir}/${this.opts.pattern.replace('%04d', padded)}`;
  }

  /* ── Load a single frame (1-based index) ────────────── */
  _loadOne(i, priority = 'auto') {
    if (this.frames[i]) return Promise.resolve(this.frames[i]);
    if (this._aborted)  return Promise.resolve(null);

    return new Promise(resolve => {
      const img         = new Image();
      img.decoding      = 'async';
      img.fetchpriority = priority;
      img.src           = this._url(i);

      img.onload = () => {
        this.frames[i] = img;
        this.loadedCount++;
        this.dispatchEvent(new CustomEvent('progress', {
          detail: { loaded: this.loadedCount, total: this.total },
        }));
        resolve(img);
      };
      img.onerror = () => {
        this.frames[i] = null; /* mark failed — skip on retry */
        this.loadedCount++;
        resolve(null);
      };
    });
  }

  /* ── Main load entry point ───────────────────────────── */
  async load() {
    const N     = this.total;
    const PRIO  = Math.min(FrameSequencePlayer.PRIORITY_COUNT, N);
    const BATCH = FrameSequencePlayer.BATCH_SIZE;

    /* ── Phase 1: priority batch — blocks until renderable ── */
    const prioIdxs = Array.from({ length: PRIO }, (_, k) => k + 1);
    await Promise.allSettled(prioIdxs.map(i => this._loadOne(i, 'high')));

    this.canRender    = true;
    this._forceRedraw = true;
    this.canvas.classList.add('is-ready');
    this.renderFrameIdx(0);
    this._startLerpLoop();
    this.dispatchEvent(new CustomEvent('renderable'));

    /* ── Phase 2: background batches — non-blocking ────────── */
    const rest = Array.from({ length: N - PRIO }, (_, k) => k + PRIO + 1);

    (async () => {
      for (let i = 0; i < rest.length; i += BATCH) {
        if (this._aborted) break;
        const batch = rest.slice(i, i + BATCH);
        await Promise.allSettled(batch.map(idx => this._loadOne(idx, 'auto')));
        /* Yield main thread between batches — keeps scroll smooth */
        await new Promise(r => setTimeout(r, 0));
      }
      if (!this._aborted) {
        this.allLoaded = true;
        this.dispatchEvent(new CustomEvent('ready'));
      }
    })();

    return this;
  }

  /* ── Internal rAF lerp loop ─────────────────────────── */
  _startLerpLoop() {
    if (this._lerpRunning) return;
    this._lerpRunning = true;

    const SPEED     = FrameSequencePlayer.LERP_SPEED;
    const THRESHOLD = FrameSequencePlayer.LERP_THRESHOLD;

    const tick = () => {
      if (this._aborted) { this._lerpRunning = false; return; }
      this._rafId = requestAnimationFrame(tick);

      const diff = this._targetProgress - this._currentProgress;

      /* Already close enough — snap to target, no render needed */
      if (Math.abs(diff) < THRESHOLD) {
        if (diff !== 0) {
          this._currentProgress = this._targetProgress;
          this.renderFrameIdx(Math.round(this._currentProgress * (this.total - 1)));
        }
        return;
      }

      /* Lerp one step */
      this._currentProgress += diff * SPEED;
      const idx = Math.round(this._currentProgress * (this.total - 1));
      this.renderFrameIdx(idx);

      /* Proactively prefetch nearby frames */
      this._prefetchNearby(idx);
    };

    this._rafId = requestAnimationFrame(tick);
  }

  /* ── Prefetch frames near current position ───────────── */
  _prefetchNearby(idx) {
    const R  = FrameSequencePlayer.PREFETCH_RADIUS;
    const lo = Math.max(1, idx - R);
    const hi = Math.min(this.total, idx + R);
    for (let i = lo; i <= hi; i++) {
      if (!this.frames[i]) this._loadOne(i, 'high');
    }
  }

  /* ── Render at 0-based frame index ─────────────────── */
  renderFrameIdx(idx) {
    if (idx < 0) idx = 0;
    if (idx >= this.total) idx = this.total - 1;

    const sameFrame = (idx === this._lastIdx) && !this._forceRedraw;
    if (sameFrame) return;

    /* Walk backward from idx to find nearest loaded frame */
    let frame = null;
    for (let i = idx; i >= 0; i--) {
      if (this.frames[i + 1]) { frame = this.frames[i + 1]; break; }
    }
    if (!frame) return;

    this._lastIdx     = idx;
    this._forceRedraw = false;

    const { _cssW: cw, _cssH: ch } = this;
    const iw = frame.naturalWidth;
    const ih = frame.naturalHeight;
    if (!iw || !ih) return;

    /* Cover-fit: scale so image fills canvas entirely, crop excess */
    const scale = Math.max(cw / iw, ch / ih);
    const sw    = iw * scale;
    const sh    = ih * scale;
    const ox    = (cw - sw) * 0.5;
    const oy    = (ch - sh) * 0.5;

    this.ctx.drawImage(frame, ox, oy, sw, sh);
  }

  /* ── Public: set target progress with lerp (0–1) ────── */
  /*
   * The rAF loop advances _currentProgress toward _targetProgress
   * at LERP_SPEED per frame. This gives smooth inertia: when scroll
   * moves fast the frames catch up gradually; when scroll stops
   * they snap cleanly to rest.
   */
  renderProgress(progress) {
    if (!this.canRender) return;
    this._targetProgress = Math.max(0, Math.min(1, progress));

    /* On very first call — snap immediately, no intro drift */
    if (this._lastIdx < 0) {
      this._currentProgress = this._targetProgress;
      this.renderFrameIdx(Math.round(this._currentProgress * (this.total - 1)));
    }
  }

  /* ── Public: instant seek without lerp ──────────────── */
  /*
   * Use this for chapter-dot navigation so clicking a dot
   * jumps immediately rather than lerping across all frames.
   */
  seekProgress(progress) {
    if (!this.canRender) return;
    const p = Math.max(0, Math.min(1, progress));
    this._currentProgress = p;
    this._targetProgress  = p;
    this.renderFrameIdx(Math.round(p * (this.total - 1)));
  }

  /* ── Getters ─────────────────────────────────────────── */
  get loadPercent() {
    return this.total > 0 ? this.loadedCount / this.total : 0;
  }

  get currentProgress() {
    return this._currentProgress;
  }

  /* ── Cleanup ─────────────────────────────────────────── */
  destroy() {
    this._aborted     = true;
    this._lerpRunning = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._onResize);
    this.frames.fill(null);
  }

  /* ── Utility ─────────────────────────────────────────── */
  _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
}

/* Expose globally for scroll-experience.js */
window.FrameSequencePlayer = FrameSequencePlayer;
