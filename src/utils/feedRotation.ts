/** 单次最多切换一条，避免从后台切回时连跳或闪屏。 */
export function advanceFeed(
  index: number,
  remaining: number,
  elapsed: number,
  count: number,
  duration: number,
) {
  if (count < 1 || duration <= 0) return { index: 0, remaining: Math.max(0, duration) }
  const current = Math.max(0, Math.min(count - 1, index))
  const nextRemaining = remaining - Math.max(0, Math.min(duration, elapsed))
  return nextRemaining <= 0
    ? { index: (current + 1) % count, remaining: duration }
    : { index: current, remaining: nextRemaining }
}
