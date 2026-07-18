import { getHexagonEdgeLengthAvg } from 'h3-js'

export const H3_TARGET_EDGE_PX = 50
export const POINT_RADIUS_MIN = 6
export const POINT_RADIUS_MAX = 24
export const POINT_RADIUS_EQUAL = 12

export function measurementRadius(value: number, values: number[]) {
  if (!values.length || values.every((item) => item === values[0])) return POINT_RADIUS_EQUAL
  const sorted = [...values].sort((a, b) => a - b)
  const cap = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
  const max = Math.max(cap, Number.EPSILON)
  const normalized = Math.sqrt(Math.min(value, max) / max)
  return POINT_RADIUS_MIN + normalized * (POINT_RADIUS_MAX - POINT_RADIUS_MIN)
}

export function h3Resolution(zoom: number, latitude: number) {
  const targetMetres = H3_TARGET_EDGE_PX * 156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** zoom)
  let best = 0
  let distance = Infinity
  for (let resolution = 0; resolution <= 15; resolution++) {
    const candidate = Math.abs(Math.log(getHexagonEdgeLengthAvg(resolution, 'm') / targetMetres))
    if (candidate < distance) {
      best = resolution
      distance = candidate
    }
  }
  return best
}
