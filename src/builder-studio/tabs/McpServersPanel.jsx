/**
 * MCP Servers management panel (embedded in the Settings tab).
 *
 * Displays the list of configured MCP servers, lets the user add / edit /
 * remove them, and triggers a tool-refresh so the dropdowns in the Inspector
 * immediately reflect the new config. All changes are persisted on the
 * backend via the REST API (see {@code McpController}).
 */
import { useEffect, useState } from 'react'
import { useMcpStore } from '../mcp/mcp-store'
import { McpIcon, PlusIcon, TrashIcon } from '../components/icons'
import ConfirmModal from '../components/ConfirmModal'
import StyledSelect from '../components/StyledSelect'

const EMPTY = {
  id: '',
  name: '',
  transport: 'STDIO',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
}

export default function McpServersPanel() {
  const servers = useMcpStore((s) => s.servers)
  const loading = useMcpStore((s) => s.loading)
  const error = useMcpStore((s) => s.error)
  const refresh = useMcpStore((s) => s.refreshServers)
  const upsert = useMcpStore((s) => s.upsertServer)
  const remove = useMcpStore((s) => s.deleteServer)
  const loadTools = useMcpStore((s) => s.loadTools)
  const toolsByServer = useMcpStore((s) => s.toolsByServer)

  const [editing, setEditing] = useState(null) // form state or null
  const [busy, setBusy] = useState(false)
  const [toolsFor, setToolsFor] = useState(null) // expanded server id
  const [pendingDelete, setPendingDelete] = useState(null) // server id awaiting confirm

  useEffect(() => { refresh() }, [refresh])

  async function handleSave() {
    setBusy(true)
    try {
      await upsert(formToConfig(editing))
      setEditing(null)
    } catch (e) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id) {
    setPendingDelete(id)
  }

  async function confirmDelete() {
    const id = pendingDelete
    setPendingDelete(null)
    try { await remove(id) } catch (e) { alert(e.message) }
  }

  async function handleShowTools(id) {
    if (toolsFor === id) { setToolsFor(null); return }
    setToolsFor(id)
    await loadTools(id, { refresh: true })
  }

  return (
    <div className="bs-mcp-panel">
      <div className="bs-mcp-panel-head">
        <McpIcon className="bs-ico-sm" />
        <h3 className="bs-settings-h3">MCP Servers</h3>
        <div className="bs-mcp-panel-actions">
          <button
            className="bs-icon-btn"
            onClick={refresh}
            disabled={loading}
            title="Refresh list"
            aria-label="Refresh"
          >
            <span className={`bs-refresh-glyph ${loading ? 'is-spinning' : ''}`}>⟳</span>
          </button>
          <button className="bs-btn bs-btn-accent" onClick={() => setEditing({ ...EMPTY })}>
            <PlusIcon className="bs-ico-xs" />
            <span>Add server</span>
          </button>
        </div>
      </div>

      {error && <div className="bs-mcp-error">{error}</div>}

      {servers.length === 0 && !loading && !editing && (
        <div className="bs-hint">
          No MCP servers configured yet. Click <b>Add server</b> to connect to one
          (stdio spawns a subprocess like <code>npx -y @modelcontextprotocol/server-filesystem /tmp</code>,
          HTTP hits a JSON-RPC endpoint).
        </div>
      )}

      <ul className="bs-mcp-list">
        {servers.map((s) => {
          const tools = toolsByServer[s.id]
          return (
            <li key={s.id} className="bs-mcp-row">
              <div className="bs-mcp-row-main">
                <div className="bs-mcp-row-name">{s.name || s.id}</div>
                <div className="bs-mcp-row-meta">
                  <span className="bs-mcp-badge">{s.transport?.toLowerCase()}</span>
                  <code className="bs-mcp-row-endpoint">
                    {s.transport === 'STDIO' ? `${s.command || '?'} ${(s.args || []).join(' ')}` : s.url || '?'}
                  </code>
                </div>
              </div>
              <div className="bs-mcp-row-actions">
                <button className="bs-btn-ghost" onClick={() => handleShowTools(s.id)}>
                  {toolsFor === s.id ? 'Hide tools' : 'Tools'}
                </button>
                <button className="bs-btn-ghost" onClick={() => setEditing(configToForm(s))}>Edit</button>
                <button className="bs-btn-ghost bs-danger" onClick={() => handleDelete(s.id)} title="Delete">
                  <TrashIcon className="bs-ico-xs" />
                </button>
              </div>
              {toolsFor === s.id && (
                <div className="bs-mcp-tools">
                  {tools == null ? (
                    <div className="bs-hint">Loading tools…</div>
                  ) : tools.length === 0 ? (
                    <div className="bs-hint">No tools advertised (or server not reachable).</div>
                  ) : (
                    <ul className="bs-mcp-tools-list">
                      {tools.map((t) => (
                        <li key={t.name}>
                          <code>{t.name}</code>
                          {t.description && <span className="bs-mcp-tool-desc"> — {t.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {editing && (
        <McpServerForm
          form={editing}
          setForm={setEditing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          busy={busy}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete MCP server?"
          message="This server and its configuration will be removed. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

function McpServerForm({ form, setForm, onSave, onCancel, busy }) {
  const up = (k, v) => setForm({ ...form, [k]: v })
  return (
    <div className="bs-mcp-form">
      <div className="bs-mcp-form-title">{form.id ? 'Edit MCP server' : 'New MCP server'}</div>

      <div className="bs-field">
        <label className="bs-label">Name</label>
        <input className="bs-input" value={form.name} onChange={(e) => up('name', e.target.value)} placeholder="Filesystem (local)" />
      </div>

      <div className="bs-field">
        <label className="bs-label">Transport</label>
        <StyledSelect
          value={form.transport}
          onChange={(id) => up('transport', id)}
          options={[
            { id: 'STDIO', label: 'stdio (spawn subprocess)' },
            { id: 'HTTP',  label: 'http (JSON-RPC POST)' },
            { id: 'SSE',   label: 'sse (server-sent events)' },
          ]}
        />
      </div>

      {form.transport === 'STDIO' ? (
        <>
          <div className="bs-field">
            <label className="bs-label">Command</label>
            <input className="bs-input" value={form.command} onChange={(e) => up('command', e.target.value)} placeholder="npx" />
          </div>
          <div className="bs-field">
            <label className="bs-label">Arguments (one per line)</label>
            <textarea
              className="bs-textarea"
              rows={4}
              value={form.args}
              onChange={(e) => up('args', e.target.value)}
              placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/tmp'}
            />
          </div>
          <div className="bs-field">
            <label className="bs-label">Environment (KEY=value per line, optional)</label>
            <textarea
              className="bs-textarea"
              rows={3}
              value={form.env}
              onChange={(e) => up('env', e.target.value)}
              placeholder={'GITHUB_TOKEN=ghp_xxx'}
            />
          </div>
        </>
      ) : (
        <>
          <div className="bs-field">
            <label className="bs-label">URL</label>
            <input className="bs-input" value={form.url} onChange={(e) => up('url', e.target.value)} placeholder="https://example.com/mcp" />
          </div>
          <div className="bs-field">
            <label className="bs-label">Headers (KEY: value per line, optional)</label>
            <textarea
              className="bs-textarea"
              rows={3}
              value={form.headers}
              onChange={(e) => up('headers', e.target.value)}
              placeholder={'Authorization: Bearer xxx'}
            />
          </div>
        </>
      )}

      <div className="bs-mcp-form-actions">
        <button className="bs-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="bs-btn-primary" onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

/* ---- form ⇄ config conversions ---- */

function configToForm(cfg) {
  return {
    id: cfg.id || '',
    name: cfg.name || '',
    transport: cfg.transport || 'STDIO',
    command: cfg.command || '',
    args: Array.isArray(cfg.args) ? cfg.args.join('\n') : '',
    env: cfg.env ? Object.entries(cfg.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
    url: cfg.url || '',
    headers: cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '',
  }
}

function formToConfig(form) {
  const cfg = {
    id: form.id || undefined,
    name: form.name?.trim(),
    transport: form.transport,
  }
  if (form.transport === 'STDIO') {
    cfg.command = form.command?.trim()
    cfg.args = (form.args || '').split('\n').map((s) => s.trim()).filter(Boolean)
    const env = {}
    for (const line of (form.env || '').split('\n')) {
      const i = line.indexOf('=')
      if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    if (Object.keys(env).length) cfg.env = env
  } else {
    cfg.url = form.url?.trim()
    const headers = {}
    for (const line of (form.headers || '').split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    if (Object.keys(headers).length) cfg.headers = headers
  }
  return cfg
}
