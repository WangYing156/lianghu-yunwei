/**
 * 孪生 VR 仿真推演脚本：步骤、联动设备与随时间演化的推演曲线（纯数据 / 纯函数，便于单测）。
 * 空间锚点均取自局部竣工模型真实双层路面（PARTIAL_ROAMING_ROUTES），progress 为路线弧长比例。
 * 消防车 / 疏散车流、泵站 / 绕行车流、事故处置 / 过车车流均按步骤分道推演，车位由净距求解器逐帧校核。
 *
 * 这里的所有读数都是工况脚本推演值，不是实时 IoT 测点；设备动作也是三维场景内的联动示意。
 */
export type TwinScenarioId = 'fire' | 'flood' | 'accident' | 'patrol'
export type TwinLevel = 'ok' | 'warn' | 'alarm'
export type TwinVentilationMode = 'normal' | 'exhaust'

/** 统一的数据边界说明，页面、HUD 与交付文档共用，避免把推演值讲成实测值。 */
export const TWIN_DATA_NOTE =
  '工况读数与设备状态为脚本推演值，非实时测点；BIM 几何、双层路面与风机位置来自真实竣工模型。'

export interface TwinStep {
  title: string
  detail: string
  /** 自动推演时长（秒，1× 速度）；0 表示由第一人称行进进度驱动 */
  duration: number
}

export interface TwinTelemetry {
  key: string
  label: string
  value: string
  level: TwinLevel
  /** 0–1，用于 HUD 进度条 */
  ratio: number
}

export interface TwinDevice {
  name: string
  value: string
  level: TwinLevel
}

export interface FireVentilationPlan {
  mode: TwinVentilationMode
  /** 事件所在下层风机负荷 */
  lower: number
  /** 非事件层保持常规通风，不被排烟模式误降速 */
  upper: number
  vent: boolean
  label: string
}

export interface TwinScenario {
  id: TwinScenarioId
  label: string
  short: string
  desc: string
  deck: 'lower' | 'upper'
  /** 事件中心沿路线位置；flood 运行时改取洞口内低点 */
  eventProgress: number
  /** 业务点位（原始方案点位 id），用于与二维点位联动定位 */
  hotspot: string
  steps: TwinStep[]
  telemetry: (step: number, k: number) => TwinTelemetry[]
  devices: (step: number, k: number) => TwinDevice[]
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k))
/** 分段曲线：每步给出起止值，按步内进度 k 插值 */
export function piecewise(
  segments: readonly (readonly [number, number])[],
  step: number,
  k: number,
): number {
  const i = Math.max(0, Math.min(segments.length - 1, step))
  const [a, b] = segments[i]
  return lerp(a, b, k)
}

