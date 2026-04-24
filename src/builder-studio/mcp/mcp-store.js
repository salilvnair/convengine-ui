/**
 * Zustand store for MCP (Model Context Protocol) servers + their tool manifests.
 *
 * The actual source of truth lives on the convengine backend (persisted to
 * {@code ~/.convengine/mcp-servers.json}). This store just caches the most
 * recent REST response so the UI — the `mcp-server-selector` dropdown, the
 * Settings tab's management UI — can render synchronously without flashing
 * "loading" every time.
 */
import { create } from 'zustand'
import * as api from './mcp-client'

export const useMcpStore = create((set, get) => ({
  servers: [],                // McpServerConfig[]
  toolsByServer: {},          // { [serverId]: Tool[] }
  loading: false,
  error: null,
  /** Whether we've attempted an initial `refreshServers` this session. */
  fetched: false,

  async refreshServers() {
    set({ loading: true, error: null })
    try {
      const servers = await api.listServers()
      set({ servers: servers || [], loading: false, fetched: true })
    } catch (e) {
      set({ loading: false, error: e.message, fetched: true })
    }
  },

  async ensureLoaded() {
    if (get().fetched) return
    await get().refreshServers()
  },

  async upsertServer(cfg) {
    const saved = await api.upsertServer(cfg)
    await get().refreshServers()
    // Replacing config invalidates the old tools cache on the server side too.
    set((s) => {
      const { [saved.id]: _drop, ...rest } = s.toolsByServer
      return { toolsByServer: rest }
    })
    return saved
  },

  async deleteServer(id) {
    await api.deleteServer(id)
    set((s) => {
      const { [id]: _drop, ...rest } = s.toolsByServer
      return {
        servers: s.servers.filter((x) => x.id !== id),
        toolsByServer: rest,
      }
    })
  },

  async loadTools(id, { refresh = false } = {}) {
    if (!refresh && get().toolsByServer[id]) return get().toolsByServer[id]
    try {
      const resp = await api.listTools(id, { refresh })
      const tools = Array.isArray(resp) ? resp : (resp?.tools || [])
      set((s) => ({ toolsByServer: { ...s.toolsByServer, [id]: tools } }))
      return tools
    } catch (e) {
      // Record the error against the server so the UI can show it, but don't
      // throw — the dropdown should still render (just empty).
      set({ error: `${id}: ${e.message}` })
      return []
    }
  },

  getTools(id) { return get().toolsByServer[id] || [] },
}))
