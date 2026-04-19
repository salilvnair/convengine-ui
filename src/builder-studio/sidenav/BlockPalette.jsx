/**
 * Block palette — draggable list of all registered blocks grouped by sim's
 * category taxonomy: blocks, tools, triggers. Mirrors sim's toolbar panel.
 */
import { useMemo, useState } from 'react'
import { getAllBlocks, CATEGORY_LABELS, CATEGORY_ORDER, groupBlocksByCategory } from '../blocks/registry'
import { useWorkflowStore } from '../stores/workflow-store'

/* Chevron for collapsible sub-groups */
function Chevron({ open }) {
  return (
    <svg className={`bs-palette-chevron ${open ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function BlockPalette() {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState({}) // { [subGroupId]: true }
  const nodes = useWorkflowStore((s) => s.nodes)
  const existingTypes = useMemo(() => new Set(nodes.map((n) => n.data?.blockType)), [nodes])

  const grouped = useMemo(() => {
    const all = getAllBlocks().filter((b) => !b.hideFromToolbar && !(b.singleton && existingTypes.has(b.type)))
    const needle = filter.trim().toLowerCase()
    const filtered = needle
      ? all.filter(
          (b) =>
            b.name.toLowerCase().includes(needle) ||
            b.type.toLowerCase().includes(needle) ||
            (b.description || '').toLowerCase().includes(needle)
        )
      : all
    const by = { blocks: [], tools: [], triggers: [], custom: [] }
    for (const b of filtered) {
      const cat = by[b.category] ? b.category : 'custom'
      by[cat].push(b)
    }
    return by
  }, [filter, existingTypes])

  const isSearching = filter.trim().length > 0

  const toggle = (id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))

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
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat] || []
        if (items.length === 0) return null

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
        return (
          <div key={cat} className="bs-palette-group">
            <div className="bs-palette-group-title">
              {CATEGORY_LABELS[cat]}
              <span className="bs-palette-group-count">{items.length}</span>
            </div>
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
          </div>
        )
      })}
    </div>
  )
}
