/**
 * 场景与设备类种子数据：与前端 src/config/scenePoints.ts、
 * src/config/alerts.ts、src/config/cctvGallery.ts、各 views 中的演示内容保持一致，
 * 保证后端接口返回的数据能直接替换页面里的硬编码演示值。
 */

export const SECTIONS = [
  { code: 'SEC-01', name: 'K2+100~K2+800', start: 'K2+100', end: 'K2+800', length: 700, sort: 1 },
  { code: 'SEC-02', name: 'K2+800~K3+100', start: 'K2+800', end: 'K3+100', length: 300, sort: 2 },
  { code: 'SEC-03', name: 'K3+100~K3+600', start: 'K3+100', end: 'K3+600', length: 500, sort: 3 },
  { code: 'SEC-04', name: 'K3+600~K4+300', start: 'K3+600', end: 'K4+300', length: 700, sort: 4 },
]

export const SEGMENTS = [
  { code: 'SEG-01', name: 'K2+100~K2+600', start: 'K2+100', end: 'K2+600', flow: 1420, congestion: 'smooth' },
  { code: 'SEG-02', name: 'K2+600~K3+100', start: 'K2+600', end: 'K3+100', flow: 1380, congestion: 'smooth' },
  { code: 'SEG-03', name: 'K3+100~K3+600', start: 'K3+100', end: 'K3+600', flow: 1860, congestion: 'slow' },
  { code: 'SEG-04', name: 'K3+600~K4+100', start: 'K3+600', end: 'K4+100', flow: 2100, congestion: 'congested' },
  { code: 'SEG-05', name: 'K4+100~K4+300', start: 'K4+100', end: 'K4+300', flow: 1150, congestion: 'smooth' },
]

export const MODULES = [
  { code: 'overview', name: '总览', path: '/overview', icon: '🏠', sort: 1 },
  { code: 'traffic', name: '智能交通', path: '/traffic', icon: '🚦', sort: 2 },
  { code: 'maintenance', name: '智慧养护', path: '/maintenance', icon: '🛠️', sort: 3 },
  { code: 'monitoring', name: '智慧监测', path: '/monitoring', icon: '📡', sort: 4 },
  { code: 'emergency', name: '数字应急', path: '/emergency', icon: '🚨', sort: 5 },
  { code: 'service', name: '数字服务', path: '/service', icon: '📱', sort: 6 },
  { code: 'asset', name: '资产资料中心', path: '/asset', icon: '📚', sort: 7 },
]

export const CATEGORIES = [
  { code: 'fan', name: '通风设备', icon: '🌀', group: 'mep', sort: 1 },
  { code: 'pump', name: '排涝设备', icon: '⚙️', group: 'mep', sort: 2 },
  { code: 'firePump', name: '消防设备', icon: '🚒', group: 'mep', sort: 3 },
  { code: 'lamp', name: '照明系统', icon: '💡', group: 'mep', sort: 4 },
  { code: 'camera', name: '视频监控', icon: '📹', group: 'traffic', sort: 5 },
  { code: 'infoBoard', name: '诱导屏 / 情报板', icon: '🚹', group: 'traffic', sort: 6 },
  { code: 'vehicleDet', name: '车辆检测', icon: '🚗', group: 'traffic', sort: 7 },
  { code: 'covi', name: '环境感知', icon: '📡', group: 'env', sort: 8 },
  { code: 'waterLevel', name: '积水监测', icon: '💧', group: 'env', sort: 9 },
  { code: 'stress', name: '结构监测', icon: '📐', group: 'monitor', sort: 10 },
  { code: 'substation', name: '供电设施', icon: '🔌', group: 'structure', sort: 11 },
]

/**
 * 点位目录：BASE_SCENE_POINTS 的 38 个点位 + 各业务页面的专用点位。
 * 字段顺序：id, name, kind, group, status, left, top, scale, stake, value, alarm, inspect, module
 */
