import type { ObservationInput, ObservationRow, Session, SessionKind } from './types.js'

type AccessCode = { id: string; kind: SessionKind; event_id: string | null }

export class Database {
  private readonly base: string
  private readonly key: string

  constructor(env = process.env) {
    this.base = env.SUPABASE_URL?.replace(/\/$/, '') ?? ''
    this.key = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  }

  get configured() {
    return Boolean(this.base && this.key)
  }

  private async request<T>(path: string, init: RequestInit = {}, prefer?: string): Promise<T> {
    if (!this.configured) throw new Error('Supabase is not configured')
    const response = await fetch(`${this.base}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) throw new Error(`Supabase request failed (${response.status})`)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  async health() {
    await this.request('events?select=id&limit=1')
  }

  async findAccessCode(codeHash: string) {
    const rows = await this.request<AccessCode[]>(
      `access_codes?select=id,kind,event_id&code_hash=eq.${codeHash}&active=eq.true&limit=1`,
    )
    return rows[0] ?? null
  }

  async createSession(code: AccessCode, tokenHash: string, privacyAcknowledged: boolean) {
    const expiresAt = code.kind === 'global'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null
    const rows = await this.request<Session[]>('collection_sessions', {
      method: 'POST',
      body: JSON.stringify({
        token_hash: tokenHash,
        kind: code.kind,
        event_id: code.event_id,
        access_code_id: code.id,
        privacy_acknowledged_at: privacyAcknowledged ? new Date().toISOString() : null,
        expires_at: expiresAt,
      }),
    }, 'return=representation')
    return rows[0]
  }

  async findSession(tokenHash: string) {
    const rows = await this.request<Session[]>(
      `collection_sessions?select=id,kind,event_id,privacy_acknowledged_at,last_write_at,expires_at,revoked_at&token_hash=eq.${tokenHash}&limit=1`,
    )
    return rows[0] ?? null
  }

  async eventDetails(eventId: string) {
    const rows = await this.request<{ status: 'open' | 'closed'; event_code: string }[]>(
      `events?select=status,event_code&id=eq.${eventId}&limit=1`,
    )
    return rows[0] ?? null
  }

  async acknowledgePrivacy(sessionId: string) {
    const rows = await this.request<Session[]>(`collection_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ privacy_acknowledged_at: new Date().toISOString() }),
    }, 'return=representation')
    return rows[0]
  }

  async touchSession(sessionId: string) {
    await this.request(`collection_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_write_at: new Date().toISOString() }),
    }, 'return=minimal')
  }

  async createDraft(session: Session, input: ObservationInput) {
    const rows = await this.request<ObservationRow[]>('observations', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        collection_session_id: session.id,
        event_id: session.event_id,
        is_temporary: session.kind === 'temporary',
      }),
    }, 'return=representation')
    return rows[0]
  }

  async getObservation(id: string) {
    const rows = await this.request<ObservationRow[]>(`observations?select=*&id=eq.${id}&limit=1`)
    return rows[0] ?? null
  }

  async getOwnedObservation(id: string, sessionId: string) {
    const rows = await this.request<ObservationRow[]>(
      `observations?select=*&id=eq.${id}&collection_session_id=eq.${sessionId}&limit=1`,
    )
    return rows[0] ?? null
  }

  async updateOwnedObservation(id: string, sessionId: string, patch: Record<string, unknown>) {
    const rows = await this.request<ObservationRow[]>(
      `observations?id=eq.${id}&collection_session_id=eq.${sessionId}`,
      { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) },
      'return=representation',
    )
    return rows[0] ?? null
  }

  async finalizeDraft(id: string, sessionId: string) {
    const now = new Date().toISOString()
    const rows = await this.request<ObservationRow[]>(
      `observations?id=eq.${id}&collection_session_id=eq.${sessionId}&status=eq.draft`,
      { method: 'PATCH', body: JSON.stringify({ status: 'finalized', created_at: now, updated_at: now }) },
      'return=representation',
    )
    return rows[0] ?? null
  }

  async listObservations(session: Session, view: 'collection' | 'stats') {
    let scope: string
    if (view === 'collection') {
      scope = `collection_session_id=eq.${session.id}`
    } else if (session.kind === 'global') {
      scope = 'is_temporary=eq.false'
    } else if (session.kind === 'temporary') {
      scope = `collection_session_id=eq.${session.id}`
    } else {
      scope = `event_id=eq.${session.event_id}`
    }
    return this.request<ObservationRow[]>(
      `observations?select=*&status=eq.finalized&${scope}&order=created_at.asc`,
    )
  }

  async deleteObservation(id: string) {
    await this.request(`observations?id=eq.${id}`, { method: 'DELETE' }, 'return=minimal')
  }

  async getConfig(key: string) {
    const rows = await this.request<{ value: string }[]>(`app_config?select=value&key=eq.${key}&limit=1`)
    return rows[0]?.value ?? null
  }

  async setConfig(key: string, value: string) {
    await this.request('app_config?on_conflict=key', {
      method: 'POST',
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    }, 'resolution=merge-duplicates,return=minimal')
  }

  async expiredDrafts(cutoff: string) {
    return this.request<ObservationRow[]>(
      `observations?select=*&status=eq.draft&updated_at=lt.${encodeURIComponent(cutoff)}`,
    )
  }

  async expiredTemporarySessions(cutoff: string) {
    return this.request<Session[]>(
      `collection_sessions?select=id,kind,event_id,privacy_acknowledged_at,last_write_at,expires_at,revoked_at&kind=eq.temporary&last_write_at=lt.${encodeURIComponent(cutoff)}`,
    )
  }

  async observationsForSession(sessionId: string) {
    return this.request<ObservationRow[]>(
      `observations?select=*&collection_session_id=eq.${sessionId}`,
    )
  }

  async deleteSession(sessionId: string) {
    await this.request(`collection_sessions?id=eq.${sessionId}`, { method: 'DELETE' }, 'return=minimal')
  }
}
