/** public/img 下可用于监控墙的媒体（不含 svg 占位） */
export const CCTV_GALLERY: string[] = [
  '/img/38e1d7b9289f27065e671df80de2f163.jpg',
  '/img/5136f489ce07c46317274653ca03988d.jpeg',
  '/img/58e38487c6b329b5288f0115b2fd0b2c.jpeg',
  '/img/6b24a02467a064569836a78d48e7b502.jpeg',
  '/img/8a3586f29d9e40598e624e72a08c41f3.jpeg',
  '/img/92006701ec33f0cd4188b21450295fe9.jpg',
  '/img/b687c6be964693f04a3f51707c215716.jpeg',
  '/img/b690b098b80fd0c329c01acf80659794.jpeg',
  '/img/c5468948bcd73580c4aef028d9ef1853.jpeg',
  '/img/c97ff03c48413801a7e654b204e7ba71.jpeg',
  '/img/d476acbe5cd55384d94cd362fa8548a0.jpeg',
  '/img/dc186001c686e609649132bd8c50cada.jpeg',
  '/img/f399bd4dd352fb0caeb4cb4df6befaff.png',
  '/img/646372a3eaef80786d97f7750fce65e5.gif',
]

/** 打乱后取 n 张，不足则循环补齐 */
export function pickRandomCctvImages(n: number, seed = Date.now()): string[] {
  const pool = [...CCTV_GALLERY]
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length])
  return out
}

export interface MonitoringCamera {
  id: string
  pointId: string
  name: string
  stake: string
  src: string
  alarm?: boolean
  event?: string
  /** 后续可接入浏览器可播放的授权媒体地址；当前仓库仅提供示例图片/GIF。 */
  streamUrl?: string
}
const previews = pickRandomCctvImages(4, 20261022)
export const CCTV_CAMERAS: MonitoringCamera[] = [
  {
    id: 'C01',
    pointId: 'cctv-north-2100',
    name: '北口 K2+100',
    stake: 'K2+100',
    src: previews[0],
  },
  {
    id: 'C02',
    pointId: 'cctv-event-3050',
    name: '事件断面 K3+050',
    stake: 'K3+050',
    src: previews[1],
    alarm: true,
    event: '模拟违停',
  },
  {
    id: 'C03',
    pointId: 'cctv-pump-3000',
    name: '泵房 K3+000',
    stake: 'K3+000',
    src: previews[2],
  },
  {
    id: 'C04',
    pointId: 'cctv-south-4300',
    name: '南口 K4+300',
    stake: 'K4+300',
    src: previews[3],
  },
]
export function cameraForPoint(point: {
  id: string
  name: string
  stake: string
  videoId?: string
}): MonitoringCamera {
  const known = CCTV_CAMERAS.find(
    (c) => c.id === point.videoId || c.pointId === point.id,
  )
  if (known) return known
  let hash = 0
  for (const char of point.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return {
    id: point.videoId ?? point.id,
    pointId: point.id,
    name: point.name,
    stake: point.stake,
    src: CCTV_GALLERY[hash % CCTV_GALLERY.length],
  }
}