const RAW_POINTS = [
  // ---- 总览 / 资产 / 应急共用的隧道环境（structure）----
  ['st1', '结构上层 K2+100~K4+300', 'structureUp', 'structure', 'ok', 40, 30, 0.9, 'K2+100~K4+300', '正常', null, '2026-10-10', 'overview'],
  ['st2', '结构下层 K3+600', 'structureDown', 'structure', 'ok', 70, 44, 0.8, 'K3+600', '正常', null, '2026-10-08', 'overview'],
  ['pipe1', '机电管线廊', 'pipe', 'structure', 'ok', 55, 70, 0.75, 'K3+200', '正常', null, '2026-10-05', 'overview'],
  ['pass1', '应急通道口', 'passage', 'structure', 'ok', 30, 66, 0.8, 'K2+600', '畅通', null, '2026-10-06', 'overview'],
  ['oc1', '隧道运管中心', 'opsCenter', 'structure', 'ok', 14, 14, 1.05, '南湖段管理中心', '运行', null, '2026-10-15', 'overview'],
  ['rp1', '雨水泵房', 'rainPump', 'structure', 'ok', 38, 84, 0.95, 'K3+000 东侧', '待机', null, '2026-10-14', 'overview'],
  ['fs1', '消防泵房', 'fireStation', 'structure', 'ok', 48, 82, 0.95, 'K3+000', '待机', null, '2026-10-14', 'overview'],
  ['wp1', '废水泵房', 'wastePump', 'structure', 'ok', 58, 84, 0.95, 'K3+000 西侧', '运行', null, '2026-10-14', 'overview'],
  ['ss1', '变电所', 'substation', 'structure', 'ok', 20, 26, 0.95, 'K2+400', '供电正常', null, '2026-10-13', 'overview'],
  // ---- 交通管控 ----
  ['c1', '固定摄像机 K2+300', 'camera', 'traffic', 'ok', 18, 30, 1.1, 'K2+300', '1080P', null, '2026-10-14', 'overview'],
  ['c2', '固定摄像机 K3+050', 'camera', 'traffic', 'alarm', 46, 26, 0.95, 'K3+050', 'AI事件', '违停事件未确认', '2026-10-15', 'overview'],
  ['dome1', '球形摄像机 K3+800', 'dome', 'traffic', 'ok', 74, 32, 0.8, 'K3+800', '在线', null, '2026-10-13', 'overview'],
  ['sc1', '可变情报板 K2+600', 'infoBoard', 'traffic', 'ok', 24, 62, 1.05, 'K2+600', '限速60', null, '2026-10-11', 'overview'],
  ['sc2', '可变情报板 K3+400', 'infoBoard', 'traffic', 'offline', 60, 64, 0.85, 'K3+400', '离线 32min', null, '2026-10-08', 'overview'],
  ['lane1', '车道指示器 K3+100', 'laneInd', 'traffic', 'ok', 42, 58, 0.85, 'K3+100', '绿灯', null, '2026-10-10', 'overview'],
  ['vd1', '车辆检测器 K2+800', 'vehicleDet', 'traffic', 'ok', 34, 74, 0.8, 'K2+800', '正常', null, '2026-10-07', 'overview'],
  ['ph1', '紧急电话 K3+300', 'phone', 'traffic', 'ok', 52, 68, 0.8, 'K3+300', '正常', null, '2026-10-09', 'overview'],
  ['spk1', '广播扬声器 K2+500', 'speaker', 'traffic', 'ok', 28, 52, 0.8, 'K2+500', '正常', null, '2026-10-07', 'overview'],
  // ---- 环控系统 ----
  ['s1', 'CO/VI检测器', 'covi', 'env', 'ok', 24, 46, 1, 'K2+500', 'CO 12ppm', null, '2026-10-10', 'overview'],
  ['wind1', '风速风向仪 K3+000', 'wind', 'env', 'ok', 44, 20, 0.9, 'K3+000', '2.4m/s', null, '2026-10-11', 'overview'],
  ['s2', '照度计', 'illum', 'env', 'warn', 58, 50, 0.9, 'K3+200', '86 lux', '照度偏低预警', '2026-10-09', 'overview'],
  ['fl1', '火焰探测器 K3+500', 'flame', 'env', 'ok', 64, 22, 0.85, 'K3+500', '正常', null, '2026-10-12', 'overview'],
  ['tmp1', '感温探测器', 'heatSensor', 'env', 'ok', 62, 18, 0.8, 'K3+400', '24.6℃', null, '2026-10-12', 'overview'],
  ['smk1', '感烟探测器 K2+900', 'smokeSensor', 'env', 'ok', 36, 22, 0.8, 'K2+900', '正常', null, '2026-10-12', 'overview'],
  ['w1', '积水监测 W1', 'waterLevel', 'env', 'ok', 66, 80, 0.8, 'K3+700', '2.1cm', null, '2026-10-15', 'overview'],
  // ---- 结构监测 ----
  ['set1', '应力应变监测点', 'stress', 'monitor', 'ok', 50, 44, 0.8, 'K3+200', '0.6mm', null, '2026-10-12', 'overview'],
  ['def1', '应力应变监测点', 'stress', 'monitor', 'ok', 80, 46, 0.75, 'K3+900', '0.3mm', null, '2026-10-12', 'overview'],
  ['cor1', '结构腐蚀监测 K3+100', 'corrosion', 'monitor', 'ok', 40, 40, 0.8, 'K3+100', '正常', null, '2026-10-11', 'overview'],
  ['blt1', '螺栓受力监测 K3+600', 'bolt', 'monitor', 'ok', 68, 40, 0.8, 'K3+600', '正常', null, '2026-10-11', 'overview'],
  ['prs1', '压力监测 K2+700', 'pressure', 'monitor', 'ok', 30, 40, 0.8, 'K2+700', '0.25MPa', null, '2026-10-11', 'overview'],
  // ---- 隧道机电 ----
  ['f1', '风机 1#', 'fan', 'mep', 'ok', 36, 18, 0.95, 'K2+900', '运行', null, '2026-10-06', 'overview'],
  ['f2', '风机 2#', 'fan', 'mep', 'ok', 68, 16, 0.8, 'K3+600', '待机', null, '2026-10-06', 'overview'],
  ['dm1', '风阀 K2+800', 'damper', 'mep', 'ok', 32, 24, 0.8, 'K2+800', '开启', null, '2026-10-06', 'overview'],
  ['vt1', '风口 K3+200', 'vent', 'mep', 'ok', 50, 26, 0.8, 'K3+200', '正常', null, '2026-10-06', 'overview'],
  ['fp1', '消防水泵 K3+000', 'firePump', 'mep', 'ok', 44, 78, 0.85, '泵房K3+000', '待机', null, '2026-10-01', 'overview'],
  ['fv1', '消防闸阀 K3+000', 'fireValve', 'mep', 'ok', 50, 80, 0.8, '泵房K3+000', '开启', null, '2026-10-01', 'overview'],
  ['p1', '排水泵 P1', 'pump', 'mep', 'ok', 40, 82, 0.9, '泵房K3+000', '0.4MPa', null, '2026-10-01', 'overview'],
  ['lamp1', '照明灯组 K2+400', 'lamp', 'mep', 'ok', 26, 34, 0.85, 'K2+400', '96回路', null, '2026-10-05', 'overview'],
  // ---- 智能交通页面点位 ----
  ['t-c1', '流量摄像机 K2+150', 'camera', 'traffic', 'ok', 14, 32, 1.1, 'K2+150', '在线', null, null, 'traffic'],
  ['t-c2', '违法摄像机 K2+600', 'camera', 'traffic', 'ok', 32, 28, 1, 'K2+600', '在线', null, null, 'traffic'],
  ['t-c3', '违法摄像机 K3+050', 'camera', 'traffic', 'alarm', 50, 24, 0.95, 'K3+050', '违停事件', 'AI识别：机动车违停', null, 'traffic'],
  ['t-c4', '流量摄像机 K3+500', 'camera', 'traffic', 'ok', 68, 28, 0.85, 'K3+500', '在线', null, null, 'traffic'],
  ['t-c5', '流量摄像机 K4+100', 'camera', 'traffic', 'offline', 84, 34, 0.75, 'K4+100', '离线', null, null, 'traffic'],
  ['t-sc1', '诱导屏 K2+400', 'infoBoard', 'traffic', 'ok', 24, 62, 1, 'K2+400', '前方畅通', null, null, 'traffic'],
  ['t-sc2', '诱导屏 K3+700', 'infoBoard', 'traffic', 'ok', 72, 64, 0.8, 'K3+700', '限速 40', null, null, 'traffic'],
  ['t-ib1', '情报板 K3+000', 'infoBoard', 'traffic', 'ok', 48, 60, 0.85, 'K3+000', '气象提示', null, null, 'traffic'],
  ['t-ib2', '情报板 K4+000', 'infoBoard', 'traffic', 'ok', 80, 62, 0.75, 'K4+000', '限速 40', null, null, 'traffic'],
  // ---- 智慧养护：病害点位 ----
  ['d1', '裂缝 K3+200', 'disease', 'monitor', 'alarm', 30, 42, 1.1, 'K3+200', '严重', '贯穿裂缝，待派发', '2026-10-16', 'maintenance'],
  ['d2', '渗漏水 K3+350', 'disease', 'monitor', 'alarm', 48, 38, 1.05, 'K3+350', '严重', '顶板渗漏，处理中', '2026-10-16', 'maintenance'],
  ['d3', '剥落 K2+700', 'disease', 'monitor', 'warn', 22, 56, 0.95, 'K2+700', '轻微', null, '2026-10-15', 'maintenance'],
  ['d4', '裂缝 K3+500', 'disease', 'monitor', 'ok', 64, 44, 0.9, 'K3+500', '已修复', null, '2026-10-15', 'maintenance'],
  ['d5', '渗漏水 K2+450', 'disease', 'monitor', 'ok', 14, 48, 0.85, 'K2+450', '已修复', null, '2026-10-14', 'maintenance'],
  ['d6', '变形缝 K3+800', 'disease', 'monitor', 'warn', 78, 50, 0.85, 'K3+800', '中等', null, '2026-10-14', 'maintenance'],
  // ---- 智慧监测：环境 + 结构 ----
  ['ill1', '环境亮度 L1', 'illum', 'env', 'ok', 34, 50, 0.9, 'K2+800', '128 lux', null, null, 'monitoring'],
  ['co1', '气体监测 G1', 'covi', 'env', 'ok', 58, 50, 0.9, 'K3+300', 'CO 15ppm', null, null, 'monitoring'],
  ['co2', '气体监测 G2', 'covi', 'env', 'warn', 72, 52, 0.8, 'K3+800', 'NO₂ 0.12', 'NO₂ 偏高', null, 'monitoring'],
  ['mw1', '风速风向 W1', 'wind', 'env', 'ok', 46, 38, 0.85, 'K3+100', '2.8m/s', null, null, 'monitoring'],
  ['mset1', '沉降监测 S1', 'stress', 'monitor', 'ok', 24, 40, 0.95, 'K2+400', '0.4mm', null, null, 'monitoring'],
  ['mset2', '沉降监测 S2', 'stress', 'monitor', 'warn', 52, 38, 0.9, 'K3+200', '1.1mm', '沉降速率偏高', null, 'monitoring'],
  ['mdef1', '变形监测 D1', 'stress', 'monitor', 'ok', 70, 40, 0.85, 'K3+800', '0.3mm', null, null, 'monitoring'],
  ['mbolt1', '螺栓受力 B1', 'bolt', 'monitor', 'ok', 38, 30, 0.8, 'K3+000', '18.2kN', null, null, 'monitoring'],
  ['mcor1', '腐蚀监测 C1', 'corrosion', 'monitor', 'ok', 62, 30, 0.8, 'K3+500', '0.02mm/y', null, null, 'monitoring'],
  // ---- 数字应急：积水 / 泵 / 风机 / 物资 ----
  ['e-w1', '积水点 W1', 'waterLevel', 'env', 'ok', 16, 70, 1.05, 'K2+250', '1.8cm', null, null, 'emergency'],
  ['e-w2', '积水点 W2', 'waterLevel', 'env', 'alarm', 46, 66, 1, 'K3+050', '26.8cm', '红色积水预警', null, 'emergency'],
  ['e-w3', '积水点 W3', 'waterLevel', 'env', 'ok', 78, 72, 0.8, 'K4+000', '2.2cm', null, null, 'emergency'],
  ['e-p1', '排涝泵 P1', 'pump', 'mep', 'warn', 38, 82, 1, '泵房K3+000', '运行 0.6MPa', '联动运行中', null, 'emergency'],
  ['e-p2', '排涝泵 P2', 'pump', 'mep', 'warn', 58, 84, 0.9, '泵房K3+000', '运行 0.6MPa', '联动运行中', null, 'emergency'],
  ['e-p3', '排涝泵 P3', 'pump', 'mep', 'ok', 80, 86, 0.75, '泵房K4+100', '待机', null, null, 'emergency'],
  ['e-fan1', '排烟风机 PY-1', 'fan', 'mep', 'ok', 30, 34, 0.9, 'K3+000', '待机', null, null, 'emergency'],
  ['e-fire1', '消防水泵 FP-1', 'firePump', 'mep', 'ok', 24, 58, 0.85, '消防泵房', '0.6MPa', null, null, 'emergency'],
  ['e-m1', '应急物资点 A', 'structureUp', 'structure', 'ok', 22, 28, 0.95, 'K2+400 物资间', '充足', null, null, 'emergency'],
  ['e-m2', '应急物资点 B', 'structureUp', 'structure', 'ok', 68, 28, 0.8, 'K3+800 物资间', '充足', null, null, 'emergency'],
  // ---- 数字服务：投诉点位 ----
  ['cp1', '积水投诉 K4+200', 'complaint', 'monitor', 'alarm', 82, 70, 1.05, 'K4+200', '待审核', '路面积水投诉', '2026-10-18', 'service'],
  ['cp2', '渗水投诉 K3+300', 'complaint', 'monitor', 'alarm', 54, 38, 1, 'K3+300', '已转工单', '顶部渗水投诉', '2026-10-18', 'service'],
  ['cp3', '照明投诉 K2+500', 'complaint', 'monitor', 'warn', 30, 50, 0.95, 'K2+500', '已转工单', null, '2026-10-18', 'service'],
  ['cp4', '诱导屏投诉 K2+100', 'complaint', 'monitor', 'ok', 16, 44, 0.9, 'K2+100', '已处理', null, '2026-10-18', 'service'],
  ['cp5', '设施建议 K2+800', 'complaint', 'monitor', 'ok', 42, 56, 0.85, 'K2+800', '已采纳', null, '2026-10-17', 'service'],
  // ---- 资产资料中心：设备点位 ----
  ['a1', '轴流风机 JF-1', 'fan', 'mep', 'ok', 20, 22, 1.1, 'K2+900', '运行', null, null, 'asset'],
  ['a2', '轴流风机 JF-2', 'fan', 'mep', 'warn', 38, 20, 1, 'K3+600', '待机', null, null, 'asset'],
  ['a3', '排涝泵 P1', 'pump', 'mep', 'ok', 56, 78, 1.05, '泵房K3+000', '0.4MPa', null, null, 'asset'],
  ['a4', '诱导屏 K2+600', 'infoBoard', 'traffic', 'ok', 30, 62, 0.95, 'K2+600', '限速60', null, null, 'asset'],
  ['a5', '情报板 K3+100', 'infoBoard', 'traffic', 'ok', 48, 58, 0.9, 'K3+100', '前方畅通', null, null, 'asset'],
  ['a6', '流量摄像机 K3+500', 'camera', 'traffic', 'ok', 68, 32, 0.9, 'K3+500', '在线', null, null, 'asset'],
  ['a7', '照明灯具组 L-3', 'lamp', 'mep', 'ok', 76, 18, 0.85, 'K3+800', '96回路', null, null, 'asset'],
  ['a8', 'CO监测器 C-2', 'covi', 'env', 'ok', 44, 48, 0.9, 'K3+200', 'CO 12ppm', null, null, 'asset'],
  ['a9', '沉降监测点 S-4', 'stress', 'monitor', 'ok', 62, 42, 0.8, 'K3+400', '0.5mm', null, null, 'asset'],
  ['a10', '积水监测 W-2', 'waterLevel', 'env', 'ok', 34, 80, 0.85, 'K2+800', '1.2cm', null, null, 'asset'],
  ['a11', '可变情报板 K4+050', 'infoBoard', 'traffic', 'offline', 82, 24, 0.9, 'K4+050', '离线', null, null, 'asset'],
  ['a12', '消防水泵 FP-2', 'firePump', 'mep', 'ok', 26, 74, 1, '消防泵房', '0.6MPa', null, null, 'asset'],
  ['a13', '风速风向仪 W-1', 'wind', 'env', 'ok', 58, 14, 0.85, 'K3+700', '2.8m/s', null, null, 'asset'],
  ['a14', '应力应变监测 S-2', 'stress', 'monitor', 'alarm', 70, 48, 0.8, 'K3+900', '182με', null, null, 'asset'],
  ['a15', '球形摄像机 D-1', 'dome', 'traffic', 'ok', 40, 36, 0.9, 'K3+150', '在线', null, null, 'asset'],
  ['a16', '照度计1', 'illum', 'env', 'ok', 22, 46, 0.85, 'K2+850', '360lx', null, null, 'asset'],
  ['a17', '照度计2', 'illum', 'env', 'ok', 36, 42, 0.85, 'K3+050', '342lx', null, null, 'asset'],
  ['a18', '照度计3', 'illum', 'env', 'warn', 52, 40, 0.85, 'K3+350', '215lx', null, null, 'asset'],
  ['a19', '照度计4', 'illum', 'env', 'ok', 66, 44, 0.85, 'K3+650', '328lx', null, null, 'asset'],
  ['a20', '隧道结构上层 S-U1', 'structureUp', 'structure', 'ok', 24, 26, 0.9, 'K2+300', '完好', null, null, 'asset'],
  ['a21', '隧道结构下层 S-D1', 'structureDown', 'structure', 'ok', 44, 28, 0.9, 'K3+100', '完好', null, null, 'asset'],
  ['a22', '机电管线 P-1', 'pipe', 'structure', 'warn', 34, 30, 0.85, 'K2+700', '1处锈蚀', null, null, 'asset'],
  ['a23', '应急通道 E-1', 'passage', 'structure', 'ok', 54, 34, 0.9, 'K3+500', '畅通', null, null, 'asset'],
  ['a24', '隧道运管中心', 'opsCenter', 'structure', 'ok', 12, 52, 1.05, 'K2+100', '运行', null, null, 'asset'],
  ['a25', '雨水泵房', 'rainPump', 'structure', 'ok', 28, 72, 1, 'K2+400', '运行', null, null, 'asset'],
  ['a26', '消防泵房', 'fireStation', 'structure', 'ok', 46, 74, 1, 'K3+000', '运行', null, null, 'asset'],
  ['a27', '废水泵房', 'wastePump', 'structure', 'warn', 64, 76, 1, 'K3+600', '待检', null, null, 'asset'],
  ['a28', '变电所', 'substation', 'structure', 'ok', 80, 70, 1, 'K4+000', '运行', null, null, 'asset'],
]

