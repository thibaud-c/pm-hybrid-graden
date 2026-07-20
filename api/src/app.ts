import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import type { MiddlewareHandler } from 'hono'
import { Database } from './db.js'
import { Drive } from './drive.js'
import type { ObservationRow, Session } from './types.js'
import {
  createToken,
  DRAFT_LIFETIME_MS,
  hash,
  MAX_MEDIA_BYTES,
  mediaExtension,
  normalizeCode,
  parseObservation,
  validateAudioDuration,
} from './validation'

type Variables = { session: Session }
export type AppDatabase = Pick<Database,
  | 'configured' | 'health' | 'findAccessCode' | 'createSession' | 'findSession'
  | 'eventDetails' | 'acknowledgePrivacy' | 'touchSession' | 'createDraft'
  | 'getObservation' | 'getOwnedObservation' | 'updateOwnedObservation' | 'finalizeDraft'
  | 'listObservations' | 'deleteObservation' | 'expiredDrafts' | 'expiredTemporarySessions'
  | 'observationsForSession' | 'deleteSession'
>
export type AppDrive = Pick<Drive, 'configured' | 'health' | 'upload' | 'download' | 'delete'>

export function createApp(options: {
  db?: AppDatabase
  drive?: AppDrive
  env?: NodeJS.ProcessEnv
} = {}) {
const env = options.env ?? process.env
const defaultDb = new Database(env)
const db = options.db ?? defaultDb
const drive = options.drive ?? new Drive(defaultDb, env)
const app = new Hono<{ Variables: Variables }>()

const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use('*', secureHeaders())
app.use('*', cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : undefined,
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}))

const fail = (status: 400 | 401 | 403 | 404 | 409 | 413 | 500 | 503, message: string): never => {
  throw new HTTPException(status, { message })
}

const clientInput = <T>(operation: () => T): T => {
  try {
    return operation()
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : 'Invalid input')
  }
}

const sessionResponse = async (session: Session) => {
  const event = session.event_id ? await db.eventDetails(session.event_id) : null
  return {
    kind: session.kind,
    eventId: session.event_id,
    eventCode: event?.event_code ?? null,
    privacyAcknowledged: Boolean(session.privacy_acknowledged_at),
    eventStatus: event?.status ?? null,
    expiresAt: session.expires_at,
  }
}

const authenticate: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const authorization = c.req.header('Authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) fail(401, 'Missing session token')
  const session = await db.findSession(hash(token!))
  if (!session || session.revoked_at) fail(401, 'Invalid session token')
  const expired = session.expires_at && Date.parse(session.expires_at) <= Date.now()
  const temporaryExpired = session.kind === 'temporary' &&
    Date.parse(session.last_write_at) + DRAFT_LIFETIME_MS <= Date.now()
  if (expired || temporaryExpired) fail(401, 'Session expired')
  c.set('session', session)
  await next()
}

const ensureWrite = async (session: Session) => {
  if (session.kind === 'global') fail(403, 'This session is read-only')
  if (!session.privacy_acknowledged_at) fail(403, 'Privacy acknowledgement required')
  if (session.event_id && (await db.eventDetails(session.event_id))?.status !== 'open') {
    fail(403, 'This Collection Event is closed')
  }
}

const publicObservation = (row: ObservationRow) => ({
  id: row.id,
  latitude: row.latitude,
  longitude: row.longitude,
  accuracyM: row.accuracy_m,
  plantReading: row.plant_reading,
  sensorColor: row.sensor_color,
  feeling: row.feeling,
  comment: row.comment,
  hasPhoto: Boolean(row.photo_drive_id),
  hasAudio: Boolean(row.audio_drive_id),
  createdAt: row.created_at,
})

const deleteFiles = async (observation: ObservationRow) => {
  if (observation.photo_drive_id) await drive.delete(observation.photo_drive_id)
  if (observation.audio_drive_id) await drive.delete(observation.audio_drive_id)
}

const deleteSessionData = async (sessionId: string) => {
  for (const observation of await db.observationsForSession(sessionId)) {
    await deleteFiles(observation)
  }
  await db.deleteSession(sessionId)
}

app.get('/', (c) => c.json({ name: 'pm-hybrid-garden-api' }))

