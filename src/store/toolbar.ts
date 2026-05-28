import { create } from 'zustand'

export type Tool = 'pen' | 'highlight' | 'eraser' | 'cursor' | 'latex' | 'text'

export const COLOR_OPTIONS = [
  { name: 'chalk', value: '#e8e6e1' },
  { name: 'gold', value: '#c8b560' },
  { name: 'blue', value: '#6fa3d4' },
  { name: 'purple', value: '#a07cba' },
  { name: 'green', value: '#6db88a' },
  { name: 'red', value: '#c87060' },
  { name: 'gray', value: '#888888' },
]

export const COLORS = COLOR_OPTIONS.map(color => color.value)

interface ToolbarStore {
  tool: Tool
  color: string
  lineWidth: number
  setTool: (tool: Tool) => void
  setColor: (color: string) => void
  setLineWidth: (lineWidth: number) => void
}

export const useToolbarStore = create<ToolbarStore>((set) => ({
  tool: 'pen',
  color: COLOR_OPTIONS[0].value,
  lineWidth: 2,
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setLineWidth: (lineWidth) => set({ lineWidth: Math.max(1, Math.min(100, lineWidth)) }),
}))
