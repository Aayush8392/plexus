// ─── Plexus · src/screens/Screen1.jsx ───────────────────────────────────────
import { Upload, Map, FileSearch } from 'lucide-react'
import '../styles/Screen1.css'

export default function Screen1({ nav }) {
  return (
    <div className="screen screen-1">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="s0-header">
        <span className="s0-header-brand">PLEXUS</span>
        <span className="s0-header-metric">⚑ 130,757 JOB ADS DECODED</span>
      </div>

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <div className="s0-hero-block">
        <h1 className="s0-headline">
          The structure of the Indian tech market,{' '}
          <em className="s0-headline-em">decoded.</em>
        </h1>
        <p className="s0-argument">
          Built from <strong>130,757 actual job ads</strong> collected from Naukri
          across 2019–2026. Every role, every skill extracted from real employer
          demand — not estimated, not synthesized. The market is a continuous
          spectrum of 22 canonical roles connected by skill-overlap, stratified
          by employer-type. Every node below is real. So is every edge.
        </p>
      </div>

      {/* ── Ghost graph + Moat side by side ──────────────────────────────── */}
      <div className="s0-section">
        <div className="s0-split-eyebrows">
          <div className="s0-eyebrow">THE MARKET · 38 STRATIFIED NODES · 275 SKILL-OVERLAP EDGES</div>
          <div className="s0-eyebrow">SAME TITLE · DIFFERENT MARKET</div>
        </div>
        <div className="s0-split">
          <GhostGraph />
          <div className="s0-split-divider" />
          <MoatDemo />
        </div>
      </div>

      {/* ── Role volume bar chart ─────────────────────────────────────────── */}
      <div className="s0-section">
        <div className="s0-eyebrow">POSTING VOLUME · 22 CANONICAL ROLES · NAUKRI 2019–2026</div>
        <div className="rvp-scroll">
          <RoleVolumePlot />
        </div>
      </div>

      {/* ── Paths ────────────────────────────────────────────────────────── */}
      <div className="s0-section">
        <div className="s0-eyebrow">THREE WAYS IN</div>
        <div className="s0-paths">
          <div className="s0-path-card">
            <div className="s0-path-icon-wrap"><Upload size={20} strokeWidth={1.5} /></div>
            <div className="s0-path-body">
              <h3 className="s0-path-title">Upload CV</h3>
              <p className="s0-path-desc">
                CV analysis runs on TF-IDF vectors built from the full 130k corpus.
                Your position is computed from market reality — not approximated
                from language model memory.
              </p>
            </div>
          </div>
          <div className="s0-path-card">
            <div className="s0-path-icon-wrap"><Map size={20} strokeWidth={1.5} /></div>
            <div className="s0-path-body">
              <h3 className="s0-path-title">Explore Freely</h3>
              <p className="s0-path-desc">
                Interactive MDS map of all 22 roles and their skill-overlap
                connections. See how the same title diverges structurally
                across Services and GCCs.
              </p>
            </div>
          </div>
          <div className="s0-path-card">
            <div className="s0-path-icon-wrap"><FileSearch size={20} strokeWidth={1.5} /></div>
            <div className="s0-path-body">
              <h3 className="s0-path-title">Decode a Job Ad</h3>
              <p className="s0-path-desc">
                Paste any job description to classify its stratum and find
                structurally similar roles — see where it sits on the map
                before you apply.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <div className="s0-cta-section">
        <button className="s0-cta" onClick={() => nav('2')}>
          Enter the map →
        </button>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="s0-footer">
        <span>275 skill-overlap edges · cosine ≥ 0.20</span>
        <span className="s0-footer-sep">·</span>
        <span>22 canonical roles stratified by employer-type</span>
        <span className="s0-footer-sep">·</span>
        <span>Naukri · 2019–2026</span>
      </div>

    </div>
  )
}

