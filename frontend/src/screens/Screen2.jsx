export default function Screen2({ nav }) {
  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
        <p style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-md)' }}>
          Phase 4 — CV Upload / Explore
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => nav('2b', { cvData: { skills: [], detectedRole: null } })}>
            Upload CV path →
          </button>
          <button className="btn btn-ghost" onClick={() => nav('3', { confirmedRole: null })}>
            Explore without CV →
          </button>
        </div>
      </div>
    </div>
  )
}
