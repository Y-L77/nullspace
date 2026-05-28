import { useEffect, useRef, useState, useCallback } from 'react'
import { useToolbarStore, COLORS, type Tool } from '../store/toolbar'

const BOOT_LINES = [
  'NULLSPACE TERMINAL v1.0.0',
  'math notetaking system — build 2025',
  '─────────────────────────────────────',
  'type "help" for available commands.',
  '',
]

type Line = { text: string; type: 'system' | 'user' | 'output' | 'error' }

const ALL_COMMANDS = ['help', 'pen', 'highlight', 'eraser', 'cursor', 'latex', 'size', 'color', 'undo', 'redo', 'clear']

function getSuggestion(input: string): string {
  if (!input) return ''
  const lower = input.toLowerCase()
  const match = ALL_COMMANDS.find(c => c.startsWith(lower) && c !== lower)
  return match ?? ''
}

interface Props {
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export default function Terminal({ onUndo, onRedo, onClear }: Props) {
  const { tool, setTool, lineWidth, setLineWidth, setColor } = useToolbarStore()
  const [lines, setLines] = useState<Line[]>(BOOT_LINES.map(t => ({ text: t, type: 'system' })))
  const [input, setInput] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [awaitingSize, setAwaitingSize] = useState(false)
  const [awaitingColor, setAwaitingColor] = useState(false)
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
    const cmd = raw.trim().toLowerCase()
    if (!cmd) return

    setCmdHistory(h => [raw, ...h.filter(x => x !== raw)])
    historyIdxRef.current = -1

    push(`user > ${raw}`, 'user')

    if (awaitingSize) {
      const n = parseInt(cmd)
      if (isNaN(n) || n < 1 || n > 100) {
        push('invalid size. enter a number between 1 and 100.', 'error')
      } else {
        setLineWidth(n)
        push(`stroke size set to ${n}.`)
      }
      setAwaitingSize(false)
      return
    }

    if (awaitingColor) {
      const idx = parseInt(cmd)
      if (!isNaN(idx) && idx >= 1 && idx <= COLORS.length) {
        setColor(COLORS[idx - 1])
        push(`color set to ${COLORS[idx - 1]}.`)
      } else if (/^#[0-9a-f]{3,6}$/i.test(cmd)) {
        setColor(cmd)
        push(`color set to ${cmd}.`)
      } else {
        push('invalid selection.', 'error')
      }
      setAwaitingColor(false)
      return
    }

    switch (cmd) {
      case 'help':
        push('available commands:')
        push('  pen         — freehand drawing tool')
        push('  highlight   — semi-transparent highlight brush')
        push('  eraser      — erase strokes')
        push('  cursor      — select and move strokes / latex blocks')
        push('  latex       — click canvas to place LaTeX equation')
        push('  size        — set stroke size (prompts for value)')
        push('  color       — choose stroke color')
        push('  undo        — undo last action  [ctrl+z]')
        push('  redo        — redo last action  [ctrl+y]')
        push('  clear       — clear entire canvas')
        push('  help        — show this list')
        break
      case 'pen':
        setTool('pen'); push('tool: pen'); break
      case 'highlight': case 'hi':
        setTool('highlight'); push('tool: highlight'); break
      case 'eraser': case 'er':
        setTool('eraser'); push('tool: eraser'); break
      case 'cursor': case 'cu':
        setTool('cursor'); push('tool: cursor — click strokes to select, drag to move'); break
      case 'latex': case 'la':
        setTool('latex'); push('tool: latex — click on canvas to place an equation'); break
      case 'size': case 'sz':
        push(`current size: ${lineWidth}. enter new size (1–100):`); setAwaitingSize(true); break
      case 'color': case 'co':
        push('select color by number or enter hex (#rrggbb):')
        COLORS.forEach((c, i) => push(`  ${i + 1}. ${c}`))
        setAwaitingColor(true)
        break
      case 'undo': onUndo(); push('undo.'); break
      case 'redo': onRedo(); push('redo.'); break
      case 'clear': onClear(); push('canvas cleared.'); break
      default:
        push(`unknown command: "${cmd}". type "help" for commands.`, 'error')
    }
  }, [awaitingSize, awaitingColor, lineWidth, onUndo, onRedo, onClear, push, setColor, setLineWidth, setTool])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(input)
      setInput('')
      setSuggestion('')
    } else if (e.key === 'Tab') {
      if (suggestion) {
        e.preventDefault()
        setInput(suggestion)
        setSuggestion('')
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIdxRef.current + 1, cmdHistory.length - 1)
      historyIdxRef.current = next
      setInput(cmdHistory[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(historyIdxRef.current - 1, -1)
      historyIdxRef.current = next
      setInput(next === -1 ? '' : cmdHistory[next] ?? '')
    }
  }

  const toolColor: Record<Tool, string> = {
    pen: '#e8e6e1',
    highlight: '#c8b560',
    eraser: '#c87060',
    cursor: '#6fa3d4',
    latex: '#a07cba',
  }

  return (
    <div
      style={{
        borderTop: '1px solid rgba(90,176,90,0.2)',
        background: 'rgba(8, 10, 8, 0.72)',
        display: 'flex', flexDirection: 'column',
        height: '100%',
        fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
        fontSize: 11,
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)',
      }} />

      {/* Header */}
      <div style={{
        padding: '6px 10px',
        borderBottom: '1px solid rgba(90,176,90,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, zIndex: 2,
        background: 'rgba(0,0,0,0.16)',
      }}>
        <span style={{ color: '#5ab05a', letterSpacing: '0.1em', fontSize: 10 }}>TERMINAL</span>
        <span style={{ color: toolColor[tool], fontSize: 10, letterSpacing: '0.08em' }}>
          ◆ {tool.toUpperCase()}  sz:{lineWidth}
        </span>
      </div>

      {/* Output */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 10px', zIndex: 2,
        scrollbarWidth: 'thin', scrollbarColor: '#1a3a1a transparent',
      }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            color: line.type === 'user' ? '#7adf7a'
              : line.type === 'error' ? '#c87060'
              : line.type === 'system' ? '#3a7a3a'
              : '#5ab05a',
            lineHeight: 1.7,
            whiteSpace: 'pre',
            opacity: line.type === 'system' ? 0.7 : 1,
          }}>
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '6px 10px', borderTop: '1px solid rgba(90,176,90,0.22)',
        flexShrink: 0, zIndex: 2, gap: 6,
        background: 'rgba(0,0,0,0.2)',
      }}>
        <span style={{ color: '#3a7a3a', flexShrink: 0 }}>user &gt;</span>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); setSuggestion(getSuggestion(e.target.value)) }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%', background: 'transparent',
              border: 'none', outline: 'none',
              color: '#7adf7a', fontFamily: 'inherit', fontSize: 11,
              caretColor: '#7adf7a',
            }}
          />
          {suggestion && (
            <span style={{
              position: 'absolute', left: `${input.length}ch`, top: 0,
              color: '#2a5a2a', pointerEvents: 'none',
              fontSize: 11, fontFamily: 'inherit',
            }}>
              {suggestion.slice(input.length)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