let seq = 0
export const POINTS = RAW_POINTS.map(
  ([id, name, kind, group, status, left, top, scale, stake, value, alarm, inspect, module]) => ({
    id,
    name,
    kind,
    group,
    status,
    left,
    top,
    scale,
    stake,
    value,
    alarm,
    inspect,
    module,
    sort: seq++,
  }),
)

// 资产页面的 28 个点位与资产台账一一对应，这里维护点位 → 设备编号映射
export const ASSET_DEVICE_MAP = {
  a1: 'SYS-JF-0001',
  a2: 'SYS-JF-0002',
  a3: 'SYS-PS-0003',
  a4: 'SYS-LED-0012',
  a5: 'SYS-IB-0007',
  a6: 'SYS-CAM-0006',
  a7: 'SYS-LMP-0003',
  a11: 'SYS-IB-0011',
}

/** 设备台账：覆盖总览设备状态卡片的 6 类共 338 台口径（演示按分类汇总） */
export const DEVICES = [
  // 通风
  { card: 'vent', code: 'SYS-JF-0001', name: '轴流风机 JF-1', category: 'fan', group: 'mep', stake: 'K2+900', model: 'TAS 9-26', vendor: '上风高科', install: '2022-06-15', status: 'ok', run: '运行 35Hz', point: 'a1', ip: '10.32.7.11' },
  { card: 'vent', code: 'SYS-JF-0002', name: '轴流风机 JF-2', category: 'fan', group: 'mep', stake: 'K3+600', model: 'TAS 9-26', vendor: '上风高科', install: '2022-06-18', status: 'warn', run: '待机', point: 'a2', ip: '10.32.7.12' },
  { card: 'vent', code: 'SYS-JF-0003', name: '新风机组 XF-1', category: 'fan', group: 'mep', stake: 'K2+500', model: 'GXF-12', vendor: '金盾', install: '2022-06-20', status: 'ok', run: '运行 45Hz', point: null, ip: '10.32.7.13' },
  { card: 'vent', code: 'SYS-JF-0004', name: '新风机组 XF-2', category: 'fan', group: 'mep', stake: 'K3+400', model: 'GXF-12', vendor: '金盾', install: '2022-06-20', status: 'ok', run: '待机', point: null, ip: '10.32.7.14' },
  { card: 'vent', code: 'SYS-JF-0005', name: '排烟风机 PY-1', category: 'fan', group: 'mep', stake: 'K3+000', model: 'HTF-II-12', vendor: '上风高科', install: '2022-06-22', status: 'ok', run: '待机', point: 'e-fan1', ip: '10.32.7.15' },
  // 排涝 / 消防
  { card: 'drain', code: 'SYS-PS-0003', name: '排涝泵 P1', category: 'pump', group: 'mep', stake: '泵房 K3+000', model: '150WQ', vendor: '凯泉', install: '2021-11-20', status: 'ok', run: '运行 0.6MPa / 210m³·h⁻¹', point: 'e-p1', ip: '10.32.8.21' },
  { card: 'drain', code: 'SYS-PS-0004', name: '排涝泵 P2', category: 'pump', group: 'mep', stake: '泵房 K3+000', model: '150WQ', vendor: '凯泉', install: '2021-11-20', status: 'ok', run: '运行 0.6MPa / 210m³·h⁻¹', point: 'e-p2', ip: '10.32.8.22' },
  { card: 'drain', code: 'SYS-PS-0005', name: '排涝泵 P3', category: 'pump', group: 'mep', stake: '泵房 K4+100', model: '100WQ', vendor: '凯泉', install: '2021-11-22', status: 'ok', run: '待机', point: 'e-p3', ip: '10.32.8.23' },
  { card: 'drain', code: 'SYS-FP-0001', name: '消防水泵 FP-1', category: 'firePump', group: 'mep', stake: '消防泵房 K3+000', model: 'XBD-15/40', vendor: '南方泵业', install: '2021-12-05', status: 'ok', run: '待机 0.6MPa', point: 'e-fire1', ip: '10.32.8.31' },
  { card: 'drain', code: 'SYS-FP-0002', name: '消防水泵 FP-2', category: 'firePump', group: 'mep', stake: '消防泵房 K3+000', model: 'XBD-15/40', vendor: '南方泵业', install: '2021-12-05', status: 'ok', run: '待机 0.6MPa', point: 'a12', ip: '10.32.8.32' },
  // 照明
  { card: 'light', code: 'SYS-LMP-0003', name: '照明灯具组 L-3', category: 'lamp', group: 'mep', stake: 'K3+800', model: 'LED 200W', vendor: '雷士', install: '2022-05-11', status: 'ok', run: '96 回路 · 全亮', point: 'a7', ip: '10.32.9.11' },
  { card: 'light', code: 'SYS-LMP-0001', name: '照明灯具组 L-1', category: 'lamp', group: 'mep', stake: 'K2+400', model: 'LED 200W', vendor: '雷士', install: '2022-05-08', status: 'ok', run: '96 回路 · 全亮', point: 'lamp1', ip: '10.32.9.12' },
  { card: 'light', code: 'SYS-LMP-0005', name: '照明灯具组 L-5', category: 'lamp', group: 'mep', stake: 'K4+200', model: 'LED 200W', vendor: '雷士', install: '2022-05-14', status: 'warn', run: '96 回路 · 2 回路故障', point: null, ip: '10.32.9.13' },
  // 视频
  { card: 'video', code: 'SYS-CAM-0006', name: '流量摄像机 K3+500', category: 'camera', group: 'traffic', stake: 'K3+500', model: '400万 枪机', vendor: '海康威视', install: '2022-03-18', status: 'ok', run: '在线 1080P', point: 'a6', ip: '10.32.10.16' },
  { card: 'video', code: 'SYS-CAM-0001', name: '固定摄像机 K2+300', category: 'camera', group: 'traffic', stake: 'K2+300', model: '400万 枪机', vendor: '海康威视', install: '2022-03-18', status: 'ok', run: '在线 1080P', point: 'c1', ip: '10.32.10.11' },
  { card: 'video', code: 'SYS-CAM-0002', name: '固定摄像机 K3+050', category: 'camera', group: 'traffic', stake: 'K3+050', model: '400万 枪机', vendor: '海康威视', install: '2022-03-18', status: 'alarm', run: '在线 · AI 事件', point: 'c2', ip: '10.32.10.12' },
  { card: 'video', code: 'SYS-CAM-0003', name: '球形摄像机 K3+800', category: 'camera', group: 'traffic', stake: 'K3+800', model: '球机 23 倍', vendor: '大华', install: '2022-03-22', status: 'ok', run: '在线', point: 'dome1', ip: '10.32.10.13' },
  { card: 'video', code: 'SYS-CAM-0004', name: '流量摄像机 K4+100', category: 'camera', group: 'traffic', stake: 'K4+100', model: '400万 枪机', vendor: '海康威视', install: '2022-03-18', status: 'offline', run: '离线 32min', point: 't-c5', ip: '10.32.10.14' },
  // 交通设施
  { card: 'board', code: 'SYS-LED-0012', name: '诱导屏 K2+600', category: 'infoBoard', group: 'traffic', stake: 'K2+600', model: 'P10 全彩', vendor: '洲明', install: '2022-03-08', status: 'ok', run: '前方畅通', point: 'a4', ip: '10.32.11.11' },
  { card: 'board', code: 'SYS-LED-0013', name: '诱导屏 K3+700', category: 'infoBoard', group: 'traffic', stake: 'K3+700', model: 'P10 全彩', vendor: '洲明', install: '2022-03-08', status: 'ok', run: '限速 40', point: 't-sc2', ip: '10.32.11.12' },
  { card: 'board', code: 'SYS-IB-0007', name: '情报板 K3+100', category: 'infoBoard', group: 'traffic', stake: 'K3+100', model: '双基色 VMS', vendor: '三思', install: '2022-03-12', status: 'ok', run: '前方畅通', point: 'a5', ip: '10.32.11.21' },
  { card: 'board', code: 'SYS-IB-0011', name: '可变情报板 K4+050', category: 'infoBoard', group: 'traffic', stake: 'K4+050', model: '双基色 VMS', vendor: '三思', install: '2022-03-22', status: 'offline', run: '离线', point: 'a11', ip: '10.32.11.22' },
  { card: 'board', code: 'SYS-VD-0001', name: '车辆检测器 K2+800', category: 'vehicleDet', group: 'traffic', stake: 'K2+800', model: '微波 VTDS', vendor: '慧尔视', install: '2022-03-20', status: 'ok', run: '正常', point: 'vd1', ip: '10.32.11.31' },
  // 环境感知
  { card: 'env', code: 'SYS-ENV-0001', name: 'CO/VI 检测器 K2+500', category: 'covi', group: 'env', stake: 'K2+500', model: 'CO/VI 一体机', vendor: '中科鼎实', install: '2022-04-02', status: 'ok', run: 'CO 12ppm', point: 's1', ip: '10.32.12.11' },
  { card: 'env', code: 'SYS-ENV-0002', name: 'CO 监测器 C-2', category: 'covi', group: 'env', stake: 'K3+200', model: 'CO/VI 一体机', vendor: '中科鼎实', install: '2022-04-02', status: 'ok', run: 'CO 15ppm', point: 'co1', ip: '10.32.12.12' },
  { card: 'env', code: 'SYS-ENV-0003', name: '照度计 3', category: 'covi', group: 'env', stake: 'K3+350', model: 'LX-101', vendor: '虹谱', install: '2022-04-06', status: 'warn', run: '215 lx 偏低', point: 'a18', ip: '10.32.12.13' },
  { card: 'env', code: 'SYS-WL-0001', name: '积水监测 W1', category: 'waterLevel', group: 'env', stake: 'K3+700', model: '雷达水位计', vendor: '海川', install: '2022-04-10', status: 'ok', run: '2.1cm', point: 'w1', ip: '10.32.12.21' },
  { card: 'env', code: 'SYS-WL-0002', name: '积水点 W2', category: 'waterLevel', group: 'env', stake: 'K3+050', model: '雷达水位计', vendor: '海川', install: '2022-04-10', status: 'alarm', run: '26.8cm 红色预警', point: 'e-w2', ip: '10.32.12.22' },
  // 结构监测
  { card: null, code: 'SYS-ST-0001', name: '沉降监测 S2', category: 'stress', group: 'monitor', stake: 'K3+200', model: '静力水准仪', vendor: '基康', install: '2022-02-18', status: 'warn', run: '1.1mm', point: 'mset2', ip: '10.32.13.11' },
  { card: null, code: 'SYS-ST-0002', name: '应力应变监测 S-2', category: 'stress', group: 'monitor', stake: 'K3+900', model: '振弦应变计', vendor: '基康', install: '2022-02-18', status: 'alarm', run: '182με', point: 'a14', ip: '10.32.13.12' },
  { card: null, code: 'SYS-ST-0003', name: '螺栓受力 B1', category: 'stress', group: 'monitor', stake: 'K3+000', model: '轴力计', vendor: '基康', install: '2022-02-20', status: 'ok', run: '18.2kN', point: 'mbolt1', ip: '10.32.13.13' },
  // 供电
  { card: null, code: 'SYS-ST-0004', name: '沉降监测 S1', category: 'stress', group: 'monitor', stake: 'K2+400', model: '静力水准仪', vendor: '基康', install: '2022-02-18', status: 'ok', run: '0.4mm', point: 'mset1', ip: '10.32.13.14' },
  { card: null, code: 'SYS-ST-0005', name: '变形监测 D1', category: 'stress', group: 'monitor', stake: 'K3+800', model: '测斜仪', vendor: '基康', install: '2022-02-20', status: 'ok', run: '0.3mm', point: 'mdef1', ip: '10.32.13.15' },
  { card: null, code: 'SYS-ST-0006', name: '腐蚀监测 C1', category: 'stress', group: 'monitor', stake: 'K3+500', model: '腐蚀传感器', vendor: '基康', install: '2022-02-20', status: 'ok', run: '0.02mm/y', point: 'mcor1', ip: '10.32.13.16' },
  { card: null, code: 'SYS-ST-0007', name: '沉降监测点 S-4', category: 'stress', group: 'monitor', stake: 'K3+400', model: '静力水准仪', vendor: '基康', install: '2022-02-18', status: 'ok', run: '0.5mm', point: 'a9', ip: '10.32.13.17' },
  { card: null, code: 'SYS-PWR-0001', name: '变电所', category: 'substation', group: 'structure', stake: 'K2+400', model: '10kV/0.4kV', vendor: '南瑞', install: '2021-10-12', status: 'ok', run: '双电源正常', point: 'ss1', ip: '10.32.14.11' },
]

