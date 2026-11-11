import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

/** chokidar 5 的字符串忽略是全等匹配，glob 无效。按路径段跳过，否则会监听 node_modules 和 5 万+ 瓦片，页面请求一直挂起。 */
function isUnwatchedPath(file: string): boolean {
  const parts = String(file).replace(/\\/g, '/').split('/')
  return parts.some(
    (part) =>
      part === 'node_modules' ||
      part === '三维数据' ||
      part === '.git' ||
      part === 'dist' ||
      part === 'test-results',
  )
}

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
      ignored: [isUnwatchedPath],
    },
  },
  optimizeDeps: {
    // 不要等全量依赖爬完才响应浏览器，否则首屏会停在白屏
    holdUntilCrawlEnd: false,
    // 预打包 Cesium，把 CJS 依赖（mersenne-twister 等）转成可被浏览器加载的 ESM。
    // 以前排除它是因为文件监听把服务卡死；监听修好后可以预打包，避免几千个源文件逐个请求。
    include: ['cesium'],
  },
  css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  build: {
    chunkSizeWarningLimit: 4000,
  },
})
