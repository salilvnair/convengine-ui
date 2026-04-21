/**
 * Chat run panel — shown when the Starter block's "Start Workflow" is set to "Chat".
 *
 * Each message the user sends becomes the starter node's output
 * ({ message, history }) and is passed downstream into the graph.
 * The final graph output is rendered as the assistant reply bubble.
 */
import { useEffect, useRef, useState } from 'react'

/* ── Helpers ──────────────────────────────────────────────────────────── */

function extractReply(result) {
  if (!result) return null
  const output = result.output
  if (output == null) return null
  if (typeof output === 'string') return output
  // Common agent/response shapes
  if (typeof output === 'object') {
    if (output.content)  return String(output.content)
    if (output.text)     return String(output.text)
    if (output.message)  return String(output.message)
    if (output.response) return String(output.response)
    if (output.output)   return String(output.output)
    if (output.answer)   return String(output.answer)
    // Fallback: pretty JSON
    return JSON.stringify(output, null, 2)
  }
  return String(output)
}

/* ── Sub-components ───────────────────────────────────────────────────── */

function ChatBubble({ role, text, pending }) {
  return (
    <div className={`bs-chat-bubble-wrap bs-chat-bubble-${role}`}>
      <div className={`bs-chat-bubble ${pending ? 'bs-chat-bubble-pending' : ''}`}>
        {pending
          ? <span className="bs-chat-typing"><span /><span /><span /></span>
          : <span className="bs-chat-bubble-text">{text}</span>
        }
      </div>
    </div>
  )
}

function ChatPanel({ ctx }) {
  const { busy, error, onChatSend } = ctx
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])   // { role: 'user'|'assistant', text }
  const pendingRef = useRef(false)
  const endRef = useRef(null)
  const textareaRef = useRef(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || busy || pendingRef.current) return
    setInput('')
    pendingRef.current = true

    const userMsg = { role: 'user', text }
    const history = messages.map((m) => ({ role: m.role, content: m.text }))
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', text: '', pending: true }])

    try {
      const result = await onChatSend({ message: text, history })
      const reply = extractReply(result) || '(no response)'
      setMessages((prev) => {
        const next = [...prev]
        // Replace the last pending bubble
        const idx = next.findLastIndex((m) => m.pending)
        if (idx >= 0) next[idx] = { role: 'assistant', text: reply }
        return next
      })
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev]
        const idx = next.findLastIndex((m) => m.pending)
        if (idx >= 0) next[idx] = { role: 'assistant', text: `Error: ${err.message || String(err)}`, isError: true }
        return next
      })
    } finally {
      pendingRef.current = false
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="bs-chat-run-wrap">
      <div className="bs-chat-run-history">
        {messages.length === 0 && (
          <div className="bs-chat-run-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".35"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Send a message to start the workflow</span>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} text={m.text} pending={m.pending} isError={m.isError} />
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="bs-chat-run-error">{error}</div>
      )}

      <div className="bs-chat-run-input-bar">
        <textarea
          ref={textareaRef}
          className="bs-chat-run-textarea nowheel"
          rows={1}
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={busy || pendingRef.current}
        />
        <button
          className="bs-chat-run-send"
          onClick={handleSend}
          disabled={!input.trim() || busy}
          title="Send (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ── Panel registration object ────────────────────────────────────────── */

const ChatRunPanel = {
  id: 'chat',
  label: 'Chat',
  order: 9,   // Appears before Run tab when in chat mode
  /** Only show this tab when the workflow's starter is set to chat mode */
  isVisible(ctx) {
    return ctx.isChatMode === true
  },
  render(ctx) {
    return <ChatPanel ctx={ctx} />
  },
}

export default ChatRunPanel
