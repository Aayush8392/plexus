// ─── Plexus · src/screens/Screen0.jsx ───────────────────────────────────────
// Landing page — 3-beat copy + looping skeleton graph animation
import '../styles/Screen0.css'

export default function Screen0({ nav }) {
  return (
    <div className="screen screen-0">
      <div className="s0-inner">

        {/* ── Left: copy ─────────────────────────────────────────────────── */}
        <div className="s0-copy">
          <div className="s0-eyebrow">Indian Tech Job Market · IT &amp; Engineering</div>

          <h1 className="s0-headline">
            Map where your role sits.<br />
            See which doors are open.
          </h1>

          <div className="s0-beats">
            <div className="s0-beat">
              <span className="s0-beat-num">01</span>
              <p className="s0-beat-text">
                Built from <strong>28,665 actual job ads</strong> collected from Naukri.
                Every role, every skill listed by real employers — nothing invented, nothing estimated.
              </p>
            </div>
            <div className="s0-beat">
              <span className="s0-beat-num">02</span>
              <p className="s0-beat-text">
                Roles that ask for similar skills are drawn closer together on the map.
                Click any role to see which others it connects to, and exactly what skills
                bridge the gap between them.
              </p>
            </div>
            <div className="s0-beat">
              <span className="s0-beat-num">03</span>
              <p className="s0-beat-text">
                Ask an AI which roles are close to yours and it will guess from memory.
                This map was computed from the actual postings — the structure you see
                is what employers posted, not what a language model thinks is likely.
              </p>
            </div>
          </div>

          <button className="s0-cta" onClick={() => nav('1')}>
            Enter the map →
          </button>
        </div>

        {/* ── Right: looping skeleton animation ──────────────────────────── */}
        <div className="s0-demo" aria-hidden="true">
          <SkeletonDemo />
        </div>

      </div>
    </div>
  )
}

// ── Skeleton animation component ──────────────────────────────────────────────
// Pure CSS loop: nodes + edges appear → center node pulses → drawer slides in
// → holds → drawer slides out → resets. No JS involved.

function SkeletonDemo() {
  return (
    <div className="skd-wrap">

      {/* Graph skeleton — SVG nodes + edges */}
      <svg className="skd-svg" viewBox="0 0 360 280" xmlns="http://www.w3.org/2000/svg">
        {/* Primary edges (from center) */}
        <line className="skd-edge" x1="180" y1="130" x2="72"  y2="68"  />
        <line className="skd-edge" x1="180" y1="130" x2="295" y2="78"  />
        <line className="skd-edge" x1="180" y1="130" x2="55"  y2="200" />
        <line className="skd-edge" x1="180" y1="130" x2="308" y2="198" />
        <line className="skd-edge" x1="180" y1="130" x2="152" y2="242" />
        {/* Secondary edges (satellite to satellite) */}
        <line className="skd-edge skd-edge--faint" x1="72"  y1="68"  x2="295" y2="78"  />
        <line className="skd-edge skd-edge--faint" x1="55"  y1="200" x2="152" y2="242" />
        <line className="skd-edge skd-edge--faint" x1="295" y1="78"  x2="308" y2="198" />

        {/* Satellite nodes */}
        <circle className="skd-node" cx="72"  cy="68"  r="9"  />
        <circle className="skd-node" cx="295" cy="78"  r="11" />
        <circle className="skd-node" cx="55"  cy="200" r="8"  />
        <circle className="skd-node" cx="308" cy="198" r="10" />
        <circle className="skd-node" cx="152" cy="242" r="9"  />
        <circle className="skd-node" cx="262" cy="248" r="8"  />

        {/* Centre node — highlighted during pulse phase */}
        <circle className="skd-node skd-node--center" cx="180" cy="130" r="15" />
        {/* Pulse ring — separate so it can expand independently */}
        <circle className="skd-pulse" cx="180" cy="130" r="15" fill="none" />
      </svg>

      {/* Skeleton drawer panel — slides in during animation */}
      <div className="skd-drawer">
        <div className="skd-drawer-header">
          <div className="skd-skel skd-skel--name" />
          <div className="skd-skel skd-skel--badge" />
        </div>
        <div className="skd-drawer-divider" />
        <div className="skd-drawer-section-label" />
        <div className="skd-door-row" />
        <div className="skd-door-row skd-door-row--md" />
        <div className="skd-door-row skd-door-row--sm" />
      </div>

    </div>
  )
}