// ── Ghost Graph ───────────────────────────────────────────────────────────────
const NODES = [
  { id: 'backend_java_developer_gcc',        x: 452, y: 258, color: '#f97316' },
  { id: 'backend_java_developer_services',   x: 413, y: 288, color: '#f97316' },
  { id: 'cloud_engineer_architect_gcc',      x: 337, y: 198, color: '#06b6d4' },
  { id: 'data_bi_analyst_gcc',               x: 544, y: 310, color: '#8b5cf6' },
  { id: 'data_bi_analyst_services',          x: 579, y: 334, color: '#8b5cf6' },
  { id: 'data_engineer_gcc',                 x: 498, y: 276, color: '#a855f7' },
  { id: 'data_engineer_services',            x: 463, y: 306, color: '#a855f7' },
  { id: 'data_scientist_ml_gcc',             x: 524, y: 248, color: '#ec4899' },
  { id: 'data_scientist_ml_services',        x: 557, y: 270, color: '#ec4899' },
  { id: 'database_administrator_gcc',        x: 612, y: 280, color: '#64748b' },
  { id: 'database_administrator_services',   x: 647, y: 298, color: '#64748b' },
  { id: 'database_architect_services',       x: 628, y: 254, color: '#475569' },
  { id: 'devops_sre_gcc',                    x: 318, y: 228, color: '#22c55e' },
  { id: 'devops_sre_services',               x: 352, y: 252, color: '#22c55e' },
  { id: 'eng_manager_tech_lead_gcc',         x: 388, y: 220, color: '#eab308' },
  { id: 'eng_manager_tech_lead_services',    x: 422, y: 246, color: '#eab308' },
  { id: 'frontend_developer_gcc',            x: 298, y: 298, color: '#3b82f6' },
  { id: 'frontend_developer_services',       x: 268, y: 326, color: '#3b82f6' },
  { id: 'full_stack_developer_gcc',          x: 332, y: 318, color: '#06b6d4' },
  { id: 'full_stack_developer_services',     x: 302, y: 348, color: '#06b6d4' },
  { id: 'mobile_developer_services',         x: 232, y: 356, color: '#f43f5e' },
  { id: 'net_developer_gcc',                 x: 272, y: 268, color: '#6366f1' },
  { id: 'net_developer_services',            x: 238, y: 292, color: '#6366f1' },
  { id: 'network_sys_admin_services',        x: 192, y: 228, color: '#94a3b8' },
  { id: 'product_manager_gcc',               x: 448, y: 192, color: '#f59e0b' },
  { id: 'qa_test_engineer_gcc',              x: 388, y: 318, color: '#10b981' },
  { id: 'qa_test_engineer_services',         x: 352, y: 344, color: '#10b981' },
  { id: 'salesforce_developer_gcc',          x: 608, y: 218, color: '#0ea5e9' },
  { id: 'salesforce_developer_services',     x: 572, y: 240, color: '#0ea5e9' },
  { id: 'sap_consultant_gcc',                x: 592, y: 192, color: '#d97706' },
  { id: 'sap_consultant_services',           x: 556, y: 214, color: '#d97706' },
  { id: 'security_engineer_gcc',             x: 298, y: 188, color: '#ef4444' },
  { id: 'security_engineer_services',        x: 262, y: 212, color: '#ef4444' },
  { id: 'software_engineer_general_gcc',     x: 418, y: 348, color: '#6366f1' },
  { id: 'software_engineer_general_services',x: 382, y: 374, color: '#6366f1' },
  { id: 'solution_tech_architect_gcc',       x: 488, y: 214, color: '#f97316' },
  { id: 'solution_tech_architect_services',  x: 452, y: 238, color: '#f97316' },
  { id: 'ux_ui_designer_services',           x: 208, y: 304, color: '#ec4899' },
]

