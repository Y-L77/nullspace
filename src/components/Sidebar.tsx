import { useState, useEffect, useRef } from 'react'
import { useTabStore } from '../store/tabs'
import Terminal from './Terminal'

export default function Sidebar() {
  const { tabs, activeId, addTab, removeTab, setActive, renameTab } = useTabStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [termOpen, setTermOpen] = useState(false)
  const [terminalPos, setTerminalPos] = useState({ left: 560, top: 110 })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

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
    const sidebarWidth = 240
    const terminalWidth = 620
    const availableWidth = window.innerWidth - sidebarWidth
    setTerminalPos({
      left: Math.max(sidebarWidth + 32, sidebarWidth + availableWidth * 0.56 - terminalWidth / 2),
      top: Math.max(72, window.innerHeight * 0.18),
    })
  }, [])

  useEffect(() => {
    const handler = () => toggleTerminal()
    window.addEventListener('nullspace:toggle-terminal', handler)
    return () => window.removeEventListener('nullspace:toggle-terminal', handler)
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

  const startTerminalDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = {
      dx: e.clientX - terminalPos.left,
      dy: e.clientY - terminalPos.top,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveTerminal = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const nextLeft = e.clientX - dragRef.current.dx
    const nextTop = e.clientY - dragRef.current.dy
    setTerminalPos({
      left: Math.max(250, Math.min(window.innerWidth - 160, nextLeft)),
      top: Math.max(20, Math.min(window.innerHeight - 70, nextTop)),
    })
  }

  const stopTerminalDrag = () => {
    dragRef.current = null
  }

  const commitRename = (id: string) => {
    if (editVal.trim()) renameTab(id, editVal.trim())
    setEditingId(null)
  }

  const dispatchCanvasAction = (action: 'undo' | 'redo' | 'clear') => {
    window.dispatchEvent(new CustomEvent(`nullspace:${action}`))
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
      <div style={{
        padding: '13px 16px 10px',
        fontSize: 12, fontWeight: 600,
        color: 'var(--text2)', letterSpacing: '0.04em',
        borderBottom: '1px solid var(--border)',
      }}>
        NULLSPACE
      </div>

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
        <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.5 }}>enter</span>
      </button>

      {termOpen && (
        <div style={{
          position: 'fixed',
          left: terminalPos.left,
          top: terminalPos.top,
          width: 'min(620px, calc(100vw - var(--sidebar-w) - 48px))',
          height: 330,
          zIndex: 50,
          border: '1px solid rgba(90,176,90,0.32)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(8, 12, 8, 0.32)',
          boxShadow: '0 20px 70px rgba(0,0,0,0.45), 0 0 30px rgba(90,176,90,0.12)',
          backdropFilter: 'blur(8px)',
        }}>
          <div
            onPointerDown={startTerminalDrag}
            onPointerMove={moveTerminal}
            onPointerUp={stopTerminalDrag}
            onPointerCancel={stopTerminalDrag}
            style={{
              height: 24,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.28)',
              borderBottom: '1px solid rgba(90,176,90,0.16)',
              cursor: 'grab',
              userSelect: 'none',
              fontFamily: '"Cascadia Code", "Fira Code", monospace',
              fontSize: 10,
              color: '#5ab05a',
              letterSpacing: '0.08em',
            }}
          >
            <span>NULLSPACE CONSOLE</span>
            <button
              onClick={() => setTermOpen(false)}
              style={{ color: '#5ab05a', fontSize: 13, lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ height: 'calc(100% - 24px)' }}>
            <Terminal
              onUndo={() => dispatchCanvasAction('undo')}
              onRedo={() => dispatchCanvasAction('redo')}
              onClear={() => dispatchCanvasAction('clear')}
            />
          </div>
        </div>
      )}
    </aside>
  )
}
