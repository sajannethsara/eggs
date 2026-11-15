import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "AK Enterprises Operations",
        short_name: "AK Ops",
        description: "One system for 5 outlets, warehouse, drivers and office.",
        theme_color: "#f59e0b",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Reference data that is useful offline: items, rates, parties.
            urlPattern: /\/api\/(items|rates|parties|auth\/me)(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "api-reference", expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:3001", changeOrigin: true },
    },
  },
})
