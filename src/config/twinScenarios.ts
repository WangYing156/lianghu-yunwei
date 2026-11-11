/**
 * 孪生 VR 仿真推演脚本：步骤、联动设备与随时间演化的遥测曲线（纯数据 / 纯函数，便于单测）。
 * 空间锚点均取自局部竣工模型真实双层路面（PARTIAL_ROAMING_ROUTES），progress 为路线弧长比例。
 */
export type TwinScenarioId = 'fire' | 'flood' | 'accident' | 'patrol'
export type TwinLevel = 'ok' | 'warn' | 'alarm'

export interface TwinStep {
  title: string
  detail: string
  /** 自动推演时长（秒，1× 速度） */
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

export interface TwinScenario {
  id: TwinScenarioId
  label: string
  short: string
  desc: string
  deck: 'lower' | 'upper'
  /** 事件中心沿路线位置；flood 运行时改取路线最低点 */
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

export const TWIN_SCENARIOS: Record<TwinScenarioId, TwinScenario> = {
  fire: {
    id: 'fire',
    label: '火灾疏散',
    short: '火灾',
    desc: '下层车道车辆起火：联动射流风机纵向排烟、加压送风、疏散指示与应急广播，推演烟气蔓延与人员疏散。',
    deck: 'lower',
    eventProgress: 0.46,
    hotspot: 'fan1',
    steps: [
      { title: '火情确认与分区锁定', detail: '感温光栅报警，视频复核确认车辆起火，锁定火灾分区；烟气开始在拱顶聚集并双向扩散。', duration: 14 },
      { title: '排烟模式切换', detail: '火点所在下层射流风机全速正转，加压送风口开启，纵向排烟把烟气压向下游，上游形成无烟区。', duration: 16 },
      { title: '诱导 / 广播疏散指引', detail: '疏散指示灯沿上游方向流动点亮，应急广播循环播放，人员背离烟气向上游安全区疏散。', duration: 16 },
      { title: '通道清障与复盘', detail: '明火扑灭，排烟持续后转常规通风，烟气消散；复盘疏散用时与烟控效果。', duration: 14 },
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
    devices: (s) => [
      { name: '下层射流风机', value: s === 0 ? '常规 36Hz' : s === 3 ? '回落 36Hz' : '排烟 50Hz', level: s === 1 || s === 2 ? 'alarm' : 'ok' },
      { name: '加压送风口', value: s >= 1 && s <= 2 ? '开启' : '关闭', level: s >= 1 && s <= 2 ? 'warn' : 'ok' },
      { name: '疏散指示', value: s >= 2 ? '上游诱导' : '待命', level: s === 2 ? 'warn' : 'ok' },
      { name: '应急广播', value: s >= 2 && s < 3 ? '循环播放' : s === 3 ? '解除' : '待命', level: s === 2 ? 'alarm' : 'ok' },
    ],
  },
  flood: {
    id: 'flood',
    label: '积水排涝',
    short: '积水',
    desc: '暴雨倒灌：路面汇水流向下层最低点，液位超红色阈值后联动排涝泵、车道封闭与绕行诱导，推演水位涨落。',
    deck: 'lower',
    eventProgress: 0,
    hotspot: 'w2',
    steps: [
      { title: '液位红色预警', detail: '路面汇水沿纵坡流向下层最低点，液位持续上涨突破 25cm 红色阈值。', duration: 14 },
      { title: '泵站联动启动', detail: '排涝泵 P1/P2 自动启动，泵井持续抽排，水位上涨速度明显放缓。', duration: 14 },
      { title: '交通诱导绕行', detail: '下层车道指示器全部转红叉封闭，情报板发布积水绕行，车辆改走上层。', duration: 14 },
      { title: '水位回落确认', detail: '雨强减弱，抽排能力大于来水，液位回落至安全线以下，逐步恢复通行。', duration: 16 },
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
    devices: (s) => [
      { name: '积水点 W2', value: s <= 1 ? '红色预警' : s === 2 ? '高位回落' : '安全', level: s <= 1 ? 'alarm' : s === 2 ? 'warn' : 'ok' },
      { name: '排涝泵 P1/P2', value: s === 0 ? '待机' : '运行 210m³/h×2', level: s === 0 ? 'ok' : 'warn' },
      { name: '下层车道指示器', value: s === 2 ? '全部封闭' : s === 3 ? '逐步放行' : '正常', level: s === 2 ? 'alarm' : 'ok' },
      { name: '可变情报板', value: s >= 2 ? '积水绕行上层' : '正常', level: s >= 2 ? 'warn' : 'ok' },
    ],
  },
  accident: {
    id: 'accident',
    label: '交通事故',
    short: '事故',
    desc: '上层车道两车追尾：联动车道指示器、可变情报板与视频监控，推演排队蔓延、救援进场与管制解除。',
    deck: 'upper',
    eventProgress: 0.55,
    hotspot: 'm1',
    steps: [
      { title: '接警与视频复核', detail: '事件检测相机识别停驶车辆，视频复核为两车追尾，后方车辆开始排队。', duration: 12 },
      { title: '车道管制发布', detail: '事故车道指示器转红叉，摆放锥桶渐变封闭，相邻车道低速通行。', duration: 14 },
      { title: '现场处置疏导', detail: '救援车经开放车道进场，警示灯开启，现场清障与伤员处置。', duration: 16 },
      { title: '解除管制恢复', detail: '事故车辆拖离，指示器恢复绿色箭头，排队车辆依次驶离。', duration: 14 },
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
    devices: (s) => [
      { name: '车道指示器', value: s === 0 ? '正常' : s === 3 ? '恢复通行' : '左闭右通', level: s === 1 || s === 2 ? 'warn' : 'ok' },
      { name: '可变情报板', value: s === 0 ? '正常' : s === 3 ? '恢复' : '前方事故 减速慢行', level: s === 1 || s === 2 ? 'warn' : 'ok' },
      { name: '事件检测相机', value: s === 0 ? '锁定画面' : '持续跟踪', level: s <= 2 ? 'alarm' : 'ok' },
      { name: '紧急电话', value: s <= 1 ? '通话中' : '已挂断', level: s <= 1 ? 'alarm' : 'ok' },
    ],
  },
  patrol: {
    id: 'patrol',
    label: '日常巡检',
    short: '巡检',
    desc: '第一人称沿下层真实路面巡检：叠加射流风机实时转速、环控指标，发现异常停机风机并生成工单闭环。',
    deck: 'lower',
    eventProgress: 0.5,
    hotspot: 'fire1',
    steps: [
      { title: '入口段结构巡视', detail: '沿下层车道入场，核对衬砌、路面与沿线结构状态。', duration: 0 },
      { title: '机电设备抽检', detail: '逐台检视射流风机实时转速与运行方向，核对与监控平台一致。', duration: 0 },
      { title: '环控指标核对', detail: '核对 CO、照度、风速等环控指标，确认通风效果达标。', duration: 0 },
      { title: '异常标注闭环', detail: '发现一台射流风机停机，现场标注并自动生成维修工单。', duration: 0 },
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
      { name: '射流风机（下层）', value: s >= 3 ? '1 台停机' : '运行正常', level: s >= 3 ? 'alarm' : 'ok' },
      { name: 'CO/VI 检测器', value: '在线', level: 'ok' },
      { name: '照明回路', value: '基本照明', level: 'ok' },
      { name: '巡检工单', value: s >= 3 ? '已生成 WO-0317' : '—', level: s >= 3 ? 'warn' : 'ok' },
    ],
  },
}

export const TWIN_SCENARIO_LIST: readonly TwinScenario[] = Object.values(TWIN_SCENARIOS)