/** 告警种子：与 src/config/alerts.ts 五条示例事件一致，并补充 2 条历史已确认记录 */
export const ALERTS = [
  { code: 'AL-20261018-0001', level: 'critical', status: 'open', source: '数字应急', title: '积水液位快速上升', description: 'K3+050 积水监测点触发预警，请加强巡查并预置排涝设备。', stake: 'K3+050', point: 'demo-alert-flood-3050', group: 'env', kind: 'waterLevel', minutesAgo: 48, device: 'SYS-WL-0002' },
  { code: 'AL-20261018-0002', level: 'warning', status: 'open', source: '智能交通', title: '违停事件待确认', description: 'K3+050 AI 识别违停事件，尚未确认，请调取对应视频核实。', stake: 'K3+050', point: 'demo-alert-traffic-3050', group: 'traffic', kind: 'camera', minutesAgo: 92, device: 'SYS-CAM-0002' },
  { code: 'AL-20261018-0003', level: 'warning', status: 'open', source: '智慧养护', title: '交通诱导屏离线', description: 'K3+400 诱导屏离线超过 30 分钟，建议检查供电与通信链路。', stake: 'K3+400', point: 'demo-alert-board-3400', group: 'traffic', kind: 'infoBoard', minutesAgo: 140, device: 'SYS-IB-0011' },
  { code: 'AL-20261018-0004', level: 'info', status: 'acknowledged', source: '智慧监测', title: '环境照度偏低', description: 'K3+200 照度偏低，建议检查照明回路及灯具运行状态。', stake: 'K3+200', point: 'demo-alert-light-3200', group: 'env', kind: 'illum', minutesAgo: 225, device: 'SYS-ENV-0003' },
  { code: 'AL-20261018-0005', level: 'info', status: 'open', source: '智能交通', title: '断面流量异常下降', description: '断面流量骤降 40%，疑似拥堵，请结合现场视频核查。', stake: 'K2+800', point: 'demo-alert-flow-2800', group: 'traffic', kind: 'vehicleDet', minutesAgo: 310, device: 'SYS-VD-0001' },
  { code: 'AL-20261017-0031', level: 'warning', status: 'closed', source: '智慧养护', title: '顶板渗漏水复发', description: 'K3+350 顶板渗漏点复查发现渗水，已转养护工单 YH-20261016-02。', stake: 'K3+350', point: 'd2', group: 'monitor', kind: 'disease', minutesAgo: 1400, device: null },
  { code: 'AL-20261017-0044', level: 'notice', status: 'closed', source: '智慧监测', title: '结构应力短时波动', description: 'K3+900 应力测点短时波动 6%，复核为列车/重载车辆通过引起，已恢复。', stake: 'K3+900', point: 'a14', group: 'monitor', kind: 'stress', minutesAgo: 1560, device: 'SYS-ST-0002' },
]

