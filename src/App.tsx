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
