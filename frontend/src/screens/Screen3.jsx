export default function Screen3({ nav, confirmedRole, cvData }) {
  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
        <p style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-md)' }}>
          Phase 5 — Graph / Pathfinder
        </p>
        {confirmedRole && (
          <p style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-md)' }}>
            Pinned: <span style={{ color: 'var(--text-accent)' }}>{confirmedRole}</span>
          </p>
        )}
        <button className="btn btn-ghost" onClick={() => nav('1')}>
          ← Back to start
        </button>
      </div>
    </div>
  )
}
