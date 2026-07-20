import { randomBytes } from 'node:crypto'
import type { Database } from './db.js'

const FOLDER_CONFIG_KEY = 'google_drive_folder_id'

export class Drive {
  constructor(private readonly db: Database, private readonly env = process.env) {}

  get configured() {
    return Boolean(
      this.env.GOOGLE_CLIENT_ID &&
      this.env.GOOGLE_CLIENT_SECRET &&
      this.env.GOOGLE_REFRESH_TOKEN,
    )
  }

  private async accessToken() {
    if (!this.configured) throw new Error('Google Drive is not configured')
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.GOOGLE_CLIENT_ID!,
        client_secret: this.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: this.env.GOOGLE_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    })
    if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`)
    const data = await response.json() as { access_token: string }
    return data.access_token
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        ...init.headers,
      },
    })
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`)
    return response
  }

  async health() {
    const folderId = await this.db.getConfig(FOLDER_CONFIG_KEY)
    if (folderId) {
      await this.request(`/drive/v3/files/${encodeURIComponent(folderId)}?fields=id`)
    } else {
      await this.request('/drive/v3/files?pageSize=1&fields=files(id)')
    }
  }

  private async folderId() {
    const existing = await this.db.getConfig(FOLDER_CONFIG_KEY)
    if (existing) return existing

    const response = await this.request('/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'pm-hybrid-garden',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
    const { id } = await response.json() as { id: string }
    // ponytail: concurrent first uploads may create a spare folder; configure eagerly if this becomes common.
    await this.db.setConfig(FOLDER_CONFIG_KEY, id)
    return id
  }

  async upload(name: string, mimeType: string, bytes: ArrayBuffer) {
    const boundary = `hybrid_${randomBytes(12).toString('hex')}`
    const metadata = JSON.stringify({ name, parents: [await this.folderId()] })
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ])
    const response = await this.request('/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    })
    return (await response.json() as { id: string }).id
  }

  async download(fileId: string) {
    return this.request(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
  }

  async delete(fileId: string) {
    try {
      await this.request(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('(404)')) throw error
    }
  }
}
