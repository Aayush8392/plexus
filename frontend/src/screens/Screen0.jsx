// ─── Plexus · src/screens/Screen0.jsx ───────────────────────────────────────
// Landing page — 3-beat copy + looping skeleton graph animation
import '../styles/Screen0.css'

export default function Screen0({ nav }) {
  return (
    <div className="screen screen-0">
      <div className="s0-inner">

        {/* ── Left: animation ────────────────────────────────────────────── */}
        <div className="s0-demo" aria-hidden="true">
          <MoatDemo />
        </div>

        {/* ── Right: copy ─────────────────────────────────────────────────── */}
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

          <div className="s0-teaser-edge">
            <span className="s0-teaser-label">Real connection · from 28,665 postings</span>
            <div className="s0-teaser-row">
              <span className="s0-teaser-from">QA Engineer</span>
              <span className="s0-teaser-arrow">→</span>
              <span className="s0-teaser-to">DevOps / SRE</span>
              <span className="s0-teaser-score">0.30 similarity</span>
              <span className="s0-teaser-skills">Jenkins · CI/CD · Docker</span>
            </div>
          </div>

          <button className="s0-cta" onClick={() => nav('1')}>
            Enter the map →
          </button>

          <div className="s0-callout">
            88 verified skill pathways · connections shown above 0.20 skill overlap · 28,665 postings
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Moat comparator animation ─────────────────────────────────────────────────
// Pure CSS loop: chips appear → services column highlights blue →
// GCC column highlights amber → fade out → reset.

const SVC_SKILLS = ['TensorFlow', 'PyTorch', 'Keras', 'Image Processing', 'Chatbot']
const GCC_SKILLS = ['NLP', 'Advanced Analytics', 'Mathematics', 'Six Sigma', 'Data Science']

function MoatDemo() {
  return (
    <div className="mdt-wrap">
      <div className="mdt-role">Data Scientist / ML</div>
      <div className="mdt-grid">
        <div className="mdt-col">
          <div className="mdt-col-header mdt-col-header--svc">Services</div>
          {SVC_SKILLS.map((skill, i) => (
            <div
              key={skill}
              className="mdt-chip mdt-chip--svc"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {skill}
            </div>
          ))}
        </div>
        <div className="mdt-sep" />
        <div className="mdt-col">
          <div className="mdt-col-header mdt-col-header--gcc">GCC</div>
          {GCC_SKILLS.map((skill, i) => (
            <div
              key={skill}
              className="mdt-chip mdt-chip--gcc"
              style={{ animationDelay: `${0.18 + i * 0.12}s` }}
            >
              {skill}
            </div>
          ))}
        </div>
      </div>
      <div className="mdt-caption">Same title. Different job.</div>
    </div>
  )
}
