import { useState, useEffect } from 'react'
import { getOverviewLayout } from '../data/loader.js'
import '../styles/Screen2b.css'

// ── Role slug → CSS variable name ─────────────────────────────────────────────
// Strips stratum suffix from node id to get role_slug, then maps to CSS hue var.
// e.g. "backend_java_developer_services" → "--role-backend_java_developer"

function roleSlugFromNodeId(nodeId) {
  return nodeId
    .replace(/_services$/, '')
    .replace(/_gcc$/, '')
}

function roleColor(roleSlug) {
  return `var(--role-${roleSlug})`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Screen2b({ nav, cvData }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  const [roles, setRoles]               = useState([])       // 22 canonical roles
  const [selectedSlug, setSelectedSlug] = useState(null)     // role_slug (no stratum)
  const [loading, setLoading]           = useState(true)

  // ── Derive the matched role slug from cvData ─────────────────────────────────
  const matchedSlug = cvData?.detectedRoleSlug
    ? roleSlugFromNodeId(cvData.detectedRoleSlug)
    : null

  // ── Load canonical roles from layout (deduplicated on role_slug) ─────────────
  useEffect(() => {
    let cancelled = false
    getOverviewLayout()
      .then(({ nodes }) => {
        if (cancelled) return
        const canonical = [
          ...new Map(
            nodes.map(n => [n.role_slug, { slug: n.role_slug, label: n.label }])
          ).values()
        ].sort((a, b) => a.label.localeCompare(b.label))
        setRoles(canonical)
        setSelectedSlug(matchedSlug)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [matchedSlug])

  // ── Confirm → navigate to Screen 3 ──────────────────────────────────────────
  // confirmedRole is the full node id (prefer services node if it exists).
  // The graph has services nodes for all roles that have one; we default to
  // _services suffix and let Screen 3 resolve the actual node from the graph.

  const handleConfirm = () => {
    if (!selectedSlug) return
    nav('3', {
      cvData,
      confirmedRole: `${selectedSlug}_services`,
    })
  }

  // ── Fallback: skip confirm, go straight to cold map ─────────────────────────
  const handleSkip = () => {
    nav('3', { cvData: null, confirmedRole: null })
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="screen screen-2b">
        <div className="screen-2b-loading">
          <div className="screen-2b-spinner" aria-label="Loading roles" />
          <span className="screen-2b-loading-text">Loading role map…</span>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="screen screen-2b">
      <div className="screen-2b-container">
        <button className="screen-back-btn" onClick={() => nav('2')}>← Back</button>

        {/* ── Header ── */}
        <div className="screen-2b-header">
          <h1 className="screen-2b-heading">
            We read you as{' '}
            <span
              className="screen-2b-heading-role"
              style={matchedSlug ? { color: `var(--role-${matchedSlug})` } : undefined}
            >
              {cvData?.detectedRole ?? 'Unknown Role'}
            </span>
            .
          </h1>
          <p className="screen-2b-sub">
            Our parser extracted the following skill architecture from your dossier.
            This selection pins your position on the market graph.
          </p>
        </div>

        {/* ── Extracted skills ── */}
        {cvData?.skills?.length > 0 && (
          <div className="screen-2b-section">
            <p className="screen-2b-section-label">Extracted skills</p>
            <div className="skill-chip-list" aria-label="Skills extracted from your CV">
              {cvData.skills.map(skill => (
                <span key={skill} className="chip">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Role picker ── */}
        <div className="screen-2b-section">
          <p className="role-picker-label">Your starting role</p>
          <p className="role-picker-hint">
            Where are you starting from — or pick your target role if you're making a move.
          </p>
          <div className="role-picker-grid" role="listbox" aria-label="Select your role">
            {roles.map(({ slug, label }) => (
              <button
                key={slug}
                role="option"
                aria-selected={selectedSlug === slug}
                className={`role-chip${selectedSlug === slug ? ' selected' : ''}`}
                style={{ '--role-color': roleColor(slug) }}
                onClick={() => setSelectedSlug(slug)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="screen-2b-cta">
          <button
            className="screen-2b-confirm-btn"
            onClick={handleConfirm}
            disabled={!selectedSlug}
          >
            Confirm Role
          </button>
          <button className="screen-2b-skip" onClick={handleSkip}>
            Skip — explore the map without a pin
          </button>
        </div>

      </div>
    </div>
  )
}
