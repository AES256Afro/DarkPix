import { defineConfig } from "vite";

export default defineConfig({
  build: {
    minify: "terser",
    terserOptions: {
      compress: { passes: 2 },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
