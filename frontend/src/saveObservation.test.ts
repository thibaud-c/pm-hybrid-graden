import { expect, test } from 'bun:test'
import { saveNewObservation } from './saveObservation'
import type { ObservationSave } from './types'

const observation: ObservationSave = {
  latitude: 47.07,
  longitude: 15.44,
  accuracyM: 5,
  plantReading: 0.75,
  sensorColor: '#A0B1C2',
  feeling: 'curiosity',
  comment: 'hello',
  photo: new Blob(['photo'], { type: 'image/jpeg' }),
  audio: new Blob(['audio'], { type: 'audio/aac' }),
  removePhoto: false,
  removeAudio: false,
}

test('reuses a draft when a media upload is retried', async () => {
  let draftId: string | null = null
  let created = 0
  let audioAttempts = 0
  const operations = {
    createDraft: async () => { created++; return 'draft-1' },
    updateObservation: async () => undefined,
    uploadMedia: async (_id: string, kind: 'photo' | 'audio') => {
      if (kind === 'audio' && audioAttempts++ === 0) throw new Error('upload failed')
    },
    finalizeObservation: async () => undefined,
  }

  await expect(saveNewObservation(observation, draftId, (id) => { draftId = id }, operations)).rejects.toThrow('upload failed')
  await saveNewObservation(observation, draftId, (id) => { draftId = id }, operations)

  expect(created).toBe(1)
})
