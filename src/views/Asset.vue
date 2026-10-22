<template>
  <div class="asset-root map-layout-full">
    <!-- 三维场景为主体（铺满） -->
    <div class="asset-scene">

      <TunnelScene map-mode selectable :points="points" height="100%" @contextmenu="onAssetContext" @select="onAssetSelect" />
      <!-- 操作提示 -->
      <div class="ctx-hint">💡 点击左侧资产列表，或点击 / 右键三维模型构件，弹出关联资料面板</div>
    </div>

    <!-- 左侧资产列表（按图层子项分类） -->
    <div class="asset-side">
      <div class="panel">
        <div class="panel-title">
          资产列表
          <span class="pt-count">共 {{ assetList.length }} 项</span>
        </div>
        <el-input v-model="searchKw" size="small" placeholder="搜索设备名称 / 编号 / 桩号" clearable>
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>

        <!-- 分类（图层分组 → 图层子项 → 设备）折叠列表 -->
        <div class="asset-groups">
          <div v-for="grp in groupedAssets" :key="grp.key" class="ag-group">
            <!-- 图层分组 -->
            <div class="ag-head" @click="toggleGroup(grp.key)">
              <el-icon class="ag-arrow" :class="{ open: !collapsed[grp.key] }"><ArrowRight /></el-icon>
              <span class="ag-dot" :style="{ background: grp.color }"></span>
              <span class="ag-name">{{ grp.name }}</span>
              <span class="ag-count">{{ grp.total }}</span>
            </div>
            <div v-show="!collapsed[grp.key]" class="ag-subs">
              <div v-for="sub in grp.subs" :key="sub.key" class="ag-sub">
                <!-- 图层子项 -->
                <div class="ag-sub-head" @click="toggleGroup('sub:' + sub.key)">
                  <el-icon class="ag-arrow" :class="{ open: !collapsed['sub:' + sub.key] }"><ArrowRight /></el-icon>
                  <span class="ag-sub-dot" :style="{ background: sub.color }"></span>
                  <span class="ag-sub-name">{{ sub.name }}</span>
                  <span class="ag-count">{{ sub.items.length }}</span>
                </div>
                <div v-show="!collapsed['sub:' + sub.key]" class="ag-list">
                  <div
                    v-for="a in sub.items"
                    :key="a.id"
                    class="ag-item"
                    :class="{ active: curAsset?.id === a.id }"
                    @click="selectAsset(a)"
                  >
                    <span class="li-icon">{{ a.icon }}</span>
                    <div class="li-body">
                      <div class="li-name">{{ a.name }}</div>
                      <div class="li-meta">{{ a.stake }} · {{ a.type }}</div>
                    </div>
                    <span class="li-tag" :class="a.status">{{ a.status === 'ok' ? '正常' : a.status === 'warn' ? '待检' : a.status === 'offline' ? '离线' : '告警' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 资产资料面板（右侧，点击/右键弹出） -->
    <transition name="slide">
      <div v-if="curAsset" class="asset-panel">
        <div class="ap-header">
          <span class="ap-icon">{{ curAsset.icon }}</span>
          <div class="ap-title">
            <div class="ap-name">{{ curAsset.name }}</div>
            <div class="ap-code">资产编码 {{ curAsset.code }} · {{ curAsset.sys }}</div>
          </div>
          <el-button size="small" circle @click="curAsset = null"><el-icon><Close /></el-icon></el-button>
        </div>

        <el-tabs v-model="tab" class="ap-tabs">
          <!-- 三维模型 -->
          <el-tab-pane label="三维模型" name="model">
            <div class="ap-model">
              <div class="am-canvas">
                <span class="am-icon">{{ curAsset.icon }}</span>
                <span class="am-tag">构件 3D 预览（可旋转/缩放）</span>
              </div>
              <div class="am-meta">
                <div class="am-row"><span>资产编码</span><b>{{ curAsset.code }}</b></div>
                <div class="am-row"><span>物理位置</span><b>{{ curAsset.stake }} · {{ curAsset.pos }}</b></div>
                <div class="am-row"><span>所属系统</span><b>{{ curAsset.sys }}</b></div>
                <div class="am-row"><span>安装日期</span><b>{{ curAsset.install }}</b></div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 结构/参数/材质 -->
          <el-tab-pane label="结构·参数·材质" name="spec">
            <div class="ap-spec">
              <div class="spec-block">
                <div class="spec-title">结构信息</div>
                <div class="spec-row" v-for="s in curAsset.structure" :key="s.k"><span>{{ s.k }}</span><b>{{ s.v }}</b></div>
              </div>
              <div class="spec-block">
                <div class="spec-title">技术参数</div>
                <div class="spec-row" v-for="s in curAsset.params" :key="s.k"><span>{{ s.k }}</span><b>{{ s.v }}</b></div>
              </div>
              <div class="spec-block">
                <div class="spec-title">材质信息</div>
                <div class="spec-row" v-for="s in curAsset.materials" :key="s.k"><span>{{ s.k }}</span><b>{{ s.v }}</b></div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 作业指导 -->
          <el-tab-pane label="作业指导" name="guide">
            <div class="ap-guide">
              <div class="guide-step" v-for="(g, i) in curAsset.guide" :key="i">
                <span class="gs-num">{{ i + 1 }}</span>
                <div class="gs-body">
                  <div class="gs-title">{{ g.t }}</div>
                  <div class="gs-desc">{{ g.d }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 技术资料 -->
          <el-tab-pane label="技术资料" name="docs">
            <div class="ap-docs">
              <div class="doc-item" v-for="d in curAsset.docList" :key="d.name">
                <span class="doc-icon">{{ d.icon }}</span>
                <div class="doc-body">
                  <div class="doc-name">{{ d.name }}</div>
                  <div class="doc-meta">{{ d.size }} · {{ d.date }} · 版本 {{ d.ver }}</div>
                </div>
                <el-button link type="primary" size="small">查看</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>

        <!-- 底部操作：更新 / 维护 -->
        <div class="ap-actions">
          <el-button type="primary" size="small" @click="openUpdate"><el-icon><Edit /></el-icon>更新设备</el-button>
          <el-button type="warning" size="small" @click="openMaintain"><el-icon><Tools /></el-icon>维护工单</el-button>
          <el-button size="small" @click="openRecord"><el-icon><Document /></el-icon>维保记录</el-button>
        </div>
      </div>
    </transition>

    <!-- 更新设备 弹窗 -->
    <el-dialog v-model="updateVisible" :title="'更新设备 · ' + (curAsset?.name || '')" width="520px">
      <el-form :model="updateForm" label-width="92px" size="small">
        <el-form-item label="资产编号"><el-input v-model="updateForm.code" /></el-form-item>
        <el-form-item label="设备名称"><el-input v-model="updateForm.name" /></el-form-item>
        <el-form-item label="所属系统"><el-input v-model="updateForm.sys" /></el-form-item>
        <el-form-item label="物理位置"><el-input v-model="updateForm.pos" /></el-form-item>
        <el-form-item label="安装日期"><el-input v-model="updateForm.install" /></el-form-item>
        <el-form-item label="运行状态">
          <el-select v-model="updateForm.status" style="width:100%">
            <el-option label="正常" value="ok" />
            <el-option label="待检" value="warn" />
            <el-option label="告警" value="alarm" />
            <el-option label="离线" value="offline" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="updateForm.remark" type="textarea" :rows="3" placeholder="更新说明..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="updateVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveUpdate">保存更新</el-button>
      </template>
    </el-dialog>

    <!-- 维护工单 弹窗 -->
    <el-dialog v-model="maintainVisible" :title="'维护工单 · ' + (curAsset?.name || '')" width="520px">
      <el-form :model="maintainForm" label-width="92px" size="small">
        <el-form-item label="维护类型">
          <el-select v-model="maintainForm.type" style="width:100%">
            <el-option label="日常巡检" value="日常巡检" />
            <el-option label="定期保养" value="定期保养" />
            <el-option label="故障维修" value="故障维修" />
            <el-option label="预防性维护" value="预防性维护" />
          </el-select>
        </el-form-item>
        <el-form-item label="紧急程度">
          <el-select v-model="maintainForm.level" style="width:100%">
            <el-option label="一般" value="一般" />
            <el-option label="较急" value="较急" />
            <el-option label="紧急" value="紧急" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划日期">
          <el-input v-model="maintainForm.date" placeholder="2026-10-25" />
        </el-form-item>
        <el-form-item label="负责人"><el-input v-model="maintainForm.owner" /></el-form-item>
        <el-form-item label="维护内容">
          <el-input v-model="maintainForm.content" type="textarea" :rows="3" placeholder="维护内容描述..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="maintainVisible = false">取消</el-button>
        <el-button size="small" type="warning" @click="submitMaintain">提交工单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Tools, Document, ArrowRight, Search, Close } from '@element-plus/icons-vue'
import TunnelScene, { type ScenePoint } from '../components/TunnelScene.vue'

/* 资产点位（隧道内各类设备） */
const points: ScenePoint[] = [
  { id: 'a1', name: '轴流风机 JF-1', kind: 'fan', group: 'mep', status: 'ok', left: '20%', top: '22%', leftNum: 20, scale: 1.1, stake: 'K2+900', value: '运行' },
  { id: 'a2', name: '轴流风机 JF-2', kind: 'fan', group: 'mep', status: 'warn', left: '38%', top: '20%', leftNum: 38, scale: 1, stake: 'K3+600', value: '待机' },
  { id: 'a3', name: '排涝泵 P1', kind: 'pump', group: 'mep', status: 'ok', left: '56%', top: '78%', leftNum: 56, scale: 1.05, stake: '泵房K3+000', value: '0.4MPa' },
  { id: 'a4', name: '诱导屏 K2+600', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '30%', top: '62%', leftNum: 30, scale: 0.95, stake: 'K2+600', value: '限速60' },
  { id: 'a5', name: '情报板 K3+100', kind: 'infoBoard', group: 'traffic', status: 'ok', left: '48%', top: '58%', leftNum: 48, scale: 0.9, stake: 'K3+100', value: '前方畅通' },
  { id: 'a6', name: '流量摄像机 K3+500', kind: 'camera', group: 'traffic', status: 'ok', left: '68%', top: '32%', leftNum: 68, scale: 0.9, stake: 'K3+500', value: '在线' },
  { id: 'a7', name: '照明灯具组 L-3', kind: 'lamp', group: 'mep', status: 'ok', left: '76%', top: '18%', leftNum: 76, scale: 0.85, stake: 'K3+800', value: '96回路' },
  { id: 'a8', name: 'CO监测器 C-2', kind: 'covi', group: 'env', status: 'ok', left: '44%', top: '48%', leftNum: 44, scale: 0.9, stake: 'K3+200', value: 'CO 12ppm' },
  { id: 'a9', name: '沉降监测点 S-4', kind: 'stress', group: 'monitor', status: 'ok', left: '62%', top: '42%', leftNum: 62, scale: 0.8, stake: 'K3+400', value: '0.5mm' },
  { id: 'a10', name: '积水监测 W-2', kind: 'waterLevel', group: 'env', status: 'ok', left: '34%', top: '80%', leftNum: 34, scale: 0.85, stake: 'K2+800', value: '1.2cm' },
  { id: 'a11', name: '可变情报板 K4+050', kind: 'infoBoard', group: 'traffic', status: 'offline', left: '82%', top: '24%', leftNum: 82, scale: 0.9, stake: 'K4+050', value: '离线' },
  { id: 'a12', name: '消防水泵 FP-2', kind: 'firePump', group: 'mep', status: 'ok', left: '26%', top: '74%', leftNum: 26, scale: 1.0, stake: '消防泵房', value: '0.6MPa' },
  { id: 'a13', name: '风速风向仪 W-1', kind: 'wind', group: 'env', status: 'ok', left: '58%', top: '14%', leftNum: 58, scale: 0.85, stake: 'K3+700', value: '2.8m/s' },
  { id: 'a14', name: '应力应变监测 S-2', kind: 'stress', group: 'monitor', status: 'alarm', left: '70%', top: '48%', leftNum: 70, scale: 0.8, stake: 'K3+900', value: '182με' },
  { id: 'a15', name: '球形摄像机 D-1', kind: 'dome', group: 'traffic', status: 'ok', left: '40%', top: '36%', leftNum: 40, scale: 0.9, stake: 'K3+150', value: '在线' },
  { id: 'a16', name: '照度计1', kind: 'illum', group: 'env', status: 'ok', left: '22%', top: '46%', leftNum: 22, scale: 0.85, stake: 'K2+850', value: '360lx' },
  { id: 'a17', name: '照度计2', kind: 'illum', group: 'env', status: 'ok', left: '36%', top: '42%', leftNum: 36, scale: 0.85, stake: 'K3+050', value: '342lx' },
  { id: 'a18', name: '照度计3', kind: 'illum', group: 'env', status: 'warn', left: '52%', top: '40%', leftNum: 52, scale: 0.85, stake: 'K3+350', value: '215lx' },
  { id: 'a19', name: '照度计4', kind: 'illum', group: 'env', status: 'ok', left: '66%', top: '44%', leftNum: 66, scale: 0.85, stake: 'K3+650', value: '328lx' },
  // 隧道环境（附属设施与结构）
  { id: 'a20', name: '隧道结构上层 S-U1', kind: 'structureUp', group: 'structure', status: 'ok', left: '24%', top: '26%', leftNum: 24, scale: 0.9, stake: 'K2+300', value: '完好' },
  { id: 'a21', name: '隧道结构下层 S-D1', kind: 'structureDown', group: 'structure', status: 'ok', left: '44%', top: '28%', leftNum: 44, scale: 0.9, stake: 'K3+100', value: '完好' },
  { id: 'a22', name: '机电管线 P-1', kind: 'pipe', group: 'structure', status: 'warn', left: '34%', top: '30%', leftNum: 34, scale: 0.85, stake: 'K2+700', value: '1处锈蚀' },
  { id: 'a23', name: '应急通道 E-1', kind: 'passage', group: 'structure', status: 'ok', left: '54%', top: '34%', leftNum: 54, scale: 0.9, stake: 'K3+500', value: '畅通' },
  { id: 'a24', name: '隧道运管中心', kind: 'opsCenter', group: 'structure', status: 'ok', left: '12%', top: '52%', leftNum: 12, scale: 1.05, stake: 'K2+100', value: '运行' },
  { id: 'a25', name: '雨水泵房', kind: 'rainPump', group: 'structure', status: 'ok', left: '28%', top: '72%', leftNum: 28, scale: 1.0, stake: 'K2+400', value: '运行' },
  { id: 'a26', name: '消防泵房', kind: 'fireStation', group: 'structure', status: 'ok', left: '46%', top: '74%', leftNum: 46, scale: 1.0, stake: 'K3+000', value: '运行' },
  { id: 'a27', name: '废水泵房', kind: 'wastePump', group: 'structure', status: 'warn', left: '64%', top: '76%', leftNum: 64, scale: 1.0, stake: 'K3+600', value: '待检' },
  { id: 'a28', name: '变电所', kind: 'substation', group: 'structure', status: 'ok', left: '80%', top: '70%', leftNum: 80, scale: 1.0, stake: 'K4+000', value: '运行' }
]

/* 资产资料数据 */
interface Asset {
  id: string
  name: string
  code: string
  icon: string
  type: string
  stake: string
  pos: string
  sys: string
  install: string
  status: 'ok' | 'warn' | 'alarm' | 'offline'
  docs: number
  structure: { k: string; v: string }[]
  params: { k: string; v: string }[]
  materials: { k: string; v: string }[]
  guide: { t: string; d: string }[]
  docList: { name: string; icon: string; size: string; date: string; ver: string }[]
}

const assets: Record<string, Asset> = {
  a1: {
    id: 'a1', name: '轴流风机 JF-1', code: 'SYS-JF-0001', icon: '🌀', type: '通风设备',
    stake: 'K2+900', pos: '顶棚吊装 · 左侧车道上方 5.2m', sys: '隧道通风系统', install: '2022-06-15', status: 'ok',
    docs: 6,
    structure: [
      { k: '型号规格', v: 'TAS 9-26 型轴流风机' }, { k: '叶轮直径', v: 'φ900mm' },
      { k: '整机重量', v: '1.2t' }, { k: '安装方式', v: '预埋吊架 + 减震支座' }
    ],
    params: [
      { k: '额定风量', v: '18,500 m³/h' }, { k: '电机功率', v: '22 kW' },
      { k: '额定转速', v: '1450 r/min' }, { k: '风压', v: '1200 Pa' }
    ],
    materials: [
      { k: '叶轮', v: '铝合金 ZL104' }, { k: '机壳', v: 'Q235 钢板（镀锌）' },
      { k: '电机', v: 'Y2 系列三相异步' }
    ],
    guide: [
      { t: '停机断电', d: '切断电源并挂"检修中"警示牌，确认叶轮完全静止。' },
      { t: '外观检查', d: '检查叶轮叶片有无裂纹、变形，机壳螺栓是否松动。' },
      { t: '润滑保养', d: '按周期加注锂基润滑脂，检查轴承温升 ≤ 65℃。' },
      { t: '试运行', d: '点动试车，确认转向正确、无异常振动后恢复运行。' }
    ],
    docList: [
      { name: '产品使用说明书', icon: '📄', size: '8.2MB', date: '2022-06', ver: 'V1.0' },
      { name: '安装竣工图纸', icon: '📐', size: '12.5MB', date: '2022-07', ver: 'V2.1' },
      { name: '维保作业指导书', icon: '📋', size: '3.1MB', date: '2023-03', ver: 'V1.2' },
      { name: '产品合格证', icon: '📜', size: '0.8MB', date: '2022-06', ver: '—' }
    ]
  },
  a2: {
    id: 'a2', name: '轴流风机 JF-2', code: 'SYS-JF-0002', icon: '🌀', type: '通风设备',
    stake: 'K3+600', pos: '顶棚吊装 · 左侧车道上方 5.2m', sys: '隧道通风系统', install: '2022-06-18', status: 'warn',
    docs: 5,
    structure: [
      { k: '型号规格', v: 'TAS 9-26 型轴流风机' }, { k: '叶轮直径', v: 'φ900mm' },
      { k: '整机重量', v: '1.2t' }, { k: '安装方式', v: '预埋吊架 + 减震支座' }
    ],
    params: [
      { k: '额定风量', v: '18,500 m³/h' }, { k: '电机功率', v: '22 kW' },
      { k: '额定转速', v: '1450 r/min' }, { k: '风压', v: '1200 Pa' }
    ],
    materials: [
      { k: '叶轮', v: '铝合金 ZL104' }, { k: '机壳', v: 'Q235 钢板（镀锌）' },
      { k: '电机', v: 'Y2 系列三相异步' }
    ],
    guide: [
      { t: '停机断电', d: '切断电源并挂"检修中"警示牌，确认叶轮完全静止。' },
      { t: '外观检查', d: '检查叶轮叶片有无裂纹、变形，机壳螺栓是否松动。' },
      { t: '润滑保养', d: '按周期加注锂基润滑脂，检查轴承温升 ≤ 65℃。' },
      { t: '试运行', d: '点动试车，确认转向正确、无异常振动后恢复运行。' }
    ],
    docList: [
      { name: '产品使用说明书', icon: '📄', size: '8.2MB', date: '2022-06', ver: 'V1.0' },
      { name: '安装竣工图纸', icon: '📐', size: '12.5MB', date: '2022-07', ver: 'V2.1' },
      { name: '维保作业指导书', icon: '📋', size: '3.1MB', date: '2023-03', ver: 'V1.2' }
    ]
  },
  a6: {
    id: 'a6', name: '流量摄像机 K3+500', code: 'SYS-CAM-0006', icon: '📷', type: '交通设施',
    stake: 'K3+500', pos: '顶棚吊装 · 车道正上方', sys: '视频监控系统', install: '2022-03-18', status: 'ok',
    docs: 3,
    structure: [
      { k: '型号规格', v: '400万 高清枪机' }, { k: '镜头', v: '8mm 定焦' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '分辨率', v: '2560×1440' }, { k: '工作电压', v: 'AC24V' },
      { k: '防护等级', v: 'IP66' }
    ],
    materials: [{ k: '外壳', v: '铝合金' }, { k: '镜头', v: '光学玻璃' }],
    guide: [
      { t: '镜头清洁', d: '定期清洁镜头玻璃，避免灰尘影响画面。' },
      { t: '预置位核查', d: '核查预置位与监测断面是否一致。' }
    ],
    docList: [
      { name: '枪机说明书', icon: '📄', size: '2.9MB', date: '2022-03', ver: 'V1.0' },
      { name: '监控布点图', icon: '📐', size: '4.6MB', date: '2022-04', ver: 'V1.0' }
    ]
  },
  a7: {
    id: 'a7', name: '照明灯具组 L-3', code: 'SYS-LMP-0003', icon: '💡', type: '照明设备',
    stake: 'K3+800', pos: '顶棚 · 照明回路 L-3', sys: '隧道照明系统', install: '2022-05-11', status: 'ok',
    docs: 2,
    structure: [
      { k: '型号规格', v: 'LED 隧道灯 200W' }, { k: '安装方式', v: '顶棚吊装' },
      { k: '回路', v: 'L-3（96 回路）' }
    ],
    params: [
      { k: '额定功率', v: '200W' }, { k: '色温', v: '5000K' },
      { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '灯体', v: '铝合金' }, { k: '光源', v: 'LED 模组' }],
    guide: [
      { t: '巡检', d: '检查灯具亮度、有无频闪与外壳破损。' },
      { t: '回路核查', d: '核对回路开关与调光控制器状态。' }
    ],
    docList: [
      { name: 'LED 灯具说明书', icon: '📄', size: '1.4MB', date: '2022-05', ver: 'V1.0' },
      { name: '照明回路图', icon: '📐', size: '2.8MB', date: '2022-05', ver: 'V1.0' }
    ]
  },
  a11: {
    id: 'a11', name: '可变情报板 K4+050', code: 'SYS-IB-0011', icon: '🖥️', type: '交通设施',
    stake: 'K4+050', pos: '顶棚悬吊 · 距地面 5.0m', sys: '智能交通系统', install: '2022-03-22', status: 'offline',
    docs: 3,
    structure: [
      { k: '型号规格', v: '双基色情报板' }, { k: '屏体尺寸', v: '4.0m × 2.0m' },
      { k: '安装方式', v: '顶棚吊架' }
    ],
    params: [
      { k: '分辨率', v: '192 × 96 点' }, { k: '可视距离', v: '≥ 200m' },
      { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '模组', v: '双基色 LED' }, { k: '箱体', v: '铝合金' }],
    guide: [
      { t: '通信排查', d: '检查供电与通信链路，恢复在线。' },
      { t: '内容核查', d: '恢复后核查发布内容是否正确。' }
    ],
    docList: [
      { name: '情报板技术说明书', icon: '📄', size: '4.6MB', date: '2022-03', ver: 'V1.0' },
      { name: '安装图纸', icon: '📐', size: '5.2MB', date: '2022-03', ver: 'V1.0' }
    ]
  },
  a3: {
    id: 'a3', name: '排涝泵 P1', code: 'SYS-PS-0003', icon: '⚙️', type: '排涝设备',
    stake: '泵房 K3+000', pos: '泵房负一层 · 基坑安装', sys: '防洪排涝系统', install: '2021-11-20', status: 'ok',
    docs: 5,
    structure: [
      { k: '型号规格', v: 'WQ 潜水排污泵 150WQ' }, { k: '叶轮直径', v: 'φ150mm' },
      { k: '整机重量', v: '0.85t' }, { k: '安装方式', v: '自动耦合装置' }
    ],
    params: [
      { k: '额定流量', v: '210 m³/h' }, { k: '扬程', v: '18 m' },
      { k: '电机功率', v: '15 kW' }, { k: '额定电流', v: '30A' }
    ],
    materials: [
      { k: '泵体', v: '铸铁 HT200' }, { k: '叶轮', v: '不锈钢 304' },
      { k: '密封', v: '双端面机械密封' }
    ],
    guide: [
      { t: '启泵前检查', d: '检查液位、供电电压、管路阀门开度是否正常。' },
      { t: '空载试转', d: '短时空载试转，确认无卡滞、无异响。' },
      { t: '密封检查', d: '检查机械密封泄漏量，超出标准及时更换。' },
      { t: '停机保养', d: '排空积水，清理叶轮杂物，涂抹防锈油。' }
    ],
    docList: [
      { name: '潜水排污泵说明书', icon: '📄', size: '6.7MB', date: '2021-11', ver: 'V1.0' },
      { name: '泵房安装图纸', icon: '📐', size: '10.2MB', date: '2021-12', ver: 'V1.0' },
      { name: '年度维保记录', icon: '📋', size: '2.4MB', date: '2023-11', ver: 'V3.0' }
    ]
  },
  a4: {
    id: 'a4', name: '交通诱导屏 K2+600', code: 'SYS-LED-0012', icon: '🚹', type: '交通设施',
    stake: 'K2+600', pos: '侧墙安装 · 距地面 4.5m', sys: '智能交通系统', install: '2022-03-08', status: 'ok',
    docs: 4,
    structure: [
      { k: '型号规格', v: 'P10 户外全彩 LED' }, { k: '屏体尺寸', v: '3.2m × 1.6m' },
      { k: '整机重量', v: '0.28t' }, { k: '安装方式', v: '侧墙抱箍支架' }
    ],
    params: [
      { k: '像素间距', v: '10mm' }, { k: '最大亮度', v: '≥ 8000 cd/m²' },
      { k: '工作电压', v: 'AC220V' }, { k: '防护等级', v: 'IP65' }
    ],
    materials: [
      { k: '模组', v: 'SMD 三合一灯珠' }, { k: '箱体', v: '铝合金压铸' },
      { k: '面罩', v: 'PC 抗紫外线' }
    ],
    guide: [
      { t: '断电维护', d: '关闭屏体电源，待 LED 冷却后进行维护。' },
      { t: '清洁除尘', d: '用软毛刷清理模组表面与散热孔积尘。' },
      { t: '模组更换', d: '断电后更换故障模组，注意接口防呆与防水圈。' }
    ],
    docList: [
      { name: 'LED 显示屏说明书', icon: '📄', size: '5.4MB', date: '2022-03', ver: 'V1.0' },
      { name: '安装结构图纸', icon: '📐', size: '4.8MB', date: '2022-03', ver: 'V1.0' },
      { name: '巡检作业指导', icon: '📋', size: '1.9MB', date: '2023-01', ver: 'V1.1' }
    ]
  },
  a5: {
    id: 'a5', name: '隧道情报板 K3+100', code: 'SYS-IB-0007', icon: '🖥️', type: '交通设施',
    stake: 'K3+100', pos: '顶棚悬吊 · 距地面 5.0m', sys: '智能交通系统', install: '2022-03-12', status: 'ok',
    docs: 4,
    structure: [
      { k: '型号规格', v: '双基色情报板' }, { k: '屏体尺寸', v: '4.0m × 2.0m' },
      { k: '整机重量', v: '0.42t' }, { k: '安装方式', v: '顶棚吊架' }
    ],
    params: [
      { k: '分辨率', v: '192 × 96 点' }, { k: '可视距离', v: '≥ 200m' },
      { k: '工作电压', v: 'AC220V' }, { k: '防护等级', v: 'IP65' }
    ],
    materials: [
      { k: '模组', v: '双基色 LED' }, { k: '箱体', v: '铝合金' }
    ],
    guide: [
      { t: '内容发布', d: '通过平台编辑文字内容并审核后下发。' },
      { t: '亮度调节', d: '按环境光自动调节亮度，夜间降亮。' },
      { t: '故障排查', d: '检查供电、通信与模组状态。' }
    ],
    docList: [
      { name: '情报板技术说明书', icon: '📄', size: '4.6MB', date: '2022-03', ver: 'V1.0' },
      { name: '安装图纸', icon: '📐', size: '5.2MB', date: '2022-03', ver: 'V1.0' }
    ]
  },
  a8: {
    id: 'a8', name: 'CO监测器 C-2', code: 'SYS-CO-0002', icon: '🌫️', type: '环控设备',
    stake: 'K3+200', pos: '侧墙 2.5m 高度', sys: '环境监测系统', install: '2022-04-10', status: 'ok',
    docs: 3,
    structure: [
      { k: '型号规格', v: 'CO 电化学监测器' }, { k: '量程', v: '0 ~ 300 ppm' },
      { k: '整机重量', v: '0.8kg' }, { k: '安装方式', v: '侧墙支架' }
    ],
    params: [
      { k: '检测精度', v: '±1 ppm' }, { k: '响应时间', v: '< 30s' },
      { k: '工作电压', v: 'DC24V' }, { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '外壳', v: 'ABS 阻燃' }, { k: '探头', v: '电化学传感器' }],
    guide: [
      { t: '定期标定', d: '每季度用标准气体标定一次。' },
      { t: '探头清洁', d: '清理探头防护罩积尘，避免堵塞。' }
    ],
    docList: [
      { name: 'CO监测器说明书', icon: '📄', size: '2.1MB', date: '2022-04', ver: 'V1.0' },
      { name: '标定记录', icon: '📋', size: '0.6MB', date: '2023-04', ver: '—' }
    ]
  },
  a9: {
    id: 'a9', name: '沉降监测点 S-4', code: 'SYS-SET-0004', icon: '📏', type: '监测设备',
    stake: 'K3+400', pos: '仰拱下方 · 结构面', sys: '结构监测系统', install: '2021-12-01', status: 'ok',
    docs: 3,
    structure: [
      { k: '型号规格', v: '静力水准仪' }, { k: '量程', v: '±50mm' },
      { k: '安装方式', v: '结构预埋' }
    ],
    params: [
      { k: '测量精度', v: '±0.1mm' }, { k: '采样频率', v: '1 次/小时' },
      { k: '供电', v: 'DC12V 总线' }
    ],
    materials: [{ k: '主体', v: '不锈钢' }, { k: '传感器', v: '压阻式' }],
    guide: [
      { t: '基准点校准', d: '定期校准基准点，消除系统漂移。' },
      { t: '数据核查', d: '异常波动时复核现场并校核数据。' }
    ],
    docList: [
      { name: '静力水准仪说明书', icon: '📄', size: '1.8MB', date: '2021-12', ver: 'V1.0' },
      { name: '监测布点图', icon: '📐', size: '3.4MB', date: '2022-01', ver: 'V1.0' }
    ]
  },
  a10: {
    id: 'a10', name: '积水监测 W-2', code: 'SYS-WL-0002', icon: '💧', type: '环控设备',
    stake: 'K2+800', pos: '行车道最低点 · 侧沟', sys: '环境监测系统', install: '2022-05-06', status: 'ok',
    docs: 3,
    structure: [
      { k: '型号规格', v: '超声波液位计' }, { k: '量程', v: '0 ~ 2m' },
      { k: '安装方式', v: '侧沟支架' }
    ],
    params: [
      { k: '测量精度', v: '±2mm' }, { k: '工作电压', v: 'DC24V' },
      { k: '防护等级', v: 'IP68' }
    ],
    materials: [{ k: '外壳', v: '不锈钢 304' }, { k: '探头', v: '超声波' }],
    guide: [
      { t: '探头清洁', d: '定期清理探头表面水垢与杂物。' },
      { t: '阈值核查', d: '核查报警阈值与实际积水情况是否匹配。' }
    ],
    docList: [
      { name: '液位计说明书', icon: '📄', size: '1.5MB', date: '2022-05', ver: 'V1.0' },
      { name: '积水点台账', icon: '📋', size: '0.5MB', date: '2023-05', ver: 'V2.0' }
    ]
  },
  a12: {
    id: 'a12', name: '消防水泵 FP-2', code: 'SYS-FP-0002', icon: '🚒', type: '消防设备',
    stake: '消防泵房', pos: '消防泵房 · 地面安装', sys: '消防系统', install: '2021-10-15', status: 'ok',
    docs: 4,
    structure: [
      { k: '型号规格', v: 'XBD 立式消防泵' }, { k: '叶轮直径', v: 'φ200mm' },
      { k: '整机重量', v: '1.6t' }, { k: '安装方式', v: '地脚螺栓固定' }
    ],
    params: [
      { k: '额定流量', v: '40 L/s' }, { k: '扬程', v: '60m' },
      { k: '电机功率', v: '37kW' }, { k: '额定转速', v: '2900 r/min' }
    ],
    materials: [{ k: '泵体', v: '铸铁' }, { k: '叶轮', v: '铜合金' }],
    guide: [
      { t: '定期试泵', d: '每月手动/自动试泵一次，记录压力与电流。' },
      { t: '盘根检查', d: '检查轴封渗漏，超标及时更换盘根。' }
    ],
    docList: [
      { name: '消防泵说明书', icon: '📄', size: '7.3MB', date: '2021-10', ver: 'V1.0' },
      { name: '消防泵房图纸', icon: '📐', size: '9.1MB', date: '2021-11', ver: 'V1.0' },
      { name: '试泵记录', icon: '📋', size: '1.2MB', date: '2023-10', ver: '—' }
    ]
  },
  a13: {
    id: 'a13', name: '风速风向仪 W-1', code: 'SYS-WD-0001', icon: '🌬️', type: '环控设备',
    stake: 'K3+700', pos: '顶棚 · 通风断面', sys: '环境监测系统', install: '2022-04-18', status: 'ok',
    docs: 3,
    structure: [
      { k: '型号规格', v: '超声波风速风向仪' }, { k: '量程', v: '0 ~ 40 m/s' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '测量精度', v: '±0.2m/s' }, { k: '工作电压', v: 'DC24V' },
      { k: '防护等级', v: 'IP66' }
    ],
    materials: [{ k: '外壳', v: '铝合金' }, { k: '探头', v: '超声波换能器' }],
    guide: [
      { t: '探头清洁', d: '定期清洁换能器表面。' },
      { t: '零点校准', d: '无风工况下校准零点。' }
    ],
    docList: [
      { name: '风速风向仪说明书', icon: '📄', size: '2.4MB', date: '2022-04', ver: 'V1.0' },
      { name: '通风断面图', icon: '📐', size: '4.0MB', date: '2022-05', ver: 'V1.0' }
    ]
  },
  a14: {
    id: 'a14', name: '应力应变监测 S-2', code: 'SYS-STR-0002', icon: '📏', type: '监测设备',
    stake: 'K3+900', pos: '衬砌内表面', sys: '结构监测系统', install: '2021-12-08', status: 'alarm',
    docs: 3,
    structure: [
      { k: '型号规格', v: '振弦式应变计' }, { k: '量程', v: '±3000με' },
      { k: '安装方式', v: '结构粘贴/预埋' }
    ],
    params: [
      { k: '测量精度', v: '±1με' }, { k: '采样频率', v: '1 次/10分钟' },
      { k: '供电', v: 'DC12V' }
    ],
    materials: [{ k: '主体', v: '不锈钢' }, { k: '敏感元件', v: '钢弦' }],
    guide: [
      { t: '数据核查', d: '异常时应变点现场复核，排除仪表故障。' },
      { t: '定期率定', d: '每年率定一次传感器。' }
    ],
    docList: [
      { name: '应变计说明书', icon: '📄', size: '1.6MB', date: '2021-12', ver: 'V1.0' },
      { name: '监测断面图', icon: '📐', size: '3.0MB', date: '2022-01', ver: 'V1.0' }
    ]
  },
  a15: {
    id: 'a15', name: '球形摄像机 D-1', code: 'SYS-DOM-0001', icon: '📹', type: '交通设施',
    stake: 'K3+150', pos: '顶棚吊装', sys: '视频监控系统', install: '2022-03-20', status: 'ok',
    docs: 3,
    structure: [
      { k: '型号规格', v: '400万 高速球机' }, { k: '变倍', v: '20 倍光学变焦' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '分辨率', v: '2560×1440' }, { k: '工作电压', v: 'AC24V' },
      { k: '防护等级', v: 'IP66' }
    ],
    materials: [{ k: '外壳', v: '铝合金' }, { k: '镜头', v: '光学玻璃' }],
    guide: [
      { t: '镜头清洁', d: '定期清洁球机透明罩。' },
      { t: '云台检查', d: '检查云台转动与预置位是否正常。' }
    ],
    docList: [
      { name: '球机说明书', icon: '📄', size: '3.2MB', date: '2022-03', ver: 'V1.0' },
      { name: '监控布点图', icon: '📐', size: '5.1MB', date: '2022-04', ver: 'V1.0' }
    ]
  },
  a16: {
    id: 'a16', name: '照度计1', code: 'SYS-IL-0001', icon: '☀️', type: '环控设备',
    stake: 'K2+850', pos: '顶棚 · 照明断面 1', sys: '环境监测系统', install: '2022-04-22', status: 'ok',
    docs: 2,
    structure: [
      { k: '型号规格', v: '数字式照度计 LX-101' }, { k: '量程', v: '0 ~ 2000 lx' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '测量精度', v: '±3%' }, { k: '工作电压', v: 'DC24V' },
      { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '外壳', v: 'ABS 阻燃' }, { k: '探头', v: '硅光电池' }],
    guide: [
      { t: '探头清洁', d: '定期清洁感光面，避免灰尘影响读数。' },
      { t: '亮度比对', d: '与手持照度计比对，偏差超 5% 需校准。' }
    ],
    docList: [
      { name: '照度计说明书', icon: '📄', size: '1.2MB', date: '2022-04', ver: 'V1.0' }
    ]
  },
  a17: {
    id: 'a17', name: '照度计2', code: 'SYS-IL-0002', icon: '☀️', type: '环控设备',
    stake: 'K3+050', pos: '顶棚 · 照明断面 2', sys: '环境监测系统', install: '2022-04-22', status: 'ok',
    docs: 2,
    structure: [
      { k: '型号规格', v: '数字式照度计 LX-101' }, { k: '量程', v: '0 ~ 2000 lx' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '测量精度', v: '±3%' }, { k: '工作电压', v: 'DC24V' },
      { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '外壳', v: 'ABS 阻燃' }, { k: '探头', v: '硅光电池' }],
    guide: [
      { t: '探头清洁', d: '定期清洁感光面，避免灰尘影响读数。' },
      { t: '亮度比对', d: '与手持照度计比对，偏差超 5% 需校准。' }
    ],
    docList: [
      { name: '照度计说明书', icon: '📄', size: '1.2MB', date: '2022-04', ver: 'V1.0' }
    ]
  },
  a18: {
    id: 'a18', name: '照度计3', code: 'SYS-IL-0003', icon: '☀️', type: '环控设备',
    stake: 'K3+350', pos: '顶棚 · 照明断面 3', sys: '环境监测系统', install: '2022-04-22', status: 'warn',
    docs: 2,
    structure: [
      { k: '型号规格', v: '数字式照度计 LX-101' }, { k: '量程', v: '0 ~ 2000 lx' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '测量精度', v: '±3%' }, { k: '工作电压', v: 'DC24V' },
      { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '外壳', v: 'ABS 阻燃' }, { k: '探头', v: '硅光电池' }],
    guide: [
      { t: '探头清洁', d: '定期清洁感光面，避免灰尘影响读数。' },
      { t: '亮度比对', d: '与手持照度计比对，偏差超 5% 需校准。' }
    ],
    docList: [
      { name: '照度计说明书', icon: '📄', size: '1.2MB', date: '2022-04', ver: 'V1.0' }
    ]
  },
  a19: {
    id: 'a19', name: '照度计4', code: 'SYS-IL-0004', icon: '☀️', type: '环控设备',
    stake: 'K3+650', pos: '顶棚 · 照明断面 4', sys: '环境监测系统', install: '2022-04-22', status: 'ok',
    docs: 2,
    structure: [
      { k: '型号规格', v: '数字式照度计 LX-101' }, { k: '量程', v: '0 ~ 2000 lx' },
      { k: '安装方式', v: '顶棚吊装' }
    ],
    params: [
      { k: '测量精度', v: '±3%' }, { k: '工作电压', v: 'DC24V' },
      { k: '防护等级', v: 'IP65' }
    ],
    materials: [{ k: '外壳', v: 'ABS 阻燃' }, { k: '探头', v: '硅光电池' }],
    guide: [
      { t: '探头清洁', d: '定期清洁感光面，避免灰尘影响读数。' },
      { t: '亮度比对', d: '与手持照度计比对，偏差超 5% 需校准。' }
    ],
    docList: [
      { name: '照度计说明书', icon: '📄', size: '1.2MB', date: '2022-04', ver: 'V1.0' }
    ]
  },
  a20: {
    id: 'a20', name: '隧道结构上层 S-U1', code: 'ASS-STR-0001', icon: '🧱', type: '隧道结构',
    stake: 'K2+300', pos: '拱顶衬砌 · 上行线', sys: '隧道环境（结构）', install: '2021-06-30', status: 'ok',
    docs: 3,
    structure: [
      { k: '结构形式', v: '双洞复合式衬砌' }, { k: '衬砌厚度', v: '500mm' },
      { k: '混凝土等级', v: 'C40 防水混凝土' }, { k: '设计使用年限', v: '100 年' }
    ],
    params: [
      { k: '结构跨度', v: '12.5m' }, { k: '净高', v: '5.2m' },
      { k: '抗震设防', v: '7 度' }
    ],
    materials: [
      { k: '衬砌', v: 'C40 防水混凝土' }, { k: '钢筋', v: 'HRB400' },
      { k: '防水层', v: 'EVA 防水板' }
    ],
    guide: [
      { t: '定期巡检', d: '每季度检查衬砌有无裂缝、渗漏水、剥落。' },
      { t: '裂缝监测', d: '对既有裂缝布设测点，跟踪宽度变化。' },
      { t: '渗漏处置', d: '发现渗漏及时注浆封堵，并记录位置与范围。' }
    ],
    docList: [
      { name: '结构设计图纸', icon: '📐', size: '18.6MB', date: '2021-06', ver: 'V2.0' },
      { name: '混凝土检测报告', icon: '📋', size: '4.2MB', date: '2021-09', ver: 'V1.0' }
    ]
  },
  a21: {
    id: 'a21', name: '隧道结构下层 S-D1', code: 'ASS-STR-0002', icon: '🧱', type: '隧道结构',
    stake: 'K3+100', pos: '仰拱 · 下行线', sys: '隧道环境（结构）', install: '2021-06-30', status: 'ok',
    docs: 3,
    structure: [
      { k: '结构形式', v: '双洞复合式衬砌' }, { k: '仰拱厚度', v: '550mm' },
      { k: '混凝土等级', v: 'C40 防水混凝土' }
    ],
    params: [
      { k: '结构跨度', v: '12.5m' }, { k: '净高', v: '5.2m' },
      { k: '路面荷载', v: '公路-Ⅰ级' }
    ],
    materials: [
      { k: '衬砌', v: 'C40 防水混凝土' }, { k: '钢筋', v: 'HRB400' }
    ],
    guide: [
      { t: '仰拱巡检', d: '检查仰拱有无隆起、开裂与积水。' },
      { t: '排水检查', d: '检查中央排水沟与横向排水管是否畅通。' }
    ],
    docList: [
      { name: '仰拱结构图纸', icon: '📐', size: '16.2MB', date: '2021-06', ver: 'V2.0' },
      { name: '排水系统图', icon: '📐', size: '5.5MB', date: '2021-08', ver: 'V1.0' }
    ]
  },
  a22: {
    id: 'a22', name: '机电管线 P-1', code: 'ASS-PIPE-0001', icon: '🔩', type: '机电管线',
    stake: 'K2+700', pos: '隧道侧墙 · 桥架敷设', sys: '隧道环境（管线）', install: '2021-09-15', status: 'warn',
    docs: 2,
    structure: [
      { k: '管线类型', v: '电力桥架 + 通信管线' }, { k: '敷设方式', v: '侧墙桥架 + 吊架' },
      { k: '总长度', v: '约 2.2km' }
    ],
    params: [
      { k: '桥架规格', v: '300×100mm' }, { k: '电压等级', v: '10kV / 380V' }
    ],
    materials: [
      { k: '桥架', v: '热镀锌钢' }, { k: '管线', v: '交联聚乙烯' }
    ],
    guide: [
      { t: '桥架巡检', d: '检查桥架有无锈蚀、变形、松动。' },
      { t: '防腐处理', d: '对锈蚀部位除锈并补刷防腐漆。' }
    ],
    docList: [
      { name: '管线综合图', icon: '📐', size: '8.4MB', date: '2021-09', ver: 'V1.0' }
    ]
  },
  a23: {
    id: 'a23', name: '应急通道 E-1', code: 'ASS-PAS-0001', icon: '🟢', type: '安全设施',
    stake: 'K3+500', pos: '两洞间横通道', sys: '隧道环境（应急通道）', install: '2021-07-10', status: 'ok',
    docs: 2,
    structure: [
      { k: '通道形式', v: '车行/人行横通道' }, { k: '净宽', v: '3.5m' },
      { k: '防火门', v: '甲级防火门' }
    ],
    params: [
      { k: '横通道间距', v: '约 500m' }, { k: '疏散宽度', v: '2.0m' }
    ],
    materials: [
      { k: '防火门', v: '钢质甲级' }, { k: '衬砌', v: 'C40 混凝土' }
    ],
    guide: [
      { t: '通道检查', d: '检查通道是否堆放杂物、防火门启闭是否正常。' },
      { t: '指示标识', d: '检查疏散指示与应急照明是否完好。' }
    ],
    docList: [
      { name: '横通道图纸', icon: '📐', size: '6.8MB', date: '2021-07', ver: 'V1.0' }
    ]
  },
  a24: {
    id: 'a24', name: '隧道运管中心', code: 'ASS-OPS-0001', icon: '🏢', type: '附属建筑',
    stake: 'K2+100', pos: '隧道南洞口 · 地面管理区', sys: '隧道环境（运管中心）', install: '2021-05-20', status: 'ok',
    docs: 4,
    structure: [
      { k: '建筑面积', v: '1200㎡' }, { k: '结构形式', v: '框架结构' },
      { k: '层数', v: '地上 3 层' }
    ],
    params: [
      { k: '监控席位', v: '12 席' }, { k: 'UPS 供电', v: '2×200kVA' }
    ],
    materials: [
      { k: '主体', v: '钢筋混凝土框架' }, { k: '幕墙', v: '玻璃幕墙' }
    ],
    guide: [
      { t: '机房巡检', d: '检查监控大屏、服务器、UPS 运行状态。' },
      { t: '消防检查', d: '检查机房气体灭火系统与烟感报警。' }
    ],
    docList: [
      { name: '运管中心平面图', icon: '📐', size: '11.2MB', date: '2021-05', ver: 'V1.0' },
      { name: '机房设备清单', icon: '📋', size: '2.8MB', date: '2021-06', ver: 'V2.0' }
    ]
  },
  a25: {
    id: 'a25', name: '雨水泵房', code: 'ASS-RP-0001', icon: '🌧️', type: '附属建筑',
    stake: 'K2+400', pos: '隧道低点 · 雨水泵房', sys: '隧道环境（雨水泵房）', install: '2021-08-10', status: 'ok',
    docs: 3,
    structure: [
      { k: '泵房形式', v: '地下式泵房' }, { k: '集水池容积', v: '120m³' },
      { k: '设计重现期', v: '50 年一遇' }
    ],
    params: [
      { k: '水泵台数', v: '3 用 1 备' }, { k: '总排水能力', v: '3600 m³/h' }
    ],
    materials: [
      { k: '泵房主体', v: 'C40 防水混凝土' }, { k: '水泵', v: '潜水排污泵' }
    ],
    guide: [
      { t: '汛前检查', d: '汛前试运行全部水泵，清理集水池淤泥。' },
      { t: '液位核查', d: '检查液位计与水泵联动启停是否正常。' }
    ],
    docList: [
      { name: '雨水泵房图纸', icon: '📐', size: '9.6MB', date: '2021-08', ver: 'V1.0' },
      { name: '水泵选型说明', icon: '📄', size: '3.1MB', date: '2021-08', ver: 'V1.0' }
    ]
  },
  a26: {
    id: 'a26', name: '消防泵房', code: 'ASS-FS-0001', icon: '🚒', type: '附属建筑',
    stake: 'K3+000', pos: '隧道中段 · 消防泵房', sys: '隧道环境（消防泵房）', install: '2021-07-25', status: 'ok',
    docs: 3,
    structure: [
      { k: '泵房形式', v: '地下式泵房' }, { k: '消防水池容积', v: '800m³' },
      { k: '防火等级', v: '一级' }
    ],
    params: [
      { k: '消防泵台数', v: '2 用 1 备' }, { k: '稳压泵', v: '2 台' },
      { k: '最不利点压力', v: '≥ 0.35MPa' }
    ],
    materials: [
      { k: '泵房主体', v: 'C40 防水混凝土' }, { k: '消防泵', v: 'XBD 立式泵' }
    ],
    guide: [
      { t: '定期试泵', d: '每月试泵一次，记录压力与流量。' },
      { t: '水池水位', d: '检查消防水池水位与补水阀状态。' }
    ],
    docList: [
      { name: '消防泵房图纸', icon: '📐', size: '10.4MB', date: '2021-07', ver: 'V1.0' },
      { name: '消防验收报告', icon: '📋', size: '3.5MB', date: '2021-10', ver: 'V1.0' }
    ]
  },
  a27: {
    id: 'a27', name: '废水泵房', code: 'ASS-WP-0001', icon: '🚰', type: '附属建筑',
    stake: 'K3+600', pos: '隧道低点 · 废水泵房', sys: '隧道环境（废水泵房）', install: '2021-08-18', status: 'warn',
    docs: 3,
    structure: [
      { k: '泵房形式', v: '地下式泵房' }, { k: '集水池容积', v: '60m³' },
      { k: '处理方式', v: '隔油沉淀 + 提升' }
    ],
    params: [
      { k: '水泵台数', v: '2 用 1 备' }, { k: '排水能力', v: '800 m³/h' }
    ],
    materials: [
      { k: '泵房主体', v: 'C40 防水混凝土' }, { k: '水泵', v: '潜水排污泵' }
    ],
    guide: [
      { t: '油污清理', d: '定期清理隔油池油污与沉淀物。' },
      { t: '水泵保养', d: '检查水泵密封与叶轮磨损情况。' }
    ],
    docList: [
      { name: '废水泵房图纸', icon: '📐', size: '8.9MB', date: '2021-08', ver: 'V1.0' },
      { name: '环保验收资料', icon: '📋', size: '4.6MB', date: '2021-11', ver: 'V1.0' }
    ]
  },
  a28: {
    id: 'a28', name: '变电所', code: 'ASS-SUB-0001', icon: '⚡', type: '附属建筑',
    stake: 'K4+000', pos: '隧道北洞口 · 地面变电所', sys: '隧道环境（变电所）', install: '2021-06-10', status: 'ok',
    docs: 4,
    structure: [
      { k: '变电所形式', v: '地面独立式' }, { k: '主变容量', v: '2×8000kVA' },
      { k: '供电等级', v: '一级负荷' }
    ],
    params: [
      { k: '进线电压', v: '110kV' }, { k: '出线电压', v: '10kV' },
      { k: '备自投', v: '双电源自动切换' }
    ],
    materials: [
      { k: '主变', v: '油浸式变压器' }, { k: '开关柜', v: 'SF6 充气柜' }
    ],
    guide: [
      { t: '设备巡检', d: '检查主变油位、温度、开关柜运行状态。' },
      { t: '停电检修', d: '按检修计划进行预防性试验与清扫。' }
    ],
    docList: [
      { name: '变电所电气图', icon: '📐', size: '14.8MB', date: '2021-06', ver: 'V1.0' },
      { name: '设备交接试验报告', icon: '📋', size: '5.9MB', date: '2021-09', ver: 'V1.0' }
    ]
  }
}

/* 图层子项分类（三级树：图层分组 → 图层子项），与 TunnelScene layerGroups 一致 */
interface SubItem { key: string; name: string; color: string }
interface SubGroup { key: string; name: string; color: string; subs: SubItem[] }
const subGroups: SubGroup[] = [
  { key: 'structure', name: '隧道环境', color: '#8fa8d0', subs: [
    { key: 'structureUp', name: '隧道结构上层', color: '#8fa8d0' },
    { key: 'structureDown', name: '隧道结构下层', color: '#7d9bc9' },
    { key: 'pipe', name: '机电管线', color: '#b08cff' },
    { key: 'passage', name: '应急通道', color: '#2ee6a0' },
    { key: 'opsCenter', name: '隧道运管中心', color: '#4ee6ff' },
    { key: 'rainPump', name: '雨水泵房', color: '#5aa7ff' },
    { key: 'fireStation', name: '消防泵房', color: '#ff5f6b' },
    { key: 'wastePump', name: '废水泵房', color: '#00c9a7' },
    { key: 'substation', name: '变电所', color: '#ffd04d' }
  ]},
  { key: 'env', name: '环控系统', color: '#00c9a7', subs: [
    { key: 'covi', name: 'CO/VI检测器', color: '#00c9a7' },
    { key: 'wind', name: '风速风向仪', color: '#4ee6ff' },
    { key: 'illum', name: '照度计', color: '#ffd04d' },
    { key: 'flame', name: '火焰探测器', color: '#ff5f6b' },
    { key: 'heatSensor', name: '感温探测器', color: '#ff8a5a' },
    { key: 'smokeSensor', name: '感烟探测器', color: '#b08cff' },
    { key: 'waterLevel', name: '积水监测', color: '#4ee6ff' }
  ]},
  { key: 'traffic', name: '交通管控', color: '#4ea6ff', subs: [
    { key: 'laneInd', name: '车道指示器', color: '#2ee6a0' },
    { key: 'infoBoard', name: '可变情报板', color: '#4ee6ff' },
    { key: 'vehicleDet', name: '车辆检测器', color: '#ffd04d' },
    { key: 'camera', name: '固定摄像机', color: '#4ea6ff' },
    { key: 'dome', name: '球形摄像机', color: '#00c9a7' },
    { key: 'phone', name: '紧急电话', color: '#ff8a5a' },
    { key: 'speaker', name: '广播扬声器', color: '#b08cff' }
  ]},
  { key: 'monitor', name: '结构监测', color: '#ff5f6b', subs: [
    { key: 'corrosion', name: '结构腐蚀监测', color: '#ff5f6b' },
    { key: 'bolt', name: '螺栓受力监测', color: '#ff8a5a' },
    { key: 'pressure', name: '压力监测', color: '#4ee6ff' },
    { key: 'stress', name: '应力应变监测', color: '#b08cff' },
    { key: 'waterpress', name: '水压监测', color: '#00c9a7' }
  ]},
  { key: 'mep', name: '隧道机电', color: '#5aa7ff', subs: [
    { key: 'fan', name: '风机', color: '#5aa7ff' },
    { key: 'damper', name: '风阀', color: '#4ee6ff' },
    { key: 'vent', name: '风口', color: '#00c9a7' },
    { key: 'firePump', name: '消防水泵', color: '#ff5f6b' },
    { key: 'fireValve', name: '消防闸阀', color: '#ff8a5a' },
    { key: 'lamp', name: '照明灯', color: '#ffd04d' },
    { key: 'pump', name: '排水泵', color: '#4ea6ff' }
  ]}
]

/* 每个资产所属图层子项（通过点位 kind 映射到子项 key） */
const subOfAsset = (id: string): string => points.find(p => p.id === id)?.kind || ''

const curAsset = ref<Asset | null>(null)
const tab = ref('model')
const searchKw = ref('')
const collapsed = reactive<Record<string, boolean>>({})

const assetList = Object.values(assets)

/* 三级分组（图层分组 → 图层子项 → 设备）+ 搜索过滤 */
const groupedAssets = computed(() => {
  const kw = searchKw.value.trim()
  const filtered = assetList.filter(a => {
    if (!kw) return true
    return a.name.includes(kw) || a.code.includes(kw) || a.stake.includes(kw) || a.type.includes(kw) || a.sys.includes(kw)
  })
  return subGroups
    .map(g => {
      const subs = g.subs
        .map(s => {
          const items = filtered.filter(a => subOfAsset(a.id) === s.key)
          return { ...s, items }
        })
        .filter(s => s.items.length > 0)
      const total = subs.reduce((n, s) => n + s.items.length, 0)
      return { ...g, subs, total }
    })
    .filter(g => g.subs.length > 0)
})

function toggleGroup(key: string) {
  collapsed[key] = !collapsed[key]
}

function selectAsset(a: Asset) {
  curAsset.value = a
  tab.value = 'model'
}
/* 左键点击三维模型：弹出关联资料（与列表选择一致） */
function onAssetSelect(p: ScenePoint) {
  const a = assets[p.id]
  if (a) {
    curAsset.value = a
    tab.value = 'model'
  }
}
/* 右键三维模型：同样弹出关联资料 */
function onAssetContext(p: ScenePoint) {
  const a = assets[p.id]
  if (a) {
    curAsset.value = a
    tab.value = 'model'
  }
}

/* 更新设备 */
const updateVisible = ref(false)
const updateForm = reactive({ code: '', name: '', sys: '', pos: '', install: '', status: 'ok', remark: '' })
function openUpdate() {
  if (!curAsset.value) return
  Object.assign(updateForm, {
    code: curAsset.value.code, name: curAsset.value.name, sys: curAsset.value.sys,
    pos: curAsset.value.pos, install: curAsset.value.install, status: curAsset.value.status, remark: ''
  })
  updateVisible.value = true
}
function saveUpdate() {
  if (curAsset.value) {
    Object.assign(curAsset.value, {
      code: updateForm.code, name: updateForm.name, sys: updateForm.sys,
      pos: updateForm.pos, install: updateForm.install, status: updateForm.status
    })
  }
  updateVisible.value = false
  ElMessage.success('设备信息已更新')
}

/* 维护工单 */
const maintainVisible = ref(false)
const maintainForm = reactive({ type: '日常巡检', level: '一般', date: '', owner: '', content: '' })
function openMaintain() {
  Object.assign(maintainForm, { type: '日常巡检', level: '一般', date: '', owner: '', content: '' })
  maintainVisible.value = true
}
function submitMaintain() {
  maintainVisible.value = false
  ElMessage.success('维护工单已提交，待派单')
}

/* 维保记录 */
function openRecord() {
  if (!curAsset.value) return
  ElMessage.info(`「${curAsset.value.name}」维保记录：近 12 个月共 ${curAsset.value.docs} 次（详见技术资料）`)
}
</script>

<style scoped lang="scss">
.asset-root {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.asset-scene {
  position: absolute;
  inset: 0;
  z-index: 0;
  :deep(.tunnel-scene) { border-radius: 0; }
}
.ctx-hint {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  color: #d5e8ff;
  font-size: 12px;
  letter-spacing: 0.3px;
  background: rgba(6, 18, 42, 0.78);
  padding: 8px 18px;
  border-radius: 20px;
  border: 1px solid rgba(78, 160, 255, 0.42);
  box-shadow: 0 6px 24px rgba(4, 16, 48, 0.45);
  backdrop-filter: blur(10px);
  z-index: 50;
  pointer-events: none;
}

/* 左侧资产列表 */
.asset-side {
  position: absolute;
  left: 14px;
  top: 14px;
  bottom: 14px;
  width: var(--map-rail-width);
  z-index: 60;
  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(4, 20, 60, 0.5);
  }
}
.panel-title {
  font-size: 15px; font-weight: 700; color: #e8f6ff;
  margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;
  .pt-count { font-size: 11px; font-weight: 400; color: #7188a8; }
}
.asset-groups {
  flex: 1; overflow: auto; margin-top: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.ag-group {
  border: 1px solid rgba(70, 140, 230, 0.22);
  border-radius: 6px; overflow: hidden;
  background: rgba(12, 34, 74, 0.4);
}
.ag-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; cursor: pointer;
  background: rgba(20, 48, 98, 0.45);
  &:hover { background: rgba(30, 65, 130, 0.5); }
  .ag-arrow { color: #7188a8; font-size: 12px; transition: transform 0.2s; &.open { transform: rotate(90deg); } }
  .ag-dot { width: 8px; height: 8px; border-radius: 50%; }
  .ag-name { flex: 1; font-size: 13px; font-weight: 600; color: #d5e6ff; }
  .ag-count { font-size: 11px; color: #4ea6ff; background: rgba(78, 160, 255, 0.15); padding: 1px 7px; border-radius: 10px; }
}
.ag-list { display: flex; flex-direction: column; }
.ag-subs { display: flex; flex-direction: column; }
.ag-sub {
  border-top: 1px solid rgba(70, 140, 230, 0.1);
}
.ag-sub-head {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px 7px 22px; cursor: pointer;
  background: rgba(15, 38, 80, 0.35);
  &:hover { background: rgba(30, 65, 130, 0.45); }
  .ag-arrow { color: #7188a8; font-size: 11px; transition: transform 0.2s; &.open { transform: rotate(90deg); } }
  .ag-sub-dot { width: 7px; height: 7px; border-radius: 50%; }
  .ag-sub-name { flex: 1; font-size: 12px; color: #b8cbe8; }
  .ag-count { font-size: 10px; color: #7188a8; }
}
.ag-item {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px 7px 38px;
  cursor: pointer; border-top: 1px solid rgba(70, 140, 230, 0.08);
  transition: all 0.2s;
  &:hover { background: rgba(40, 90, 180, 0.3); }
  &.active { background: rgba(40, 100, 200, 0.4); box-shadow: inset 2px 0 0 #4ee6ff; }
  .li-icon { font-size: 16px; }
  .li-body { flex: 1; min-width: 0; }
  .li-name { font-size: 12px; color: #e8f6ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .li-meta { font-size: 10px; color: #7188a8; }
  .li-tag {
    font-size: 10px; flex: none; padding: 1px 6px; border-radius: 4px;
    &.ok { color: #35e08c; background: rgba(0, 210, 106, 0.15); }
    &.warn { color: #ffb400; background: rgba(255, 180, 0, 0.15); }
    &.alarm { color: #ff7a7c; background: rgba(255, 77, 79, 0.18); }
    &.offline { color: #7f95b8; background: rgba(127, 149, 184, 0.15); }
  }
}
.ag-empty { padding: 10px; font-size: 11px; color: #7188a8; text-align: center; }

/* 右侧资产资料面板 */
.asset-panel {
  position: absolute;
  right: 14px;
  top: 14px;
  bottom: 14px;
  width: min(440px, calc(100vw - var(--map-rail-width) - 48px));
  background: linear-gradient(165deg, rgba(14, 42, 88, 0.96) 0%, rgba(6, 18, 42, 0.98) 100%);
  border: 1px solid rgba(78, 160, 255, 0.42);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(4, 20, 60, 0.55), 0 0 1px rgba(78, 230, 255, 0.3);
  backdrop-filter: blur(14px);
  z-index: 45;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    pointer-events: none;
  }
  &::before {
    top: -1px;
    left: -1px;
    border-top: 2px solid #4ee6ff;
    border-left: 2px solid #4ee6ff;
    border-radius: 14px 0 0 0;
  }
  &::after {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid #4ee6ff;
    border-right: 2px solid #4ee6ff;
    border-radius: 0 0 14px 0;
  }
}
.ap-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(78, 160, 255, 0.28);
  background: linear-gradient(180deg, rgba(28, 72, 150, 0.45), rgba(12, 34, 74, 0.25));
  .ap-icon { font-size: 26px; }
  .ap-title { flex: 1; min-width: 0; }
  .ap-name { font-size: 16px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ap-code { font-size: 11px; color: #7188a8; margin-top: 2px; }
}
.ap-tabs { flex: 1; min-height: 0; }
:deep(.ap-tabs .el-tabs__content) { height: calc(100% - 40px); overflow: auto; }
:deep(.ap-tabs .el-tabs__item) { color: #9fc3f0; }
:deep(.ap-tabs .el-tabs__item.is-active) { color: #4ee6ff; }
:deep(.ap-tabs .el-tabs__nav-wrap::after) { background: rgba(78, 160, 255, 0.25); }

/* 底部操作栏 */
.ap-actions {
  flex: none;
  display: flex; gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(78, 160, 255, 0.3);
  background: rgba(20, 55, 115, 0.4);
}

.ap-model {
  .am-canvas {
    height: 160px; border-radius: 6px;
    background: radial-gradient(ellipse at center, rgba(30, 80, 180, 0.4), rgba(8, 20, 48, 0.6));
    border: 1px solid rgba(78, 160, 255, 0.3);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    .am-icon { font-size: 48px; filter: drop-shadow(0 0 12px rgba(78, 180, 255, 0.6)); }
    .am-tag { font-size: 11px; color: #7188a8; }
  }
  .am-meta { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .am-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; padding: 6px 10px;
    background: rgba(20, 48, 98, 0.45); border-radius: 4px;
    span { color: #7188a8; } b { color: #e8f6ff; font-weight: 600; }
  }
}

.ap-spec { display: flex; flex-direction: column; gap: 12px; }
.spec-block {
  border: 1px solid rgba(70, 140, 230, 0.22); border-radius: 6px;
  .spec-title {
    font-size: 12px; font-weight: 700; color: #4ee6ff;
    padding: 6px 10px; background: rgba(30, 70, 140, 0.4);
    border-radius: 6px 6px 0 0;
  }
  .spec-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; padding: 6px 10px;
    border-top: 1px solid rgba(70, 140, 230, 0.12);
    span { color: #7188a8; } b { color: #e8f6ff; font-weight: 500; }
  }
}

.ap-guide { display: flex; flex-direction: column; gap: 10px; }
.guide-step { display: flex; gap: 10px; }
.gs-num {
  flex: none; width: 22px; height: 22px; border-radius: 50%;
  background: #165dff; color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin-top: 2px;
}
.gs-title { font-size: 13px; font-weight: 600; color: #e8f6ff; }
.gs-desc { font-size: 12px; color: #aebcd8; margin-top: 2px; line-height: 1.5; }

.ap-docs { display: flex; flex-direction: column; gap: 6px; }
.doc-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: rgba(20, 48, 98, 0.45); border-radius: 6px;
  .doc-icon { font-size: 18px; }
  .doc-body { flex: 1; min-width: 0; }
  .doc-name { font-size: 13px; color: #e8f6ff; }
  .doc-meta { font-size: 10px; color: #7188a8; }
}

.slide-enter-active, .slide-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(30px); opacity: 0; }
</style>