app.get('/status', async (c) => {
  const check = async (configured: boolean, operation: () => Promise<void>) => {
    if (!configured) return 'unavailable' as const
    try {
      await operation()
      return 'healthy' as const
    } catch {
      return 'unavailable' as const
    }
  }
  const [supabase, googleDrive] = await Promise.all([
    check(db.configured, () => db.health()),
    check(db.configured && drive.configured, () => drive.health()),
  ])
  const overall = supabase === 'healthy' && googleDrive === 'healthy'
    ? 'healthy'
    : supabase === 'unavailable' && googleDrive === 'unavailable'
      ? 'unavailable'
      : 'degraded'
  return c.json({ status: overall, services: { api: 'healthy', supabase, googleDrive } }, overall === 'unavailable' ? 503 : 200)
})

app.post('/auth/code', async (c) => {
  const body = await c.req.json().catch(() => null) as null | {
    code?: unknown
    purpose?: unknown
    privacyAcknowledged?: unknown
  }
  const codeValue = typeof body?.code === 'string' ? body.code : null
  if (!codeValue) fail(400, 'Access Code is required')
  const purpose = body?.purpose === 'stats' ? 'stats' : 'collect'
  const privacyAcknowledged = body?.privacyAcknowledged === true
  const code = await db.findAccessCode(hash(normalizeCode(codeValue!)))
  if (!code) fail(401, 'Invalid Access Code')
  if (purpose === 'collect' && code.kind === 'global') fail(403, 'This code is read-only')
  if (purpose === 'collect' && !privacyAcknowledged) {
    fail(400, 'Privacy acknowledgement is required')
  }
  const token = createToken()
  const session = await db.createSession(code, hash(token), privacyAcknowledged)
  return c.json({ token, session: await sessionResponse(session) }, 201)
})

app.get('/auth/session', authenticate, async (c) =>
  c.json({ session: await sessionResponse(c.get('session')) }))

app.post('/auth/privacy', authenticate, async (c) => {
  const session = c.get('session')
  if (session.kind === 'global') fail(403, 'This session is read-only')
  const updated = await db.acknowledgePrivacy(session.id)
  return c.json({ session: await sessionResponse(updated) })
})

app.use('/observations', authenticate)
app.use('/observations/*', authenticate)

app.get('/observations', async (c) => {
  const view = c.req.query('view') === 'collection' ? 'collection' : 'stats'
  const session = c.get('session')
  if (view === 'collection' && session.kind === 'global') fail(403, 'This session is read-only')
  const observations = await db.listObservations(session, view)
  return c.json({ observations: observations.map(publicObservation) })
})

app.post('/observations/drafts', async (c) => {
  const session = c.get('session')
  await ensureWrite(session)
  const body = await c.req.json().catch(() => null)
  const input = clientInput(() => parseObservation(body))
  const draft = await db.createDraft(session, input)
  await db.touchSession(session.id)
  return c.json({ id: draft.id }, 201)
})

app.patch('/observations/:id', async (c) => {
  const session = c.get('session')
  await ensureWrite(session)
  const body = await c.req.json().catch(() => null)
  const input = clientInput(() => parseObservation(body))
  const updated = await db.updateOwnedObservation(c.req.param('id'), session.id, input)
  if (!updated) fail(404, 'Observation not found')
  await db.touchSession(session.id)
  return c.json({ observation: publicObservation(updated) })
})

app.post('/observations/:id/finalize', async (c) => {
  const session = c.get('session')
  await ensureWrite(session)
  const id = c.req.param('id')
  const observation = await db.finalizeDraft(id, session.id) ?? await db.getOwnedObservation(id, session.id)
  if (!observation || observation.status !== 'finalized') fail(409, 'Observation could not be finalized')
  await db.touchSession(session.id)
  return c.json({ observation: publicObservation(observation) })
})

