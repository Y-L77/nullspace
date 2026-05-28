import { useEffect, useRef, useCallback, useState, type CSSProperties } from 'react'
import jsPDF from 'jspdf'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useCanvas } from '../hooks/useCanvas'
import { useTabStore } from '../store/tabs'
import { useToolbarStore } from '../store/toolbar'

const MIN_H = 3000
const DOT = 28
const TRASH_X = 140
const PDF_W = 816
const PDF_H = 1056
const PDF_M = 36

type Block = { id: string; x: number; y: number; source: string; kind?: 'latex' | 'text' }
type Pt = { x: number; y: number }
type StrokeLike = { id: string; points: Pt[]; color: string; width: number; opacity: number }

function contentHeight(strokes: { points: Pt[] }[], blocks: Block[]) {
  const sy = strokes.reduce((m, s) => Math.max(m, ...s.points.map(p => p.y), 0), 0)
  const by = blocks.reduce((m, b) => Math.max(m, b.y + (b.kind === 'text' ? b.source.split('\n').length * 24 + 80 : 100)), 0)
  return Math.max(MIN_H, sy + 700, by)
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, maxWidth = 520) {
  ctx.save(); ctx.font = font; ctx.fillStyle = '#e8e6e1'; ctx.textBaseline = 'top'
  let yy = y
  for (const line of text.split('\n')) {
    let cur = ''
    for (const word of line.split(' ')) {
      const test = cur ? `${cur} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && cur) { ctx.fillText(cur, x, yy); yy += 22; cur = word }
      else cur = test
    }
    ctx.fillText(cur, x, yy); yy += 22
  }
  ctx.restore()
}

function draw(ctx: CanvasRenderingContext2D, strokes: StrokeLike[], camY: number, w: number, h: number, grid: boolean, zoom: number) {
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, 0, w, h)
  if (grid) {
    ctx.fillStyle = '#2a2a2a'
    const sy = camY - (camY % DOT)
    for (let x = DOT; x < w / zoom + DOT; x += DOT) for (let y = sy; y < camY + h / zoom + DOT; y += DOT) {
      ctx.beginPath(); ctx.arc(x * zoom, (y - camY) * zoom, Math.max(0.7, 0.9 * zoom), 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(0, -camY)
  for (const s of strokes) {
    if (!s.points.length) continue
    ctx.globalAlpha = s.opacity ?? 1; ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath()
    const p = s.points; ctx.moveTo(p[0].x, p[0].y)
    if (p.length === 1) ctx.lineTo(p[0].x + 0.1, p[0].y)
    else { for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2); ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y) }
    ctx.stroke(); ctx.globalAlpha = 1
  }
  ctx.restore()
}

function hitStroke(s: { points: Pt[]; width?: number }, x: number, y: number) {
  const r = Math.max(12, (s.width ?? 2) + 8)
  return s.points.some(p => Math.hypot(p.x - x, p.y - y) < r)
}

type Overlay = { x: number; y: number; camY: number; editingId?: string }

export default function Canvas() {
  const { tabs, activeId } = useTabStore(); const activeTab = tabs.find(t => t.id === activeId)
  const { tool, color, lineWidth, setTool } = useToolbarStore(); const canvas = useCanvas(activeId)
  const canvasRef = useRef<HTMLCanvasElement>(null), containerRef = useRef<HTMLDivElement>(null), barRef = useRef<HTMLDivElement>(null)
  const camY = useRef(0), zoomRef = useRef(1), pan = useRef<{ y: number; cy: number } | null>(null)
  const [cameraY, setCameraYState] = useState(0); const [zoom, setZoomState] = useState(1); const [grid, setGrid] = useState(true)
  const drawing = useRef(false), snap = useRef<ReturnType<typeof canvas.snapshot> | null>(null), moveSnap = useRef<ReturnType<typeof canvas.snapshot> | null>(null)
  const [selected, setSelected] = useState<string | null>(null); const drag = useRef<{ dx: number; dy: number } | null>(null)
  const blockDrag = useRef<{ id: string; dx: number; dy: number } | null>(null); const [draggingBlock, setDraggingBlock] = useState(false); const [trash, setTrash] = useState(false)
  const [latexBox, setLatexBox] = useState<Overlay | null>(null), [latexVal, setLatexVal] = useState(''); const latexRef = useRef<HTMLInputElement>(null)
  const [textBox, setTextBox] = useState<Overlay | null>(null), [textVal, setTextVal] = useState(''); const textRef = useRef<HTMLTextAreaElement>(null)
  const blocks = canvas.latexBlocks as Block[]; const height = contentHeight(canvas.strokes, blocks)

  const clampY = useCallback((y: number, z = zoomRef.current) => {
    const el = canvasRef.current, vh = (el?.height ?? 800) / z
    return Math.max(0, Math.min(Math.max(0, height - vh), y))
  }, [height])
  const setCamY = useCallback((y: number, z = zoomRef.current) => { const n = clampY(y, z); camY.current = n; setCameraYState(n) }, [clampY])
  const world = (clientX: number, clientY: number) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: (clientX - r.left) / zoomRef.current, y: (clientY - r.top) / zoomRef.current + camY.current } }

  const redraw = useCallback(() => {
    const el = canvasRef.current, ctx = el?.getContext('2d'); if (!el || !ctx) return
    draw(ctx, canvas.strokes, camY.current, el.width, el.height, grid, zoomRef.current)
    const thumb = barRef.current?.querySelector('.thumb') as HTMLElement | null
    if (thumb) { const visibleH = el.height / zoomRef.current; thumb.style.height = `${Math.max(40, (visibleH / height) * el.height)}px`; thumb.style.top = `${(camY.current / height) * el.height}px` }
  }, [canvas.strokes, grid, height])
  useEffect(() => { zoomRef.current = zoom; redraw() }, [zoom, redraw])
  useEffect(() => { const c = containerRef.current, el = canvasRef.current; if (!c || !el) return; const ro = new ResizeObserver(() => { el.width = c.clientWidth; el.height = c.clientHeight; setCamY(camY.current); redraw() }); ro.observe(c); return () => ro.disconnect() }, [redraw, setCamY])
  useEffect(() => { redraw() }, [redraw, cameraY])

  const exportPdf = useCallback(() => {
    const el = canvasRef.current; if (!el) return
    const pageW = Math.max(el.width, PDF_W), pageH = PDF_H, pageContent = pageH - PDF_M * 2, total = Math.max(1, Math.ceil(height / pageContent))
    const pdf = new jsPDF({ orientation: pageW > pageH ? 'landscape' : 'portrait', unit: 'px', format: [pageW, pageH], compress: true })
    for (let i = 0; i < total; i++) {
      if (i) pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait')
      const out = document.createElement('canvas'); out.width = pageW; out.height = pageH; const ctx = out.getContext('2d'); if (!ctx) return
      const top = i * pageContent - PDF_M; draw(ctx, canvas.strokes, top, pageW, pageH, grid, 1)
      for (const b of blocks) { const y = b.y - top; if (y < -120 || y > pageH + 120) continue; drawText(ctx, b.kind === 'text' ? b.source : `$${b.source}$`, b.x + 7, y + 4, b.kind === 'text' ? '15px system-ui, sans-serif' : '16px serif') }
      ctx.fillStyle = '#666'; ctx.font = '11px system-ui'; ctx.fillText(`${activeTab?.name ?? 'Nullspace'} · page ${i + 1}/${total}`, PDF_M, pageH - 22)
      pdf.addImage(out.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, pageH)
    }
    pdf.save(`${activeTab?.name ?? 'nullspace-note'}.pdf`.replace(/[^a-z0-9-_\.]/gi, '_'))
  }, [activeTab?.name, blocks, canvas.strokes, grid, height])

  useEffect(() => {
    const key = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return; if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); const b = blocks.find(x => x.id === selected), s = canvas.strokes.find(x => x.id === selected); if (b) canvas.removeLatexBlock(selected); else if (s) canvas.removeStroke(selected, canvas.snapshot()); setSelected(null) } if (e.ctrlKey || e.metaKey) { if (e.key === 'z') { e.preventDefault(); canvas.undo() } if (e.key === 'y') { e.preventDefault(); canvas.redo() } } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [blocks, canvas, selected])
  useEffect(() => {
    const gridHandler = () => setGrid(v => !v)
    const zoomTo = (e: Event) => { const z = (e as CustomEvent<number>).detail; if (![1, 1.5, 2, 3].includes(z)) return; const el = canvasRef.current, old = zoomRef.current, cy = camY.current + (el?.height ?? 800) / (2 * old); zoomRef.current = z; setZoomState(z); setCamY(cy - (el?.height ?? 800) / (2 * z), z) }
    const clear = () => { setSelected(null); canvas.clear() }
    window.addEventListener('nullspace:undo', canvas.undo); window.addEventListener('nullspace:redo', canvas.redo); window.addEventListener('nullspace:clear', clear); window.addEventListener('nullspace:grid', gridHandler); window.addEventListener('nullspace:export', exportPdf); window.addEventListener('nullspace:zoom', zoomTo)
    return () => { window.removeEventListener('nullspace:undo', canvas.undo); window.removeEventListener('nullspace:redo', canvas.redo); window.removeEventListener('nullspace:clear', clear); window.removeEventListener('nullspace:grid', gridHandler); window.removeEventListener('nullspace:export', exportPdf); window.removeEventListener('nullspace:zoom', zoomTo) }
  }, [canvas, exportPdf, setCamY])

  const getCursor = () => pan.current ? 'grabbing' : tool === 'cursor' ? 'default' : (tool === 'latex' || tool === 'text') ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair'
  const eraseAt = (x: number, y: number) => { const hit = [...canvas.strokes].reverse().find(s => hitStroke(s, x, y)); if (!hit) return; canvas.removeStroke(hit.id, canvas.snapshot()) }
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) { e.preventDefault(); pan.current = { y: e.clientY, cy: camY.current }; e.currentTarget.setPointerCapture(e.pointerId); return }
    if (e.button !== 0) return
    if (tool === 'latex' || tool === 'text') { const r = canvasRef.current!.getBoundingClientRect(), box = { x: e.clientX - r.left, y: e.clientY - r.top, camY: camY.current }; if (tool === 'latex') { setLatexBox(box); setLatexVal(''); setTimeout(() => latexRef.current?.focus(), 10) } else { setTextBox(box); setTextVal(''); setTimeout(() => textRef.current?.focus(), 10) } setTool('pen'); return }
    if (tool === 'eraser') { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const p = world(e.clientX, e.clientY); eraseAt(p.x, p.y); return }
    if (tool === 'cursor') { const p = world(e.clientX, e.clientY), hit = [...canvas.strokes].reverse().find(s => hitStroke(s, p.x, p.y)); if (hit) { setSelected(hit.id); moveSnap.current = canvas.snapshot(); const cx = hit.points.reduce((a, p) => a + p.x, 0) / hit.points.length, cy = hit.points.reduce((a, p) => a + p.y, 0) / hit.points.length; drag.current = { dx: p.x - cx, dy: p.y - cy }; e.currentTarget.setPointerCapture(e.pointerId) } else { setSelected(null); drag.current = null; moveSnap.current = null } return }
    e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; snap.current = canvas.snapshot(); const p = world(e.clientX, e.clientY); canvas.startStroke(p.x, p.y, color, tool === 'highlight' ? Math.max(lineWidth * 4, 16) : lineWidth, tool === 'highlight' ? 0.35 : 1)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (pan.current) { setCamY(pan.current.cy - (e.clientY - pan.current.y) / zoomRef.current); return }
    if (tool === 'cursor' && selected && drag.current) { const p = world(e.clientX, e.clientY), s = canvas.strokes.find(s => s.id === selected); if (!s) return; const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length, cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length; canvas.moveStroke(selected, (p.x - drag.current.dx) - cx, (p.y - drag.current.dy) - cy); return }
    if (tool === 'eraser' && drawing.current) { const p = world(e.clientX, e.clientY); eraseAt(p.x, p.y); return }
    if (!drawing.current) return; const p = world(e.clientX, e.clientY); canvas.continueStroke(p.x, p.y)
  }
  const onPointerUp = () => { if (pan.current) { pan.current = null; return } if (tool === 'cursor') { if (selected && moveSnap.current) canvas.finishMoveStroke(moveSnap.current); drag.current = null; moveSnap.current = null; return } if (tool === 'eraser') { drawing.current = false; return } if (!drawing.current) return; drawing.current = false; canvas.endStroke(snap.current!); snap.current = null }
  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); setCamY(camY.current + e.deltaY / zoomRef.current) }
  const commitLatex = () => { if (!latexBox || !latexVal.trim()) { setLatexBox(null); setLatexVal(''); return } if (latexBox.editingId) canvas.removeLatexBlock(latexBox.editingId); canvas.addLatexBlock({ id: Math.random().toString(36).slice(2), x: latexBox.x / zoomRef.current, y: latexBox.y / zoomRef.current + latexBox.camY, source: latexVal.trim(), kind: 'latex' }); setLatexBox(null); setLatexVal('') }
  const commitText = () => { if (!textBox || !textVal.trim()) { setTextBox(null); setTextVal(''); return } if (textBox.editingId) canvas.removeLatexBlock(textBox.editingId); canvas.addLatexBlock({ id: Math.random().toString(36).slice(2), x: textBox.x / zoomRef.current, y: textBox.y / zoomRef.current + textBox.camY, source: textVal, kind: 'text' }); setTextBox(null); setTextVal('') }
  const editBlock = (b: Block) => { const sx = b.x * zoomRef.current, sy = (b.y - camY.current) * zoomRef.current; if (b.kind === 'text') { setTextBox({ x: sx, y: sy, camY: camY.current, editingId: b.id }); setTextVal(b.source); setTimeout(() => textRef.current?.focus(), 10) } else { setLatexBox({ x: sx, y: sy, camY: camY.current, editingId: b.id }); setLatexVal(b.source); setTimeout(() => latexRef.current?.focus(), 10) } }
  const startBlockDrag = (e: React.PointerEvent<HTMLDivElement>, b: Block) => { if (tool !== 'cursor') return; e.stopPropagation(); const p = world(e.clientX, e.clientY); setSelected(b.id); setDraggingBlock(true); moveSnap.current = canvas.snapshot(); blockDrag.current = { id: b.id, dx: p.x - b.x, dy: p.y - b.y }; setTrash(e.clientX < TRASH_X); e.currentTarget.setPointerCapture(e.pointerId) }
  const moveBlockDrag = (e: React.PointerEvent<HTMLDivElement>) => { if (!blockDrag.current) return; const p = world(e.clientX, e.clientY); setTrash(e.clientX < TRASH_X); canvas.updateLatexBlock(blockDrag.current.id, { x: p.x - blockDrag.current.dx, y: p.y - blockDrag.current.dy }) }
  const stopBlockDrag = () => { const id = blockDrag.current?.id; if (id && trash) canvas.removeLatexBlock(id); else if (id && moveSnap.current) canvas.finishMoveLatexBlock(moveSnap.current); blockDrag.current = null; moveSnap.current = null; setDraggingBlock(false); setTrash(false) }
  const latexPreview = latexVal ? katex.renderToString(latexVal, { throwOnError: false, displayMode: true }) : ''

  return <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', minWidth: 0, maxWidth: '100%' }}>
    <div style={{ padding: '11px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}><span>{activeTab?.name ?? 'Untitled'}</span><span style={{ fontSize: 10, color: 'var(--text3)' }}>[{tool}]</span><span style={{ fontSize: 10, color: 'var(--text3)' }}>{grid ? 'grid:on' : 'grid:off'}</span><span style={{ fontSize: 10, color: 'var(--text3)' }}>zoom:{Math.round(zoom * 100)}%</span><span style={{ fontSize: 10, color: 'var(--text3)' }}>right-drag: vertical pan</span></div>
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, maxWidth: '100%' }} onContextMenu={e => e.preventDefault()}>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: getCursor(), touchAction: 'none', maxWidth: '100%' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel} />
      {draggingBlock && <div style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: trash ? 82 : 70, height: trash ? 82 : 70, borderRadius: 18, border: `1px solid ${trash ? '#c87060' : 'rgba(200,112,96,0.45)'}`, background: trash ? 'rgba(200,112,96,0.18)' : 'rgba(10,10,10,0.55)', color: trash ? '#ff8a7a' : '#c87060', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 35, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', fontSize: 10 }}><span style={{ fontSize: 27 }}>🗑</span><span>{trash ? 'release' : 'trash'}</span></div>}
      {blocks.map(b => { const isText = b.kind === 'text', sx = b.x * zoom, sy = (b.y - cameraY) * zoom; const style: CSSProperties = { position: 'absolute', left: sx, top: sy, transform: `scale(${zoom})`, transformOrigin: 'top left', color: '#e8e6e1', fontSize: 15, lineHeight: isText ? 1.45 : undefined, pointerEvents: tool === 'cursor' ? 'auto' : 'none', userSelect: 'none', cursor: tool === 'cursor' ? 'move' : 'default', background: isText ? 'rgba(20,20,20,0.08)' : 'transparent', borderRadius: 4, padding: isText ? '4px 7px' : '2px 6px', border: selected === b.id ? '1px solid #6fa3d4' : '1px solid transparent', whiteSpace: isText ? 'pre-wrap' : undefined, minWidth: isText ? 80 : undefined, maxWidth: isText ? 520 : undefined, fontFamily: isText ? 'system-ui, sans-serif' : undefined }; return isText ? <div key={b.id} style={style} onPointerDown={e => startBlockDrag(e, b)} onPointerMove={moveBlockDrag} onPointerUp={stopBlockDrag} onPointerCancel={stopBlockDrag} onDoubleClick={() => tool === 'cursor' && editBlock(b)}>{b.source}</div> : <div key={b.id} style={style} onPointerDown={e => startBlockDrag(e, b)} onPointerMove={moveBlockDrag} onPointerUp={stopBlockDrag} onPointerCancel={stopBlockDrag} onDoubleClick={() => tool === 'cursor' && editBlock(b)} dangerouslySetInnerHTML={{ __html: katex.renderToString(b.source, { throwOnError: false, displayMode: true }) }} /> })}
      {latexBox && <div style={{ position: 'absolute', left: latexBox.x, top: latexBox.y, zIndex: 20, background: '#141414', border: '1px solid #6fa3d4', borderRadius: 6, padding: 10, minWidth: 220, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}><div style={{ fontSize: 10, color: '#6fa3d4', marginBottom: 6 }}>LaTeX</div><input ref={latexRef} value={latexVal} onChange={e => setLatexVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitLatex(); if (e.key === 'Escape') { setLatexBox(null); setLatexVal('') } }} placeholder="\frac{1}{2} + x^2" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#e8e6e1', fontSize: 12, fontFamily: 'monospace' }} />{latexPreview && <div style={{ marginTop: 8, color: '#e8e6e1', fontSize: 14 }} dangerouslySetInnerHTML={{ __html: latexPreview }} />}<div style={{ marginTop: 6, fontSize: 9, color: '#555' }}>Enter to place · Esc to cancel</div></div>}
      {textBox && <div style={{ position: 'absolute', left: textBox.x, top: textBox.y, zIndex: 20, background: 'rgba(20,20,20,0.92)', border: '1px solid #6db88a', borderRadius: 6, padding: 10, minWidth: 260, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}><div style={{ fontSize: 10, color: '#6db88a', marginBottom: 6 }}>Text</div><textarea ref={textRef} value={textVal} onChange={e => setTextVal(e.target.value)} onBlur={commitText} onKeyDown={e => { if (e.key === 'Escape') { setTextBox(null); setTextVal('') } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitText() }} placeholder="Type notes here..." rows={4} style={{ width: 300, minHeight: 90, resize: 'both', background: 'transparent', border: 'none', outline: 'none', color: '#e8e6e1', fontSize: 14, lineHeight: 1.45, fontFamily: 'system-ui, sans-serif', whiteSpace: 'pre-wrap' }} /><div style={{ marginTop: 6, fontSize: 9, color: '#555' }}>Enter = line break · Ctrl+Enter or click away = place · Esc = cancel</div></div>}
      <div ref={barRef} style={{ position: 'absolute', right: 4, top: 8, bottom: 8, width: 5, borderRadius: 3, cursor: 'pointer' }} onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setCamY(((e.clientY - r.top) / r.height) * height) }}><div className="thumb" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 40, background: '#333', borderRadius: 3 }} /></div>
    </div>
  </main>
}
