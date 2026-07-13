# MetroForge

Static storefront and download page for [MetroForge](https://github.com/Egg3901/metroforge-native), a native 3D transit builder.

**Game code lives in [metroforge-native](https://github.com/Egg3901/metroforge-native)** (`sim/`). This repo only builds the marketing site.

## Run

```bash
npm install
npm run dev        # local preview
npm run build      # typecheck + vite build → dist/
```

## Pages

- `/` — download landing page
- `/changelog.html` — release history (fetched from GitHub)
- `/download.html` — redirects to `/`
