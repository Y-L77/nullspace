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

  const focusTerminalInput = () => {
    window.dispatchEvent(new CustomEvent('nullspace:focus-terminal'))
  }

  const openAndFocusTerminal = () => {
    setTermOpen(true)
    window.setTimeout(focusTerminalInput, 0)
  }

  const toggleTerminal = () => {
    setTermOpen(open => {
      const next = !open
      if (next) window.setTimeout(focusTerminalInput, 0)
      return next
    })
  }

  useEffect(() => {
    window.addEventListener('nullspace:toggle-terminal', toggleTerminal)
    return () => window.removeEventListener('nullspace:toggle-terminal', toggleTerminal)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable

      if (e.key === 'Enter' && !isTyping) {
        e.preventDefault()
        openAndFocusTerminal()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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

      {/* Terminal toggle button stays anchored at the bottom-left of the sidebar. */}
      <button
        onClick={toggleTerminal}
        style={{
          margin: '0 8px 8px',
          padding: '7px 10px',
          borderRadius: 6,
          background: termOpen ? 'rgba(58,122,58,0.2)' : 'transparent',
          border: `1px solid ${termOpen ? '#2f7d32' : 'transparent'}`,
          color: termOpen ? '#7adf7a' : 'var(--text3)',
          fontSize: 11,
          fontFamily: '"Cascadia Code", "Fira Code", monospace',
          textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          flexShrink: 0,
          letterSpacing: '0.04em',
          transition: 'all 0.15s',
          boxShadow: termOpen
            ? '0 0 14px rgba(90,176,90,0.45), inset 0 0 12px rgba(90,176,90,0.08)'
            : 'none',
          textShadow: termOpen ? '0 0 8px rgba(122,223,122,0.8)' : 'none',
        }}
        onMouseEnter={e => { if (!termOpen) (e.currentTarget.style.background = 'var(--hover)') }}
        onMouseLeave={e => { if (!termOpen) (e.currentTarget.style.background = 'transparent') }}
      >
        <span style={{ fontSize: 13 }}>{'>'}_</span>
        terminal
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>tab / enter</span>
      </button>

      {/* Floating terminal panel. */}
      {termOpen && (
        <div style={{
          position: 'fixed',
          left: 'calc(var(--sidebar-w) + 24px)',
          bottom: 24,
          width: 'min(620px, calc(100vw - var(--sidebar-w) - 48px))',
          height: 330,
          zIndex: 50,
          border: '1px solid rgba(90,176,90,0.35)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(8, 12, 8, 0.58)',
          boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 30px rgba(90,176,90,0.12)',
          backdropFilter: 'blur(10px)',
        }}>
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