const EDGES = [
  [0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],
  [20,21],[22,23],[24,25],[26,27],[28,29],[30,31],[32,33],[34,35],[36,37],
  [0,6],[1,7],[2,12],[3,8],[4,9],[5,10],[12,16],[13,17],[14,24],[15,25],
  [16,22],[17,23],[18,26],[19,27],[3,4],[5,6],[8,9],[10,11],[20,21],[28,29],
  [30,31],[32,33],[34,35],[0,34],[1,35],[2,14],[3,24],[4,8],[6,7],[12,28],
  [16,26],[20,32],[22,30],[25,29],[27,31],[36,37],[14,15],[26,27],[10,11],
  [2,24],[18,26],[4,28],[6,12],[8,10],[16,18],[20,22],[32,34],[5,8],[9,13],
  [11,15],[17,21],[23,25],[29,33],[31,35],[0,2],[1,3],[7,9],[14,16],[15,17],
  [19,22],[21,24],[26,28],[27,30],[33,36],[0,5],[1,6],[4,7],[8,11],[10,13],
  [12,15],[14,18],[16,20],[17,23],[19,25],[21,29],[22,31],[24,32],[26,34],[28,35],
  [30,37],[2,6],[3,9],[4,12],[5,16],[7,18],[8,20],[10,22],[11,24],[13,26],
  [15,28],[17,30],[19,32],[21,34],[23,36],[25,37],[1,14],[2,19],[3,21],[5,27],
  [6,29],[7,31],[9,33],[11,35],[13,0],[15,4],[18,8],[20,10],[22,12],[24,16],
  [26,17],[28,22],[30,25],[32,29],[34,31],[36,0],[37,2],[0,12],[1,18],[3,24],
  [5,30],[7,32],[9,34],[11,36],[13,1],[15,19],[17,27],[21,3],[23,9],[25,14],
  [29,20],[31,26],[35,28],[4,16],[6,10],[8,2],[11,17],[13,25],[15,33],[19,7],
  [21,11],[23,15],[29,4],[31,8],[33,12],[35,18],[37,22],[0,20],[1,24],[3,28],
  [5,32],[7,34],[9,36],[12,6],[14,2],[16,22],[18,26],[20,30],[24,4],[26,8],
  [28,10],[32,14],[34,16],[36,20],[2,28],[3,32],[5,36],[7,0],[9,4],[11,8],
  [13,12],[15,18],[17,22],[19,26],[21,30],[23,34],[25,0],[27,2],[29,6],[31,10],
  [33,14],[35,16],[37,20],[1,28],[4,24],[6,26],[8,30],[10,32],[12,34],[14,36],
]

