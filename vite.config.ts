import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: '单词勇者 WordQuest',
        short_name: 'WordQuest',
        description: '把背单词变成像素 RPG 冒险的离线四六级学习应用',
        theme_color: '#0D0D1A',
        background_color: '#0D0D1A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        lang: 'zh-CN',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        // 词库与音频按需缓存：首次下载后永久离线
        runtimeCaching: [
          {
            urlPattern: /\/exams\/.*\/paper\.json(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wq-cet-papers-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/exams\/.*\/listening\.mp3(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wq-cet-recordings-v1',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // 分片 URL 带 ?rev= 版本参数，正则需兼容查询串
            urlPattern: /\/data\/.*\.json(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              // v2：词表内容修订后，旧缓存（v1）随新 SW 激活自动清理
              cacheName: 'wq-wordpacks-v2',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/audio\/.*\.(opus|mp3|ogg)(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wq-audio-v1',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          db: ['dexie', 'dexie-react-hooks'],
          fsrs: ['ts-fsrs'],
        },
      },
    },
  },
})
