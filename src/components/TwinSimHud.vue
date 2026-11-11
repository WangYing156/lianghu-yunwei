<template>
  <div class="twin-hud" :class="{ stereo: state.stereo }">
    <section
      class="twin-hud__brief"
      aria-label="孪生仿真推演步骤"
      @pointerdown.stop
      @wheel.stop
    >
      <header>
        <span class="twin-hud__dot" :class="{ live: state.playing }"></span>
        <div>
          <strong>{{ scenario.label }}</strong>
          <small>孪生 VR 仿真 · {{ viewLabel }}</small>
        </div>
        <button
          type="button"
          class="twin-hud__exit"
          title="退出仿真并恢复场景（Esc）"
          @click="emit('exit')"
        >
          退出
        </button>
      </header>
      <div v-if="state.loading" class="twin-hud__msg" role="status">
        正在加载竣工模型并布置仿真场景…
      </div>
      <div v-else-if="state.error && !state.active" class="twin-hud__msg error" role="alert">
        {{ state.error }}
      </div>
      <template v-else>
        <ol>
          <li
            v-for="(s, i) in scenario.steps"
            :key="s.title"
            :class="{ active: i === state.step, done: i < state.step }"
            @click="emit('step', i)"
          >
            <i>{{ i < state.step ? '✓' : i + 1 }}</i><span>{{ s.title }}</span>
            <b
              v-if="i === state.step"
              class="twin-hud__bar"
              :style="{ '--p': `${state.stepProgress * 100}%` }"
            ></b>
          </li>
        </ol>
        <p class="twin-hud__narration">{{ current.detail }}</p>
        <div class="twin-hud__ctrl">
          <button
            type="button"
            :disabled="state.step <= 0"
            title="上一步（←）"
            aria-label="上一步"
            @click="emit('step', state.step - 1)"
          >
            ‹
          </button>
          <button
            type="button"
            class="main"
            :class="{ on: state.playing }"
            title="播放 / 暂停（空格）"
            @click="emit('play')"
          >
            {{ state.finished ? '重新推演' : state.playing ? '暂停推演' : '继续推演' }}
          </button>
          <button
            type="button"
            :disabled="state.step >= scenario.steps.length - 1"
            title="下一步（→）"
            aria-label="下一步"
            @click="emit('step', state.step + 1)"
          >
            ›
          </button>
          <select
            :value="state.rate"
            aria-label="推演倍速"
            @change="emit('rate', Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 4)"
          >
            <option :value="1">1×</option>
            <option :value="2">2×</option>
            <option :value="4">4×</option>
          </select>
        </div>
      </template>
    </section>

    <section
      v-if="state.active"
      class="twin-hud__data"
      aria-label="实时遥测与联动设备"
      @pointerdown.stop
      @wheel.stop
    >
      <div class="twin-hud__live">
        <i></i>仿真遥测 · 步骤 {{ state.step + 1 }}/{{ scenario.steps.length }}
      </div>
      <div class="twin-hud__telemetry">
        <div v-for="t in state.telemetry" :key="t.key" :class="t.level">
          <em>{{ t.label }}</em><b>{{ t.value }}</b>
          <span class="meter"><span :style="{ width: `${t.ratio * 100}%` }"></span></span>
        </div>
      </div>
      <div class="twin-hud__devices">
        <div v-for="d in state.devices" :key="d.name" :class="d.level">
          <span>{{ d.name }}</span><b>{{ d.value }}</b>
        </div>
      </div>
    </section>

    <div
      v-if="state.active"
      class="twin-hud__stage-banner"
      aria-live="polite"
    >
      <span class="stage-pill">STEP 0{{ state.step + 1 }}</span>
      <strong>{{ current.title }}</strong>
      <span class="stage-sep">｜</span>
      <span class="stage-desc">{{ current.detail }}</span>
    </div>

    <nav
      v-if="state.active"
      class="twin-hud__views"
      aria-label="仿真视角"
      @pointerdown.stop
      @wheel.stop
    >
      <button
        v-for="v in views"
        :key="v.id"
        type="button"
        :class="{ on: state.view === v.id }"
        :title="v.tip"
        @click="emit('view', v.id)"
      >
        {{ v.label }}
      </button>
      <button
        v-if="state.view === 'overview'"
        type="button"
        :class="{ on: state.orbit }"
        title="全景视角下自动环绕事件点；拖拽场景即接管"
        @click="emit('orbit', !state.orbit)"
      >
        自动环绕
      </button>
      <span class="sep" aria-hidden="true"></span>
      <button
        type="button"
        class="vr"
        :class="{ on: state.stereo }"
        title="立体分屏 VR（可配合 Cardboard 等头显观看）"
        @click="emit('stereo', !state.stereo)"
      >
        {{ state.stereo ? '退出 VR' : 'VR 分屏' }}
      </button>
      <span class="keys">空格 播放 · ← → 步骤 · Esc 退出</span>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TwinScenario } from '../config/twinScenarios'
