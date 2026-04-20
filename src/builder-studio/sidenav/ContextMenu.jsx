/**
 * Lightweight right-click context menu. Renders a floating item list at the
 * cursor in viewport coordinates.
 *
 * Rendered through a React portal to {@code document.body} because callers
 * (notably {@code WorkflowNode} inside the ReactFlow viewport) live under
 * ancestors that apply a {@code transform}. Per CSS spec, a transformed
 * ancestor becomes the containing block for {@code position: fixed}
 * descendants — so without the portal, the menu would snap to the
 * transformed frame instead of the viewport cursor position.
 *
 * Supports nested submenus via `children` arrays on items.
 *
 * Dismissal: click outside, Escape, or any action selection.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* ── Chevron-right arrow for submenu indicators ── */
function ChevronRight({ className }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/* ── Search icon ── */
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45, flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}

/* ── Collect all leaf items from a nested menu tree (for search) ── */
function collectLeaves(items) {
  const result = []
  for (const it of items) {
    if (it.separator || it.disabled || it.isHeader || !it.label) continue
    if (it.children) result.push(...collectLeaves(it.children))
    else result.push(it)
  }
  return result
}

/* ── Render a flat or nested item list ── */
function MenuItemList({ items, onClose, onAction }) {
  return items.map((it, i) =>
    it.separator ? (
      <div key={`sep-${i}`} className="bs-ctxmenu-sep" />
    ) : it.compactRow ? (
      <div key={it.id || `cr-${i}`} className="bs-ctxmenu-compact-row">
        {(it.items || []).map((btn) => (
          <button
            key={btn.id}
            className={`bs-ctxmenu-compact-btn${btn.danger ? ' is-danger' : ''}`}
            onClick={() => { btn.onSelect?.(); onAction() }}
            disabled={btn.disabled}
            title={btn.label + (btn.shortcut ? ` (${btn.shortcut})` : '')}
          >
            {btn.icon && <btn.icon className="bs-ico-xs" style={btn.iconColor ? { color: btn.iconColor } : undefined} />}
          </button>
        ))}
      </div>
    ) : it.children ? (
      <SubMenuItem key={it.id || i} item={it} onClose={onClose} onAction={onAction} />
    ) : (
      <button
        key={it.id || i}
        role="menuitem"
        className={`bs-ctxmenu-item ${it.danger ? 'is-danger' : ''}`}
        onClick={() => { it.onSelect?.(); onAction() }}
        disabled={it.disabled}
      >
        {it.icon ? <it.icon className="bs-ico-xs" style={it.iconColor ? { color: it.iconColor } : undefined} /> : <span className="bs-ico-xs" />}
        <span className="bs-ctxmenu-label">{it.label}</span>
        {it.shortcut && <span className="bs-ctxmenu-kbd">{it.shortcut}</span>}
      </button>
    )
  )
}

/* ── Submenu (nested level) ── */
function SubMenu({ parentRect, items, onClose, onAction, searchable }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [query, setQuery] = useState('')

  useLayoutEffect(() => {
    if (!ref.current || !parentRect) return
    const rect = ref.current.getBoundingClientRect()
    const pad = 4
    // prefer right; fall back left if no room
    let left = parentRect.right + pad
    if (left + rect.width > window.innerWidth - 8) left = parentRect.left - rect.width - pad
    let top = parentRect.top
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8
    if (top < 8) top = 8
    setPos({ left, top })
  }, [parentRect])

  // Auto-focus the search input when the submenu opens
  useEffect(() => {
    if (searchable) setTimeout(() => inputRef.current?.focus(), 60)
  }, [searchable])

  // When searching, flatten all leaves and filter
  const q = query.trim().toLowerCase()
  const showSearch = searchable && items.length > 8
  const filteredItems = q
    ? collectLeaves(items).filter((it) => it.label?.toLowerCase().includes(q))
    : items

  return createPortal(
    <div ref={ref} className="bs-ctxmenu bs-ctxmenu-sub" style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()} role="menu">
      {showSearch && (
        <div className="bs-ctxmenu-search">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            className="bs-ctxmenu-search-input"
            placeholder="Search blocks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') } }}
          />
        </div>
      )}
      <div className="bs-ctxmenu-scroll">
        {filteredItems.length === 0 ? (
          <div className="bs-ctxmenu-empty">No matches</div>
        ) : (
          <MenuItemList items={filteredItems} onClose={onClose} onAction={onAction} />
        )}
      </div>
    </div>,
    document.body
  )
}

/* ── A single item that opens a child submenu on hover ── */
function SubMenuItem({ item, onClose, onAction }) {
  const btnRef = useRef(null)
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  function enter() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), 120)
  }
  function leave() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(false), 200)
  }

  const rect = btnRef.current?.getBoundingClientRect()

  return (
    <div onMouseEnter={enter} onMouseLeave={leave}>
      <button
        ref={btnRef}
        role="menuitem"
        className={`bs-ctxmenu-item bs-ctxmenu-item-parent ${open ? 'is-open' : ''}`}
      >
        {item.icon ? <item.icon className="bs-ico-xs" /> : <span className="bs-ico-xs" />}
        <span className="bs-ctxmenu-label">{item.label}</span>
        <ChevronRight className="bs-ctxmenu-arrow" />
      </button>
      {open && rect && (
        <SubMenu parentRect={rect} items={item.children} onClose={onClose} onAction={onAction} searchable={item.searchable} />
      )}
    </div>
  )
}

