import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [vue(), cesium()],
  server: { host: '0.0.0.0', port: 5188, strictPort: true, allowedHosts: ['.e2b.app', 'localhost'] },
  css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  build: {
    chunkSizeWarningLimit: 4000
  }
})