export const DISEASES = [
  { code: 'YH-20261016-01', type: 'crack', severity: 'medium', stake: 'K3+200', section: 'SEC-03', description: 'K3+200 拱顶纵向裂缝，长度 2.4m，宽度 0.3mm。', source: 'ai', status: 'found', point: 'd1', hoursAgo: 4 },
  { code: 'YH-20261016-02', type: 'seepage', severity: 'severe', stake: 'K3+350', section: 'SEC-03', description: 'K3+350 顶板施工缝渗漏水，滴落至行车道。', source: 'public', status: 'repairing', point: 'd2', hoursAgo: 6 },
  { code: 'YH-20261015-07', type: 'spalling', severity: 'slight', stake: 'K2+700', section: 'SEC-01', description: 'K2+700 侧墙混凝土保护层剥落，面积约 0.6㎡。', source: 'manual', status: 'reviewing', point: 'd3', hoursAgo: 18 },
  { code: 'YH-20261015-05', type: 'crack', severity: 'slight', stake: 'K3+500', section: 'SEC-03', description: 'K3+500 路面横向裂缝，已灌浆封闭。', source: 'ai', status: 'completed', point: 'd4', hoursAgo: 22 },
  { code: 'YH-20261014-09', type: 'seepage', severity: 'medium', stake: 'K2+450', section: 'SEC-01', description: 'K2+450 侧墙渗水，已注浆处理。', source: 'manual', status: 'completed', point: 'd5', hoursAgo: 30 },
  { code: 'YH-20261014-04', type: 'joint', severity: 'medium', stake: 'K3+800', section: 'SEC-04', description: 'K3+800 变形缝止水带老化，需更换。', source: 'manual', status: 'dispatched', point: 'd6', hoursAgo: 34 },
]

