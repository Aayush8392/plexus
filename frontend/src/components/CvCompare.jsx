// ─── Plexus · src/components/CvCompare.jsx ───────────────────────────────────
// Target-role decomposition overlay.
// Shows which CV skills match a chosen target role's top signals,
// and which are missing. Only renders when cvData exists.

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getPathfinder } from '../data/loader.js'

function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

function normalise(s) {
  return s.toLowerCase().trim()
}

export default function CvCompare({ cvData, canonData, onClose }) {
  const [targetId, setTargetId]   = useState('')
  const [targetPf, setTargetPf]   = useState(null)
  const [loading, setLoading]     = useState(false)

  // Sorted list of canonical nodes for the picker
  const canonNodes = [...(canonData?.nodes ?? [])].sort((a, b) =>
    a.label.localeCompare(b.label)
  )

  // Resolve canonical node → prefer _services, fall back to _gcc
  function resolveNodeId(slug) {
    const nodes = canonData?.nodes ?? []
    return (
      nodes.find(n => n.id === `${slug}_services`)?.id ??
      nodes.find(n => n.id === `${slug}_gcc`)?.id ??
      null
    )
  }

  useEffect(() => {
    if (!targetId) { setTargetPf(null); return }
    let cancelled = false
    setLoading(true)
    getPathfinder(targetId)
      .then(pf => { if (!cancelled) { setTargetPf(pf); setLoading(false) } })
      .catch(() => { if (!cancelled) { setTargetPf(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [targetId])

  // Skill comparison
  const cvSkills     = new Set((cvData?.skills ?? []).map(normalise))
  const targetSkills = targetPf?.top_skills ?? []
  const have         = targetSkills.filter(s => cvSkills.has(normalise(s)))
  const missing      = targetSkills.filter(s => !cvSkills.has(normalise(s)))

  const targetColor = targetId ? `var(--role-${roleSlug(targetId)})` : 'var(--text-accent)'

  return (
    <div className="cv-compare-overlay" role="dialog" aria-label="Compare my CV">
      <div className="cv-compare-panel">

        <button className="cv-compare-close" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>

        <div className="cv-compare-heading">Compare my CV</div>
        <p className="cv-compare-sub">
          Pick a target role to see which of your CV skills match what the market asks for — and what's missing.
        </p>

        {/* Role picker */}
        <select
          className="cv-compare-select"
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
        >
          <option value="">— Select a target role —</option>
          {canonNodes.map(n => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>

        {/* Results */}
        {loading && (
          <div className="cv-compare-loading">Loading role data…</div>
        )}

        {!loading && targetPf && (
          <div className="cv-compare-results">

            <div className="cv-compare-role-label" style={{ color: targetColor }}>
              {targetPf.label}
              <span className="cv-compare-posting-count">
                {targetPf.posting_count.toLocaleString()} postings
              </span>
            </div>

            {/* Skills you have */}
            <div className="cv-compare-group">
              <div className="cv-compare-group-title cv-compare-group-title--have">
                You already have ({have.length} of {targetSkills.length})
              </div>
              {have.length > 0 ? (
                <div className="cv-compare-chips">
                  {have.map(s => (
                    <span key={s} className="chip chip--have">{s}</span>
                  ))}
                </div>
              ) : (
                <p className="cv-compare-empty">
                  None of this role's top signals appear in your CV directly.
                </p>
              )}
            </div>

            {/* Skills to build */}
            <div className="cv-compare-group">
              <div className="cv-compare-group-title cv-compare-group-title--missing">
                Skills to build ({missing.length})
              </div>
              {missing.length > 0 ? (
                <div className="cv-compare-chips">
                  {missing.map(s => (
                    <span key={s} className="chip chip--missing">{s}</span>
                  ))}
                </div>
              ) : (
                <p className="cv-compare-empty cv-compare-empty--good">
                  Your CV covers all top signals for this role.
                </p>
              )}
            </div>

            <p className="cv-compare-caveat">
              Based on this role's top skill signals from {targetPf.posting_count.toLocaleString()} postings.
              Skill matching is based on exact terms — partial matches may be missed.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
