import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [vue(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 5188,
    strictPort: true,
    // 允许局域网 IP 访问；原先只放行 localhost，用 172.28.x 打开会被拦住
    allowedHosts: true,
    // 三维瓦片数量极大，监听它们会把开发服务卡死，页面请求一直挂起
    watch: {
      ignored: ['**/public/三维数据/**', '**/.git/**'],
    },
  },
  optimizeDeps: {
    // 不要等全量依赖爬完才响应浏览器，否则首屏会停在白屏
    holdUntilCrawlEnd: false,
    // Cesium 源码预打包会把开发服务卡死，页面请求一直挂起。
    // 开发态直接走已发布的 ESM，HTML 可以马上返回。
    exclude: ['cesium', '@cesium/engine', '@cesium/widgets', '@cesium/core'],
  },
  css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  build: {
    chunkSizeWarningLimit: 4000,
  },
})
