import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Where the app lives: "/" locally, "/<repository>/" on GitHub Pages (set by the deploy workflow).
const base = process.env.BASE_PATH ?? '/';
// Full public address, so link previews (WhatsApp) can show the icon. Set by the deploy workflow.
const siteUrl = process.env.SITE_URL ?? base;

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'link-preview-urls',
      transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
    },
    VitePWA({
      registerType: 'prompt',
      workbox: {
        // App shell only. The ML runtime (.wasm) and Whisper models are large and are
        // downloaded and cached on first use of on-device recognition instead.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Bouquet Calculator',
        short_name: 'Bouquet',
        description: 'Dictate a bouquet and get its price.',
        theme_color: '#0f6e56',
        background_color: '#f7f5f0',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  server: {
    host: true,
  },
  preview: {
    host: true,
    // Allow temporary HTTPS tunnels used for testing on real phones.
    allowedHosts: ['.trycloudflare.com'],
  },
});
