import { fileURLToPath } from 'node:url'

import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue(), AutoImport({ imports: ['vue', '@vueuse/core'], dts: false }), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../frontend/src', import.meta.url)),
    },
  },
  root: './src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
