interface Props {
  tool: 'pen' | 'eraser'
  setTool: (t: 'pen' | 'eraser') => void
  color: string
  setColor: (c: string) => void
  lineWidth: number
  setLineWidth: (n: number) => void
  zoom: number
  setZoom: (n: number) => void
  undo: () => void
  redo: () => void
  clear: () => void
  canUndo: boolean
  canRedo: boolean
}

const COLORS = ['#e8e6e1', '#c8b560', '#6fa3d4', '#a07cba', '#6db88a', '#c87060', '#888']

export default function Toolbar(props: Props) {
  const { tool, setTool, color, setColor, lineWidth, setLineWidth,
          zoom, setZoom, undo, redo, clear, canUndo, canRedo } = props

  const btn = (active: boolean) => ({
    padding: '5px 10px',
    borderRadius: 4,
    background: active ? 'var(--surface2)' : 'transparent',
    border: active ? '1px solid var(--border2)' : '1px solid transparent',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontSize: 11,
    letterSpacing: '0.05em',
    transition: 'all 0.1s',
  } as React.CSSProperties)

  return (
    <div style={{
      position: 'absolute',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--surface)',
      border: '1px solid var(--border2)',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '4px 8px',
      zIndex: 10,
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      userSelect: 'none',
    }}>
      {/* Undo / redo */}
      <button onClick={undo} disabled={!canUndo} style={btn(false)} title="Undo (Ctrl+Z)">↩</button>
      <button onClick={redo} disabled={!canRedo} style={btn(false)} title="Redo (Ctrl+Y)">↪</button>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Tools */}
      <button onClick={() => setTool('pen')} style={btn(tool === 'pen')} title="Pen (P)">pen</button>
      <button onClick={() => setTool('eraser')} style={btn(tool === 'eraser')} title="Eraser (E)">erase</button>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Colors */}
      {COLORS.map(c => (
        <button
          key={c}
          onClick={() => { setColor(c); setTool('pen') }}
          title={c}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: c,
            border: color === c && tool === 'pen' ? '2px solid var(--accent)' : '2px solid transparent',
            padding: 0,
            outline: color === c && tool === 'pen' ? '1px solid var(--accent)' : 'none',
            outlineOffset: 1,
          }}
        />
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Line width */}
      <span style={{ fontSize: 10, color: 'var(--text3)' }}>sz</span>
      <input
        type="range" min={1} max={20} step={1} value={lineWidth}
        onChange={e => setLineWidth(Number(e.target.value))}
        style={{ width: 64, accentColor: 'var(--accent)' }}
      />

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      {/* Zoom */}
      <button onClick={() => setZoom(Math.max(0.25, zoom - 0.1))} style={btn(false)}>−</button>
      <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 36, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={() => setZoom(Math.min(4, zoom + 0.1))} style={btn(false)}>+</button>
      <button onClick={() => setZoom(1)} style={{ ...btn(false), fontSize: 10 }}>reset</button>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

      <button onClick={clear} style={{ ...btn(false), color: 'var(--danger)', fontSize: 10 }}>clear</button>
    </div>
  )
}