import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

/** chokidar 5 的字符串忽略是全等匹配，glob 无效。按路径段跳过，否则会监听 node_modules 和 5 万+ 瓦片，页面请求一直挂起。 */
function isUnwatchedPath(file: string): boolean {
  const parts = String(file).replace(/\\/g, '/').split('/')
  const name = parts[parts.length - 1] ?? ''
  // Word 打开 docx 时文件被独占，chokidar 去 watch 会直接把开发服务打崩
  if (name.startsWith('~$') || /\.(docx?|xlsx?|pptx?)$/i.test(name)) return true
  return parts.some(
    (part) =>
      part === 'node_modules' ||
      part === '三维数据' ||
      part === '.git' ||
      part === 'dist' ||
      part === 'test-results',
  )
}

/**
 * 后端地址：开发时由 Vite 代理 /api 到本机后端，避免浏览器跨域与硬编码 localhost。
 * 现场部署可用 VITE_API_TARGET 指向别的后端，例如 http://172.28.12.194:8080。
 */
/** 读取环境变量（构建期由 Node 注入；浏览器端不会执行该文件） */
declare const process: { env: Record<string, string | undefined> } | undefined
const API_TARGET = (typeof process !== 'undefined' ? process?.env?.VITE_API_TARGET : undefined) || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [vue(), cesium()],
  server: {
    host: '0.0.0.0',
    port: 5188,
    strictPort: true,
    // 允许局域网 IP 访问；原先只放行 localhost，用 172.28.x 打开会被拦住
    allowedHosts: true,
    proxy: {
      // 前端只请求相对路径 /api/v1/...，由开发服务器转发到后端
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        ws: false,
      },
    },
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
