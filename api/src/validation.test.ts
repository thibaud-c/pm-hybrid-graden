import { describe, expect, test } from 'bun:test'
import app from './app.js'
import { hash, mediaExtension, normalizeCode, parseObservation, validateAudioDuration } from './validation.js'

function wav(seconds: number) {
  const sampleRate = 8_000
  const dataSize = sampleRate * seconds
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, dataSize, true)
  return bytes.buffer
}

describe('API trust boundaries', () => {
  test('normalizes and hashes Access Codes consistently', () => {
    expect(hash(normalizeCode(' hybrid-1 '))).toBe(
      '71bb23900ae187d37c9b2d9e1e8270a25cb1cfeca6a9a83bbb0a7663c5d19c1f',
    )
  })

  test('accepts a valid Observation and normalizes its color', () => {
    expect(parseObservation({
      latitude: 47.07,
      longitude: 15.44,
      plantReading: 0.75,
      sensorColor: '#a0b1c2',
      feeling: 'curiosity',
      comment: ' hello ',
    })).toEqual({
      latitude: 47.07,
      longitude: 15.44,
      accuracy_m: null,
      plant_reading: 0.75,
      sensor_color: '#A0B1C2',
      feeling: 'curiosity',
      comment: 'hello',
    })
  })

  test('rejects invalid numeric and categorical input', () => {
    expect(() => parseObservation({
      latitude: 100,
      longitude: 15,
      plantReading: -1,
      sensorColor: '#000000',
    })).toThrow()
    expect(() => parseObservation({
      latitude: 47,
      longitude: 15,
      plantReading: 1.01,
      sensorColor: '#000000',
    })).toThrow('Plant Reading must be between 0 and 1')
  })

  test('uses the actual supported audio MIME type', () => {
    expect(mediaExtension('audio/webm;codecs=opus', 'audio')).toEqual({ mime: 'audio/webm', extension: 'webm' })
    expect(mediaExtension('audio/aac', 'audio')).toEqual({ mime: 'audio/aac', extension: 'aac' })
    expect(mediaExtension('audio/x-caf', 'audio')).toEqual({ mime: 'audio/x-caf', extension: 'caf' })
    expect(() => mediaExtension('video/mp4', 'audio')).toThrow()
  })

  test('reads the uploaded audio and rejects recordings longer than 60 seconds', async () => {
    expect(await validateAudioDuration(wav(12), 'audio/wav')).toBe(12)
    await expect(validateAudioDuration(wav(61), 'audio/wav')).rejects.toThrow('60 seconds')
  })

  test('accepts audio when its duration metadata cannot be read', async () => {
    expect(await validateAudioDuration(new Uint8Array([1, 2, 3]).buffer, 'audio/webm')).toBeUndefined()
  })

  test('reports unavailable dependencies without leaking configuration', async () => {
    const response = await app.request('/status')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: 'unavailable',
      services: { api: 'healthy', supabase: 'unavailable', googleDrive: 'unavailable' },
    })
  })

  test('rejects missing authentication before touching storage', async () => {
    const response = await app.request('/auth/session')
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { message: 'Missing session token' } })
  })

  test('rejects a missing Access Code before touching storage', async () => {
    const response = await app.request('/auth/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { message: 'Access Code is required' } })
  })
})
