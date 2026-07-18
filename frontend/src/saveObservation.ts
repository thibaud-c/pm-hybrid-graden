import {
  createDraft,
  finalizeObservation,
  updateObservation,
  uploadMedia,
} from './api'
import type { ObservationInput, ObservationSave } from './types'

type SaveOperations = {
  createDraft: (input: ObservationInput) => Promise<string>
  updateObservation: (id: string, input: ObservationInput) => Promise<unknown>
  uploadMedia: (id: string, kind: 'photo' | 'audio', blob: Blob) => Promise<unknown>
  finalizeObservation: (id: string) => Promise<unknown>
}

const apiOperations: SaveOperations = {
  createDraft,
  updateObservation,
  uploadMedia,
  finalizeObservation,
}

export async function saveNewObservation(
  value: ObservationSave,
  existingDraftId: string | null,
  rememberDraft: (id: string) => void,
  operations: SaveOperations = apiOperations,
) {
  const {
    photo,
    audio,
    removePhoto: _removePhoto,
    removeAudio: _removeAudio,
    ...input
  } = value
  const id = existingDraftId ?? await operations.createDraft(input)
  if (!existingDraftId) rememberDraft(id)
  else await operations.updateObservation(id, input)
  if (photo) await operations.uploadMedia(id, 'photo', photo)
  if (audio) await operations.uploadMedia(id, 'audio', audio)
  await operations.finalizeObservation(id)
}
