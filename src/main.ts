import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import './styles/global.scss'

// 图标按组件按需引入，不再全量注册 Element Plus Icons（显著缩短首屏解析）
const app = createApp(App)
app.use(ElementPlus).use(router).mount('#app')
