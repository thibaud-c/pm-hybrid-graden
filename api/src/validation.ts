import { createHash, randomBytes } from 'node:crypto'
import { parseBuffer } from 'music-metadata'
import type { Feeling, ObservationInput } from './types.js'

export const MAX_MEDIA_BYTES = 4_000_000
export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000

const feelings = new Set<Feeling>([
  'laughter', 'joy', 'calm', 'curiosity', 'surprise',
  'fear', 'sadness', 'anger', 'disgust', 'neutral',
])

export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex')

export const normalizeCode = (code: string) => code.trim().toUpperCase()
export const createToken = () => randomBytes(32).toString('base64url')

export function parseObservation(value: unknown): ObservationInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid observation')
  const input = value as Record<string, unknown>
  const number = (key: string) => {
    const result = input[key]
    if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error(`Invalid ${key}`)
    return result
  }

  const latitude = number('latitude')
  const longitude = number('longitude')
  const plantReading = number('plantReading')
  const accuracy = input.accuracyM
  const color = typeof input.sensorColor === 'string' ? input.sensorColor.toUpperCase() : ''
  const comment = typeof input.comment === 'string' ? input.comment.trim() || null : null
  const feeling = input.feeling === null || input.feeling === undefined || input.feeling === ''
    ? null
    : input.feeling

  if (latitude < -90 || latitude > 90) throw new Error('Invalid latitude')
  if (longitude < -180 || longitude > 180) throw new Error('Invalid longitude')
  if (plantReading < 0 || plantReading > 1) throw new Error('Plant Reading must be between 0 and 1')
  if (accuracy !== null && accuracy !== undefined &&
      (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0)) {
    throw new Error('Invalid GPS accuracy')
  }
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error('Invalid Sensor Color')
  if (comment && comment.length > 500) throw new Error('Comment is limited to 500 characters')
  if (feeling !== null && (typeof feeling !== 'string' || !feelings.has(feeling as Feeling))) {
    throw new Error('Invalid Observer Feeling')
  }

  return {
    latitude,
    longitude,
    accuracy_m: accuracy as number | null | undefined ?? null,
    plant_reading: plantReading,
    sensor_color: color,
    feeling: feeling as Feeling | null,
    comment,
  }
}

export function mediaExtension(mimeType: string, kind: 'photo' | 'audio') {
  const mime = mimeType.split(';')[0].trim().toLowerCase()
  if (kind === 'photo' && mime === 'image/jpeg') return { mime, extension: 'jpg' }
  const audioTypes: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
    'audio/x-m4a': 'm4a',
  }
  if (kind === 'audio' && audioTypes[mime]) return { mime, extension: audioTypes[mime] }
  if (kind === 'audio' && mime.startsWith('audio/')) {
    const extension = mime.slice('audio/'.length).replace(/^x-/, '').replace(/[^a-z0-9]/g, '')
    if (extension) return { mime, extension }
  }
  throw new Error(`Unsupported ${kind} format`)
}

export async function validateAudioDuration(bytes: ArrayBuffer, mime: string) {
  let duration: number | undefined
  try {
    const metadata = await parseBuffer(new Uint8Array(bytes), { mimeType: mime, size: bytes.byteLength }, {
      duration: true,
      skipCovers: true,
    })
    duration = metadata.format.duration
  } catch {
    // ponytail: accept browser audio the parser cannot inspect; add transcoding only if the size cap proves insufficient.
    return undefined
  }
  if (!duration || !Number.isFinite(duration)) return undefined
  if (duration > 60) throw new Error('Voice Notes are limited to 60 seconds')
  return duration
}
