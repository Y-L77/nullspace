import { create } from 'zustand'
import { getNotes, createNote, renameNote, deleteNote } from './db'

export interface Tab {
  id: string
  name: string
  createdAt: number
}

interface TabStore {
  tabs: Tab[]
  activeId: string | null
  loaded: boolean
  loadTabs: () => Promise<void>
  addTab: () => Promise<void>
  removeTab: (id: string) => Promise<void>
  setActive: (id: string) => void
  renameTab: (id: string, name: string) => Promise<void>
}

const makeId = () => Math.random().toString(36).slice(2, 10)

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeId: null,
  loaded: false,

  loadTabs: async () => {
    let notes = await getNotes()
    if (notes.length === 0) {
      const id = makeId()
      await createNote(id, 'Note 1')
      notes = await getNotes()
    }
    set({ tabs: notes, activeId: notes[0].id, loaded: true })
  },

  addTab: async () => {
    const id = makeId()
    const n = get().tabs.length + 1
    await createNote(id, `Note ${n}`)
    const notes = await getNotes()
    set({ tabs: notes, activeId: id })
  },

  removeTab: async (id) => {
    const { tabs, activeId } = get()
    if (tabs.length === 1) return
    const idx = tabs.findIndex(t => t.id === id)
    const next = tabs[idx === 0 ? 1 : idx - 1]
    await deleteNote(id)
    const notes = await getNotes()
    set({ tabs: notes, activeId: activeId === id ? next.id : activeId })
  },

  setActive: (id) => set({ activeId: id }),

  renameTab: async (id, name) => {
    await renameNote(id, name)
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, name } : t) }))
  },
}))