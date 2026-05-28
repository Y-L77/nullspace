import { useEffect, useRef, useState, useCallback } from 'react'
import { useToolbarStore, COLOR_OPTIONS, type Tool } from '../store/toolbar'

const BOOT_LINES = [
  'NULLSPACE TERMINAL v1.0.0',
  'math notetaking system - june 2026',
  'operator: yipeng.dev@gmail.com',
  '-------------------------------------',
  'type "help" for available commands.',
  '',
]

type Line = { text: string; type: 'system' | 'user' | 'output' | 'error' }

const ALL_COMMANDS = ['help', 'pen', 'highlight', 'eraser', 'cursor', 'latex', 'text', 'grid', 'export', 'zoom', 'unzoom', 'size', 'color', 'undo', 'redo', 'clear']

function normalizeCommand(raw: string) {
  return raw.trim().toLowerCase().replace(/^\//, '')
}

function getSuggestion(input: string): string {
  if (!input) return ''
  const hasSlash = input.startsWith('/')
  const lower = input.toLowerCase().replace(/^\//, '')
  const match = ALL_COMMANDS.find(c => c.startsWith(lower) && c !== lower)
  return match ? `${hasSlash ? '/' : ''}${match}` : ''
}

function parseZoomValue(cmd: string, menuChoice = false): number | null {
  const cleaned = cmd.replace('%', '').trim()

  if (menuChoice) {
    if (cleaned === '1') return 1.5
    if (cleaned === '2') return 2
    if (cleaned === '3') return 3
    if (cleaned === '4') return 4
    if (cleaned === '5') return 5
  }

  if (cleaned === '100') return 1
  if (cleaned === '150' || cleaned === '1.5') return 1.5
  if (cleaned === '200' || cleaned === '2') return 2
  if (cleaned === '300' || cleaned === '3') return 3
  if (cleaned === '400' || cleaned === '4') return 4
  if (cleaned === '500' || cleaned === '5') return 5
  return null
}

interface Props {
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onClose?: () => void
}

export default function Terminal({ onUndo, onRedo, onClear, onClose }: Props) {
  const { tool, setTool, lineWidth, setLineWidth, setColor } = useToolbarStore()
  const [lines, setLines] = useState<Line[]>(BOOT_LINES.map(t => ({ text: t, type: 'system' })))
  const [input, setInput] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [awaitingSize, setAwaitingSize] = useState(false)
  const [awaitingColor, setAwaitingColor] = useState(false)
  const [awaitingZoom, setAwaitingZoom] = useState(false)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const historyIdxRef = useRef(-1)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const push = useCallback((text: string, type: Line['type'] = 'output') => {
    setLines(l => [...l, { text, type }])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus()
    window.addEventListener('nullspace:focus-terminal', focusInput)
    window.setTimeout(focusInput, 0)
    return () => window.removeEventListener('nullspace:focus-terminal', focusInput)
  }, [])

  const handleCommand = useCallback((raw: string) => {
    const cmd = normalizeCommand(raw)
    if (!cmd) return

    setCmdHistory(h => [raw, ...h.filter(x => x !== raw)])
    historyIdxRef.current = -1
    push(`user > ${raw}`, 'user')

    if (awaitingZoom) {
      const zoom = parseZoomValue(cmd, true)
      if (!zoom) {
        push('invalid zoom. choose 1, 2, 3, 4, or 5.', 'error')
      } else {
        window.dispatchEvent(new CustomEvent('nullspace:zoom', { detail: zoom }))
        push(`zoom set to ${Math.round(zoom * 100)}%.`)
      }
      setAwaitingZoom(false)
      return
    }

    if (awaitingSize) {
      const n = parseInt(cmd)
      if (isNaN(n) || n < 1 || n > 100) push('invalid size. enter a number between 1 and 100.', 'error')
      else { setLineWidth(n); push(`stroke size set to ${n}.`) }
      setAwaitingSize(false)
      return
    }

    if (awaitingColor) {
      const colorByNumber = COLOR_OPTIONS[parseInt(cmd) - 1]
      const colorByName = COLOR_OPTIONS.find(color => color.name === cmd)
      if (colorByNumber) { setColor(colorByNumber.value); push(`color set to ${colorByNumber.name}.`) }
      else if (colorByName) { setColor(colorByName.value); push(`color set to ${colorByName.name}.`) }
      else if (/^#[0-9a-f]{3,6}$/i.test(cmd)) { setColor(cmd); push('color set to custom.') }
      else push('invalid color. use a name, number, or hex value.', 'error')
      setAwaitingColor(false)
      return
    }

    const parts = cmd.split(/\s+/)
    const command = parts[0]
    const arg = parts[1]

    switch (command) {
      case 'help':
        push('available commands:')
        push('  /pen        - freehand drawing tool')
        push('  /highlight  - highlight brush')
        push('  /eraser     - erase strokes')
        push('  /cursor     - select and move objects')
        push('  /text       - regular multiline text box')
        push('  /latex      - LaTeX equation box')
        push('  /grid       - toggle dotted grid')
        push('  /export     - export canvas as paginated PDF')
        push('  /zoom       - choose 150%, 200%, 300%, 400%, or 500%')
        push('  /unzoom     - return to 100%')
        push('  /size       - set stroke size')
        push('  /color      - choose stroke color by name')
        push('  /undo       - undo last action')
        push('  /redo       - redo last action')
        push('  /clear      - clear entire canvas')
        break
      case 'pen': setTool('pen'); push('tool: pen'); break
      case 'highlight': case 'hi': setTool('highlight'); push('tool: highlight'); break
      case 'eraser': case 'er': setTool('eraser'); push('tool: eraser'); break
      case 'cursor': case 'cu': setTool('cursor'); push('tool: cursor'); break
      case 'text': case 'txt': case 't': setTool('text'); push('tool: text'); break
      case 'latex': case 'la': setTool('latex'); push('tool: latex'); break
      case 'grid': window.dispatchEvent(new CustomEvent('nullspace:grid')); push('grid toggled.'); break
      case 'export': window.dispatchEvent(new CustomEvent('nullspace:export')); push('export started.'); break
      case 'zoom': {
        const zoom = arg ? parseZoomValue(arg) : null
        if (zoom) {
          window.dispatchEvent(new CustomEvent('nullspace:zoom', { detail: zoom }))
          push(`zoom set to ${Math.round(zoom * 100)}%.`)
        } else {
          push('choose zoom:')
          push('  1. 150%')
          push('  2. 200%')
          push('  3. 300%')
          push('  4. 400%')
          push('  5. 500%')
          setAwaitingZoom(true)
        }
        break
      }
      case 'unzoom': window.dispatchEvent(new CustomEvent('nullspace:zoom', { detail: 1 })); push('zoom reset to 100%.'); break
      case 'size': case 'sz': push(`current size: ${lineWidth}. enter new size (1-100):`); setAwaitingSize(true); break
      case 'color': case 'co':
        push('select color by name or number:')
        COLOR_OPTIONS.forEach((color, i) => push(`  ${i + 1}. ${color.name}`))
        setAwaitingColor(true)
        break
      case 'undo': onUndo(); push('undo.'); break
      case 'redo': onRedo(); push('redo.'); break
      case 'clear': onClear(); push('canvas cleared.'); break
      default: push(`unknown command: "${cmd}". type "help" for commands.`, 'error')
    }
  }, [awaitingZoom, awaitingSize, awaitingColor, lineWidth, onUndo, onRedo, onClear, push, setColor, setLineWidth, setTool])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!input.trim() && !awaitingSize && !awaitingColor && !awaitingZoom) { e.preventDefault(); onClose?.(); return }
      handleCommand(input); setInput(''); setSuggestion('')
    } else if (e.key === 'Tab') {
      if (suggestion) { e.preventDefault(); setInput(suggestion); setSuggestion('') }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); const next = Math.min(historyIdxRef.current + 1, cmdHistory.length - 1); historyIdxRef.current = next; setInput(cmdHistory[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); const next = Math.max(historyIdxRef.current - 1, -1); historyIdxRef.current = next; setInput(next === -1 ? '' : cmdHistory[next] ?? '')
    }
  }

  const toolColor: Record<Tool, string> = { pen: '#e8e6e1', highlight: '#c8b560', eraser: '#c87060', cursor: '#6fa3d4', latex: '#a07cba', text: '#6db88a' }

  return (
    <div style={{ borderTop: '1px solid rgba(90,176,90,0.2)', background: 'rgba(8, 10, 8, 0.54)', display: 'flex', flexDirection: 'column', height: '100%', fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace', fontSize: 11, position: 'relative', overflow: 'hidden' }} onClick={() => inputRef.current?.focus()}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.055) 2px, rgba(0,0,0,0.055) 4px)' }} />
      <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(90,176,90,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 2, background: 'rgba(0,0,0,0.12)' }}>
        <span style={{ color: '#5ab05a', letterSpacing: '0.1em', fontSize: 10 }}>TERMINAL</span>
        <span style={{ color: toolColor[tool], fontSize: 10, letterSpacing: '0.08em' }}>◆ {tool.toUpperCase()}  sz:{lineWidth}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', zIndex: 2, scrollbarWidth: 'thin', scrollbarColor: '#1a3a1a transparent' }}>
        {lines.map((line, i) => <div key={i} style={{ color: line.type === 'user' ? '#7adf7a' : line.type === 'error' ? '#c87060' : line.type === 'system' ? '#3a7a3a' : '#5ab05a', lineHeight: 1.7, whiteSpace: 'pre', opacity: line.type === 'system' ? 0.7 : 1 }}>{line.text}</div>)}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderTop: '1px solid rgba(90,176,90,0.22)', flexShrink: 0, zIndex: 2, gap: 6, background: 'rgba(0,0,0,0.16)' }}>
        <span style={{ color: '#3a7a3a', flexShrink: 0 }}>user &gt;</span>
        <div style={{ position: 'relative', flex: 1 }}>
          <input ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setSuggestion(getSuggestion(e.target.value)) }} onKeyDown={onKeyDown} spellCheck={false} autoComplete="off" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#7adf7a', fontFamily: 'inherit', fontSize: 11, caretColor: '#7adf7a' }} />
          {suggestion && <span style={{ position: 'absolute', left: `${input.length}ch`, top: 0, color: '#2a5a2a', pointerEvents: 'none', fontSize: 11, fontFamily: 'inherit' }}>{suggestion.slice(input.length)}</span>}
        </div>
      </div>
    </div>
  )
}