export const CAMERAS = [
  { code: 'CAM-C01', name: '北口 K2+100', type: 'fixed', stake: 'K2+100', status: 'online', point: 'cctv-north-2100', preview: '01', ai: true },
  { code: 'CAM-C02', name: '事件断面 K3+050', type: 'fixed', stake: 'K3+050', status: 'alarm', point: 'cctv-event-3050', preview: '02', ai: true },
  { code: 'CAM-C03', name: '泵房 K3+000', type: 'fixed', stake: 'K3+000', status: 'online', point: 'cctv-pump-3000', preview: '03', ai: true },
  { code: 'CAM-C04', name: '南口 K4+300', type: 'fixed', stake: 'K4+300', status: 'online', point: 'cctv-south-4300', preview: '04', ai: true },
  { code: 'CAM-C05', name: '流量摄像机 K3+500', type: 'dome', stake: 'K3+500', status: 'online', point: 'a6', preview: '05', ai: true },
  { code: 'CAM-C06', name: '球形摄像机 K3+800', type: 'ptz', stake: 'K3+800', status: 'online', point: 'dome1', preview: '06', ai: false },
]

export const TRAFFIC_EVENTS = [
  { code: 'JT-20261018-01', type: 'parking', level: 'high', stake: 'K3+050', confidence: 96, status: 'pending', camera: 'CAM-C02', minutesAgo: 25 },
  { code: 'JT-20261018-02', type: 'congestion', level: 'medium', stake: 'K3+400', confidence: 91, status: 'confirmed', camera: 'CAM-C03', minutesAgo: 50 },
  { code: 'JT-20261018-03', type: 'debris', level: 'medium', stake: 'K2+800', confidence: 88, status: 'handled', camera: 'CAM-C01', minutesAgo: 132 },
  { code: 'JT-20261018-04', type: 'pedestrian', level: 'high', stake: 'K4+200', confidence: 94, status: 'handled', camera: 'CAM-C04', minutesAgo: 228 },
  { code: 'JT-20261018-05', type: 'wrongway', level: 'high', stake: 'K2+300', confidence: 89, status: 'handled', camera: 'CAM-C01', minutesAgo: 263 },
]

