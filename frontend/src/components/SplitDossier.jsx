// ─── Plexus · src/components/SplitDossier.jsx ────────────────────────────────
// Compare mode — two role profiles side by side.
// Opens when a second node is shift-clicked while one is pinned.
// Desktop: two panels. Mobile: tab switch.

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getPathfinder } from '../data/loader.js'
import '../styles/SplitDossier.css'

function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

function normalise(s) {
  return s?.toLowerCase().trim() ?? ''
}

// ── Single role panel ─────────────────────────────────────────────────────────
function RolePanel({ nodeId, canonData, otherSkills, onNavigate }) {
  const [pf, setPf]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPf(null)
    getPathfinder(nodeId)
      .then(data => { if (!cancelled) { setPf(data); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [nodeId])

  const color = `var(--role-${roleSlug(nodeId)})`

  // Connection to the other node (if they're adjacent in the graph)
  const connectionEdge = canonData
    ? [...(canonData.solidEdges ?? []), ...(canonData.crossEdges ?? [])].find(
        e => (e.source === nodeId && otherSkills?.nodeId === e.target) ||
             (e.target === nodeId && otherSkills?.nodeId === e.source)
      )
    : null

  if (loading) {
    return (
      <div className="sd-panel sd-panel-loading">
        <div className="sd-spinner" />
      </div>
    )
  }

  if (!pf) return <div className="sd-panel"><p className="sd-no-data">No data available.</p></div>

  const mySkills = new Set((pf.top_skills ?? []).map(normalise))
  const theirSkillsNorm = new Set((otherSkills?.skills ?? []).map(normalise))

  const shared  = (pf.top_skills ?? []).filter(s => theirSkillsNorm.has(normalise(s)))
  const unique  = (pf.top_skills ?? []).filter(s => !theirSkillsNorm.has(normalise(s)))

  // Doors leading toward the other role
  const doors   = (pf.doors ?? []).slice(0, 5)

  return (
    <div className="sd-panel">
      {/* Role header */}
      <div className="sd-role-header">
        <div className="sd-role-name" style={{ color }}>{pf.label}</div>
        <div className="sd-role-meta">
          <span className={`badge badge-${pf.stratum}`}>
            {pf.stratum === 'gcc' ? 'GCC' : 'Services'}
          </span>
          <span className="sd-posting-count">
            {pf.posting_count?.toLocaleString()} postings
          </span>
        </div>
      </div>

      {/* Connection strength to the other role */}
      {connectionEdge && (
        <div className="sd-connection">
          <span className="sd-connection-label">Connection to other role</span>
          <span className="sd-connection-cosine">
            {(connectionEdge.cosine * 100).toFixed(0)}% skill overlap
          </span>
        </div>
      )}

      {/* Skill breakdown */}
      {pf.top_skills?.length > 0 && (
        <div className="sd-skills-section">
          <div className="sd-skills-group-label">Shared skills</div>
          {shared.length > 0
            ? <div className="sd-chips">{shared.map(s => <span key={s} className="chip sd-chip-shared">{s}</span>)}</div>
            : <p className="sd-no-overlap">No overlap in top skills</p>
          }
          <div className="sd-skills-group-label sd-skills-unique-label">Unique to this role</div>
          <div className="sd-chips">{unique.map(s => <span key={s} className="chip sd-chip-unique">{s}</span>)}</div>
        </div>
      )}

      {/* Doors */}
      {doors.length > 0 && (
        <div className="sd-doors-section">
          <div className="sd-section-title">Doors</div>
          <div className="sd-doors-list">
            {doors.map(d => (
              <button
                key={d.node_id}
                className="sd-door-btn"
                onClick={() => onNavigate(d.node_id)}
              >
                <span className="sd-door-name">{d.label}</span>
                <span className="sd-door-cosine">{(d.cosine * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SplitDossier overlay ──────────────────────────────────────────────────────
export default function SplitDossier({ nodeIdA, nodeIdB, canonData, onClose, onNavigate }) {
  const [activeTab, setActiveTab] = useState('a')
  const [pfA, setPfA] = useState(null)
  const [pfB, setPfB] = useState(null)

  // Pre-load both pathfinder records to enable skill crossrefs
  useEffect(() => {
    let cancelled = false
    getPathfinder(nodeIdA).then(d => { if (!cancelled) setPfA(d) }).catch(() => {})
    getPathfinder(nodeIdB).then(d => { if (!cancelled) setPfB(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [nodeIdA, nodeIdB])

  const skillsA = { nodeId: nodeIdB, skills: pfB?.top_skills ?? [] }
  const skillsB = { nodeId: nodeIdA, skills: pfA?.top_skills ?? [] }

  const colorA = `var(--role-${roleSlug(nodeIdA)})`
  const colorB = `var(--role-${roleSlug(nodeIdB)})`

  return (
    <div className="sd-overlay" role="dialog" aria-label="Compare roles">
      <div className="sd-container">

        {/* Header */}
        <div className="sd-header">
          <span className="sd-header-label">Comparing roles</span>
          <button className="sd-close" onClick={onClose} aria-label="Close compare">
            <X size={15} />
          </button>
        </div>

        {/* Mobile tab bar */}
        <div className="sd-mobile-tabs">
          <button
            className={`sd-mobile-tab${activeTab === 'a' ? ' sd-mobile-tab--active' : ''}`}
            style={activeTab === 'a' ? { borderBottomColor: colorA } : {}}
            onClick={() => setActiveTab('a')}
          >
            {pfA?.label ?? nodeIdA}
          </button>
          <button
            className={`sd-mobile-tab${activeTab === 'b' ? ' sd-mobile-tab--active' : ''}`}
            style={activeTab === 'b' ? { borderBottomColor: colorB } : {}}
            onClick={() => setActiveTab('b')}
          >
            {pfB?.label ?? nodeIdB}
          </button>
        </div>

        {/* Panels */}
        <div className="sd-panels">
          <div className={`sd-panel-slot${activeTab === 'a' ? ' sd-panel-slot--active' : ''}`}>
            <RolePanel
              nodeId={nodeIdA}
              canonData={canonData}
              otherSkills={skillsA}
              onNavigate={(id) => { onClose(); onNavigate(id) }}
            />
          </div>
          <div className="sd-divider" />
          <div className={`sd-panel-slot${activeTab === 'b' ? ' sd-panel-slot--active' : ''}`}>
            <RolePanel
              nodeId={nodeIdB}
              canonData={canonData}
              otherSkills={skillsB}
              onNavigate={(id) => { onClose(); onNavigate(id) }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
