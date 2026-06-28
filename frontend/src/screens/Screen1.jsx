export default function Screen1({ nav }) {
  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
        <p style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-md)' }}>
          Phase 3 — Domain Selector
        </p>
        <button
          className="btn btn-primary"
          onClick={() => nav('2')}
        >
          Continue to Screen 2 →
        </button>
      </div>
    </div>
  )
}
