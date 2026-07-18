import { expect, test } from 'bun:test'
import { h3Resolution, measurementRadius, POINT_RADIUS_EQUAL, POINT_RADIUS_MAX } from './mapMath'

test('uses a fixed radius when all Plant Readings are equal', () => {
  expect(measurementRadius(2, [2, 2, 2])).toBe(POINT_RADIUS_EQUAL)
})

test('clamps extreme readings at the 95th percentile radius', () => {
  const values = Array.from({ length: 20 }, (_, index) => index + 1).concat(10_000)
  expect(measurementRadius(10_000, values)).toBe(POINT_RADIUS_MAX)
})

test('uses finer H3 cells when zooming in', () => {
  expect(h3Resolution(16, 47)).toBeGreaterThan(h3Resolution(8, 47))
})
