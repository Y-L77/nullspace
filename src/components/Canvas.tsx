import { useEffect, useRef, useCallback, useState, type CSSProperties } from 'react'
import jsPDF from 'jspdf'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useCanvas } from '../hooks/useCanvas'
import { useTabStore } from '../store/tabs'
import { useToolbarStore } from '../store/toolbar'

const MIN_HEIGHT = 3000
const DOT_SPACING = 28
const LATEX_TRASH_ZONE_X = 140
const PDF_PAGE_WIDTH = 816
const PDF_PAGE_HEIGHT = 1056
const PDF_MARGIN = 36

type ExportBlock = {
  id: string
  x: number
  y: number
  source: string
  kind?: 'latex' | 'text'
}

function getContentHeight(
  strokes: { points: { x: number; y: number }[] }[],
  blocks: ExportBlock[],
) {
  const maxStrokeY = strokes.reduce((maxY, stroke) => {
    const strokeMaxY = stroke.points.reduce((m, p) => Math.max(m, p.y), 0)
    return Math.max(maxY, strokeMaxY)
  }, 0)

  const maxBlockY = blocks.reduce((maxY, block) => {
    const roughHeight = block.kind === 'text'
      ? Math.max(50, block.source.split('\n').length * 24 + 20)
      : 60
    return Math.max(maxY, block.y + roughHeight)
  }, 0)

  return Math.max(MIN_HEIGHT, maxStrokeY + 600, maxBlockY + 300)
}

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: { id: string; points: { x: number; y: number }[]; color: string; width: number; opacity: number }[],
  scrollY: number,
  w: number,
  h: number,
  showGrid: boolean,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#1c1c1c'
  ctx.fillRect(0, 0, w, h)

  if (showGrid) {
    ctx.fillStyle = '#2a2a2a'
    const startY = scrollY % DOT_SPACING
    for (let x = DOT_SPACING; x < w; x += DOT_SPACING) {
      for (let y = -startY + DOT_SPACING; y < h + DOT_SPACING; y += DOT_SPACING) {
        ctx.beginPath()
        ctx.arc(x, y, 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
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

function drawExportText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { font: string; color: string; lineHeight: number; maxWidth: number },
) {
  ctx.save()
  ctx.font = options.font
  ctx.fillStyle = options.color
  ctx.textBaseline = 'top'

  const lines = text.split('\n')
  let currentY = y

  for (const line of lines) {
    const words = line.split(' ')
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      if (ctx.measureText(testLine).width > options.maxWidth && currentLine) {
        ctx.fillText(currentLine, x, currentY)
        currentY += options.lineHeight
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    ctx.fillText(currentLine, x, currentY)
    currentY += options.lineHeight
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

interface LatexInputOverlay {
  x: number
  y: number
  canvasScrollY: number
  editingId?: string
}

interface TextInputOverlay {
  x: number
  y: number
  canvasScrollY: number
  editingId?: string
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
  const [showGrid, setShowGrid] = useState(true)
  const isDrawing = useRef(false)
  const canvas = useCanvas(activeId)
  const snapRef = useRef<ReturnType<typeof canvas.snapshot> | null>(null)
  const moveSnapRef = useRef<ReturnType<typeof canvas.snapshot> | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const latexDragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const draggingLatexId = useRef<string | null>(null)
  const [isDraggingLatex, setIsDraggingLatex] = useState(false)
  const [latexTrashActive, setLatexTrashActive] = useState(false)

  const [latexInput, setLatexInput] = useState<LatexInputOverlay | null>(null)
  const [latexVal, setLatexVal] = useState('')
  const latexInputRef = useRef<HTMLInputElement>(null)

  const [textInput, setTextInput] = useState<TextInputOverlay | null>(null)
  const [textVal, setTextVal] = useState('')
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  const contentHeight = getContentHeight(canvas.strokes, canvas.latexBlocks as ExportBlock[])

  const clampScroll = useCallback((y: number) => {
    const h = canvasRef.current?.height ?? 800
    return Math.max(0, Math.min(contentHeight - h, y))
  }, [contentHeight])

  const redraw = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    drawCanvas(ctx, canvas.strokes, scrollYRef.current, el.width, el.height, showGrid)

    const sb = scrollbarRef.current
    if (sb) {
      const ratio = el.height / contentHeight
      const thumbH = Math.max(40, ratio * el.height)
      const thumbTop = (scrollYRef.current / contentHeight) * el.height
      const thumb = sb.querySelector('.thumb') as HTMLElement
      if (thumb) {
        thumb.style.height = `${thumbH}px`
        thumb.style.top = `${thumbTop}px`
      }
    }
  }, [canvas.strokes, contentHeight, showGrid])

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

  const drawPageObjects = useCallback((ctx: CanvasRenderingContext2D, pageTop: number, pageWidth: number, pageHeight: number) => {
    drawCanvas(ctx, canvas.strokes, pageTop, pageWidth, pageHeight, showGrid)

    for (const block of canvas.latexBlocks as ExportBlock[]) {
      const screenY = block.y - pageTop
      if (screenY < -120 || screenY > pageHeight + 120) continue

      if (block.kind === 'text') {
        drawExportText(ctx, block.source, block.x + 7, screenY + 4, {
          font: '15px system-ui, sans-serif',
          color: '#e8e6e1',
          lineHeight: 22,
          maxWidth: 520,
        })
      } else {
        drawExportText(ctx, `$${block.source}$`, block.x + 6, screenY + 2, {
          font: '16px serif',
          color: '#e8e6e1',
          lineHeight: 24,
          maxWidth: 520,
        })
      }
    }
  }, [canvas.latexBlocks, canvas.strokes, showGrid])

  const exportPdf = useCallback(() => {
    const source = canvasRef.current
    if (!source) return

    const pageWidth = Math.max(source.width, PDF_PAGE_WIDTH)
    const pageHeight = PDF_PAGE_HEIGHT
    const pageContentHeight = pageHeight - PDF_MARGIN * 2
    const totalPages = Math.max(1, Math.ceil(contentHeight / pageContentHeight))

    const pdf = new jsPDF({
      orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pageWidth, pageHeight],
      compress: true,
    })

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage([pageWidth, pageHeight], pageWidth > pageHeight ? 'landscape' : 'portrait')

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = pageWidth
      pageCanvas.height = pageHeight
      const ctx = pageCanvas.getContext('2d')
      if (!ctx) return

      ctx.fillStyle = '#111111'
      ctx.fillRect(0, 0, pageWidth, pageHeight)
      drawPageObjects(ctx, page * pageContentHeight - PDF_MARGIN, pageWidth, pageHeight)

      ctx.save()
      ctx.fillStyle = '#666'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(`${activeTab?.name ?? 'Nullspace'} · page ${page + 1}/${totalPages}`, PDF_MARGIN, pageHeight - 22)
      ctx.restore()

      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, pageHeight)
    }

    pdf.save(`${activeTab?.name ?? 'nullspace-note'}.pdf`.replace(/[^a-z0-9-_\.]/gi, '_'))
  }, [activeTab?.name, contentHeight, drawPageObjects])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedId) return
        e.preventDefault()
        const selectedBlock = canvas.latexBlocks.find(block => block.id === selectedId)
        const selectedStroke = canvas.strokes.find(stroke => stroke.id === selectedId)
        if (selectedBlock) canvas.removeLatexBlock(selectedId)
        else if (selectedStroke) canvas.removeStroke(selectedId, canvas.snapshot())
        setSelectedId(null)
        return
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); canvas.undo() }
        if (e.key === 'y') { e.preventDefault(); canvas.redo() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canvas, selectedId])

  useEffect(() => {
    const undo = () => canvas.undo()
    const redo = () => canvas.redo()
    const clear = () => { setSelectedId(null); canvas.clear() }
    const grid = () => setShowGrid(value => !value)
    const exportCanvas = () => exportPdf()

    window.addEventListener('nullspace:undo', undo)
    window.addEventListener('nullspace:redo', redo)
    window.addEventListener('nullspace:clear', clear)
    window.addEventListener('nullspace:grid', grid)
    window.addEventListener('nullspace:export', exportCanvas)

    return () => {
      window.removeEventListener('nullspace:undo', undo)
      window.removeEventListener('nullspace:redo', redo)
      window.removeEventListener('nullspace:clear', clear)
      window.removeEventListener('nullspace:grid', grid)
      window.removeEventListener('nullspace:export', exportCanvas)
    }
  }, [canvas, exportPdf])

  const latexPreview = latexVal
    ? katex.renderToString(latexVal, { throwOnError: false, displayMode: true })
    : ''

  const getPoint = (e: React.PointerEvent) => {
    const el = canvasRef.current!
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top + scrollYRef.current }
  }

  const getCursor = () => {
    if (tool === 'cursor') return 'default'
    if (tool === 'latex' || tool === 'text') return 'text'
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

    if (tool === 'latex') {
      const rect = canvasRef.current!.getBoundingClientRect()
      setLatexInput({ x: e.clientX - rect.left, y: e.clientY - rect.top, canvasScrollY: scrollYRef.current })
      setLatexVal('')
      setTool('pen')
      setTimeout(() => latexInputRef.current?.focus(), 10)
      return
    }

    if (tool === 'text') {
      const rect = canvasRef.current!.getBoundingClientRect()
      setTextInput({ x: e.clientX - rect.left, y: e.clientY - rect.top, canvasScrollY: scrollYRef.current })
      setTextVal('')
      setTool('pen')
      setTimeout(() => textInputRef.current?.focus(), 10)
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
        const cx = hit.points.reduce((a, p) => a + p.x, 0) / hit.points.length
        const cy = hit.points.reduce((a, p) => a + p.y, 0) / hit.points.length
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
    canvas.startStroke(pt.x, pt.y, color, tool === 'highlight' ? Math.max(lineWidth * 4, 16) : lineWidth, tool === 'highlight' ? 0.35 : 1)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'cursor' && selectedId && dragOffset.current) {
      const pt = getPoint(e)
      const stroke = canvas.strokes.find(s => s.id === selectedId)
      if (!stroke) return
      const cx = stroke.points.reduce((a, p) => a + p.x, 0) / stroke.points.length
      const cy = stroke.points.reduce((a, p) => a + p.y, 0) / stroke.points.length
      canvas.moveStroke(selectedId, (pt.x - dragOffset.current.dx) - cx, (pt.y - dragOffset.current.dy) - cy)
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
    if (tool === 'eraser') { isDrawing.current = false; return }
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

  const commitLatex = () => {
    if (!latexInput || !latexVal.trim()) { setLatexInput(null); setLatexVal(''); return }
    if (latexInput.editingId) canvas.removeLatexBlock(latexInput.editingId)
    canvas.addLatexBlock({ id: Math.random().toString(36).slice(2), x: latexInput.x, y: latexInput.y + latexInput.canvasScrollY, source: latexVal.trim(), kind: 'latex' })
    setLatexInput(null); setLatexVal(''); setTool('pen')
  }

  const commitText = () => {
    if (!textInput || !textVal.trim()) { setTextInput(null); setTextVal(''); return }
    if (textInput.editingId) canvas.removeLatexBlock(textInput.editingId)
    canvas.addLatexBlock({ id: Math.random().toString(36).slice(2), x: textInput.x, y: textInput.y + textInput.canvasScrollY, source: textVal, kind: 'text' })
    setTextInput(null); setTextVal(''); setTool('pen')
  }

  const editBlock = (block: ExportBlock) => {
    if (block.kind === 'text') {
      setTextInput({ x: block.x, y: block.y - scrollYState, canvasScrollY: scrollYState, editingId: block.id })
      setTextVal(block.source)
      setTimeout(() => textInputRef.current?.focus(), 10)
    } else {
      setLatexInput({ x: block.x, y: block.y - scrollYState, canvasScrollY: scrollYState, editingId: block.id })
      setLatexVal(block.source)
      setTimeout(() => latexInputRef.current?.focus(), 10)
    }
  }

  const startLatexDrag = (e: React.PointerEvent<HTMLDivElement>, blockId: string, blockX: number, blockY: number) => {
    if (tool !== 'cursor') return
    e.stopPropagation()
    setSelectedId(blockId)
    draggingLatexId.current = blockId
    setIsDraggingLatex(true)
    moveSnapRef.current = canvas.snapshot()
    latexDragOffset.current = { dx: e.clientX - blockX, dy: e.clientY - (blockY - scrollYState) }
    setLatexTrashActive(e.clientX < LATEX_TRASH_ZONE_X)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveLatexDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const id = draggingLatexId.current
    if (!id || !latexDragOffset.current) return
    setLatexTrashActive(e.clientX < LATEX_TRASH_ZONE_X)
    canvas.updateLatexBlock(id, { x: e.clientX - latexDragOffset.current.dx, y: e.clientY - latexDragOffset.current.dy + scrollYState })
  }

  const stopLatexDrag = () => {
    const id = draggingLatexId.current
    if (id && latexTrashActive) canvas.removeLatexBlock(id)
    else if (id && moveSnapRef.current) canvas.finishMoveLatexBlock(moveSnapRef.current)
    draggingLatexId.current = null
    latexDragOffset.current = null
    moveSnapRef.current = null
    setIsDraggingLatex(false)
    setLatexTrashActive(false)
  }

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', minWidth: 0 }}>
      <div style={{ padding: '11px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', flexShrink: 0, letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>{activeTab?.name ?? 'Untitled'}</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>[{tool}]</span>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{showGrid ? 'grid:on' : 'grid:off'}</span>
      </div>

      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <canvas ref={canvasRef} style={{ display: 'block', cursor: getCursor(), touchAction: 'none' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel} />

        {isDraggingLatex && (
          <div style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: latexTrashActive ? 82 : 70, height: latexTrashActive ? 82 : 70, borderRadius: 18, border: `1px solid ${latexTrashActive ? '#c87060' : 'rgba(200,112,96,0.45)'}`, background: latexTrashActive ? 'rgba(200,112,96,0.18)' : 'rgba(10,10,10,0.55)', color: latexTrashActive ? '#ff8a7a' : '#c87060', boxShadow: latexTrashActive ? '0 0 26px rgba(200,112,96,0.45)' : '0 8px 28px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 35, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', fontSize: 10, transition: 'all 0.12s ease' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
            <span>{latexTrashActive ? 'release' : 'trash'}</span>
          </div>
        )}

        {(canvas.latexBlocks as ExportBlock[]).map(block => {
          const isText = block.kind === 'text'
          const baseStyle: CSSProperties = { position: 'absolute', left: block.x, top: block.y - scrollYState, color: '#e8e6e1', fontSize: 15, lineHeight: isText ? 1.45 : undefined, pointerEvents: tool === 'cursor' ? 'auto' : 'none', userSelect: 'none', cursor: tool === 'cursor' ? 'move' : 'default', background: isText ? 'rgba(20,20,20,0.08)' : 'transparent', borderRadius: 4, padding: isText ? '4px 7px' : '2px 6px', border: selectedId === block.id ? '1px solid #6fa3d4' : '1px solid transparent', opacity: draggingLatexId.current === block.id && latexTrashActive ? 0.55 : 1, whiteSpace: isText ? 'pre-wrap' : undefined, minWidth: isText ? 80 : undefined, maxWidth: isText ? 520 : undefined, fontFamily: isText ? 'system-ui, sans-serif' : undefined }
          return isText ? (
            <div key={block.id} style={baseStyle} onPointerDown={e => startLatexDrag(e, block.id, block.x, block.y)} onPointerMove={moveLatexDrag} onPointerUp={stopLatexDrag} onPointerCancel={stopLatexDrag} onDoubleClick={() => tool === 'cursor' && editBlock(block)}>{block.source}</div>
          ) : (
            <div key={block.id} style={baseStyle} onPointerDown={e => startLatexDrag(e, block.id, block.x, block.y)} onPointerMove={moveLatexDrag} onPointerUp={stopLatexDrag} onPointerCancel={stopLatexDrag} onDoubleClick={() => tool === 'cursor' && editBlock(block)} dangerouslySetInnerHTML={{ __html: katex.renderToString(block.source, { throwOnError: false, displayMode: true }) }} />
          )
        })}

        {latexInput && (
          <div style={{ position: 'absolute', left: latexInput.x, top: latexInput.y, zIndex: 20, background: '#141414', border: '1px solid #6fa3d4', borderRadius: 6, padding: 10, minWidth: 220, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 10, color: '#6fa3d4', marginBottom: 6 }}>LaTeX</div>
            <input ref={latexInputRef} value={latexVal} onChange={e => setLatexVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitLatex(); if (e.key === 'Escape') { setLatexInput(null); setLatexVal(''); setTool('pen') } }} placeholder="\frac{1}{2} + x^2" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#e8e6e1', fontSize: 12, fontFamily: 'monospace' }} />
            {latexPreview && <div style={{ marginTop: 8, color: '#e8e6e1', fontSize: 14 }} dangerouslySetInnerHTML={{ __html: latexPreview }} />}
            <div style={{ marginTop: 6, fontSize: 9, color: '#555' }}>Enter to place · Esc to cancel</div>
          </div>
        )}

        {textInput && (
          <div style={{ position: 'absolute', left: textInput.x, top: textInput.y, zIndex: 20, background: 'rgba(20,20,20,0.92)', border: '1px solid #6db88a', borderRadius: 6, padding: 10, minWidth: 260, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 10, color: '#6db88a', marginBottom: 6 }}>Text</div>
            <textarea ref={textInputRef} value={textVal} onChange={e => setTextVal(e.target.value)} onBlur={commitText} onKeyDown={e => { if (e.key === 'Escape') { setTextInput(null); setTextVal(''); setTool('pen') } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitText() }} placeholder="Type notes here..." rows={4} style={{ width: 300, minHeight: 90, resize: 'both', background: 'transparent', border: 'none', outline: 'none', color: '#e8e6e1', fontSize: 14, lineHeight: 1.45, fontFamily: 'system-ui, sans-serif', whiteSpace: 'pre-wrap' }} />
            <div style={{ marginTop: 6, fontSize: 9, color: '#555' }}>Enter = line break · Ctrl+Enter or click away = place · Esc = cancel</div>
          </div>
        )}

        <div ref={scrollbarRef} style={{ position: 'absolute', right: 4, top: 8, bottom: 8, width: 5, borderRadius: 3, cursor: 'pointer' }} onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); const ratio = (e.clientY - rect.top) / rect.height; scrollYRef.current = clampScroll(ratio * contentHeight); setScrollYState(scrollYRef.current); redraw() }}>
          <div className="thumb" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 40, background: '#333', borderRadius: 3, transition: 'background 0.1s' }} onMouseEnter={e => (e.currentTarget.style.background = '#444')} onMouseLeave={e => (e.currentTarget.style.background = '#333')} />
        </div>
      </div>
    </main>
  )
}
