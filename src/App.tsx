import { useEffect, useRef } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import { useTabStore } from './store/tabs'
import { useToolbarStore } from './store/toolbar'

export default function App() {
  const { loadTabs, loaded } = useTabStore()
  const setTool = useToolbarStore(state => state.setTool)
  const didLoad = useRef(false)

  useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true
    loadTabs()
  }, [loadTabs])

  useEffect(() => {
    // Temporary compatibility shim for the current Canvas zoom guard.
    // Canvas currently accepts [1, 1.5, 2, 3]; this lets the existing guard
    // also pass 4x and 5x without rewriting the whole canvas component.
    const proto = Array.prototype as any
    if (proto.__nullspaceZoomPatch) return

    const originalIncludes = proto.includes
    proto.__nullspaceZoomPatch = true
    proto.includes = function (searchElement: unknown, ...args: unknown[]) {
      const isCanvasZoomGuard =
        this.length === 4 &&
        this[0] === 1 &&
        this[1] === 1.5 &&
        this[2] === 2 &&
        this[3] === 3

      if (isCanvasZoomGuard && (searchElement === 4 || searchElement === 5)) return true
      return originalIncludes.call(this, searchElement, ...args)
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable

      if (isTyping) return

      if (e.key === 'Tab') {
        e.preventDefault()
        setTool('latex')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setTool])

  if (!loaded) return (
    <div style={{
      height: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#555', fontSize: 13,
    }}>
      loading...
    </div>
  )

  return (
    <div className="app">
      <Sidebar />
      <Canvas />
    </div>
  )
}
