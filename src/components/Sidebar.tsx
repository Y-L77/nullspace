import { useState, useEffect } from 'react'
import { useTabStore } from '../store/tabs'
import Terminal from './Terminal'
import { useCanvas } from '../hooks/useCanvas'

export default function Sidebar() {
  const { tabs, activeId, addTab, removeTab, setActive, renameTab } = useTabStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [termOpen, setTermOpen] = useState(false)

  const canvas = useCanvas(activeId)

  useEffect(() => {
    const handler = () => setTermOpen(o => !o)
    window.addEventListener('nullspace:toggle-terminal', handler)
    return () => window.removeEventListener('nullspace:toggle-terminal', handler)
  }, [])

  const commitRename = (id: string) => {
    if (editVal.trim()) renameTab(id, editVal.trim())
    setEditingId(null)
  }

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minWidth: 'var(--sidebar-w)',
      maxWidth: 'var(--sidebar-w)',
      background: 'var(--sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* App name */}
      <div style={{
        padding: '13px 16px 10px',
        fontSize: 12, fontWeight: 600,
        color: 'var(--text2)', letterSpacing: '0.04em',
        borderBottom: '1px solid var(--border)',
      }}>
        NULLSPACE
      </div>

      {/* New note */}
      <div style={{ padding: '8px' }}>
        <button
          onClick={addTab}
          style={{
            width: '100%', textAlign: 'left',
            padding: '7px 10px', borderRadius: 6,
            color: 'var(--text2)', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
          New note
        </button>
      </div>

      {/* Notes list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActive(tab.id)}
            onDoubleClick={() => { setEditingId(tab.id); setEditVal(tab.name) }}
            onMouseEnter={() => setHoverId(tab.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 10px', borderRadius: 6,
              cursor: 'pointer', marginBottom: 1, gap: 8,
              background: tab.id === activeId ? 'var(--active)' : 'transparent',
              userSelect: 'none',
            }}
            onMouseOver={e => { if (tab.id !== activeId) (e.currentTarget as HTMLElement).style.background = 'var(--hover)' }}
            onMouseOut={e => { if (tab.id !== activeId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--text3)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>

            {editingId === tab.id ? (
              <input
                autoFocus value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => commitRename(tab.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(tab.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1, fontSize: 13,
                  background: 'transparent', border: 'none',
                  outline: 'none', color: 'var(--text)', fontFamily: 'inherit',
                }}
              />
            ) : (
              <span style={{
                flex: 1, fontSize: 13,
                color: tab.id === activeId ? 'var(--text)' : 'var(--text2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {tab.name}
              </span>
            )}

            {hoverId === tab.id && tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); removeTab(tab.id) }}
                style={{ color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
              >×</button>
            )}
          </div>
        ))}
      </div>

      {/* Terminal toggle button */}
      <button
        onClick={() => setTermOpen(o => !o)}
        style={{
          margin: '0 8px 8px',
          padding: '7px 10px',
          borderRadius: 6,
          background: termOpen ? 'rgba(58,122,58,0.15)' : 'transparent',
          border: `1px solid ${termOpen ? '#2a4a2a' : 'transparent'}`,
          color: termOpen ? '#5ab05a' : 'var(--text3)',
          fontSize: 11,
          fontFamily: '"Cascadia Code", "Fira Code", monospace',
          textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          flexShrink: 0,
          letterSpacing: '0.04em',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!termOpen) (e.currentTarget.style.background = 'var(--hover)') }}
        onMouseLeave={e => { if (!termOpen) (e.currentTarget.style.background = 'transparent') }}
      >
        <span style={{ fontSize: 13 }}>{'>'}_</span>
        terminal
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>tab</span>
      </button>

      {/* Terminal panel */}
      {termOpen && (
        <div style={{ height: 280, flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <Terminal
            onUndo={canvas.undo}
            onRedo={canvas.redo}
            onClear={canvas.clear}
          />
        </div>
      )}
    </aside>
  )
}