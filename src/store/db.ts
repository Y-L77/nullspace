import Dexie, { type Table } from 'dexie'
import type { Stroke } from '../hooks/useCanvas'

export interface NoteRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface StrokeRecord {
  id: string
  noteId: string
  points: { x: number; y: number }[]
  color: string
  width: number
  opacity: number
  order: number
}

export interface LatexRecord {
  id: string
  noteId: string
  x: number
  y: number
  source: string
  order: number
}

class NullspaceDB extends Dexie {
  notes!: Table<NoteRecord>
  strokes!: Table<StrokeRecord>
  latexBlocks!: Table<LatexRecord>

  constructor() {
    super('nullspace')
    this.version(1).stores({
      notes: 'id, createdAt',
      strokes: 'id, noteId, order',
    })
    this.version(2).stores({
      notes: 'id, createdAt',
      strokes: 'id, noteId, order',
      latexBlocks: 'id, noteId, order',
    })
  }
}

export const db = new NullspaceDB()

export async function getNotes(): Promise<NoteRecord[]> {
  return db.notes.orderBy('createdAt').toArray()
}

export async function createNote(id: string, name: string): Promise<void> {
  const now = Date.now()
  await db.notes.put({ id, name, createdAt: now, updatedAt: now })
}

export async function renameNote(id: string, name: string): Promise<void> {
  await db.notes.update(id, { name, updatedAt: Date.now() })
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id)
  await db.strokes.where('noteId').equals(id).delete()
  await db.latexBlocks.where('noteId').equals(id).delete()
}

export async function getStrokes(noteId: string): Promise<Stroke[]> {
  const records = await db.strokes.where('noteId').equals(noteId).sortBy('order')
  return records.map(r => ({ id: r.id, points: r.points, color: r.color, width: r.width, opacity: r.opacity ?? 1 }))
}

export async function saveStroke(noteId: string, stroke: Stroke, order: number): Promise<void> {
  await db.strokes.put({ ...stroke, noteId, order })
}

export async function replaceStrokes(noteId: string, strokes: Stroke[]): Promise<void> {
  await db.strokes.where('noteId').equals(noteId).delete()
  if (strokes.length > 0) {
    await db.strokes.bulkPut(strokes.map((s, i) => ({ ...s, noteId, order: i })))
  }
}

export interface LatexBlock {
  id: string
  x: number
  y: number
  source: string
}

export async function getLatexBlocks(noteId: string): Promise<LatexBlock[]> {
  const records = await db.latexBlocks.where('noteId').equals(noteId).sortBy('order')
  return records.map(r => ({ id: r.id, x: r.x, y: r.y, source: r.source }))
}

export async function saveLatexBlock(noteId: string, block: LatexBlock, order: number): Promise<void> {
  await db.latexBlocks.put({ ...block, noteId, order })
}

export async function deleteLatexBlock(noteId: string, id: string): Promise<void> {
  await db.latexBlocks
    .where('noteId')
    .equals(noteId)
    .and(block => block.id === id)
    .delete()
}

export async function replaceLatexBlocks(noteId: string, blocks: LatexBlock[]): Promise<void> {
  await db.latexBlocks.where('noteId').equals(noteId).delete()
  if (blocks.length > 0) {
    await db.latexBlocks.bulkPut(blocks.map((b, i) => ({ ...b, noteId, order: i })))
  }
}
