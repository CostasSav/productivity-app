import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['apple-touch-icon.png', 'icons/*.png'],
    manifest: {
      id: '/',
      name: 'My Workspace',
      short_name: 'My Workspace',
      description: 'Your personal productivity workspace.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#0d9488',
      background_color: '#f9fafb',
      icons: [
        { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
      cleanupOutdatedCaches: true,
      // State-based navigation uses /. Never return the shell for API paths.
      navigateFallbackAllowlist: [/^\/$/],
      // No runtime caches: Railway, /api and external content remain network-only.
      runtimeCaching: [],
    },
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
