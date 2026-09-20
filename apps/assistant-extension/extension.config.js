import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

import AutoImport from 'unplugin-auto-import/rspack'
import Components from 'unplugin-vue-components/rspack'

const frontendSource = fileURLToPath(new URL('../frontend/src', import.meta.url))
const extensionSource = fileURLToPath(new URL('./src', import.meta.url))
const assistantWebSource = fileURLToPath(new URL('../assistant-web/src', import.meta.url))
const require = createRequire(import.meta.url)
const assistantWebRequire = createRequire(new URL('../assistant-web/package.json', import.meta.url))
const vueLoader = require.resolve('vue-loader')
const sharedVueRouterRuntime = assistantWebRequire.resolve('vue-router/dist/vue-router.js')

/** @type {import('extension').FileConfig} */
export default {
  config: (config) => {
    config.resolve ??= {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': frontendSource,
      '@assistant': assistantWebSource,
      '@extension': extensionSource,
      // Shared views and the app router must use identical provide/inject keys.
      'vue-router$': sharedVueRouterRuntime,
      '@antv/infographic': false,
      '@terrastruct/d2': false,
      katex: false,
      mermaid: false,
      'stream-markdown': false,
      'stream-monaco': false,
    }
    config.plugins ??= []
    config.plugins.push(
      AutoImport({
        include: [/\.[jt]sx?$/, /\.vue$/, /\.vue\?vue/, /\.vue\.[tj]sx?\?vue/],
        imports: ['vue', 'vue-router', 'vue-i18n', '@vueuse/core'],
        dts: 'src/auto-imports.d.ts',
      }),
      Components({
        dirs: [`${assistantWebSource}/components`, `${frontendSource}/components`],
        dts: 'src/components.d.ts',
      })
    )
    config.module ??= {}
    config.module.rules ??= []
    config.module.rules.push({
      test: /\.vue$/,
      include: [extensionSource, assistantWebSource, frontendSource],
      loader: vueLoader,
    })
    config.module.rules.push({
      test: /\.(?:js|mjs|ts)$/,
      include: [assistantWebSource, frontendSource],
      use: {
        loader: 'builtin:swc-loader',
        options: { detectSyntax: 'auto' },
      },
    })

    return config
  },
}
