/**
 * Block palette — draggable list of all registered blocks grouped by sim's
 * category taxonomy: blocks, tools, triggers. Mirrors sim's toolbar panel.
 */
import { useCallback, useMemo, useState } from 'react'
import { getAllBlocks, CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_CONFIG, groupBlocksByCategory } from '../blocks/registry'
import { useWorkflowStore } from '../stores/workflow-store'

/* Chevron for collapsible sub-groups */
function Chevron({ open }) {
  return (
    <svg className={`bs-palette-chevron ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/* Expand-all / Collapse-all icons — diagonal arrows */
function ExpandAllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}
function CollapseAllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
    </svg>
  )
}

/* Show-all (flat grid) icon — a 2×2 grid of squares */
function ShowAllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export default function BlockPalette() {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState({}) // { [key]: true }  — keys: category ids + "cat-subgroupId"
  const [showFlat, setShowFlat] = useState(false)
  const nodes = useWorkflowStore((s) => s.nodes)
  const existingTypes = useMemo(() => new Set(nodes.map((n) => n.data?.blockType)), [nodes])

  const grouped = useMemo(() => {
    const all = getAllBlocks().filter((b) => !b.hideFromToolbar && !(b.singleton && existingTypes.has(b.type)))
    const needle = filter.trim().toLowerCase()
    if (!needle) {
      const by = { blocks: [], tools: [], triggers: [], custom: [] }
      for (const b of all) {
        const cat = by[b.category] ? b.category : 'custom'
        by[cat].push(b)
      }
      return by
    }

    /* Build sets of categories & subgroup types that match the search term */
    const matchedCats = new Set()
    const matchedSubgroupTypes = new Set()
    for (const cat of CATEGORY_ORDER) {
      if ((CATEGORY_LABELS[cat] || '').toLowerCase().includes(needle)) matchedCats.add(cat)
      const cfg = CATEGORY_CONFIG[cat]
      if (cfg) {
        for (const sg of cfg.subgroups) {
          if (sg.label.toLowerCase().includes(needle)) {
            for (const t of sg.types) matchedSubgroupTypes.add(t)
          }
        }
      }
    }

    const filtered = all.filter(
      (b) =>
        b.name.toLowerCase().includes(needle) ||
        b.type.toLowerCase().includes(needle) ||
        (b.description || '').toLowerCase().includes(needle) ||
        matchedCats.has(b.category) ||
        matchedSubgroupTypes.has(b.type)
    )
    const by = { blocks: [], tools: [], triggers: [], custom: [] }
    for (const b of filtered) {
      const cat = by[b.category] ? b.category : 'custom'
      by[cat].push(b)
    }
    return by
  }, [filter, existingTypes])

  /* Collect every collapsible key (root cats + subgroups) for expand/collapse all */
  const allCollapsibleKeys = useMemo(() => {
    const keys = []
    for (const cat of CATEGORY_ORDER) {
      const items = grouped[cat] || []
      if (items.length === 0) continue
      keys.push(`root-${cat}`)
      const { groups } = groupBlocksByCategory(items, cat)
      for (const sg of groups) keys.push(`${cat}-${sg.id}`)
    }
    return keys
  }, [grouped])

  const isSearching = filter.trim().length > 0

  const toggle = (id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

  const expandAll = useCallback(() => setCollapsed({}), [])
  const collapseAll = useCallback(() => {
    const next = {}
    for (const k of allCollapsibleKeys) next[k] = true
    setCollapsed(next)
  }, [allCollapsibleKeys])

  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/builder-studio-block', blockType)
    e.dataTransfer.effectAllowed = 'move'
  }

  const renderBlockItem = (b) => {
    const Icon = b.icon
    return (
      <div
        key={b.type}
        className="bs-palette-item"
        draggable
        onDragStart={(e) => onDragStart(e, b.type)}
        title={b.description}
      >
        <div className="bs-palette-icon" style={{ background: b.bgColor }}>
          {Icon ? <Icon className="bs-palette-iconsvg" /> : null}
        </div>
        <div className="bs-palette-meta">
          <div className="bs-palette-name">{b.name}</div>
          <div className="bs-palette-desc">{b.description}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bs-palette">
      <div className="bs-palette-search-wrap">
        <svg className="bs-palette-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="bs-input bs-palette-search"
          placeholder="Search blocks…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        {filter && (
          <button
            type="button"
            className="bs-palette-search-clear"
            onClick={() => setFilter('')}
            aria-label="Clear search"
            title="Clear"
          >×</button>
        )}
      </div>

      {/* Expand / Collapse / Show-all toolbar */}
      {!isSearching && (
        <div className="bs-palette-toolbar">
          <button className="bs-palette-toolbar-btn" onClick={expandAll} title="Expand all">
            <ExpandAllIcon />
          </button>
          <button className="bs-palette-toolbar-btn" onClick={collapseAll} title="Collapse all">
            <CollapseAllIcon />
          </button>
          <button
            className={`bs-palette-toolbar-btn ${showFlat ? 'is-active' : ''}`}
            onClick={() => setShowFlat((v) => !v)}
            title={showFlat ? 'Show by category' : 'Show all blocks (flat)'}
          >
            <ShowAllIcon />
          </button>
        </div>
      )}

      {/* Flat view — all blocks in a single list, no categories */}
      {!isSearching && showFlat && (() => {
        const allItems = CATEGORY_ORDER.flatMap((cat) => grouped[cat] || [])
        return (
          <div className="bs-palette-group">
            <div className="bs-palette-group-title">ALL BLOCKS</div>
            <div className="bs-palette-list">
              {allItems.map(renderBlockItem)}
            </div>
          </div>
        )
      })()}

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat] || []
        if (items.length === 0) return null

        // When flat view is active, categories are suppressed (rendered above)
        if (!isSearching && showFlat) return null

        // When searching, render flat list (no sub-groups)
        if (isSearching) {
          return (
            <div key={cat} className="bs-palette-group">
              <div className="bs-palette-group-title">{CATEGORY_LABELS[cat]}</div>
              <div className="bs-palette-list">
                {items.map(renderBlockItem)}
              </div>
            </div>
          )
        }

        // Sub-grouped rendering (driven by CATEGORY_CONFIG in registry)
        const { topItems, groups } = groupBlocksByCategory(items, cat)
        const rootKey = `root-${cat}`
        const rootOpen = !collapsed[rootKey]
        return (
          <div key={cat} className="bs-palette-group">
            <button className="bs-palette-group-title bs-palette-group-toggle" onClick={() => toggle(rootKey)}>
              <Chevron open={rootOpen} />
              {CATEGORY_LABELS[cat]}
              <span className="bs-palette-group-count">{items.length}</span>
            </button>
            {rootOpen && (
              <>
                {topItems.length > 0 && (
                  <div className="bs-palette-list">
                    {topItems.map(renderBlockItem)}
                  </div>
                )}
                {groups.map((sg) => {
                  const isOpen = !collapsed[`${cat}-${sg.id}`]
                  return (
                    <div key={sg.id} className="bs-palette-subgroup">
                      <button className="bs-palette-subgroup-toggle" onClick={() => toggle(`${cat}-${sg.id}`)}>
                        <Chevron open={isOpen} />
                        <span>{sg.label}</span>
                        <span className="bs-palette-subgroup-count">{sg.items.length}</span>
                      </button>
                      {isOpen && (
                        <div className="bs-palette-list">
                          {sg.items.map(renderBlockItem)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
