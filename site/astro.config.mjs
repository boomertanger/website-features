// @ts-check
import { defineConfig } from "astro/config";

// Static output (no SSR adapter); Cloudflare Pages serves site/dist.
export default defineConfig({
  output: "static",
  vite: {
    server: {
      // The kit lives in ../shared (repo root); let the dev server read it.
      fs: { allow: [".."] },
    },
  },
});