export const BOARD_ROWS = [
  { code: 'BRD-B1', name: '诱导屏 K2+400', type: 'induce', stake: 'K2+400', status: 'online', content: '前方畅通', point: 't-sc1' },
  { code: 'BRD-B2', name: '诱导屏 K3+700', type: 'induce', stake: 'K3+700', status: 'online', content: '限速 40', point: 't-sc2' },
  { code: 'BRD-B3', name: '情报板 K3+000', type: 'vms', stake: 'K3+000', status: 'online', content: '气象提示', point: 't-ib1' },
  { code: 'BRD-B4', name: '情报板 K4+000', type: 'vms', stake: 'K4+000', status: 'online', content: '限速 40', point: 't-ib2' },
  { code: 'BRD-B5', name: '情报板 K4+050', type: 'vms', stake: 'K4+050', status: 'offline', content: '', point: 'a11' },
]

export const FEEDBACKS = [
  { code: 'FK-20261018-01', channel: 'miniapp', content: '南口 K4+200 路面有积水，车辆通过溅水', stake: 'K4+200', point: 'cp1', status: 'pending', minutesAgo: 122 },
  { code: 'FK-20261018-02', channel: 'hotline', content: 'K3+300 顶部渗水，滴落到挡风玻璃', stake: 'K3+300', point: 'cp2', status: 'converted', minutesAgo: 200 },
  { code: 'FK-20261018-03', channel: 'miniapp', content: 'K2+500 照明灯不亮，光线昏暗', stake: 'K2+500', point: 'cp3', status: 'converted', minutesAgo: 285 },
  { code: 'FK-20261018-04', channel: 'miniapp', content: '北口诱导屏显示模糊', stake: 'K2+100', point: 'cp4', status: 'converted', minutesAgo: 358 },
  { code: 'FK-20261018-05', channel: 'hotline', content: '建议增加雨天限速提醒', stake: null, point: null, status: 'reviewed', minutesAgo: 390 },
  { code: 'FK-20261018-06', channel: 'miniapp', content: '（内容与通道无关，无法定位）', stake: null, point: null, status: 'invalid', minutesAgo: 436 },
]

