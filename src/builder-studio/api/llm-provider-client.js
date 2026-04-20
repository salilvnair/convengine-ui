const BASE = (import.meta.env?.VITE_CONVENGINE_BASE || (import.meta.env?.DEV ? '/api/v1' : 'http://localhost:8080/api/v1')).replace(/\/$/, '')

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