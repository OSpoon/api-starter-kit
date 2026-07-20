import { fileURLToPath, URL } from 'node:url'

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:13333'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    AutoImport({
      imports: ['vue', 'vue-router', 'vue-i18n', '@vueuse/core'],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      dirs: ['src/components', '!src/components/ui'],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 18080,
    host: true,
    proxy: {
      '/api/v1': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/vue/') || id.includes('vue-router') || id.includes('/pinia/')) {
            return 'vue-vendor'
          }
          if (id.includes('vue-i18n')) return 'i18n-vendor'
          if (
            id.includes('reka-ui') ||
            id.includes('@lucide/vue') ||
            id.includes('class-variance-authority') ||
            id.includes('clsx') ||
            id.includes('tailwind-merge')
          ) {
            return 'ui-vendor'
          }
          if (
            id.includes('vee-validate') ||
            id.includes('@vee-validate') ||
            id.includes('/zod/') ||
            id.includes('/ajv/') ||
            id.includes('ajv-formats')
          ) {
            return 'form-vendor'
          }
          if (id.includes('@tanstack/vue-table')) return 'table-vendor'
          if (id.includes('markstream-vue')) return 'markdown-vendor'
          return undefined
        },
      },
    },
  },
})
