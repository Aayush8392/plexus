export default function Screen2b({ nav, cvData }) {
  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
        <p style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-md)' }}>
          Phase 4 — Confirm Role
        </p>
        <button className="btn btn-primary" onClick={() => nav('3', { confirmedRole: cvData?.detectedRole })}>
          Confirm & go to map →
        </button>
      </div>
    </div>
  )
}
