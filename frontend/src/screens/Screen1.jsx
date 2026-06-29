import '../styles/Screen1.css'

export default function Screen1({ nav }) {
  return (
    <div className="screen screen-1">
      <div className="screen-1-container">
        <div className="screen-1-header">
          <h1 className="screen-1-title">PLEXUS</h1>
          <p className="screen-1-tagline">Map the structure of your market.</p>
        </div>

        <div className="screen-1-card-wrapper">
          <button
            className="domain-card domain-card--live"
            onClick={() => nav('2')}
            aria-label="Enter IT & Engineering market"
          >
            <div className="domain-card-inner">
              {/* Mini graph thumbnail */}
              <svg
                className="domain-card-graph"
                viewBox="0 0 60 60"
                width="60"
                height="60"
                aria-hidden="true"
              >
                <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
                {/* 5 nodes */}
                <circle cx="20" cy="15" r="2.5" fill="var(--text-accent)" />
                <circle cx="40" cy="15" r="2.5" fill="hsl(45, 90%, 60%)" />
                <circle cx="30" cy="30" r="2.5" fill="hsl(175, 70%, 52%)" />
                <circle cx="15" cy="45" r="2.5" fill="hsl(270, 70%, 68%)" />
                <circle cx="45" cy="45" r="2.5" fill="hsl(30, 80%, 58%)" />
                {/* Connecting lines */}
                <line x1="20" y1="15" x2="30" y2="30" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                <line x1="40" y1="15" x2="30" y2="30" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                <line x1="30" y1="30" x2="15" y2="45" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                <line x1="30" y1="30" x2="45" y2="45" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.8" />
                <line x1="20" y1="15" x2="40" y2="15" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="0.6" />
              </svg>

              <div className="domain-card-content">
                <div className="domain-card-header">
                  <span className="domain-card-tag">LIVE</span>
                  <h2 className="domain-card-title">IT & Engineering</h2>
                </div>

                <p className="domain-card-descriptor">
                  23 roles · 28,665 postings · Services &amp; GCC stratified
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
