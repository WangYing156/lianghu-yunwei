import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

export interface MapPopupHistoryPoint {
  time: string
  value: number
}

export interface MapPopupPayload {
  name: string
  icon: string
  kindLabel: string
  groupLabel: string
  statusLabel: string
  statusTone: 'ok' | 'warn' | 'alarm' | 'offline'
  stake: string
  value?: string
  inspect?: string
  alarm?: string
  unit?: string
  history?: MapPopupHistoryPoint[]
}

const STATUS_CLASS: Record<MapPopupPayload['statusTone'], string> = {
  ok: 'is-ok',
  warn: 'is-warn',
  alarm: 'is-alarm',
  offline: 'is-offline'
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type PopupRoot = HTMLDivElement & {
  __chart?: echarts.ECharts
  __chartRo?: ResizeObserver
  __chartData?: MapPopupPayload
}

/** 构建与平台玻璃态一致的 Popup DOM */
export function createMapPopupElement(
  data: MapPopupPayload,
  actions?: { onClose?: () => void; onVideo?: () => void }
): HTMLDivElement {
  const root = document.createElement('div') as PopupRoot
  root.className = 'pd-shell pd-shell--popup'
  root.__chartData = data
  root.innerHTML = `
    <div class="pd-header">
      <div class="pd-icon-wrap">${esc(data.icon)}</div>
      <div class="pd-titles">
        <div class="pd-name">${esc(data.name)}</div>
        <div class="pd-meta">${esc(data.kindLabel)} · ${esc(data.groupLabel)}</div>
      </div>
      <span class="pd-status-tag ${STATUS_CLASS[data.statusTone]}">${esc(data.statusLabel)}</span>
    </div>
    <div class="pd-body">
      <div class="pd-grid">
        <div class="pd-cell">
          <div class="pd-label">桩号位置</div>
          <div class="pd-val">${esc(data.stake)}</div>
        </div>
        <div class="pd-cell">
          <div class="pd-label">实时数值</div>
          <div class="pd-val">${esc(data.value || '—')}</div>
        </div>
        <div class="pd-cell">
          <div class="pd-label">最近巡检</div>
          <div class="pd-val">${esc(data.inspect || '—')}</div>
        </div>
        <div class="pd-cell${data.alarm ? ' alarm-cell' : ''}">
          <div class="pd-label">关联告警</div>
          <div class="pd-val">${esc(data.alarm || '无')}</div>
        </div>
      </div>
      ${
        data.history?.length
          ? `
      <div class="pd-chart-wrap">
        <div class="pd-chart-title">
          <span>数值变化趋势</span>
          <span class="pd-chart-unit">${esc(data.unit || '')}</span>
        </div>
        <div class="pd-chart" data-chart-host></div>
      </div>`
          : ''
      }
    </div>
    <div class="pd-foot">
      <button type="button" class="pd-btn pd-btn--ghost" data-action="close">关闭</button>
      <button type="button" class="pd-btn pd-btn--primary" data-action="video">调取实时视频</button>
    </div>
  `

  const bindAction = (action: string, fn?: () => void) => {
    const btn = root.querySelector(`[data-action=${action}]`)
    if (!btn || !fn) return
    const handler = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e as MouseEvent).stopImmediatePropagation?.()
      fn()
    }
    btn.addEventListener('pointerdown', handler)
    btn.addEventListener('click', handler)
  }
  bindAction('close', actions?.onClose)
  bindAction('video', actions?.onVideo)

  return root
}

/** 必须在 popup 插入可见 DOM 之后调用，才能正确拿到宽高并渲染 ECharts */
export function mountMapPopupChart(root: HTMLElement | null | undefined) {
  const host = root as PopupRoot | null
  if (!host?.__chartData?.history?.length) return
  const chartHost = host.querySelector('[data-chart-host]') as HTMLDivElement | null
  if (!chartHost) return

  const data = host.__chartData

  const buildOption = () => ({
    backgroundColor: 'transparent',
    grid: { left: 46, right: 16, top: 18, bottom: 26, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(12, 32, 68, 0.96)',
      borderColor: 'rgba(78, 160, 255, 0.4)',
      textStyle: { color: '#e8f4ff', fontSize: 11 },
      axisPointer: { lineStyle: { color: 'rgba(78, 230, 255, 0.5)' } }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.history!.map(x => x.time),
      axisLabel: { fontSize: 9, color: '#8fa8c8' },
      axisLine: { lineStyle: { color: 'rgba(120, 170, 230, 0.35)' } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: data.unit || '',
      nameLocation: 'end',
      nameGap: 6,
      nameTextStyle: { fontSize: 9, color: '#8fa8c8', align: 'left' },
      axisLabel: { fontSize: 9, color: '#8fa8c8' },
      splitLine: { lineStyle: { color: 'rgba(120, 170, 230, 0.12)' } }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: data.history!.map(x => x.value),
        lineStyle: { color: '#4ee6ff', width: 2 },
        itemStyle: { color: '#4ee6ff', borderColor: '#bdf6ff', borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(78, 230, 255, 0.28)' },
              { offset: 1, color: 'rgba(78, 230, 255, 0.02)' }
            ]
          }
        }
      }
    ]
  })

  let tries = 0
  const mount = () => {
    if (host.__chart) {
      host.__chart.resize()
      return
    }
    // 强制确定性尺寸，避免父级尚未 layout 完成导致宽高为 0
    chartHost.style.width = '100%'
    chartHost.style.minWidth = '240px'
    chartHost.style.height = '200px'
    if (chartHost.clientWidth <= 0 || chartHost.clientHeight <= 0) {
      if (tries++ < 60) requestAnimationFrame(mount)
      return
    }
    const inst = echarts.init(chartHost)
    inst.setOption(buildOption())
    host.__chart = inst
  }

  host.__chartRo?.disconnect()
  if (typeof ResizeObserver !== 'undefined') {
    host.__chartRo = new ResizeObserver(() => {
      if (host.__chart) host.__chart.resize()
    })
    host.__chartRo.observe(chartHost)
  }
  requestAnimationFrame(mount)
}

export function disposeMapPopupChart(root: HTMLElement | null | undefined) {
  const el = root as PopupRoot | null
  el?.__chartRo?.disconnect()
  if (el) el.__chartRo = undefined
  el?.__chart?.dispose()
  if (el) el.__chart = undefined
}
