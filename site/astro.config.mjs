// @ts-check
import { defineConfig } from "astro/config";

// Static output (no SSR adapter); Cloudflare Pages serves site/dist.
export default defineConfig({
  output: "static",
  // Markdown (the legal pages) renders exactly as written: no curly quotes or dashes.
  markdown: { smartypants: false },
  vite: {
    server: {
      // The kit lives in ../shared (repo root); let the dev server read it.
      fs: { allow: [".."] },
    },
    build: {
      rollupOptions: {
        output: {
          // Firebase app + Auth and the site's auth store load on every page as one
          // chunk. Without this, the game bundle's Firestore reads (which reach
          // lib/firebase without lib/auth) split them in two, which costs every page.
          manualChunks(id) {
            const p = id.replace(/\\/g, "/");
            if (/\/src\/lib\/(firebase\.ts|auth\.ts|auth-keys\.ts|env\.js)$/.test(p)) return "auth";
            if (/\/node_modules\/(firebase|@firebase)\/(app|auth|util|logger|component)\//.test(p)) return "auth";
          },
        },
      },
    },
  },
});
