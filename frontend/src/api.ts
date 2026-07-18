import type { Observation, ObservationInput, SessionInfo } from './types'

const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const TOKEN_KEY = 'hybrid-plant-session'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export const invalidatesSession = (error: unknown) => error instanceof ApiError && error.status === 401

export const sessionToken = () => localStorage.getItem(TOKEN_KEY)
export const clearSession = () => localStorage.removeItem(TOKEN_KEY)

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const token = sessionToken()
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as null | { error?: { message?: string } }
    throw new ApiError(body?.error?.message || `Request failed (${response.status})`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function login(code: string, purpose: 'collect' | 'stats', privacyAcknowledged: boolean) {
  const result = await request<{ token: string; session: SessionInfo }>('/auth/code', {
    method: 'POST',
    body: JSON.stringify({ code, purpose, privacyAcknowledged }),
  }, false)
  localStorage.setItem(TOKEN_KEY, result.token)
  return result.session
}

export const currentSession = () => request<{ session: SessionInfo }>('/auth/session').then((r) => r.session)
export const acknowledgePrivacy = () => request<{ session: SessionInfo }>('/auth/privacy', { method: 'POST' }).then((r) => r.session)
export const observations = (view: 'collection' | 'stats') =>
  request<{ observations: Observation[] }>(`/observations?view=${view}`).then((r) => r.observations)

export const createDraft = (input: ObservationInput) =>
  request<{ id: string }>('/observations/drafts', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.id)
export const updateObservation = (id: string, input: ObservationInput) =>
  request<{ observation: Observation }>(`/observations/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((r) => r.observation)
export const finalizeObservation = (id: string) =>
  request<{ observation: Observation }>(`/observations/${id}/finalize`, { method: 'POST' }).then((r) => r.observation)
export const uploadMedia = (id: string, kind: 'photo' | 'audio', blob: Blob) =>
  request(`/observations/${id}/${kind}`, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type },
  })
export const removeMedia = (id: string, kind: 'photo' | 'audio') =>
  request(`/observations/${id}/${kind}`, { method: 'DELETE' })
export const deleteObservation = (id: string) => request(`/observations/${id}`, { method: 'DELETE' })
export const deleteTemporarySession = () => request('/temporary-session', { method: 'DELETE' })

export async function mediaBlob(id: string, kind: 'photo' | 'audio') {
  const response = await fetch(`${base}/observations/${id}/media/${kind}`, {
    headers: { Authorization: `Bearer ${sessionToken()}` },
  })
  if (!response.ok) throw new ApiError('Media could not be loaded', response.status)
  return response.blob()
}

export async function systemStatus() {
  const response = await fetch(`${base}/status`)
  const body = await response.json().catch(() => null) as null | {
  status: 'healthy' | 'degraded' | 'unavailable'
  services: Record<'api' | 'supabase' | 'googleDrive', 'healthy' | 'unavailable'>
  }
  if (!body) throw new ApiError('Status unavailable', response.status)
  return body
}
