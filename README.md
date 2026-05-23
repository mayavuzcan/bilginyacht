# Bilgin Yacht
**Ultra-premium luxury superyacht website with FAL AI-generated cinematic assets**

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS · GSAP · Lenis |
| Backend | Node.js 18+ · Express |
| Image AI | [Nano Banana Pro](https://fal.ai/models/fal-ai/nano-banana-pro) via FAL AI |
| Video AI | [Kling v3 → v2 Master → v1.6 Pro](https://fal.ai/models/fal-ai/kling-video) via FAL AI |

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and add your FAL AI API key from https://fal.ai/dashboard/keys:
```
FAL_KEY=your_key_id:your_key_secret
```

### 3. Generate AI assets _(optional — site works with placeholders without this)_
```bash
# Generate everything (images + hero video)
npm run generate

# Images only (~$1–2 · ~2–5 minutes)
npm run generate:images

# Hero video only (~$3 · ~5–15 minutes)
npm run generate:video

# Preview what would be generated (no API calls)
npm run generate:dry
```

Assets are saved to `assets/generated/` and registered in `assets/generated/manifest.json`.

### 4. Start the server
```bash
npm start          # production
npm run dev        # with --watch auto-restart
```

Open: **http://localhost:3000**

---

## How It Works

```
Browser ──GET /api/assets──► Express server
                              └─ reads assets/generated/manifest.json
                              └─ returns { images: {...}, videos: {...} }

asset-loader.js receives manifest
  ├─ hero video available?  → activates <video#heroVideo> with crossfade
  ├─ hero image available?  → injects .hero__ai-bg overlay
  ├─ section images?        → swaps picsum placeholders with real assets
  └─ graceful fallback if nothing generated yet
```

**Security:** The `FAL_KEY` never leaves the server. All generation API calls happen in `services/` (server-side only). The browser only calls `/api/assets` (read manifest) and `/api/generate/*` (trigger jobs without credentials).

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assets` | Get generated asset manifest |
| `POST` | `/api/generate/image` | Submit image generation job |
| `POST` | `/api/generate/video` | Submit video generation job |
| `GET` | `/api/generate/status/:id` | Poll job status |
| `GET` | `/api/generate/jobs` | List active jobs |

### Generate image via API
```bash
curl -X POST http://localhost:3000/api/generate/image \
  -H "Content-Type: application/json" \
  -d '{"type": "hero"}'
# → {"success":true,"requestId":"...","model":"fal-ai/nano-banana-pro"}

curl http://localhost:3000/api/generate/status/REQUEST_ID
# → {"status":"IN_PROGRESS","queuePosition":2,"elapsed":"45s"}
```

### Generate video via API
```bash
curl -X POST http://localhost:3000/api/generate/video \
  -H "Content-Type: application/json" \
  -d '{"type": "hero"}'
# → {"success":true,"requestId":"...","model":"fal-ai/kling-video/v3/standard/text-to-video"}
```

---

## Image Asset Types

| Type | Section | Model |
|------|---------|-------|
| `hero` | Hero background | Nano Banana Pro |
| `exterior-bow` | Exterior panel 1 | Nano Banana Pro |
| `exterior-profile` | Exterior panel 2 | Nano Banana Pro |
| `exterior-aft` | Exterior panel 3 | Nano Banana Pro |
| `interior-salon` | Interior showcase | Nano Banana Pro |
| `interior-master` | Interior card | Nano Banana Pro |
| `interior-dining` | Interior card | Nano Banana Pro |
| `craftsmanship` | Craft primary | Nano Banana Pro |
| `gallery-1` … `gallery-6` | Gallery grid | Nano Banana Pro |

---

## Cost Estimates

| Asset | Model | Duration | Cost |
|-------|-------|----------|------|
| 14× 2K images | Nano Banana Pro | ~2–5 min | ~$1–2 |
| 1× 10s video | Kling v2 Master | ~5–15 min | ~$2.80 |
| **Total** | | | **~$4–5** |

---

## Production Deployment

Generated videos are gitignored (large files). For production:

1. Run `npm run generate` locally
2. Upload `assets/generated/videos/` to a CDN (Cloudflare R2, AWS S3, etc.)
3. Update `manifest.json` paths to CDN URLs
4. Deploy the Node server (Railway, Render, Fly.io, etc.)
5. Set `FAL_KEY` as a server environment variable — never in code

---

## Project Structure

```
bilginyacht/
├── .env                     ← API key (gitignored)
├── .env.example             ← Template
├── .gitignore
├── package.json
├── server.js                ← Express backend
├── services/
│   ├── fal-client.js        ← FAL client (server-side only)
│   ├── image-gen.js         ← Nano Banana Pro service
│   └── video-gen.js         ← Kling video service
├── scripts/
│   └── generate-assets.js   ← One-time CLI generation
├── assets/generated/
│   ├── images/              ← Generated JPEGs
│   ├── videos/              ← Generated MP4s (gitignored)
│   └── manifest.json        ← Asset registry
├── js/
│   ├── main.js              ← GSAP animations
│   ├── asset-loader.js      ← Generated asset integration
│   └── asset-loader-init.js ← ESM wrapper
├── css/main.css
└── index.html
```
