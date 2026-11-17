import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Path relatif: aplikasi dilayani di https://kanasastudio.github.io/kanasastudio/ai/ dan juga dari APK Capacitor.
export default defineConfig(({ mode }) => {
  const capacitor = mode === "capacitor";
  return {
    base: "./",
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        disable: capacitor,
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.png", "apple-touch-icon.png", "logo-white.png", "icons/badge-96.png"],
        injectManifest: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, globPatterns: ["**/*.{js,css,html,png,svg,woff2}"] },
        manifest: {
          id: "./",
          name: "KANASA STUDIO — Autonomous AI Company",
          short_name: "Kanasa AI",
          description: "Kantor virtual perusahaan AI KANASA STUDIO: AI CEO AURELIA-01 dan tim karyawan AI yang bekerja 24 jam.",
          lang: "id",
          start_url: "./#/kantor",
          scope: "./",
          display: "standalone",
          orientation: "portrait",
          background_color: "#F6F1EA",
          theme_color: "#1B1B1B",
          categories: ["business", "productivity"],
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          shortcuts: [
            { name: "Dashboard Founder", url: "./#/dashboard", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
            { name: "Pusat Tugas", url: "./#/tugas", icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          ],
        },
      }),
    ],
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@supabase")) return "supabase";
          },
        },
      },
    },
  };
});
