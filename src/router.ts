import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', component: () => import('./views/Overview.vue'), meta: { title: '总览' } },
  { path: '/traffic', component: () => import('./views/Traffic.vue'), meta: { title: '智能交通' } },
  { path: '/maintenance', component: () => import('./views/Maintenance.vue'), meta: { title: '智慧养护' } },
  { path: '/monitoring', component: () => import('./views/Monitoring.vue'), meta: { title: '智慧监测' } },
  { path: '/emergency', component: () => import('./views/Emergency.vue'), meta: { title: '数字应急' } },
  { path: '/service', component: () => import('./views/Service.vue'), meta: { title: '数字服务' } },
  { path: '/asset', component: () => import('./views/Asset.vue'), meta: { title: '资产资料中心' } }
]

export default createRouter({ history: createWebHashHistory(), routes })
