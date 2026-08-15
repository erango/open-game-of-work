import { defineConfig } from 'vite';

/**
 * GitHub Pages serves a project site from `/<repo>/`, so the bundle's own URLs need that prefix
 * baked in at build time. Only at build: keeping dev on `/` means the dev server, the contrast
 * audit and every ad-hoc script address the app at the root as before.
 *
 * The game's *asset* paths (`assets/graphics-gen/...`, `assets/music/...`) are deliberately
 * relative, so they follow the document wherever it is served from and need no prefix. VITE_BASE
 * overrides it for a fork with a different repository name, or `/` for a user site.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? '/open-game-of-work/') : '/',
  build: {
    // 12 MB of music and 10 MB of artwork live in public/ and are copied verbatim; the warning
    // is about the JS bundle, which is 110 kB.
    chunkSizeWarningLimit: 800,
  },
}));
