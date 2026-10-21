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
  '/img/646372a3eaef80786d97f7750fce65e5.gif'
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
