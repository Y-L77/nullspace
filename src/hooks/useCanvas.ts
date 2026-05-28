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

export function useCanvas(noteId: string | null) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [latexBlocks, setLatexBlocks] = useState<LatexBlock[]>([])
  const [history, setHistory] = useState<{ strokes: Stroke[]; latex: LatexBlock[] }[]>([])
  const [future, setFuture] = useState<{ strokes: Stroke[]; latex: LatexBlock[] }[]>([])

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

  const snapshot = useCallback(() => ({
    strokes: strokesRef.current,
    latex: latexRef.current,
  }), [])

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

  const endStroke = useCallback((snap: { strokes: Stroke[]; latex: LatexBlock[] }) => {
    const id = activeStrokeId.current
    const nid = noteIdRef.current
    if (!id || !nid) return
    activeStrokeId.current = null
    setHistory(h => [...h, snap])
    setFuture([])
    const stroke = strokesRef.current.find(s => s.id === id)
    if (stroke) saveStroke(nid, stroke, strokesRef.current.length - 1)
  }, [])

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

  const addLatexBlock = useCallback((block: LatexBlock) => {
    const nid = noteIdRef.current
    if (!nid) return
    setHistory(h => [...h, snapshot()])
    setFuture([])
    const next = [...latexRef.current, block]
    latexRef.current = next
    setLatexBlocks(next)
    saveLatexBlock(nid, block, next.length - 1)
  }, [snapshot])

  const updateLatexBlock = useCallback((id: string, changes: Partial<LatexBlock>) => {
    const nid = noteIdRef.current
    if (!nid) return
    const next = latexRef.current.map(b => b.id === id ? { ...b, ...changes } : b)
    latexRef.current = next
    setLatexBlocks(next)
    const updated = next.find(b => b.id === id)
    if (updated) saveLatexBlock(nid, updated, next.indexOf(updated))
  }, [])

  const removeLatexBlock = useCallback((id: string) => {
    const nid = noteIdRef.current
    if (!nid) return
    setHistory(h => [...h, snapshot()])
    setFuture([])
    const next = latexRef.current.filter(b => b.id !== id)
    latexRef.current = next
    setLatexBlocks(next)
    deleteLatexBlock(nid, id)
  }, [snapshot])

  const undo = useCallback(() => {
    const nid = noteIdRef.current
    setHistory(h => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setFuture(f => [snapshot(), ...f])
      strokesRef.current = prev.strokes
      latexRef.current = prev.latex
      setStrokes(prev.strokes)
      setLatexBlocks(prev.latex)
      if (nid) {
        replaceStrokes(nid, prev.strokes)
        replaceLatexBlocks(nid, prev.latex)
      }
      return h.slice(0, -1)
    })
  }, [snapshot])

  const redo = useCallback(() => {
    const nid = noteIdRef.current
    setFuture(f => {
      if (f.length === 0) return f
      const next = f[0]
      setHistory(h => [...h, snapshot()])
      strokesRef.current = next.strokes
      latexRef.current = next.latex
      setStrokes(next.strokes)
      setLatexBlocks(next.latex)
      if (nid) {
        replaceStrokes(nid, next.strokes)
        replaceLatexBlocks(nid, next.latex)
      }
      return f.slice(1)
    })
  }, [snapshot])

  const clear = useCallback(() => {
    const nid = noteIdRef.current
    if (!nid) return
    setHistory(h => [...h, snapshot()])
    setFuture([])
    strokesRef.current = []
    latexRef.current = []
    setStrokes([])
    setLatexBlocks([])
    replaceStrokes(nid, [])
    replaceLatexBlocks(nid, [])
  }, [snapshot])

  return {
    strokes, latexBlocks,
    startStroke, continueStroke, endStroke, moveStroke,
    addLatexBlock, updateLatexBlock, removeLatexBlock,
    undo, redo, clear,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    snapshot,
  }
}