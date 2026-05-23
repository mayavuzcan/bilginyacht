/* =========================================================
   BILGIN YACHT — Main JavaScript
   Stack: GSAP + ScrollTrigger + Lenis
   ========================================================= */

gsap.registerPlugin(ScrollTrigger);

/* ── 1. LENIS SMOOTH SCROLL ─────────────────────────────── */
let lenis;

function initLenis() {
  /* Lenis v1.0.x — smooth scroll, GSAP-synced */
  lenis = new Lenis({
    duration       : 1.4,
    easing         : t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel    : true,
    wheelMultiplier: 0.9,
    touchMultiplier: 2,
    infinite       : false,
  });

  /* Keep ScrollTrigger in sync with Lenis scroll position */
  lenis.on('scroll', ScrollTrigger.update);

  /* Drive Lenis from GSAP's single rAF ticker — no double rAF */
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  /* Expose globally for chapter dot navigation & anchor scrolling */
  window.lenis = lenis;
}

/* ── 2. HERO PARTICLES (canvas — GSAP ticker driven) ─────── */
function initParticles() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let active = true;

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function createParticles() {
    particles = [];
    const count = Math.min(60, Math.floor((canvas.width * canvas.height) / 20000));
    for (let i = 0; i < count; i++) {
      particles.push({
        x:   Math.random() * canvas.width,
        y:   Math.random() * canvas.height,
        r:   Math.random() * 1.1 + 0.3,
        vx:  (Math.random() - 0.5) * 0.22,
        vy:  (Math.random() - 0.5) * 0.20,
        op:  Math.random() * 0.40 + 0.10,
      });
    }
  }

  function draw() {
    if (!active) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,169,81,${p.op})`;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0)             p.x = canvas.width;
      if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0)             p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
    });
  }

  resize();
  createParticles();

  // Use GSAP's ticker — single animation scheduler for the whole page
  gsap.ticker.add(draw);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); createParticles(); }, 200);
  });

  /* Particles stay active during entire pinned scroll hero */
  ScrollTrigger.create({
    trigger : '#hero',
    start   : 'top top',
    end     : '+=560%',
    onLeave     : () => { active = false; ctx.clearRect(0, 0, canvas.width, canvas.height); },
    onEnterBack : () => { active = true; },
  });
}

/* ── 3. LOADER ───────────────────────────────────────────── */
function initLoader() {
  const loader = document.getElementById('loader');
  gsap.to(loader, {
    opacity: 0,
    duration: 0.7,
    delay: 2.4,
    ease: 'power2.inOut',
    onComplete: () => {
      loader.style.display = 'none';
      document.body.classList.remove('is-loading');
      /* Trigger cinematic intro on the scroll hero */
      if (window.scrollHeroInstance) {
        window.scrollHeroInstance.enterIntro();
      }
    },
  });
}

/* initHero() removed — scroll hero driven by ScrollVideoHero in scroll-experience.js */

/* ── 5. NAV SCROLL BEHAVIOR ──────────────────────────────── */
function initNav() {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('navBurger');
  const mobile = document.getElementById('navMobile');

  ScrollTrigger.create({
    start: 80,
    onUpdate: self => {
      nav.classList.toggle('is-scrolled', self.progress > 0);
    },
  });

  burger.addEventListener('click', () => {
    const open = burger.classList.toggle('is-open');
    mobile.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Close on link click
  mobile.querySelectorAll('.nav__m-link').forEach(a => {
    a.addEventListener('click', () => {
      burger.classList.remove('is-open');
      mobile.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  });
}

/* ── 6. EXTERIOR HORIZONTAL SCROLL ──────────────────────── */
function initExterior() {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  if (isMobile) return;

  const trigger = document.getElementById('exteriorTrigger');
  const pin     = document.getElementById('exteriorPin');
  const track   = document.getElementById('exteriorTrack');
  if (!trigger || !track) return;

  const panels = track.querySelectorAll('.exterior__panel');
  const totalWidth = (panels.length - 1) * window.innerWidth;

  trigger.style.height = `${totalWidth + window.innerHeight}px`;

  const exteriorTween = gsap.to(track, {
    x: () => -totalWidth,
    ease: 'none',
    scrollTrigger: {
      id: 'exteriorScroll',
      trigger: trigger,
      pin: pin,
      scrub: 1.2,
      start: 'top top',
      end: () => `+=${totalWidth}`,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // Subtle parallax on each image within the panels
  track.querySelectorAll('.exterior__img').forEach(img => {
    gsap.fromTo(img,
      { x: '-6%' },
      {
        x: '6%',
        ease: 'none',
        scrollTrigger: {
          trigger: img.closest('.exterior__panel'),
          containerAnimation: exteriorTween,
          start: 'left right',
          end: 'right left',
          scrub: true,
        },
      }
    );
  });
}

/* ── 7. SECTION REVEALS ──────────────────────────────────── */
/*
 * Basic reveals only. Cinematic versions (blur, scale, clip-path)
 * are handled by initCinematicSections() in scroll-experience.js.
 * This keeps section-title, interior, craft, gallery, spec, story,
 * and CTA animations in one place (scroll-experience.js).
 */
function initReveals() {

  /* Section labels */
  gsap.utils.toArray('.section-label').forEach(el => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      x: -24, opacity: 0, duration: 0.9, ease: 'power3.out',
    });
  });

  /* Gold lines */
  gsap.utils.toArray('.gold-line').forEach(el => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      scaleX: 0, transformOrigin: 'left center', duration: 1.2, ease: 'power3.inOut',
    });
  });

  /* Body text */
  gsap.utils.toArray('.section-body').forEach(el => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: 'top 87%', once: true },
      y: 25, opacity: 0, duration: 0.95, ease: 'power3.out',
    });
  });

  /* Craft — material rows */
  gsap.from('.craft__mat', {
    scrollTrigger: { trigger: '.craft__materials', start: 'top 85%', once: true },
    y: 20, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power2.out',
  });

  /* Craft — secondary images */
  gsap.from('.craft__sec-img', {
    scrollTrigger: { trigger: '.craft__secondary-imgs', start: 'top 88%', once: true },
    scale: 0.94, opacity: 0, duration: 1, stagger: 0.2, ease: 'power3.out',
  });

  /* Spec detail rows */
  gsap.from('.specs__detail', {
    scrollTrigger: { trigger: '.specs__detail-row', start: 'top 85%', once: true },
    y: 20, opacity: 0, duration: 0.7, stagger: 0.12, ease: 'power2.out',
  });

  /* Footer */
  gsap.from('.footer__brand', {
    scrollTrigger: { trigger: '.footer', start: 'top 90%', once: true },
    y: 30, opacity: 0, duration: 0.9, ease: 'power2.out',
  });
  gsap.from('.footer__col', {
    scrollTrigger: { trigger: '.footer', start: 'top 90%', once: true },
    y: 25, opacity: 0, duration: 0.8, stagger: 0.1, delay: 0.15, ease: 'power2.out',
  });
}

/* ── 8. COUNTER ANIMATIONS (spec tiles only) ─────────────── */
function initCounters() {
  document.querySelectorAll('.spec-tile__val[data-count]').forEach(el => {
    const raw     = parseInt(el.dataset.count, 10);
    const display = el.dataset.display; // e.g. "12.8" for internal count 128
    const obj     = { val: 0 };

    gsap.to(obj, {
      val: raw,
      duration: 2.4,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 82%', once: true },
      onUpdate() {
        if (display) {
          // Scale back to display value
          const scale = parseFloat(display) / raw;
          el.textContent = (obj.val * scale).toFixed(1);
        } else {
          el.textContent = raw >= 1000
            ? Math.round(obj.val).toLocaleString('en')
            : Math.round(obj.val);
        }
      },
      onComplete() {
        el.textContent = display || (raw >= 1000 ? raw.toLocaleString('en') : raw);
      },
    });
  });
}

/* ── 9. EXTERIOR STATS COUNTER (trigger in-panel) ────────── */
function initStatCounters() {
  document.querySelectorAll('.stat__num').forEach(el => {
    const raw     = parseInt(el.dataset.count, 10);
    const display = el.dataset.display;
    const obj     = { val: 0 };

    gsap.to(obj, {
      val: raw,
      duration: 2.2,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate() {
        if (display) {
          const scale = parseFloat(display) / raw;
          el.textContent = (obj.val * scale).toFixed(1);
        } else {
          el.textContent = raw >= 1000
            ? Math.round(obj.val).toLocaleString('en')
            : Math.round(obj.val);
        }
      },
      onComplete() {
        el.textContent = display || (raw >= 1000 ? raw.toLocaleString('en') : raw);
      },
    });
  });
}

/* ── 10. FORM SUBMISSION ─────────────────────────────────── */
function initForm() {
  const form = document.getElementById('ctaForm');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const original = btn.textContent;
    btn.textContent = 'Enquiry Received';
    btn.style.opacity = '0.7';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.style.opacity = '';
      btn.disabled = false;
      form.reset();
    }, 3500);
  });
}

/* ── 11. HOVER TILT — SPEC TILES ─────────────────────────── */
function initTilt() {
  document.querySelectorAll('.spec-tile').forEach(tile => {
    tile.addEventListener('mousemove', e => {
      const rect = tile.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
      const y = ((e.clientY - rect.top)  / rect.height - 0.5) * -6;
      gsap.to(tile, { rotateX: y, rotateY: x, duration: 0.4, ease: 'power2.out', transformPerspective: 600 });
    });
    tile.addEventListener('mouseleave', () => {
      gsap.to(tile, { rotateX: 0, rotateY: 0, duration: 0.6, ease: 'elastic.out(1,0.7)' });
    });
  });
}

/* ── 12. SMOOTH ANCHOR SCROLLING ─────────────────────────── */
function initAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis && lenis.scrollTo(target, { offset: -80, duration: 1.6 });
    });
  });
}

/* ── 13. ACTIVE NAV LINK on scroll ───────────────────────── */
function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const links    = document.querySelectorAll('.nav__link');
  if (!sections.length || !links.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const id = entry.target.getAttribute('id');
      links.forEach(l => {
        l.classList.toggle('is-active', l.getAttribute('href') === `#${id}`);
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => io.observe(s));
}

/* ── 14. SCROLL PROGRESS BAR ─────────────────────────────── */
function initProgressBar() {
  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'height:1px',
    'width:0%', 'background:' + getComputedStyle(document.documentElement)
      .getPropertyValue('--gold').trim(),
    'z-index:200', 'pointer-events:none',
    'transition:width 0.1s linear',
    'transform-origin:left center',
  ].join(';');
  document.body.appendChild(bar);

  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = max > 0 ? ((window.scrollY / max) * 100) + '%' : '0%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion) initLenis();

  /* Cinematic scroll experience (creates window.scrollHeroInstance) */
  if (typeof window.initScrollExperience === 'function') {
    window.initScrollExperience();
  }

  initNav();
  initLoader();
  initExterior();
  initReveals();
  initCounters();
  initStatCounters();
  initForm();
  initAnchors();
  initActiveNav();
  initProgressBar();

  /* Refresh ScrollTrigger after all fonts/images settle */
  window.addEventListener('load', () => {
    setTimeout(() => ScrollTrigger.refresh(), 200);
  });
});
