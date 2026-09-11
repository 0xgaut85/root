# Root Network

Monorepo for the Root Network web properties. Each app is deployed as its own Railway service.

| App | Path | Domain | Status |
| --- | --- | --- | --- |
| Landing | `apps/landing` | `rootnetwork.co` | live |
| Protocol docs | `apps/docs` | `read.rootnetwork.co` | live |
| Earn app (dashboard + API) | `apps/earn` | `earn.rootnetwork.co` | live |
| Browser extension | `apps/extension` | [Chrome Web Store](https://chromewebstore.google.com/detail/jlgmdngjhimpgjeceddehokdjcbglebg) | published |

Brand mark: `logo.png` (source) — processed copies live in `apps/landing/public/assets/brand/`.

## apps/landing

Vite + TypeScript, three.js (loader), GSAP ScrollTrigger + Lenis (scroll scenes). No framework.

```bash
cd apps/landing
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm start          # serves dist/ on $PORT (what Railway runs)
```

Useful URLs while developing:

- `/?skip` — bypass the WebGL loader and go straight to the page.

### Experience

1. **Loader** — frosted-glass WebGL pane (`src/loader/`). A photoreal 3D hand follows the cursor; dragging wipes the frost. The visitor has to draw an **R** (ghost letter as a guide; freehand also works, detected with a $P point-cloud recognizer in `RGesture.ts`). A `Skip` button appears after 9 s or two failed attempts.
2. **Welcome** — the frost melts to white and "Welcome to Root Network" is revealed.
3. **Scenes** — five pinned, scroll-driven frames (`src/scroll/`), each with a slow zoom on a generated background (images + two ambient Seedance loops), followed by CTA and footer.

### Fonts

Same families as codex.xyz, self-hosted in `public/fonts/`: Die Grotesk B (400/500, primary), Tiempos Headline Light (italic accents), DM Mono (labels).

### Deploying to Railway

Create a service from this repo and set **Root Directory** to `apps/landing`. `apps/landing/railway.json` already defines build (`npm ci && npm run build`) and start (`npm start`) commands; the server binds to `$PORT`. Attach the custom domain `rootnetwork.co` to the service.
