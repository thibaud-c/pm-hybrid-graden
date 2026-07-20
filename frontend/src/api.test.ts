import { expect, test } from 'bun:test'
import { ApiError, invalidatesSession, uploadMedia } from './api'

test('only authentication failures invalidate the saved session', () => {
  expect(invalidatesSession(new ApiError('expired', 401))).toBe(true)
  expect(invalidatesSession(new ApiError('service unavailable', 503))).toBe(false)
  expect(invalidatesSession(new TypeError('network failed'))).toBe(false)
})

test('accepts an empty successful media upload response', async () => {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'session-token' },
  })
  globalThis.fetch = Object.assign(async () => new Response(null, { status: 200 }), {
    preconnect: originalFetch.preconnect,
  })

  try {
    await expect(uploadMedia('observation-1', 'audio', new Blob(['voice'], { type: 'audio/webm' }))).resolves.toBeUndefined()
  } finally {
    globalThis.fetch = originalFetch
    delete (globalThis as { localStorage?: Storage }).localStorage
  }
})