const level = (v: number, warn: number, alarm: number, inverse = false): TwinLevel => {
  if (inverse) return v <= alarm ? 'alarm' : v <= warn ? 'warn' : 'ok'
  return v >= alarm ? 'alarm' : v >= warn ? 'warn' : 'ok'
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * 火灾排烟与遥测、风机覆写、烟气方向共用同一份状态机：
 * 0 常规通风 → 1/2 事故层全速排烟 → 3 前半段续排、后半段回落常规。
 */
export function fireVentilationPlan(step: number, k: number): FireVentilationPlan {
  const exhaust = step === 1 || step === 2 || (step === 3 && k < 0.55)
  return {
    mode: exhaust ? 'exhaust' : 'normal',
    lower: exhaust ? 1 : 0.72,
    upper: 0.72,
    vent: exhaust,
    label: exhaust ? '火灾排烟联动' : '常规通风恢复',
  }
}

export const TWIN_SCENARIOS: Record<TwinScenarioId, TwinScenario> = {
  fire: {
    id: 'fire',
    label: '火灾疏散',
    short: '火灾',
    desc: '下层车道车辆起火：事故层射流风机纵向排烟、消防车经中间车道进场、社会车辆在右车道分道撤离，疏散指示与应急广播联动；最后清障并回落常规通风。',
    deck: 'lower',
    eventProgress: 0.46,
    hotspot: 'fan1',
    steps: [
      { title: '火情确认与分区锁定', detail: '感温光栅报警，视频复核确认车辆起火，锁定火灾分区；上游社会车辆停驶排队，烟气在拱顶双向扩散。', duration: 14 },
      { title: '排烟与消防车进场', detail: '事故层风机全速正转，纵向排烟压向下游；消防车沿中间车道进场，不越过绿色疏散诱导线。', duration: 16 },
      { title: '诱导 / 分道疏散', detail: '绿色诱导线与应急广播启动；人员走检修带，三辆社会车在右车道保持车距分道撤离。', duration: 16 },
      { title: '通道清障与复盘', detail: '明火扑灭，消防车离场，车辆完成撤离；排烟转常规通风，烟气消散并复盘烟控效果。', duration: 14 },
    ],
    telemetry: (s, k) => {
      const temp = piecewise([[42, 86], [86, 118], [118, 92], [92, 31]], s, k)
      const smoke = piecewise([[4.3, 2.4], [2.4, 3.7], [3.7, 4.3], [4.3, 4.9]], s, k)
      const vis = piecewise([[60, 14], [14, 34], [34, 58], [58, 100]], s, k)
      const evac = piecewise([[0, 6], [6, 38], [38, 100], [100, 100]], s, k)
      return [
        { key: 'temp', label: '火点温度', value: `${temp.toFixed(0)}℃`, level: level(temp, 60, 90), ratio: clamp01(temp / 140) },
        { key: 'smoke', label: '烟气层高度', value: `${smoke.toFixed(1)}m`, level: level(smoke, 3.2, 2.6, true), ratio: clamp01(smoke / 5) },
        { key: 'vis', label: '能见度', value: `${vis.toFixed(0)}m`, level: level(vis, 40, 20, true), ratio: clamp01(vis / 100) },
        { key: 'evac', label: '疏散完成', value: `${evac.toFixed(0)}%`, level: evac >= 99 ? 'ok' : 'warn', ratio: clamp01(evac / 100) },
      ]
    },
    devices: (s, k) => {
      const plan = fireVentilationPlan(s, k)
      const ventOpen = s === 1 || s === 2 || (s === 3 && k < 0.55)
      const guiding = s === 2 || (s === 3 && k < 0.35)
      return [
        { name: '下层射流风机', value: plan.mode === 'exhaust' ? '排烟 50Hz' : '常规 36Hz', level: plan.mode === 'exhaust' ? 'alarm' : 'ok' },
        { name: '加压送风口', value: ventOpen ? '开启' : '关闭', level: ventOpen ? 'warn' : 'ok' },
        { name: '疏散指示', value: guiding ? '上游诱导' : s === 3 ? '解除' : '待命', level: guiding ? 'warn' : 'ok' },
        { name: '应急广播', value: s === 2 ? '循环播放' : s === 3 && k < 0.55 ? '解除播报' : s === 3 ? '解除' : '待命', level: s === 2 ? 'alarm' : 'ok' },
        { name: '消防车 / 疏散车流', value: s === 0 ? '待命 / 停驶排队' : s === 1 ? '消防车进场 / 车辆待避让' : s === 2 ? '驻车控火 / 分道撤离' : s === 3 && k < 0.6 ? '消防车离场 / 撤离完成' : '通道清空', level: s === 1 || s === 2 ? 'warn' : 'ok' },
      ]
    },
  },
  flood: {
    id: 'flood',
    label: '积水排涝',
    short: '积水',
    desc: '暴雨倒灌：水平水面按竣工路面真实纵坡求交，泵站叶轮随抽排流量旋转，车辆沿黄色诱导线右侧干燥车道绕行；水位回落后双车道放行。',
    deck: 'lower',
    eventProgress: 0,
    hotspot: 'w2',
    steps: [
      { title: '液位红色预警', detail: '路面汇水流向洞口内低点，水平水面随液位上涨；第一步末达到 26.8cm 红色阈值。', duration: 14 },
      { title: '泵站联动启动', detail: '排涝泵 P1/P2 启动，叶轮随流量旋转，泵井受纳并经流线排出；水位上涨速度明显放缓。', duration: 14 },
      { title: '交通诱导绕行', detail: '积水侧封闭，黄色诱导线与锥桶限定干燥绕行车道；车辆不压线、不涉水，依次改走上层。', duration: 14 },
      { title: '水位回落与双车道放行', detail: '雨强减弱，抽排能力持续大于来水，液位回落至安全线以下，诱导设施撤除并逐步恢复通行。', duration: 16 },
    ],
    telemetry: (s, k) => {
      const lv = piecewise([[8, 26.8], [26.8, 29.4], [29.4, 23.5], [23.5, 3.2]], s, k)
      const flow = piecewise([[0, 0], [0, 420], [420, 420], [420, 210]], s, k)
      const rain = piecewise([[38, 42], [42, 36], [36, 22], [22, 8]], s, k)
      return [
        { key: 'level', label: '积水液位', value: `${lv.toFixed(1)}cm`, level: level(lv, 15, 25), ratio: clamp01(lv / 35) },
        { key: 'pump', label: '抽排流量', value: `${flow.toFixed(0)}m³/h`, level: flow > 0 ? 'warn' : 'ok', ratio: clamp01(flow / 420) },
        { key: 'rain', label: '雨强', value: `${rain.toFixed(0)}mm/h`, level: level(rain, 20, 35), ratio: clamp01(rain / 50) },
      ]
    },
    devices: (s, k) => {
      const flow = piecewise([[0, 0], [0, 420], [420, 420], [420, 210]], s, k)
      const starting = s === 1 && k < 0.2
      const running = s >= 2 || (s === 1 && k >= 0.2)
      const guiding = s === 2 || (s === 3 && k < 0.55)
      const passing = s === 3 && k >= 0.55
      return [
        { name: '积水点 W2', value: s <= 1 ? '红色预警' : s === 2 ? '高位回落' : '安全', level: s <= 1 ? 'alarm' : s === 2 ? 'warn' : 'ok' },
        { name: '排涝泵 P1/P2', value: starting ? '启动建压' : running ? `运行 ${flow.toFixed(0)}m³/h` : '待机', level: running ? 'warn' : 'ok' },
        { name: '下层车道指示器', value: guiding ? '全部封闭' : passing ? '逐步放行' : '正常', level: guiding ? 'alarm' : 'ok' },
        { name: '可变情报板', value: passing ? '积水消退 · 恢复通行' : guiding ? '积水绕行上层' : '正常', level: guiding ? 'warn' : 'ok' },
        { name: '泵站叶轮 / 诱导锥桶', value: running ? `叶轮 ${flow.toFixed(0)}m³/h` : '叶轮停转', level: guiding ? 'warn' : running ? 'ok' : 'ok' },
      ]
    },
  },
  accident: {
    id: 'accident',
    label: '交通事故',
    short: '事故',
    desc: '上层车道两车追尾：左道锥桶渐变封闭，中间车道供救援车进场，右道社会车辆低速通过；清障车拖离事故车后管制解除。',
    deck: 'upper',
    eventProgress: 0.55,
    hotspot: 'm1',
    steps: [
      { title: '接警与视频复核', detail: '事件检测相机识别停驶车辆，视频复核为两车追尾，后方车辆开始排队。', duration: 12 },
      { title: '车道管制发布', detail: '事故车道指示器转红叉，摆放锥桶渐变封闭，相邻车道低速通行。', duration: 14 },
      { title: '现场处置与清障拖离', detail: '救援车经中间车道进场并驻车处置，社会车辆持续从右道通过；后半段清障车沿事故道拖离两车。', duration: 16 },
      { title: '解除管制恢复', detail: '事故车辆与清障车离场，锥桶撤除，指示器恢复绿色箭头，排队车辆依次驶离。', duration: 14 },
    ],
    telemetry: (s, k) => {
      const queue = piecewise([[0, 180], [180, 420], [420, 300], [300, 0]], s, k)
      const speed = piecewise([[60, 18], [18, 12], [12, 15], [15, 58]], s, k)
      const resp = piecewise([[0, 1.2], [1.2, 2.6], [2.6, 3.8], [3.8, 3.8]], s, k)
      return [
        { key: 'queue', label: '排队长度', value: `${queue.toFixed(0)}m`, level: level(queue, 150, 350), ratio: clamp01(queue / 450) },
        { key: 'speed', label: '断面车速', value: `${speed.toFixed(0)}km/h`, level: level(speed, 30, 15, true), ratio: clamp01(speed / 80) },
        { key: 'resp', label: '响应用时', value: `${resp.toFixed(1)}min`, level: resp > 5 ? 'warn' : 'ok', ratio: clamp01(resp / 6) },
      ]
    },
    devices: (s, k) => {
      const clearing = (s === 2 && k >= 0.52) || s === 3
      const opening = s === 3 && k >= 0.55
      const closed = (s === 1 || s === 2) && !clearing
      return [
        { name: '车道指示器', value: closed ? '左闭右通' : opening ? '恢复通行' : clearing ? '逐步放行' : '正常', level: closed ? 'warn' : 'ok' },
        { name: '可变情报板', value: closed ? '前方事故 减速慢行' : opening ? '恢复' : clearing ? '清障中 谨慎驾驶' : '正常', level: closed ? 'warn' : 'ok' },
        { name: '事件检测相机', value: s <= 2 ? (clearing ? '清障跟踪' : '锁定画面') : '恢复巡检', level: s <= 2 ? 'alarm' : 'ok' },
        { name: '紧急电话', value: s <= 1 ? '通话中' : s === 2 && !clearing ? '保持联络' : '已挂断', level: s <= 2 && !clearing ? 'alarm' : 'ok' },
        { name: '清障车 / 过车通道', value: s <= 1 ? '待命 / 右道通行' : s === 2 && !clearing ? '救援进场 / 右道低速' : clearing ? '拖离事故车 / 依次放行' : '恢复通行', level: s === 2 && !opening ? 'warn' : 'ok' },
      ]
    },
  },
  patrol: {
    id: 'patrol',
    label: '日常巡检',
    short: '巡检',
    desc: '第一人称沿下层真实路面巡检：叠加射流风机推演转速、环控指标，发现异常停机风机并生成推演工单闭环。',
    deck: 'lower',
    eventProgress: 0.5,
    hotspot: 'fire1',
    steps: [
      { title: '入口段结构巡视', detail: '沿下层车道入场，核对衬砌、路面与沿线结构状态。', duration: 0 },
      { title: '机电设备抽检', detail: '逐台检视射流风机推演转速与运行方向，核对与监控平台示意一致。', duration: 0 },
      { title: '环控指标核对', detail: '核对 CO、照度、风速等环控推演值，确认通风效果达标。', duration: 0 },
      { title: '异常标注闭环', detail: '发现一台射流风机停机，现场标注并在推演中生成维修工单。', duration: 0 },
    ],
    telemetry: (s, k) => {
      const co = 12 + Math.sin((s + k) * 2.1) * 2.4
      const lux = 328 + Math.cos((s + k) * 1.7) * 18
      const wind = piecewise([[2.4, 2.6], [2.6, 2.7], [2.7, 2.5], [2.5, 2.2]], s, k)
      const done = ((s + k) / 4) * 100
      return [
        { key: 'co', label: 'CO 浓度', value: `${co.toFixed(1)}ppm`, level: level(co, 50, 100), ratio: clamp01(co / 60) },
        { key: 'lux', label: '路面照度', value: `${lux.toFixed(0)}lx`, level: 'ok', ratio: clamp01(lux / 400) },
        { key: 'wind', label: '断面风速', value: `${wind.toFixed(1)}m/s`, level: 'ok', ratio: clamp01(wind / 5) },
        { key: 'done', label: '巡检进度', value: `${done.toFixed(0)}%`, level: 'ok', ratio: clamp01(done / 100) },
      ]
    },
    devices: (s) => [
      { name: '射流风机（下层）', value: s >= 3 ? '1 台停机（推演）' : '运行正常（推演）', level: s >= 3 ? 'alarm' : 'ok' },
      { name: 'CO/VI 检测器', value: '在线（示意）', level: 'ok' },
      { name: '照明回路', value: '基本照明（示意）', level: 'ok' },
      { name: '巡检工单', value: s >= 3 ? '推演工单 WO-0317' : '—', level: s >= 3 ? 'warn' : 'ok' },
    ],
  },
}

export const TWIN_SCENARIO_LIST: readonly TwinScenario[] = Object.values(TWIN_SCENARIOS)
