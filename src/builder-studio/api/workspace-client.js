/**
 * API client for Builder Studio persistence endpoints.
 *
 * Dual-persistence: the front-end keeps localStorage (Zustand persist) as
 * the primary store and mirrors every save to Postgres via these endpoints.
 * On startup, the app can hydrate from the database when localStorage is
 * empty.
 *
 * Endpoints:
 *  - POST /api/v1/builder-studio/workspace/{id}/sync   → save snapshot
 *  - GET  /api/v1/builder-studio/workspace/{id}         → load snapshot
 */
const BASE = (import.meta.env?.VITE_CONVENGINE_BASE || 'http://localhost:8080/api/v1').replace(/\/$/, '')

/**
 * Save (sync) the full workspace snapshot to Postgres.
 * Fire-and-forget from the caller's perspective — errors are logged but
 * don't block the UI.
 */
export async function syncWorkspaceToServer(workspaceId, snapshot) {
  const url = `${BASE}/builder-studio/workspace/${encodeURIComponent(workspaceId)}/sync`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
    if (!res.ok) {
      console.warn('[builder-studio] sync failed:', res.status, await res.text())
      return { ok: false, status: res.status }
    }
    return { ok: true }
  } catch (err) {
    // Network error — backend might not be running. Silently degrade.
    console.warn('[builder-studio] sync network error:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Load the full workspace snapshot from Postgres.
 * Returns the snapshot object on success, or null if unavailable.
 */
export async function loadWorkspaceFromServer(workspaceId) {
  const url = `${BASE}/builder-studio/workspace/${encodeURIComponent(workspaceId)}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('[builder-studio] load failed:', res.status)
      return null
    }
    return await res.json()
  } catch (err) {
    console.warn('[builder-studio] load network error:', err.message)
    return null
  }
}
