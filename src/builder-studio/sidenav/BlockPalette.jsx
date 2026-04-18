/**
 * Block palette — draggable list of all registered blocks grouped by sim's
 * category taxonomy: blocks, tools, triggers. Mirrors sim's toolbar panel.
 */
import { useMemo, useState } from 'react'
import { getAllBlocks } from '../blocks/registry'

const CATEGORY_LABELS = {
  blocks: 'Core Blocks',
  tools: 'Tools & Integrations',
  triggers: 'Triggers',
  custom: 'Custom',
}

export default function BlockPalette() {
  const [filter, setFilter] = useState('')

  const grouped = useMemo(() => {
    const all = getAllBlocks().filter((b) => !b.hideFromToolbar)
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
  }, [filter])

  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/builder-studio-block', blockType)
    e.dataTransfer.effectAllowed = 'move'
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
      {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
        const items = grouped[cat] || []
        if (items.length === 0) return null
        return (
          <div key={cat} className="bs-palette-group">
            <div className="bs-palette-group-title">{label}</div>
            <div className="bs-palette-list">
              {items.map((b) => {
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
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