for (const kind of ['photo', 'audio'] as const) {
  app.put(`/observations/:id/${kind}`, async (c) => {
    const session = c.get('session')
    await ensureWrite(session)
    const observation = await db.getOwnedObservation(c.req.param('id'), session.id)
    if (!observation) fail(404, 'Observation not found')
    const declaredLength = Number(c.req.header('Content-Length') ?? 0)
    if (declaredLength > MAX_MEDIA_BYTES) fail(413, 'Media is limited to 4 MB')
    const bytes = await c.req.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_BYTES) fail(413, 'Media is limited to 4 MB')
    const { mime, extension } = clientInput(() => mediaExtension(c.req.header('Content-Type') ?? '', kind))
    if (kind === 'audio') {
      try {
        await validateAudioDuration(bytes, mime)
      } catch (error) {
        fail(400, error instanceof Error ? error.message : 'Invalid Voice Note')
      }
    }
    const previousId = observation[`${kind}_drive_id`]
    const driveId = await drive.upload(`${kind === 'photo' ? 'cam' : 'audio'}_${observation.id}.${extension}`, mime, bytes)
    try {
      await db.updateOwnedObservation(observation.id, session.id, {
        [`${kind}_drive_id`]: driveId,
        [`${kind}_mime_type`]: mime,
        [`${kind}_extension`]: extension,
      })
    } catch (error) {
      await drive.delete(driveId)
      throw error
    }
    if (previousId) await drive.delete(previousId)
    await db.touchSession(session.id)
    return c.json({ uploaded: true })
  })

  app.delete(`/observations/:id/${kind}`, async (c) => {
    const session = c.get('session')
    await ensureWrite(session)
    const observation = await db.getOwnedObservation(c.req.param('id'), session.id)
    if (!observation) fail(404, 'Observation not found')
    const fileId = observation[`${kind}_drive_id`]
    if (fileId) await drive.delete(fileId)
    await db.updateOwnedObservation(observation.id, session.id, {
      [`${kind}_drive_id`]: null,
      [`${kind}_mime_type`]: null,
      [`${kind}_extension`]: null,
    })
    await db.touchSession(session.id)
    return c.body(null, 204)
  })
}

app.get('/observations/:id/media/:kind', async (c) => {
  const kind = c.req.param('kind')
  if (kind !== 'photo' && kind !== 'audio') fail(404, 'Media not found')
  const session = c.get('session')
  const observation = await db.getObservation(c.req.param('id'))
  if (!observation || observation.status !== 'finalized') fail(404, 'Media not found')
  const allowed = session.kind === 'global'
    ? !observation.is_temporary
    : session.kind === 'temporary'
      ? observation.collection_session_id === session.id
      : observation.event_id === session.event_id
  if (!allowed) fail(403, 'Media is outside this statistics scope')
  const fileId = kind === 'photo' ? observation.photo_drive_id : observation.audio_drive_id
  const mimeType = kind === 'photo' ? observation.photo_mime_type : observation.audio_mime_type
  const authorizedFileId = fileId ?? fail(404, 'Media not found')
  const authorizedMimeType = mimeType ?? fail(404, 'Media not found')
  const file = await drive.download(authorizedFileId)
  return new Response(file.body, {
    headers: {
      'Content-Type': authorizedMimeType,
      'Cache-Control': 'private, max-age=300',
    },
  })
})

app.delete('/observations/:id', async (c) => {
  const session = c.get('session')
  await ensureWrite(session)
  const observation = await db.getOwnedObservation(c.req.param('id'), session.id)
  if (!observation) fail(404, 'Observation not found')
  await deleteFiles(observation)
  await db.deleteObservation(observation.id)
  await db.touchSession(session.id)
  return c.body(null, 204)
})

app.delete('/temporary-session', authenticate, async (c) => {
  const session = c.get('session')
  if (session.kind !== 'temporary') fail(403, 'This is not a Temporary Collection Session')
  await deleteSessionData(session.id)
  return c.body(null, 204)
})

app.get('/cron/cleanup', async (c) => {
  const secret = env.CRON_SECRET
  if (!secret || c.req.header('Authorization') !== `Bearer ${secret}`) fail(401, 'Invalid cron authorization')
  const cutoff = new Date(Date.now() - DRAFT_LIFETIME_MS).toISOString()
  let deletedDrafts = 0
  let deletedTemporarySessions = 0

  for (const draft of await db.expiredDrafts(cutoff)) {
    await deleteFiles(draft)
    await db.deleteObservation(draft.id)
    deletedDrafts++
  }
  for (const session of await db.expiredTemporarySessions(cutoff)) {
    await deleteSessionData(session.id)
    deletedTemporarySessions++
  }
  return c.json({ deletedDrafts, deletedTemporarySessions })
})

app.notFound((c) => c.json({ error: { message: 'Not found' } }, 404))
app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500
  if (!(error instanceof HTTPException)) console.error(error)
  return c.json({ error: { message: error.message || 'Unexpected error' } }, status)
})

return app
}

export default createApp()
