/** 南湖段桩号范围；线路 GeoJSON 为 P1(北) → Pn(南)，K2 对应南端、K4 对应北端 */
export const TUNNEL_STATION_MIN = 2100
export const TUNNEL_STATION_MAX = 4300
export const TUNNEL_STATION_INVERT = true

export function stakeToProgress(stake: string): number | null {
  const m = /K(\d)\+(\d{3})/.exec(stake)
  if (!m) return null
  const station = Number(m[1]) * 1000 + Number(m[2])
  return Math.max(0, Math.min(1, (station - TUNNEL_STATION_MIN) / (TUNNEL_STATION_MAX - TUNNEL_STATION_MIN)))
}