export default function ContextMenu({ x, y, items, onClose, searchable }) {
  const ref = useRef(null)
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  // Measure after first paint so we can clamp using the real size rather
  // than a guessed height (items may wrap).
  const [pos, setPos] = useState(() => clamp(x, y, 200, items.length * 32 + 8))

  useLayoutEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(clamp(x, y, rect.width, rect.height))
  }, [x, y])

  // Auto-focus search input
  useEffect(() => {
    if (searchable) setTimeout(() => searchRef.current?.focus(), 60)
  }, [searchable])

  useEffect(() => {
    function onDocClick(e) {
      // Don't close when clicking inside any submenu portal
      if (e.target.closest?.('.bs-ctxmenu')) return
      onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        if (query) { setQuery(''); e.stopPropagation(); return }
        onClose()
      }
    }
    function onScroll() { onClose() }
    function onGlobalClose() { onClose() }
    // Close on any click or right-click outside the menu
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('contextmenu', onDocClick)
    document.addEventListener('keydown', onKey)
    // Global event: another context menu is opening, close this one
    window.addEventListener('bs:close-context-menus', onGlobalClose)
    // If anything scrolls under the menu (canvas pan, panel scroll), close it.
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('contextmenu', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('bs:close-context-menus', onGlobalClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose, query])

  const q = query.trim().toLowerCase()
  const isSearching = searchable && q.length > 0

  // When searching, flatten all leaves and filter
  const displayItems = isSearching
    ? collectLeaves(items).filter((it) => it.label?.toLowerCase().includes(q))
    : items

  const menu = (
    <div
      ref={ref}
      className="bs-ctxmenu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {/* Primary header (first isHeader item — rendered above search) */}
      {!isSearching && (() => {
        const primary = items.find((it) => it.isHeader)
        return primary ? (
          <button
            key={primary.id}
            role="menuitem"
            className="bs-ctxmenu-item bs-ctxmenu-item-header"
          >
            {primary.icon ? <primary.icon className="bs-ico-xs" /> : <span className="bs-ico-xs" />}
            <span className="bs-ctxmenu-label">{primary.label}</span>
          </button>
        ) : null
      })()}
      {/* Search input */}
      {searchable && (
        <>
          <div className="bs-ctxmenu-search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="text"
              className="bs-ctxmenu-search-input"
              placeholder="Search blocks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') } }}
            />
          </div>
        </>
      )}
      <div className="bs-ctxmenu-scroll">
        {isSearching && displayItems.length === 0 ? (
          <div className="bs-ctxmenu-empty">No matches</div>
        ) : (
          (isSearching ? displayItems : (() => {
            // Skip the first header + its trailing separator (rendered above search)
            const firstHeaderIdx = displayItems.findIndex((it) => it.isHeader)
            let skipIds = new Set()
            if (firstHeaderIdx >= 0) {
              skipIds.add(firstHeaderIdx)
              // Also skip separator immediately after first header
              if (displayItems[firstHeaderIdx + 1]?.separator) skipIds.add(firstHeaderIdx + 1)
            }
            return displayItems.filter((_, idx) => !skipIds.has(idx))
          })()).map((it, i) =>
            it.isHeader ? (
              <button
                key={it.id}
                role="menuitem"
                className="bs-ctxmenu-item bs-ctxmenu-item-header"
              >
                {it.icon ? <it.icon className="bs-ico-xs" style={it.iconColor ? { color: it.iconColor } : undefined} /> : <span className="bs-ico-xs" />}
                <span className="bs-ctxmenu-label">{it.label}</span>
              </button>
            ) : it.separator ? (
              <div key={`sep-${i}`} className="bs-ctxmenu-sep" />
            ) : it.compactRow ? (
              <div key={it.id || `cr-${i}`} className="bs-ctxmenu-compact-row">
                {(it.items || []).map((btn) => (
                  <button
                    key={btn.id}
                    className={`bs-ctxmenu-compact-btn${btn.danger ? ' is-danger' : ''}`}
                    onClick={() => { btn.onSelect?.(); onClose() }}
                    disabled={btn.disabled}
                    title={btn.label + (btn.shortcut ? ` (${btn.shortcut})` : '')}
                  >
                    {btn.icon && <btn.icon className="bs-ico-xs" style={btn.iconColor ? { color: btn.iconColor } : undefined} />}
                  </button>
                ))}
              </div>
            ) : it.children ? (
              <SubMenuItem key={it.id || i} item={it} onClose={onClose} onAction={onClose} />
            ) : (
              <button
                key={it.id || i}
                role="menuitem"
                className={`bs-ctxmenu-item ${it.danger ? 'is-danger' : ''}`}
                onClick={() => { it.onSelect?.(); onClose() }}
                disabled={it.disabled}
              >
                {it.icon ? <it.icon className="bs-ico-xs" style={it.iconColor ? { color: it.iconColor } : undefined} /> : <span className="bs-ico-xs" />}
                <span className="bs-ctxmenu-label">{it.label}</span>
                {it.shortcut && <span className="bs-ctxmenu-kbd">{it.shortcut}</span>}
              </button>
            )
          )
        )}
      </div>
    </div>
  )

  // Portal to body so we escape any transformed ancestor (ReactFlow viewport)
  // and so stacking-context battles with the canvas / inspector disappear.
  if (typeof document === 'undefined') return null
  return createPortal(menu, document.body)
}

function clamp(x, y, w, h) {
  const padX = 8, padTop = 8, padBottom = 64
  const left = Math.max(padX, Math.min(x, window.innerWidth - w - padX))
  const top = Math.max(padTop, Math.min(y, window.innerHeight - h - padBottom))
  return { left, top }
}
