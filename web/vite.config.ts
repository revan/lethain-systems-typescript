import { defineConfig } from "vite";

// Served from https://<user>.github.io/<repo>/ on GitHub Pages, so build with
// relative asset URLs; that works at any base path.
export default defineConfig({
  base: "./",
});