export const NOTICES = [
  { title: 'K3 段积水处置，请减速慢行', level: 'red', channels: ['App推送', '诱导屏', '广播'], reach: 126000, hoursAgo: 6 },
  { title: '今日有暴雨，请注意通道积水提示', level: 'yellow', channels: ['App推送', '诱导屏'], reach: 98000, hoursAgo: 11 },
  { title: 'K2+600 夜间养护施工，临时占用左道', level: 'blue', channels: ['App推送', '诱导屏'], reach: 72000, hoursAgo: 54 },
  { title: '消防演练公告（10-09 22:00~23:00）', level: 'blue', channels: ['App推送', '公告'], reach: 54000, hoursAgo: 150 },
]

export const ARTICLES = [
  { title: '隧道火灾逃生自救指南', category: '消防安全', icon: '🔥', views: 23000, daysAgo: 1, summary: '记住疏散指示与紧急电话位置，低姿快撤，勿贪恋财物。' },
  { title: '汛期积水路段安全出行提示', category: '汛期安全', icon: '💧', views: 18000, daysAgo: 4, summary: '遇积水先观察标尺与警示，切勿涉水强行通过。' },
  { title: '隧道内行车安全注意事项', category: '行车安全', icon: '🚗', views: 15000, daysAgo: 7, summary: '进洞开灯、控距减速，禁止变道超车与随意停车。' },
  { title: '紧急情况一键报警使用说明', category: '应急求助', icon: '🆘', views: 9800, daysAgo: 10, summary: '紧急电话与一键报警均直连监控中心，请说明桩号与现场情况。' },
]

export const MATERIALS = [
  { name: '防汛沙袋', site: '物资间 A', stake: 'K2+400', quantity: 600, unit: '袋', sufficient: true },
  { name: '移动泵车 M1', site: '北口值守点', stake: 'K2+100', quantity: 1, unit: '台', sufficient: true },
  { name: '锥桶 / 警示牌', site: '物资间 B', stake: 'K3+800', quantity: 120, unit: '件', sufficient: true },
  { name: '消防水带', site: '消防救援口', stake: 'K3+100', quantity: 8, unit: '盘', sufficient: false },
  { name: '应急照明灯', site: '物资间 A', stake: 'K2+400', quantity: 40, unit: '台', sufficient: true },
]

export const MAINTENANCE_PLANS = [
  { name: '照明灯具批量更换（北段）', cycle: 'quarterly', next: '2026-10-22', status: 'due' },
  { name: '射流风机保养（1#~4#）', cycle: 'halfYear', next: '2026-11-05', status: 'scheduled' },
  { name: '排水沟清淤（全线）', cycle: 'monthly', next: '2026-10-18', status: 'due' },
  { name: '诱导屏巡检校准', cycle: 'quarterly', next: '2026-11-20', status: 'scheduled' },
  { name: '消防设施月检', cycle: 'monthly', next: '2026-10-25', status: 'scheduled' },
]

export const INSPECTION_TASKS = [
  { code: 'XJ-20261018-01', name: '南湖段日常巡查（白班）', cycle: 'daily', plan: '2026-10-18', status: 'done', coverage: 100 },
  { code: 'XJ-20261018-02', name: '南湖段日常巡查（夜班）', cycle: 'daily', plan: '2026-10-18', status: 'running', coverage: 62 },
  { code: 'XJ-20261019-01', name: '结构专项复测（K3+100~K3+600）', cycle: 'weekly', plan: '2026-10-19', status: 'planned', coverage: 0 },
]

export const HEALTH = [
  { section: 'SEC-01', name: 'K2+100~K2+800', score: 88, level: 'good' },
  { section: 'SEC-02', name: 'K2+800~K3+100', score: 76, level: 'watch' },
  { section: 'SEC-03', name: 'K3+100~K3+600', score: 58, level: 'warning' },
  { section: 'SEC-04', name: 'K3+600~K4+300', score: 82, level: 'good' },
]

/** 遥测：每类设备一条指标序列，用于 /telemetry 与 /timeseries 演示 */
export const TELEMETRY_SERIES = [
  { device: 'SYS-WL-0002', metric: 'water_level', unit: 'cm', points: [8.2, 11.5, 15.2, 19.6, 23.4, 26.8], stepMinutes: 60 },
  { device: 'SYS-WL-0001', metric: 'water_level', unit: 'cm', points: [1.2, 1.4, 1.5, 1.6, 1.8, 1.8], stepMinutes: 120 },
  { device: 'SYS-ENV-0001', metric: 'co', unit: 'ppm', points: [10, 11, 12, 11.5, 12, 12.4], stepMinutes: 15 },
  { device: 'SYS-ENV-0002', metric: 'co', unit: 'ppm', points: [12, 13, 14, 15, 14.8, 15.2], stepMinutes: 15 },
  { device: 'SYS-ENV-0003', metric: 'illuminance', unit: 'lux', points: [360, 340, 300, 215, 240, 260], stepMinutes: 60 },
  { device: 'SYS-ST-0001', metric: 'settlement', unit: 'mm', points: [0.4, 0.55, 0.7, 0.85, 0.98, 1.1], stepMinutes: 43200 },
  { device: 'SYS-ST-0002', metric: 'strain', unit: 'με', points: [162, 168, 175, 180, 182, 179], stepMinutes: 60 },
  { device: 'SYS-ST-0003', metric: 'bolt_force', unit: 'kN', points: [17.8, 17.9, 18.0, 18.1, 18.2, 18.2], stepMinutes: 43200 },
  { device: 'SYS-PS-0003', metric: 'pressure', unit: 'MPa', points: [0, 0.15, 0.35, 0.52, 0.6, 0.6], stepMinutes: 30 },
  { device: 'SYS-JF-0001', metric: 'fan_frequency', unit: 'Hz', points: [20, 24, 28, 32, 35, 35], stepMinutes: 20 },
  { device: 'SYS-VD-0001', metric: 'flow', unit: 'veh/h', points: [1420, 1380, 1860, 2100, 1980, 1150], stepMinutes: 60 },
]

export const SIMULATION_RUNS = [
  { scenario: 'fire', stepReached: 3, totalSteps: 5, immersive: false, hoursAgo: 26, note: '月度消防演练，下层排烟计划验证' },
  { scenario: 'flood', stepReached: 4, totalSteps: 5, immersive: true, hoursAgo: 50, note: '强降雨预案推演，泵站联动与绕行引导' },
  { scenario: 'accident', stepReached: 3, totalSteps: 4, immersive: false, hoursAgo: 74, note: '交通事故处置流程推演' },
  { scenario: 'inspection', stepReached: 2, totalSteps: 3, immersive: false, hoursAgo: 100, note: '日常巡检脚本走查' },
]
