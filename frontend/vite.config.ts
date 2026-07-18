import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pm-hybrid-graden/',
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        collection: resolve(__dirname, 'index.html'),
        stats: resolve(__dirname, 'stats/index.html'),
        status: resolve(__dirname, 'status/index.html'),
      },
    },
  },
})