import type { TwinSimState, TwinView } from '../composables/useTwinSimulation'

const props = defineProps<{
  state: TwinSimState
  scenario: TwinScenario
}>()
const emit = defineEmits<{
  (e: 'play'): void
  (e: 'step', step: number): void
  (e: 'view', view: TwinView): void
  (e: 'rate', rate: 1 | 2 | 4): void
  (e: 'orbit', on: boolean): void
  (e: 'stereo', on: boolean): void
  (e: 'exit'): void
}>()

const current = computed(
  () => props.scenario.steps[Math.min(props.state.step, props.scenario.steps.length - 1)],
)

const views = computed<{ id: TwinView; label: string; tip: string }[]>(() =>
  props.scenario.id === 'patrol'
    ? [
        { id: 'walk', label: '第一人称', tip: '沿下层真实路面巡检行进' },
        { id: 'overview', label: '全景透视', tip: '结构透视俯瞰整段竣工模型' },
      ]
    : [
        { id: 'overview', label: '全景透视', tip: '结构透视 + 环绕观察事件全貌' },
        { id: 'event', label: '事件近景', tip: '模型内部近距离观察事件点' },
        { id: 'walk', label: '第一人称', tip: '从上游沿路面行进驶近事件点' },
      ],
)

const viewLabel = computed(
  () => views.value.find((v) => v.id === props.state.view)?.label ?? '',
)
</script>

