import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Đông Dương — Quản lý xưởng in",
        short_name: "Đông Dương",
        description: "Không gian quản lý xưởng in",
        lang: "vi",
        theme_color: "#2563eb",
        background_color: "#f6f7f9",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
        globIgnores: ["**/server.*"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [
          { urlPattern: /\/api(?:\/|$)/, handler: "NetworkOnly" },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve("src") } },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              /recharts|d3-|victory-vendor|@reduxjs|react-redux|redux|reselect|immer|decimal\.js-light|tiny-invariant|eventemitter3/.test(
                id,
              )
            )
              return "charts";
            if (id.includes("@tanstack")) return "query-table";
            if (id.includes("radix-ui") || id.includes("@radix-ui"))
              return "ui-primitives";
            return "vendor";
          }
        },
      },
    },
  },
});
