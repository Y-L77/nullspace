import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getStrokes, saveStroke, replaceStrokes,
  getLatexBlocks, saveLatexBlock, replaceLatexBlocks, deleteLatexBlock,
} from '../store/db'
import type { LatexBlock } from '../store/db'

export interface Stroke {
  id: string
  points: { x: number; y: number }[]
  color: string
  width: number
  opacity: number
}

interface CanvasSnapshot {
  strokes: Stroke[]
  latex: LatexBlock[]
}

function cloneSnapshot(strokes: Stroke[], latex: LatexBlock[]): CanvasSnapshot {
  return {
    strokes: strokes.map(stroke => ({
      ...stroke,
      points: stroke.points.map(point => ({ ...point })),
    })),
    latex: latex.map(block => ({ ...block })),
  }
}

export function useCanvas(noteId: string | null) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [latexBlocks, setLatexBlocks] = useState<LatexBlock[]>([])
  const [history, setHistory] = useState<CanvasSnapshot[]>([])
  const [future, setFuture] = useState<CanvasSnapshot[]>([])

  const activeStrokeId = useRef<string | null>(null)
  const noteIdRef = useRef(noteId)
  const strokesRef = useRef<Stroke[]>([])
  const latexRef = useRef<LatexBlock[]>([])

  useEffect(() => { noteIdRef.current = noteId }, [noteId])
  useEffect(() => { strokesRef.current = strokes }, [strokes])
  useEffect(() => { latexRef.current = latexBlocks }, [latexBlocks])

  useEffect(() => {
    if (!noteId) return
    let cancelled = false

    Promise.all([getStrokes(noteId), getLatexBlocks(noteId)]).then(([loadedStrokes, loadedLatex]) => {
      if (cancelled) return
      strokesRef.current = loadedStrokes as Stroke[]
      latexRef.current = loadedLatex
      setStrokes(loadedStrokes as Stroke[])
      setLatexBlocks(loadedLatex)
      setHistory([])
      setFuture([])
    })

    return () => { cancelled = true }
  }, [noteId])

  const snapshot = useCallback((): CanvasSnapshot => {
    return cloneSnapshot(strokesRef.current, latexRef.current)
  }, [])

  const persistAll = useCallback((snap: CanvasSnapshot) => {
    const nid = noteIdRef.current
    if (!nid) return
    replaceStrokes(nid, snap.strokes)
    replaceLatexBlocks(nid, snap.latex)
  }, [])

  const pushHistory = useCallback((snap: CanvasSnapshot) => {
    setHistory(h => [...h, snap])
    setFuture([])
  }, [])

  const startStroke = useCallback((x: number, y: number, color: string, width: number, opacity: number) => {
    const id = Math.random().toString(36).slice(2)
    activeStrokeId.current = id
    const newStroke: Stroke = { id, points: [{ x, y }], color, width, opacity }
    const next = [...strokesRef.current, newStroke]
    strokesRef.current = next
    setStrokes(next)
  }, [])

  const continueStroke = useCallback((x: number, y: number) => {
    const id = activeStrokeId.current
    if (!id) return

    const next = strokesRef.current.map(s =>
      s.id === id ? { ...s, points: [...s.points, { x, y }] } : s
    )
    strokesRef.current = next
    setStrokes(next)
  }, [])

  const endStroke = useCallback((snap: CanvasSnapshot) => {
    const id = activeStrokeId.current
    const nid = noteIdRef.current
    if (!id || !nid) return

    activeStrokeId.current = null
    pushHistory(snap)

    const stroke = strokesRef.current.find(s => s.id === id)
    if (stroke) saveStroke(nid, stroke, strokesRef.current.length - 1)
  }, [pushHistory])

  const moveStroke = useCallback((id: string, ddx: number, ddy: number) => {
    const nid = noteIdRef.current
    const next = strokesRef.current.map(s =>
      s.id === id
        ? { ...s, points: s.points.map(p => ({ x: p.x + ddx, y: p.y + ddy })) }
        : s
    )

    strokesRef.current = next
    setStrokes(next)

    if (nid) {
      const stroke = next.find(s => s.id === id)
      if (stroke) saveStroke(nid, stroke, next.indexOf(stroke))
    }
  }, [])

  const finishMoveStroke = useCallback((snap: CanvasSnapshot | null) => {
    if (!snap) return
    pushHistory(snap)
    persistAll(snapshot())
  }, [persistAll, pushHistory, snapshot])

  const removeStroke = useCallback((id: string, snap: CanvasSnapshot) => {
    const nid = noteIdRef.current
    if (!nid) return

    const next = strokesRef.current.filter(stroke => stroke.id !== id)
    strokesRef.current = next
    setStrokes(next)
    pushHistory(snap)
    replaceStrokes(nid, next)
  }, [pushHistory])

  const addLatexBlock = useCallback((block: LatexBlock) => {
    const nid = noteIdRef.current
    if (!nid) return

    pushHistory(snapshot())
    const next = [...latexRef.current, block]
    latexRef.current = next
    setLatexBlocks(next)
    saveLatexBlock(nid, block, next.length - 1)
  }, [pushHistory, snapshot])

  const updateLatexBlock = useCallback((id: string, changes: Partial<LatexBlock>) => {
    const nid = noteIdRef.current
    if (!nid) return

    const next = latexRef.current.map(b => b.id === id ? { ...b, ...changes } : b)
    latexRef.current = next
    setLatexBlocks(next)

    const updated = next.find(b => b.id === id)
    if (updated) saveLatexBlock(nid, updated, next.indexOf(updated))
  }, [])

  const finishMoveLatexBlock = useCallback((snap: CanvasSnapshot | null) => {
    if (!snap) return
    pushHistory(snap)
    persistAll(snapshot())
  }, [persistAll, pushHistory, snapshot])

  const removeLatexBlock = useCallback((id: string) => {
    const nid = noteIdRef.current
    if (!nid) return

    pushHistory(snapshot())
    const next = latexRef.current.filter(b => b.id !== id)
    latexRef.current = next
    setLatexBlocks(next)
    deleteLatexBlock(nid, id)
  }, [pushHistory, snapshot])

  const undo = useCallback(() => {
    const nid = noteIdRef.current
    setHistory(h => {
      if (h.length === 0) return h

      const prev = h[h.length - 1]
      const current = snapshot()
      setFuture(f => [current, ...f])

      strokesRef.current = prev.strokes
      latexRef.current = prev.latex
      setStrokes(prev.strokes)
      setLatexBlocks(prev.latex)

      if (nid) persistAll(prev)
      return h.slice(0, -1)
    })
  }, [persistAll, snapshot])

  const redo = useCallback(() => {
    const nid = noteIdRef.current
    setFuture(f => {
      if (f.length === 0) return f

      const next = f[0]
      const current = snapshot()
      setHistory(h => [...h, current])

      strokesRef.current = next.strokes
      latexRef.current = next.latex
      setStrokes(next.strokes)
      setLatexBlocks(next.latex)

      if (nid) persistAll(next)
      return f.slice(1)
    })
  }, [persistAll, snapshot])

  const clear = useCallback(() => {
    const nid = noteIdRef.current
    if (!nid) return

    const current = snapshot()
    if (current.strokes.length === 0 && current.latex.length === 0) return

    pushHistory(current)
    strokesRef.current = []
    latexRef.current = []
    setStrokes([])
    setLatexBlocks([])
    replaceStrokes(nid, [])
    replaceLatexBlocks(nid, [])
  }, [pushHistory, snapshot])

  return {
    strokes, latexBlocks,
    startStroke, continueStroke, endStroke, moveStroke, finishMoveStroke, removeStroke,
    addLatexBlock, updateLatexBlock, finishMoveLatexBlock, removeLatexBlock,
    undo, redo, clear,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    snapshot,
  }
}
