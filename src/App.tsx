import { useEffect, useRef } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import Canvas from './components/Canvas'
import { useTabStore } from './store/tabs'

export default function App() {
  const { loadTabs, loaded } = useTabStore()
  const didLoad = useRef(false)

  useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true
    loadTabs()
  }, [loadTabs])

  // Tab key toggles terminal — handled inside Sidebar via a global event
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      // Only intercept Tab when not in an input/textarea
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Tab') {
        e.preventDefault()
        // Dispatch a custom event that Sidebar listens for
        window.dispatchEvent(new CustomEvent('nullspace:toggle-terminal'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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