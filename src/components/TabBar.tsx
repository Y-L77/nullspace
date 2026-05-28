import { useTabStore } from '../store/tabs'

export default function TabBar() {
  const { tabs, activeId, setActive, removeTab, addTab } = useTabStore()

  return (
    <div style={{
      gridArea: 'tabbar',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'stretch',
      overflowX: 'auto',
      overflowY: 'hidden',
    }}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => setActive(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            cursor: 'pointer',
            borderRight: '1px solid var(--border)',
            background: tab.id === activeId ? 'var(--bg)' : 'transparent',
            borderBottom: tab.id === activeId ? '1px solid var(--bg)' : '1px solid transparent',
            marginBottom: tab.id === activeId ? -1 : 0,
            minWidth: 100,
            maxWidth: 180,
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          <span style={{
            flex: 1,
            fontSize: 11,
            color: tab.id === activeId ? 'var(--text)' : 'var(--text2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {tab.name}
          </span>
          {tabs.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); removeTab(tab.id) }}
              style={{ color: 'var(--text3)', fontSize: 12 }}
            >×</button>
          )}
        </div>
      ))}
      <button
        onClick={addTab}
        style={{ padding: '0 12px', color: 'var(--text3)', fontSize: 16 }}
      >+</button>
    </div>
  )
}