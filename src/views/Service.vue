<template>
  <div class="page-bg">
    <!-- 投诉信息点位三维场景 -->
    <div class="panel scene-panel">
      <MarkPoint :index="5" doc-key="service.complaintmap" />
      <TunnelScene
        map-mode
        resizable
        :min-height="200"
        :points="complaintPoints"
        height="280px"
        :default-groups="['structure']"
      />
    </div>

    <div class="grid-2" style="margin-top: 16px">
      <!-- 公众病害反馈 -->
      <div class="panel">
        <MarkPoint :index="1" doc-key="service.feedback" />
        <div class="panel-title">公众病害反馈</div>
        <div class="fb-stats">
          <div class="fb-item"><b class="num-blue">37</b><span>今日上报</span></div>
          <div class="fb-item"><b class="num-orange">9</b><span>待审核</span></div>
          <div class="fb-item"><b class="num-green">26</b><span>已转工单</span></div>
          <div class="fb-item"><b class="num-green">2</b><span>无效反馈</span></div>
        </div>
        <el-table :data="feedbacks" size="small" height="210">
          <el-table-column prop="time" label="时间" width="72" />
          <el-table-column prop="channel" label="渠道" width="72" />
          <el-table-column prop="content" label="反馈内容" />
          <el-table-column prop="stake" label="位置" width="80" />
          <el-table-column prop="status" label="状态" width="76">
            <template #default="{ row }">
              <el-tag :type="row.stType" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="64">
            <template #default>
              <el-button link type="primary" size="small">审核</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 预警信息发布 -->
      <div class="panel">
        <MarkPoint :index="2" doc-key="service.publish" />
        <div class="panel-title">预警信息发布
          <el-button size="small" type="primary" style="margin-left:auto">新建发布</el-button>
        </div>
        <el-table :data="publishes" size="small" height="260">
          <el-table-column prop="time" label="发布时间" width="92" />
          <el-table-column prop="title" label="信息标题" />
          <el-table-column prop="level" label="级别" width="64">
            <template #default="{ row }">
              <el-tag :type="row.lvType" size="small">{{ row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="发布渠道" width="150">
            <template #default="{ row }">
              <span class="ch">{{ row.channels.join(' / ') }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="reach" label="触达" width="64" />
        </el-table>
      </div>
    </div>

    <!-- 安全知识教育 -->
    <div class="grid-3" style="margin-top: 16px">
      <div class="panel">
        <MarkPoint :index="4" doc-key="service.safetyedu" />
        <div class="panel-title">安全知识教育</div>
        <div class="edu-list">
          <div class="edu-item" v-for="e in eduItems" :key="e.title">
            <span class="edu-icon">{{ e.icon }}</span>
            <div class="edu-body">
              <div class="edu-title">{{ e.title }}</div>
              <div class="edu-meta">{{ e.views }} 次浏览 · {{ e.pub }}</div>
            </div>
          </div>
        </div>
        <el-button size="small" type="primary" plain style="width:100%; margin-top:8px">进入安全教育专区</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import MarkPoint from '../components/MarkPoint.vue'
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'

/* 投诉信息点位三维场景 */
const complaintPoints: ScenePoint[] = [
  { id: 'cp1', name: '积水投诉 K4+200', kind: 'complaint', group: 'monitor', status: 'alarm', left: '82%', top: '70%', leftNum: 82, scale: 1.05, stake: 'K4+200', value: '待审核', alarm: '路面积水投诉', inspect: '2026-10-18' },
  { id: 'cp2', name: '渗水投诉 K3+300', kind: 'complaint', group: 'monitor', status: 'alarm', left: '54%', top: '38%', leftNum: 54, scale: 1, stake: 'K3+300', value: '已转工单', alarm: '顶部渗水投诉', inspect: '2026-10-18' },
  { id: 'cp3', name: '照明投诉 K2+500', kind: 'complaint', group: 'monitor', status: 'warn', left: '30%', top: '50%', leftNum: 30, scale: 0.95, stake: 'K2+500', value: '已转工单', inspect: '2026-10-18' },
  { id: 'cp4', name: '诱导屏投诉 K2+100', kind: 'complaint', group: 'monitor', status: 'ok', left: '16%', top: '44%', leftNum: 16, scale: 0.9, stake: 'K2+100', value: '已处理', inspect: '2026-10-18' },
  { id: 'cp5', name: '设施建议 K2+800', kind: 'complaint', group: 'monitor', status: 'ok', left: '42%', top: '56%', leftNum: 42, scale: 0.85, stake: 'K2+800', value: '已采纳', inspect: '2026-10-17' }
]

const feedbacks = [
  { time: '13:58', channel: '小程序', content: '南口 K4+200 路面有积水，车辆通过溅水', stake: 'K4+200', status: '待审核', stType: 'warning' },
  { time: '12:40', channel: '热线', content: 'K3+300 顶部渗水，滴落到挡风玻璃', stake: 'K3+300', status: '已转工单', stType: 'success' },
  { time: '11:15', channel: '小程序', content: 'K2+500 照明灯不亮，光线昏暗', stake: 'K2+500', status: '已转工单', stType: 'success' },
  { time: '10:02', channel: '小程序', content: '北口诱导屏显示模糊', stake: 'K2+100', status: '已转工单', stType: 'success' },
  { time: '09:30', channel: '热线', content: '建议增加雨天限速提醒', stake: '—', status: '建议采纳', stType: 'primary' },
  { time: '08:44', channel: '小程序', content: '（内容与通道无关，无法定位）', stake: '—', status: '已关闭', stType: 'info' }
]

const publishes = [
  { time: '10-16 14:00', title: 'K3 段积水处置，请减速慢行', level: '红色', lvType: 'danger', channels: ['App推送', '诱导屏', '广播'], reach: '12.6万' },
  { time: '10-16 09:10', title: '今日有暴雨，请注意通道积水提示', level: '黄色', lvType: 'warning', channels: ['App推送', '诱导屏'], reach: '9.8万' },
  { time: '10-12 20:00', title: 'K2+600 夜间养护施工，临时占用左道', level: '蓝色', lvType: 'primary', channels: ['App推送', '诱导屏'], reach: '7.2万' },
  { time: '10-08 15:30', title: '消防演练公告（10-09 22:00~23:00）', level: '蓝色', lvType: 'primary', channels: ['App推送', '公告'], reach: '5.4万' }
]

const eduItems = [
  { icon: '🔥', title: '隧道火灾逃生自救指南', views: '2.3万', pub: '2026-10-12' },
  { icon: '💧', title: '汛期积水路段安全出行提示', views: '1.8万', pub: '2026-10-15' },
  { icon: '🚗', title: '隧道内行车安全注意事项', views: '1.5万', pub: '2026-10-08' },
  { icon: '🆘', title: '紧急情况一键报警使用说明', views: '9800', pub: '2026-10-05' }
]
</script>

<style scoped lang="scss">
.scene-panel { padding: 0; overflow: hidden; }

.fb-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
.fb-item {
  text-align: center; background: rgba(20, 48, 98, 0.55); border-radius: 6px; padding: 8px 0;
  b { display: block; font-size: 20px; }
  span { font-size: 11px; color: #7188a8; }
}
.ch { font-size: 11px; color: #aebcd8; }

.edu-list { display: flex; flex-direction: column; gap: 8px; }
.edu-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; background: rgba(20, 48, 98, 0.4); border-radius: 6px;
  cursor: pointer; transition: all 0.2s;
  &:hover { background: rgba(40, 90, 180, 0.35); }
  .edu-icon { font-size: 18px; }
  .edu-title { font-size: 13px; color: #e8f6ff; }
  .edu-meta { font-size: 10px; color: #7188a8; margin-top: 2px; }
}
</style>