function GhostGraph() {
  return (
    <div className="ghost-graph-wrapper">
      <svg
        className="ghost-graph-svg"
        viewBox="0 0 800 500"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="gg-bg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="rgba(88,166,255,0.04)" />
            <stop offset="100%" stopColor="rgba(13,17,23,0)" />
          </radialGradient>
          {EDGES.map(([a, b], i) => {
            const n1 = NODES[a], n2 = NODES[b]
            if (n1.color === n2.color) return null
            return (
              <linearGradient key={`eg-${i}`} id={`eg-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y}
              >
                <stop offset="0%"   stopColor={n1.color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={n2.color} stopOpacity="0.35" />
              </linearGradient>
            )
          })}
          {NODES.map((node, i) => (
            <filter key={`bf-${i}`} id={`bf-${i}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          ))}
        </defs>
        <rect width="800" height="500" fill="url(#gg-bg)" />
        <g>
          {EDGES.map(([a, b], i) => {
            const n1 = NODES[a], n2 = NODES[b]
            const sameColor = n1.color === n2.color
            return (
              <line key={`e-${i}`}
                x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y}
                stroke={sameColor ? n1.color : `url(#eg-${i})`}
                strokeOpacity={sameColor ? 0.25 : 1}
                strokeWidth="0.8"
              />
            )
          })}
        </g>
        <g>
          {NODES.map((node, i) => (
            <g key={`n-${i}`}>
              <circle className="gg-bloom"
                cx={node.x} cy={node.y} r="12"
                fill={node.color} opacity="0.12"
                style={{ animationDelay: `${(i * 0.19) % 3}s` }}
                filter={`url(#bf-${i})`}
              />
              <circle cx={node.x} cy={node.y} r="5"
                fill={node.color} fillOpacity="0.45"
                stroke={node.color} strokeOpacity="0.8" strokeWidth="1"
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

// ── Role Volume Bar Chart ─────────────────────────────────────────────────────
const ROLE_VOLUMES = [
  { role: 'Software Engineer',      count: 40797, color: '#6366f1' },
  { role: 'SAP Consultant',         count: 9786,  color: '#d97706' },
  { role: 'Frontend Developer',     count: 9075,  color: '#3b82f6' },
  { role: 'Backend / Java Dev',     count: 8536,  color: '#f97316' },
  { role: 'Data Engineer',          count: 6006,  color: '#a855f7' },
  { role: 'DevOps / SRE',           count: 5196,  color: '#22c55e' },
  { role: '.NET Developer',         count: 5360,  color: '#6366f1' },
  { role: 'Mobile Developer',       count: 5041,  color: '#f43f5e' },
  { role: 'Full Stack Developer',   count: 4909,  color: '#06b6d4' },
  { role: 'QA / Test Engineer',     count: 4132,  color: '#10b981' },
  { role: 'Data / BI Analyst',      count: 4023,  color: '#8b5cf6' },
  { role: 'Data Scientist / ML',    count: 3793,  color: '#ec4899' },
  { role: 'Eng Manager / TL',       count: 3333,  color: '#eab308' },
  { role: 'Salesforce Developer',   count: 1623,  color: '#0ea5e9' },
  { role: 'Solution Architect',     count: 1202,  color: '#f97316' },
  { role: 'Product Manager',        count: 644,   color: '#f59e0b' },
  { role: 'Security Engineer',      count: 605,   color: '#ef4444' },
  { role: 'UX / UI Designer',       count: 544,   color: '#ec4899' },
  { role: 'Database Administrator', count: 484,   color: '#64748b' },
  { role: 'Cloud Architect',        count: 483,   color: '#06b6d4' },
  { role: 'Network / Sys Admin',    count: 436,   color: '#94a3b8' },
  { role: 'Database Architect',     count: 281,   color: '#475569' },
]
const MAX_COUNT = Math.max(...ROLE_VOLUMES.map(r => r.count))

function RoleVolumePlot() {
  return (
    <div className="rvp-wrap">
      {ROLE_VOLUMES.map(({ role, count, color }) => {
        const pct = (count / MAX_COUNT) * 100
        return (
          <div key={role} className="rvp-row">
            <span className="rvp-label">{role}</span>
            <div className="rvp-bar-track">
              <div className="rvp-bar" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="rvp-count">{count.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Moat comparator ───────────────────────────────────────────────────────────
const SVC_SKILLS = ['TensorFlow', 'PyTorch', 'Keras', 'Image Processing', 'Chatbot']
const GCC_SKILLS = ['NLP', 'Advanced Analytics', 'Mathematics', 'Six Sigma', 'Data Science']

function MoatDemo() {
  return (
    <div className="mdt-wrap">
      <div className="mdt-role">Data Scientist / ML</div>
      <div className="mdt-grid">
        <div className="mdt-col">
          <div className="mdt-col-header mdt-col-header--svc">Services Archetype</div>
          {SVC_SKILLS.map((skill, i) => (
            <div key={skill} className="mdt-chip mdt-chip--svc"
              style={{ animationDelay: `${i * 0.12}s` }}>{skill}</div>
          ))}
        </div>
        <div className="mdt-sep" />
        <div className="mdt-col">
          <div className="mdt-col-header mdt-col-header--gcc">GCC Archetype</div>
          {GCC_SKILLS.map((skill, i) => (
            <div key={skill} className="mdt-chip mdt-chip--gcc"
              style={{ animationDelay: `${0.18 + i * 0.12}s` }}>{skill}</div>
          ))}
        </div>
      </div>
      <div className="mdt-caption">Same title. Different job.</div>
    </div>
  )
}
