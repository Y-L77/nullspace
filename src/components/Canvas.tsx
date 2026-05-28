import { useEffect, useRef, useCallback, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useCanvas } from '../hooks/useCanvas'
import { useTabStore } from '../store/tabs'
import { useToolbarStore } from '../store/toolbar'

const MIN_HEIGHT = 3000
const DOT_SPACING = 28

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: { id: string; points: { x: number; y: number }[]; color: string; width: number; opacity: number }[],
  scrollY: number,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#1c1c1c'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#2a2a2a'
  const startY = scrollY % DOT_SPACING
  for (let x = DOT_SPACING; x < w; x += DOT_SPACING) {
    for (let y = -startY + DOT_SPACING; y < h + DOT_SPACING; y += DOT_SPACING) {
      ctx.beginPath()
      ctx.arc(x, y, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.save()
  ctx.translate(0, -scrollY)
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.globalAlpha = stroke.opacity ?? 1
    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pts = stroke.points
    ctx.moveTo(pts[0].x, pts[0].y)
    if (pts.length === 1) {
      ctx.lineTo(pts[0].x + 0.1, pts[0].y)
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2
        const my = (pts[i].y + pts[i + 1].y) / 2
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function strokeHitTest(stroke: { points: { x: number; y: number }[]; width?: number }, px: number, py: number, threshold = 12) {
  const hitRadius = Math.max(threshold, (stroke.width ?? 2) + 8)
  for (const pt of stroke.points) {
    if (Math.hypot(pt.x - px, pt.y - py) < hitRadius) return true
  }
  return false
}

export default function Canvas() {
  const { tabs, activeId } = useTabStore()
  const activeTab = tabs.find(t => t.id === activeId)
  const { tool, color, lineWidth, setTool } = useToolbarStore()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollbarRef = useRef<HTMLDivElement>(null)
  const scrollYRef = useRef(0)
  const [scrollYState, setScrollYState] = useState(0)
  const isDrawing = useRef(false)
  const snapRef = useRef<ReturnType<typeof canvas.snapshot> | null>(null)
  const moveSnapRef = useRef<ReturnType<typeof canvas.snapshot> | null>(null)

  const canvas = useCanvas(activeId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const latexDragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const draggingLatexId = useRef<string | null>(null)

  const maxY = canvas.strokes.reduce((m, s) =>
    Math.max(m, ...s.points.map(p => p.y)), 0)
  const getHeight = useCallback(() => Math.max(MIN_HEIGHT, maxY + 600), [maxY])

  const clampScroll = useCallback((y: number) => {
    const h = canvasRef.current?.height ?? 800
    return Math.max(0, Math.min(getHeight() - h, y))
  }, [getHeight])

  const redraw = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    drawCanvas(ctx, canvas.strokes, scrollYRef.current, el.width, el.height)

    const sb = scrollbarRef.current
    if (sb) {
      const height = getHeight()
      const ratio = el.height / height
      const thumbH = Math.max(40, ratio * el.height)
      const thumbTop = (scrollYRef.current / height) * el.height
      const thumb = sb.querySelector('.thumb') as HTMLElement
      if (thumb) {
        thumb.style.height = `${thumbH}px`
        thumb.style.top = `${thumbTop}px`
      }
    }
  }, [canvas.strokes, getHeight])

  useEffect(() => {
    const container = containerRef.current
    const el = canvasRef.current
    if (!container || !el) return
    const ro = new ResizeObserver(() => {
      el.width = container.clientWidth
      el.height = container.clientHeight
      redraw()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [redraw])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); canvas.undo() }
        if (e.key === 'y') { e.preventDefault(); canvas.redo() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canvas])

  useEffect(() => {
    const undo = () => canvas.undo()
    const redo = () => canvas.redo()
    const clear = () => canvas.clear()

    window.addEventListener('nullspace:undo', undo)
    window.addEventListener('nullspace:redo', redo)
    window.addEventListener('nullspace:clear', clear)

    return () => {
      window.removeEventListener('nullspace:undo', undo)
      window.removeEventListener('nullspace:redo', redo)
      window.removeEventListener('nullspace:clear', clear)
    }
  }, [canvas])

  const getPoint = (e: React.PointerEvent) => {
    const el = canvasRef.current!
    const rect = el.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top + scrollYRef.current,
    }
  }

  const getCursor = () => {
    if (tool === 'cursor') return 'default'
    if (tool === 'latex') return 'text'
    if (tool === 'eraser') return 'cell'
    return 'crosshair'
  }

  const eraseAt = (x: number, y: number) => {
    const hit = [...canvas.strokes].reverse().find(s => strokeHitTest(s, x, y))
    if (!hit) return false
    canvas.removeStroke(hit.id, canvas.snapshot())
    return true
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return

    // LaTeX mode is now a temporary text-mode indicator only.
    // First canvas click exits back to pen without opening the annoying input box.
    if (tool === 'latex') {
      setTool('pen')
      return
    }

    if (tool === 'eraser') {
      e.currentTarget.setPointerCapture(e.pointerId)
      isDrawing.current = true
      const pt = getPoint(e)
      eraseAt(pt.x, pt.y)
      return
    }

    if (tool === 'cursor') {
      const pt = getPoint(e)
      const hit = [...canvas.strokes].reverse().find(s => strokeHitTest(s, pt.x, pt.y))
      if (hit) {
        setSelectedId(hit.id)
        moveSnapRef.current = canvas.snapshot()
        const pts = hit.points
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
        dragOffset.current = { dx: pt.x - cx, dy: pt.y - cy }
        e.currentTarget.setPointerCapture(e.pointerId)
      } else {
        setSelectedId(null)
        dragOffset.current = null
        moveSnapRef.current = null
      }
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawing.current = true
    snapRef.current = canvas.snapshot()
    const pt = getPoint(e)

    const strokeColor = color
    const strokeWidth = tool === 'highlight' ? Math.max(lineWidth * 4, 16) : lineWidth
    const strokeOpacity = tool === 'highlight' ? 0.35 : 1
    canvas.startStroke(pt.x, pt.y, strokeColor, strokeWidth, strokeOpacity)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'cursor' && selectedId && dragOffset.current) {
      const pt = getPoint(e)
      const stroke = canvas.strokes.find(s => s.id === selectedId)
      if (!stroke) return
      const pts = stroke.points
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
      const ddx = (pt.x - dragOffset.current.dx) - cx
      const ddy = (pt.y - dragOffset.current.dy) - cy
      canvas.moveStroke(selectedId, ddx, ddy)
      return
    }

    if (tool === 'eraser' && isDrawing.current) {
      const pt = getPoint(e)
      eraseAt(pt.x, pt.y)
      return
    }

    if (!isDrawing.current) return
    const pt = getPoint(e)
    canvas.continueStroke(pt.x, pt.y)
  }

  const onPointerUp = () => {
    if (tool === 'cursor') {
      if (selectedId && moveSnapRef.current) canvas.finishMoveStroke(moveSnapRef.current)
      dragOffset.current = null
      moveSnapRef.current = null
      return
    }

    if (tool === 'eraser') {
      isDrawing.current = false
      return
    }

    if (!isDrawing.current) return
    isDrawing.current = false
    canvas.endStroke(snapRef.current!)
    snapRef.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    scrollYRef.current = clampScroll(scrollYRef.current + e.deltaY)
    setScrollYState(scrollYRef.current)
    redraw()
  }

  const startLatexDrag = (e: React.PointerEvent<HTMLDivElement>, blockId: string, blockX: number, blockY: number) => {
    if (tool !== 'cursor') return
    e.stopPropagation()
    setSelectedId(blockId)
    draggingLatexId.current = blockId
    moveSnapRef.current = canvas.snapshot()
    latexDragOffset.current = {
      dx: e.clientX - blockX,
      dy: e.clientY - (blockY - scrollYState),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveLatexDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const id = draggingLatexId.current
    if (!id || !latexDragOffset.current) return
    canvas.updateLatexBlock(id, {
      x: e.clientX - latexDragOffset.current.dx,
      y: e.clientY - latexDragOffset.current.dy + scrollYState,
    })
  }

  const stopLatexDrag = () => {
    if (draggingLatexId.current && moveSnapRef.current) {
      canvas.finishMoveLatexBlock(moveSnapRef.current)
    }
    draggingLatexId.current = null
    latexDragOffset.current = null
    moveSnapRef.current = null
  }

  return (
    <main style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--bg)', minWidth: 0,
    }}>
      <div style={{
        padding: '11px 20px',
        borderBottom: '1px solid var(--border)',
        fontSize: 13, color: 'var(--text2)',
        flexShrink: 0, letterSpacing: '0.01em',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span>{activeTab?.name ?? 'Untitled'}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>[{tool}]</span>
      </div>

      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: getCursor(), touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        />

        {canvas.latexBlocks.map(block => (
          <div
            key={block.id}
            style={{
              position: 'absolute',
              left: block.x,
              top: block.y - scrollYState,
              color: '#e8e6e1',
              fontSize: 15,
              pointerEvents: tool === 'cursor' ? 'auto' : 'none',
              userSelect: 'none',
              cursor: tool === 'cursor' ? 'move' : 'default',
              background: 'transparent',
              borderRadius: 4,
              padding: '2px 6px',
              border: selectedId === block.id ? '1px solid #6fa3d4' : '1px solid transparent',
            }}
            dangerouslySetInnerHTML={{ __html: katex.renderToString(block.source, { throwOnError: false, displayMode: true }) }}
            onPointerDown={e => startLatexDrag(e, block.id, block.x, block.y)}
            onPointerMove={moveLatexDrag}
            onPointerUp={stopLatexDrag}
            onPointerCancel={stopLatexDrag}
            onDoubleClick={() => {
              if (tool === 'cursor') {
                canvas.removeLatexBlock(block.id)
              }
            }}
          />
        ))}

        <div
          ref={scrollbarRef}
          style={{ position: 'absolute', right: 4, top: 8, bottom: 8, width: 5, borderRadius: 3, cursor: 'pointer' }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const ratio = (e.clientY - rect.top) / rect.height
            scrollYRef.current = clampScroll(ratio * getHeight())
            setScrollYState(scrollYRef.current)
            redraw()
          }}
        >
          <div className="thumb" style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: 40,
            background: '#333', borderRadius: 3, transition: 'background 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#444')}
            onMouseLeave={e => (e.currentTarget.style.background = '#333')}
          />
        </div>
      </div>
    </main>
  )
}
