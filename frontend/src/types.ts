export const feelings = [
  ['laughter', '😂', 'Laughter'],
  ['joy', '😊', 'Joy'],
  ['calm', '😌', 'Calm'],
  ['curiosity', '🤔', 'Curiosity'],
  ['surprise', '😮', 'Surprise'],
  ['fear', '😨', 'Fear'],
  ['sadness', '😢', 'Sadness'],
  ['anger', '😡', 'Anger'],
  ['disgust', '🤢', 'Disgust'],
  ['neutral', '😐', 'Neutral'],
] as const

export type Feeling = typeof feelings[number][0]
export type SessionKind = 'event' | 'temporary' | 'global'

export type SessionInfo = {
  kind: SessionKind
  eventId: string | null
  eventCode: string | null
  privacyAcknowledged: boolean
  eventStatus: 'open' | 'closed' | null
  expiresAt: string | null
}

export type Location = { latitude: number; longitude: number; accuracyM: number | null }

export type Observation = Location & {
  id: string
  plantReading: number
  sensorColor: string
  feeling: Feeling | null
  comment: string | null
  hasPhoto: boolean
  hasAudio: boolean
  createdAt: string
}

export type ObservationInput = Location & {
  plantReading: number
  sensorColor: string
  feeling: Feeling | null
  comment: string | null
}

export type ObservationSave = ObservationInput & {
  photo: Blob | null
  audio: Blob | null
  removePhoto: boolean
  removeAudio: boolean
}
