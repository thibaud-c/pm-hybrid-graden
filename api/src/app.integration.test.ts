import { describe, expect, test } from 'bun:test'
import { createApp } from './app.js'
import type { AppDatabase, AppDrive } from './app.js'
import type { Session } from './types.js'

const input = {
  latitude: 47.07,
  longitude: 15.44,
  accuracyM: 4,
  plantReading: 0.75,
  sensorColor: '#A0B1C2',
  feeling: 'curiosity',
  comment: null,
}

function testApp(status: 'open' | 'closed' = 'open') {
  const sessions = new Map<string, Session>()
  const db = {
    configured: true,
    findAccessCode: async () => ({ id: 'code-1', kind: 'event' as const, event_id: 'event-1' }),
    createSession: async (code: { kind: 'event'; event_id: string }, tokenHash: string, privacy: boolean) => {
      const session: Session = {
        id: 'session-1',
        kind: code.kind,
        event_id: code.event_id,
        privacy_acknowledged_at: privacy ? new Date().toISOString() : null,
        last_write_at: new Date().toISOString(),
        expires_at: null,
        revoked_at: null,
      }
      sessions.set(tokenHash, session)
      return session
    },
    findSession: async (tokenHash: string) => sessions.get(tokenHash) ?? null,
    eventDetails: async () => ({ status, event_code: 'HYBRID-1' }),
    acknowledgePrivacy: async (id: string) => {
      const session = [...sessions.values()].find((value) => value.id === id)!
      session.privacy_acknowledged_at = new Date().toISOString()
      return session
    },
    createDraft: async () => ({ id: 'observation-1' }),
    updateOwnedObservation: async () => null,
    touchSession: async () => undefined,
  }
  const drive = { configured: true }
  return createApp({ db: db as unknown as AppDatabase, drive: drive as AppDrive, env: {} })
}

async function login(app: ReturnType<typeof createApp>, privacyAcknowledged: boolean) {
  const response = await app.request('/auth/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'HYBRID-1', purpose: 'stats', privacyAcknowledged }),
  })
  return { response, body: await response.json() as { token: string; session: Record<string, unknown> } }
}

describe('collection session policy', () => {
  test('stats access preserves privacy acknowledgement for later collection', async () => {
    const app = testApp()
    const { response, body } = await login(app, false)
    expect(response.status).toBe(201)
    expect(body.session).toMatchObject({ privacyAcknowledged: false, eventCode: 'HYBRID-1' })

    const denied = await app.request('/observations/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(denied.status).toBe(403)

    const acknowledged = await app.request('/auth/privacy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.token}` },
    })
    expect(acknowledged.status).toBe(200)

    const created = await app.request('/observations/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(created.status).toBe(201)
  })

  test('a closed event rejects collection writes', async () => {
    const app = testApp('closed')
    const { body } = await login(app, true)
    const response = await app.request('/observations/drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${body.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(response.status).toBe(403)
  })

  test('a session cannot edit an Observation it does not own', async () => {
    const app = testApp()
    const { body } = await login(app, true)
    const response = await app.request('/observations/someone-elses-observation', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${body.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(response.status).toBe(404)
  })
})

test('deleting a Temporary Collection Session removes its media and token', async () => {
  const sessions = new Map<string, Session>()
  const deletedFiles: string[] = []
  const db = {
    configured: true,
    findAccessCode: async () => ({ id: 'code-1', kind: 'temporary' as const, event_id: null }),
    createSession: async (_code: unknown, tokenHash: string) => {
      const session: Session = {
        id: 'temporary-1', kind: 'temporary', event_id: null,
        privacy_acknowledged_at: null, last_write_at: new Date().toISOString(),
        expires_at: null, revoked_at: null,
      }
      sessions.set(tokenHash, session)
      return session
    },
    findSession: async (tokenHash: string) => sessions.get(tokenHash) ?? null,
    observationsForSession: async () => [{ photo_drive_id: 'photo-1', audio_drive_id: 'audio-1' }],
    deleteSession: async () => { sessions.clear() },
  }
  const drive = {
    configured: true,
    delete: async (id: string) => { deletedFiles.push(id) },
  }
  const app = createApp({
    db: db as unknown as AppDatabase,
    drive: drive as unknown as AppDrive,
    env: {},
  })
  const { response, body } = await login(app, false)
  expect(response.status).toBe(201)

  const deleted = await app.request('/temporary-session', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${body.token}` },
  })
  expect(deleted.status).toBe(204)
  expect(deletedFiles.sort()).toEqual(['audio-1', 'photo-1'])

  const restored = await app.request('/auth/session', {
    headers: { Authorization: `Bearer ${body.token}` },
  })
  expect(restored.status).toBe(401)
})

test('Global Stats never exposes writable Event Codes', async () => {
  const sessions = new Map<string, Session>()
  const db = {
    configured: true,
    findAccessCode: async () => ({ id: 'global-code', kind: 'global' as const, event_id: null }),
    createSession: async (_code: unknown, tokenHash: string) => {
      const session: Session = {
        id: 'global-1', kind: 'global', event_id: null,
        privacy_acknowledged_at: null, last_write_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null,
      }
      sessions.set(tokenHash, session)
      return session
    },
    findSession: async (tokenHash: string) => sessions.get(tokenHash) ?? null,
    listObservations: async () => [{
      id: 'observation-1', latitude: 47.07, longitude: 15.44, accuracy_m: null,
      plant_reading: 1.25, sensor_color: '#A0B1C2', feeling: null, comment: null,
      photo_drive_id: null, audio_drive_id: null, created_at: new Date().toISOString(),
      events: { event_code: 'HYBRID-1' },
    }],
  }
  const app = createApp({
    db: db as unknown as AppDatabase,
    drive: { configured: true } as AppDrive,
    env: {},
  })
  const { body } = await login(app, false)
  const response = await app.request('/observations?view=stats', {
    headers: { Authorization: `Bearer ${body.token}` },
  })
  const result = await response.json() as { observations: Array<Record<string, unknown>> }
  expect(result.observations).toHaveLength(1)
  expect(result.observations[0].plantReading).toBe(1)
  expect('eventCode' in result.observations[0]).toBe(false)
})
