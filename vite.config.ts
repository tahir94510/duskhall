import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    outDir: "dist",
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    strictPort: false
  },
  preview: {
    port: 5173,
    host: true
  }
});