<style scoped lang="scss">
.twin-hud {
  --hud-bg: linear-gradient(155deg, rgba(6, 20, 44, 0.88), rgba(3, 11, 26, 0.9));
  --hud-line: rgba(88, 214, 255, 0.42);
  --hud-ok: #2ee6a0;
  --hud-warn: #ffb03a;
  --hud-alarm: #ff5f6b;
  --hud-font: clamp(11px, 0.62vw + 4px, 13px);
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  font-size: var(--hud-font);
  color: #e2f0ff;
}
.twin-hud section,
.twin-hud nav {
  position: absolute;
  pointer-events: auto;
  background: var(--hud-bg);
  border: 1px solid var(--hud-line);
  border-radius: 10px;
  backdrop-filter: blur(10px);
  box-shadow:
    0 12px 32px rgba(0, 4, 14, 0.55),
    inset 0 1px 0 rgba(160, 230, 255, 0.18);
}
.twin-hud__stage-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(560px, calc(100% - 620px));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(6, 22, 48, 0.92), rgba(12, 38, 76, 0.88), rgba(6, 22, 48, 0.92));
  border: 1px solid rgba(94, 224, 255, 0.52);
  box-shadow: 0 6px 22px rgba(0, 8, 24, 0.55), 0 0 16px rgba(56, 182, 255, 0.18);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  .stage-pill {
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #03152c;
    background: linear-gradient(90deg, #4ee6ff, #38b6ff);
  }
  strong {
    color: #ffffff;
    font-size: 13px;
    letter-spacing: 0.03em;
    text-shadow: 0 0 10px rgba(78, 230, 255, 0.45);
  }
  .stage-sep { color: rgba(130, 190, 255, 0.45); }
  .stage-desc {
    color: #b9deff;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
.twin-hud__brief {
  top: 12px;
  left: 12px;
  width: min(304px, 42%);
  padding: 11px 13px;
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(90, 175, 255, 0.18);
    div { flex: 1; min-width: 0; }
    strong {
      display: block;
      font-size: 1.18em;
      letter-spacing: 0.04em;
      color: #f6fbff;
      text-shadow: 0 0 12px rgba(78, 190, 255, 0.4);
    }
    small { color: #8ab4dc; font-size: 0.9em; }
  }
  ol { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  li {
    position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 8px;
    border-radius: 6px; cursor: pointer; color: #95b2d4; overflow: hidden;
    border: 1px solid transparent;
    transition: background 0.2s, color 0.2s, border-color 0.2s;
    i {
      width: 19px; height: 19px; flex: none; border-radius: 50%;
      display: grid; place-items: center; font-style: normal; font-size: 10px; font-weight: 700;
      background: rgba(78, 160, 255, 0.16); color: #a8d0f8;
    }
    &:hover { background: rgba(78, 160, 255, 0.12); }
    &.done { color: #a8dec4; i { background: rgba(46, 230, 160, 0.2); color: var(--hud-ok); } }
    &.active {
      color: #ffffff;
      font-weight: 600;
      background: linear-gradient(90deg, rgba(56, 168, 255, 0.26), rgba(20, 68, 130, 0.14));
      border-color: rgba(88, 214, 255, 0.38);
      i { background: linear-gradient(135deg, #56ecff, #2f9bff); color: #03132b; font-weight: 800; }
    }
  }
}
.twin-hud__bar {
  position: absolute; left: 0; bottom: 0; height: 2.5px; width: var(--p);
  background: linear-gradient(90deg, #38b6ff, #56ffc6); transition: width 0.25s linear;
}
.twin-hud__dot {
  width: 9px; height: 9px; border-radius: 50%; background: #6f8cae; flex: none;
  &.live {
    background: var(--hud-alarm);
    box-shadow: 0 0 10px var(--hud-alarm);
    animation: hudBlink 1.2s infinite;
  }
}
.twin-hud__exit {
  border: 1px solid rgba(255, 95, 107, 0.55); background: rgba(255, 95, 107, 0.16);
  color: #ffc2c7; border-radius: 5px; padding: 3px 10px; cursor: pointer; font-size: 12px; font-weight: 600;
  &:hover { background: rgba(255, 95, 107, 0.32); }
}
.twin-hud__msg {
  margin-top: 8px; padding: 8px; border-radius: 4px; color: #b8d4f5;
  background: rgba(78, 160, 255, 0.1);
  &.error { color: #ffb3b9; background: rgba(255, 95, 107, 0.12); }
}
.twin-hud__narration {
  margin: 8px 0 0; padding: 8px 10px; line-height: 1.58; color: #d8ecff; font-size: 12px;
  background: linear-gradient(90deg, rgba(56, 168, 255, 0.14), rgba(14, 38, 78, 0.25));
  border-left: 3px solid #4ee6ff; border-radius: 4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}
.twin-hud__ctrl {
  display: flex; gap: 6px; margin-top: 8px;
  button, select {
    border: 1px solid var(--hud-line); background: rgba(20, 48, 98, 0.6); color: #cfe3ff;
    border-radius: 4px; height: 26px; min-width: 30px; cursor: pointer; font-size: 14px;
    &:disabled { opacity: 0.35; cursor: not-allowed; }
  }
  select { font-size: 12px; padding: 0 4px; }
  .main { flex: 1; font-size: 12px; }
  .main.on { border-color: rgba(46, 230, 160, 0.6); color: var(--hud-ok); background: rgba(46, 230, 160, 0.12); }
}
.twin-hud__data {
  top: 12px;
  right: 12px;
  width: min(260px, 36%);
  padding: 10px 12px;
}
.twin-hud__live {
  display: flex; align-items: center; gap: 6px; color: #8fb3d9; font-size: 0.9em;
  i { width: 7px; height: 7px; border-radius: 50%; background: var(--hud-alarm); animation: hudBlink 1.2s infinite; }
}
@keyframes hudBlink { 50% { opacity: 0.25; } }
.twin-hud__telemetry {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 8px;
  div {
    padding: 5px 6px; border-radius: 5px; background: rgba(8, 24, 48, 0.7);
    border: 1px solid rgba(78, 160, 255, 0.18);
    em { display: block; font-style: normal; font-size: 0.82em; color: #8eabc8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    b { font-size: 1.08em; white-space: nowrap; font-variant-numeric: tabular-nums; }
    &.ok { --tone: var(--hud-ok); }
    &.warn { --tone: var(--hud-warn); }
    &.alarm { --tone: var(--hud-alarm); }
    b { color: var(--tone); }
  }
  .meter {
    display: block; height: 3px; margin-top: 4px; border-radius: 2px; background: rgba(78, 160, 255, 0.15);
    span { display: block; height: 100%; border-radius: 2px; background: var(--tone); transition: width 0.3s; }
  }
}
.twin-hud__devices {
  display: flex; flex-direction: column; gap: 4px; margin-top: 8px;
  div {
    display: flex; justify-content: space-between; gap: 8px; padding: 5px 7px;
    border-radius: 5px; background: rgba(8, 24, 48, 0.5); color: #b7cce8;
    b { font-weight: 700; white-space: nowrap; }
    &.ok b { color: var(--hud-ok); }
    &.warn b { color: var(--hud-warn); }
    &.alarm b { color: var(--hud-alarm); }
  }
}
.twin-hud__views {
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  white-space: nowrap;
  button {
    border: 1px solid var(--hud-line); background: rgba(20, 48, 98, 0.55); color: #cfe3ff;
    border-radius: 4px; height: 26px; padding: 0 10px; cursor: pointer; font-size: 12px;
    &.on { background: #4ea6ff; border-color: #4ea6ff; color: #04122e; font-weight: 700; }
    &.vr.on { background: var(--hud-ok); border-color: var(--hud-ok); }
  }
  .sep { width: 1px; height: 18px; background: var(--hud-line); }
  .keys { color: #6f8cae; font-size: 11px; margin-left: 4px; }
}
/* 立体分屏时只保留视角条，避免遮挡双目画面 */
.twin-hud.stereo {
  .twin-hud__brief, .twin-hud__data, .twin-hud__stage-banner { display: none; }
}

@media (max-height: 560px) {
  .twin-hud__narration, .twin-hud__devices, .twin-hud__views .keys { display: none; }
}
@media (max-width: 1120px) {
  .twin-hud__stage-banner { display: none; }
}
@media (max-width: 900px) {
  .twin-hud__data { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .twin-hud__dot.live, .twin-hud__live i { animation: none; }
}
</style>
