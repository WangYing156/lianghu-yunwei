import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { advanceFeed } from '../utils/feedRotation'

export function useRotatingFeed<T>(items: () => readonly T[], duration = 7000) {
  const index = ref(0)
  const remaining = ref(duration)
  const manualPaused = ref(false)
  const hovered = ref(false)
  const focused = ref(false)
  const reducedMotion = ref(false)
  const hidden = ref(false)
  const paused = computed(
    () =>
      manualPaused.value ||
      hovered.value ||
      focused.value ||
      reducedMotion.value ||
      hidden.value ||
      items().length < 2,
  )
  const active = computed(() => items()[index.value])
  const progress = computed(() => 1 - remaining.value / duration)
  let timer: ReturnType<typeof setInterval> | undefined
  let query: MediaQueryList | undefined
  let previousTime = 0
  const updateMotion = () => {
    reducedMotion.value = query?.matches ?? false
  }
  const updateVisibility = () => {
    hidden.value = document.hidden
    previousTime = performance.now()
  }

  function select(value: number) {
    const count = items().length
    index.value = count ? ((value % count) + count) % count : 0
    remaining.value = duration
    previousTime = performance.now()
  }
  function blur(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
      focused.value = false
  }
  watch(
    () => items().length,
    () => select(Math.min(index.value, Math.max(0, items().length - 1))),
  )
  onMounted(() => {
    query = window.matchMedia('(prefers-reduced-motion: reduce)')
    updateMotion()
    updateVisibility()
    query.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    timer = setInterval(() => {
      const now = performance.now()
      const elapsed = now - previousTime
      previousTime = now
      if (paused.value) return
      const next = advanceFeed(index.value, remaining.value, elapsed, items().length, duration)
      index.value = next.index
      remaining.value = next.remaining
    }, 200)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    query?.removeEventListener('change', updateMotion)
    document.removeEventListener('visibilitychange', updateVisibility)
  })
  return {
    index,
    active,
    remaining,
    progress,
    manualPaused,
    hovered,
    focused,
    reducedMotion,
    paused,
    select,
    blur,
    next: () => select(index.value + 1),
    previous: () => select(index.value - 1),
    togglePause: () => {
      manualPaused.value = !manualPaused.value
    },
  }
}
