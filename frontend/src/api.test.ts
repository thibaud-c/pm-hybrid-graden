import { expect, test } from 'bun:test'
import { ApiError, invalidatesSession } from './api'

test('only authentication failures invalidate the saved session', () => {
  expect(invalidatesSession(new ApiError('expired', 401))).toBe(true)
  expect(invalidatesSession(new ApiError('service unavailable', 503))).toBe(false)
  expect(invalidatesSession(new TypeError('network failed'))).toBe(false)
})
