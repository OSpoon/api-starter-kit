import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/pi/index.ts'],
  dts: true,
  exports: true,
})
