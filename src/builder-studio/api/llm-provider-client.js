const BASE = (globalThis.__BS_BRIDGE_BASE__ || import.meta.env?.VITE_CONVENGINE_BASE || (import.meta.env?.DEV ? '/api/v1' : 'http://localhost:8080/api/v1')).replace(/\/$/, '')

export async function fetchAvailableProviders() {
  const res = await fetch(`${BASE}/builder-studio/llm/providers`)
  if (!res.ok) {
    throw new Error(`Failed to load available providers (${res.status})`)
  }
  return await res.json()
}

export async function changeRuntimeProvider(body) {
  const res = await fetch(`${BASE}/builder-studio/llm/provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  if (!res.ok) {
    throw new Error(`Failed to change provider (${res.status})`)
  }
  return await res.json()
}

/* ── Custom provider CRUD ─────────────────────────────────────────── */

export async function fetchCustomProviders() {
  const res = await fetch(`${BASE}/builder-studio/llm/custom-providers`)
  if (!res.ok) throw new Error(`Failed to load custom providers (${res.status})`)
  return await res.json()
}

/**
 * Create or update a custom provider.
 * @param {Object} cfg  { name, type, chatUrl, modelsUrl, apiKey?, headers? }
 */
export async function saveCustomProvider(cfg) {
  const res = await fetch(`${BASE}/builder-studio/llm/custom-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Failed to save custom provider (${res.status})`)
  }
  return await res.json()
}

/**
 * Delete a custom provider by its key.
 */
export async function deleteCustomProvider(key) {
  const res = await fetch(`${BASE}/builder-studio/llm/custom-providers/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete custom provider (${res.status})`)
  return await res.json()
}

/**
 * Refresh the model list for a custom provider.
 * Returns the updated ModelInfo[] from the provider's modelsUrl.
 */
export async function refreshCustomProviderModels(key) {
  const res = await fetch(
    `${BASE}/builder-studio/llm/custom-providers/${encodeURIComponent(key)}/models`,
    { method: 'POST' },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Failed to refresh models (${res.status})`)
  }
  return await res.json()
}