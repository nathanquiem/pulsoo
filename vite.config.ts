import { defineConfig } from "vite";
export default defineConfig({
  root: "web",
  build: { outDir: "../dist/web", emptyOutDir: false },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3081",
      "/health": "http://127.0.0.1:3081",
    },
  },
});
