export type SessionKind = 'event' | 'temporary' | 'global'
export type Feeling =
  | 'laughter'
  | 'joy'
  | 'calm'
  | 'curiosity'
  | 'surprise'
  | 'fear'
  | 'sadness'
  | 'anger'
  | 'disgust'
  | 'neutral'

export type Session = {
  id: string
  kind: SessionKind
  event_id: string | null
  privacy_acknowledged_at: string | null
  last_write_at: string
  expires_at: string | null
  revoked_at: string | null
}

export type ObservationRow = {
  id: string
  collection_session_id: string
  event_id: string | null
  is_temporary: boolean
  status: 'draft' | 'finalized'
  latitude: number
  longitude: number
  accuracy_m: number | null
  plant_reading: number
  sensor_color: string
  feeling: Feeling | null
  comment: string | null
  photo_drive_id: string | null
  photo_mime_type: string | null
  photo_extension: string | null
  audio_drive_id: string | null
  audio_mime_type: string | null
  audio_extension: string | null
  created_at: string | null
  updated_at: string
}

export type ObservationInput = Pick<
  ObservationRow,
  'latitude' | 'longitude' | 'accuracy_m' | 'plant_reading' | 'sensor_color' | 'feeling' | 'comment'
>
