// ─── Plexus · src/components/Drawer.jsx ─────────────────────────────────────
// Side drawer — opens on node pin. All 7 sections.
// Section 1: role header, stratum badge, posting count, top skills
// Section 2: who's hiring (stratified companies) — from plexus_drawer_data.json
// Section 3: seniority spread (recharts bar) — from plexus_drawer_data.json
// Section 4: your doors (top 5 + expandable)
// Section 5: onward region (2-3 roles, equal weight)
// Section 6: bridge skills (collapsed, expandable)
// Section 7: two dialects (services vs GCC top skills, fires for 13 splittable roles)

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { getPathfinder, getDrawerData, getOverviewLayout } from '../data/loader.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

function StratumBadge({ stratum }) {
  return (
    <span className={`badge badge-${stratum}`}>
      {stratum === 'gcc' ? 'GCC' : 'Services'}
    </span>
  )
}

function ProximityTag({ tag }) {
  const cls = { strong: 'tag-strong', moderate: 'tag-moderate', 'a stretch': 'tag-stretch' }
  return <span className={cls[tag] ?? ''}>{tag}</span>
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ children, className = '' }) {
  return (
    <div className={`drawer-section ${className}`}>
      {children}
    </div>
  )
}

// ── Section 1 — Role header ───────────────────────────────────────────────────
function SectionRoleHeader({ pf }) {
  const color = `var(--role-${roleSlug(pf.node_id)})`
  return (
    <Section className="drawer-section-header">
      <div className="drawer-role-name" style={{ color }}>{pf.label}</div>
      <div className="drawer-role-meta">
        <StratumBadge stratum={pf.stratum} />
        <span className="drawer-posting-count">
          {pf.posting_count.toLocaleString()} postings
        </span>
      </div>
      {pf.top_skills?.length > 0 && (
        <div className="drawer-top-skills">
          {pf.top_skills.map(s => (
            <span key={s} className="chip">{s}</span>
          ))}
        </div>
      )}
    </Section>
  )
}

// ── Section 2 — Who's hiring ──────────────────────────────────────────────────
function SectionWhoHiring({ drawerData, stratum }) {
  if (!drawerData) return null
  const svcList = drawerData.top_companies?.services ?? []
  const gccList = drawerData.top_companies?.gcc ?? []
  if (!svcList.length && !gccList.length) return null

  return (
    <Section>
      <div className="drawer-section-title">Who's hiring</div>
      <p className="drawer-section-subtitle">
        Companies with the highest posting volume for this role across the dataset (Naukri, 2019–2026). Shows structural hiring patterns — who dominates this role in the market — not current openings.
        GCC numbers are small — they make up about 5% of this dataset, and that's a real market fact, not a data gap.
      </p>
      <div className="drawer-companies-grid">
        {svcList.length > 0 && (
          <div className="drawer-companies-col">
            <div className="drawer-companies-col-label badge badge-services">Services</div>
            <ul className="drawer-companies-list">
              {svcList.map(c => (
                <li key={c.name} className="drawer-company-row">
                  <span className="drawer-company-name">{c.name}</span>
                  <span className="drawer-company-count">{c.count} postings</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {gccList.length > 0 && (
          <div className="drawer-companies-col">
            <div className="drawer-companies-col-label badge badge-gcc">GCC</div>
            <ul className="drawer-companies-list">
              {gccList.map(c => (
                <li key={c.name} className="drawer-company-row">
                  <span className="drawer-company-name">{c.name}</span>
                  <span className="drawer-company-count">{c.count} postings</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Section 3 — Seniority spread ─────────────────────────────────────────────
function SectionSeniority({ drawerData }) {
  if (!drawerData) return null
  const spread = drawerData.seniority_spread ?? []
  const hasData = spread.some(b => b.count > 0)
  if (!hasData) return null

  return (
    <Section>
      <div className="drawer-section-title">Seniority spread</div>
      <p className="drawer-section-subtitle">
        How many job postings asked for each experience level. Shows whether this role skews junior, mid-level, or senior in practice.
      </p>
      <div className="drawer-seniority-chart">
        <ResponsiveContainer width="100%" height={110}>
          <BarChart
            data={spread}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="bracket"
              width={60}
              tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{
                background: 'var(--bg-elevated)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--text-primary)',
              }}
              formatter={(v) => [v, 'postings']}
            />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={10}>
              {spread.map((_, i) => (
                <Cell key={i} fill="var(--text-accent)" fillOpacity={0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}

// ── Section 4 — Your doors ────────────────────────────────────────────────────
function SectionDoors({ pf, onSelectEdge, nodeId }) {
  const [expanded, setExpanded] = useState(false)
  const allDoors  = pf.doors_full  ?? []
  const top5      = pf.doors_top5  ?? []
  const shown     = expanded ? allDoors : top5
  const extra     = allDoors.length - top5.length

  if (!top5.length) {
    if (pf.low_connectivity) {
      return (
        <Section>
          <div className="drawer-section-title">Your doors</div>
          <p className="drawer-low-conn-note">
            This role has few structural connections in the current dataset — it represents a genuine boundary in the market.
          </p>
        </Section>
      )
    }
    return null
  }

  return (
    <Section>
      <div className="drawer-section-title">
        Your doors
        <span className="drawer-door-count">{allDoors.length} total</span>
      </div>
      <p className="drawer-section-subtitle">
        Other roles that share enough skills with this one that a move is realistic. The more skills you already have in common, the shorter the gap to bridge.
      </p>

      <div className="drawer-proxy-caveat">
        Edges show skill overlap — a proxy for reachability, not a guarantee.
      </div>

      <ul className="drawer-doors-list">
        {shown.map(door => (
          <li key={door.node_id} className="drawer-door-item">
            <button
              className="drawer-door-btn"
              onClick={() => onSelectEdge({ sourceId: nodeId, targetId: door.node_id })}
              style={{ '--door-color': `var(--role-${roleSlug(door.node_id)})` }}
            >
              <span className="drawer-door-name">{door.label}</span>
              <ProximityTag tag={door.proximity_tag} />
            </button>
            {Array.isArray(door.bridge_skills) && door.bridge_skills.length > 0 && (
              <div className="drawer-door-skills">
                {door.bridge_skills.slice(0, 3).map(s => (
                  <span key={s} className="chip">{s}</span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {extra > 0 && (
        <button
          className="drawer-expand-btn"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded
            ? `Show fewer`
            : `Showing 5 of ${allDoors.length} doors — show all`}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      )}
    </Section>
  )
}

// ── Section 5 — Onward region ─────────────────────────────────────────────────
function SectionOnward({ pf, onNavigate }) {
  if (pf.is_hub) {
    return (
      <Section>
        <div className="drawer-section-title">Where this opens toward</div>
        <p className="drawer-hub-note">
          This role connects broadly — explore its doors directly.
        </p>
      </Section>
    )
  }

  const region = pf.onward_region ?? []
  if (!region.length) return null

  const combinedVolume = region.reduce((sum, r) => sum + (r.posting_count ?? 0), 0)

  return (
    <Section>
      <div className="drawer-section-title">
        Where this opens toward
        <span className="drawer-onward-volume">{combinedVolume.toLocaleString()} combined postings</span>
      </div>
      <p className="drawer-section-subtitle">
        Two steps out. If you move to one of your doors, these are the roles that become reachable next. No ranking — the data doesn't favour one over another, so all are shown at equal weight.
      </p>
      <ul className="drawer-onward-list">
        {region.map(r => (
          <li key={r.node_id}>
            <button
              className="drawer-onward-btn"
              onClick={() => onNavigate(r.node_id)}
              style={{ '--onward-color': `var(--role-${roleSlug(r.node_id)})` }}
            >
              <span className="drawer-onward-name">{r.label}</span>
              <StratumBadge stratum={r.stratum} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ── Section 6 — Bridge skills (collapsed) ────────────────────────────────────
function SectionBridgeSkills({ pf }) {
  const [open, setOpen] = useState(false)

  // Collect all bridge skills from all doors (deduplicated)
  const allBridgeSkills = new Set()
  for (const door of pf.doors_full ?? []) {
    if (Array.isArray(door.bridge_skills)) {
      door.bridge_skills.forEach(s => allBridgeSkills.add(s))
    }
  }

  if (!allBridgeSkills.size) return null

  const skills = [...allBridgeSkills].slice(0, 20)

  return (
    <Section>
      <button
        className="drawer-collapse-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className="drawer-section-title" style={{ marginBottom: 0 }}>Bridge skills</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <>
          <p className="drawer-section-subtitle" style={{ marginTop: 'var(--space-sm)' }}>
            Skills the door roles ask for that this role doesn't emphasise. These are the gaps you'd need to fill to make a move.
          </p>
          <div className="drawer-bridge-skills">
            {skills.map(s => (
              <span key={s} className="chip">{s}</span>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

// ── Section 7 — Two dialects ──────────────────────────────────────────────────
// Fires for roles with a self_twin_id. Fetches twin's top_skills from layout.
function SectionTwoDialects({ pf, layoutNodes }) {
  if (!pf.self_twin_id) return null

  const twin = layoutNodes?.find(n => n.id === pf.self_twin_id)
  if (!twin) return null

  const mySkills   = pf.top_skills   ?? []
  const twinSkills = twin.top_skills ?? []

  // Determine which is services, which is GCC
  const isMyServices = pf.stratum === 'services'
  const svcSkills    = isMyServices ? mySkills : twinSkills
  const gccSkills    = isMyServices ? twinSkills : mySkills

  return (
    <Section>
      <div className="drawer-section-title">Same title, different market</div>
      <p className="drawer-section-subtitle">
        The same job title asks for different skills depending on who's hiring.
        A role at an IT services company and the same role at a GCC (Global Capability Centre — a multinational's in-house tech team) are genuinely different jobs. This shows you the gap.
      </p>
      <div className="drawer-dialects-grid">
        <div className="drawer-dialect-col">
          <div className="drawer-dialect-label badge badge-services">Services</div>
          <ul className="drawer-dialect-skills">
            {svcSkills.map(s => (
              <li key={s} className="chip chip--dialect-services">{s}</li>
            ))}
          </ul>
        </div>
        <div className="drawer-dialect-col">
          <div className="drawer-dialect-label badge badge-gcc">GCC</div>
          <ul className="drawer-dialect-skills">
            {gccSkills.map(s => (
              <li key={s} className="chip chip--dialect-gcc">{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

// ── Edge detail view ─────────────────────────────────────────────────────────
function EdgeDetail({ pf, selectedEdge, onNavigate, onClearEdge }) {
  const door = pf?.doors_full?.find(d => d.node_id === selectedEdge.targetId)
  if (!door) return null

  const sourceColor = `var(--role-${roleSlug(pf.node_id)})`
  const targetColor = `var(--role-${roleSlug(selectedEdge.targetId)})`

  return (
    <div className="drawer-content">
      <div className="drawer-edge-detail">
        <button className="drawer-edge-back" onClick={onClearEdge}>
          ← {pf.label}
        </button>
        <div className="drawer-edge-header">
          <span style={{ color: sourceColor }}>{pf.label}</span>
          <span className="drawer-edge-arrow">→</span>
          <span style={{ color: targetColor }}>{door.label}</span>
        </div>
        <div className="drawer-edge-meta">
          <ProximityTag tag={door.proximity_tag} />
          <span className="drawer-proxy-caveat" style={{ marginBottom: 0 }}>
            Skill overlap — a proxy for reachability, not a guarantee.
          </span>
        </div>
        {door.bridge_skills?.length > 0 ? (
          <div className="drawer-edge-skills-section">
            <div className="drawer-section-title">Bridge skills</div>
            <div className="drawer-bridge-skills">
              {door.bridge_skills.map(s => (
                <span key={s} className="chip">{s}</span>
              ))}
            </div>
          </div>
        ) : (
          <p className="drawer-edge-empty">
            This move requires seniority and breadth typical of {door.label} — see full skill profile.
          </p>
        )}
        <button
          className="drawer-edge-explore"
          style={{ '--explore-color': targetColor }}
          onClick={() => onNavigate(selectedEdge.targetId)}
        >
          Explore {door.label} →
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Drawer — main component
// ═══════════════════════════════════════════════════════════════════════════════

export default function Drawer({ nodeId, layoutData, cvData, onClose, onNavigate, selectedEdge, onSelectEdge, onCompare }) {
  const [pf, setPf]               = useState(null)
  const [drawerData, setDrawerData] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [activeTab, setActiveTab]   = useState('pathfinder')

  useEffect(() => {
    if (!nodeId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setPf(null)
    setDrawerData(null)
    setActiveTab('pathfinder')

    Promise.all([
      getPathfinder(nodeId),
      // getDrawerData returns null gracefully if node missing
      getDrawerData(nodeId),
    ])
      .then(([pfData, ddData]) => {
        if (cancelled) return
        setPf(pfData)
        setDrawerData(ddData)
        setLoading(false)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [nodeId])

  // Door click = navigate to that node (re-pins, drawer reloads)
  const handleNavigate = (targetId) => {
    onNavigate(targetId)
  }

  const layoutNodes = layoutData?.nodes ?? []

  return (
    <aside className="drawer" aria-label="Role details">

      {/* Drag handle — visible on mobile only */}
      <div className="drawer-drag-handle" aria-hidden="true">
        <div className="drawer-drag-handle-pill" />
      </div>

      {/* Close button */}
      <button className="drawer-close" onClick={onClose} aria-label="Close drawer">
        <X size={16} />
      </button>

      {/* Loading */}
      {loading && (
        <div className="drawer-loading">
          <div className="drawer-spinner" />
          <span>Loading role data…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="drawer-error">
          <p>Failed to load: {error}</p>
        </div>
      )}

      {/* Edge detail view */}
      {!loading && !error && pf && selectedEdge && (
        <EdgeDetail
          pf={pf}
          selectedEdge={selectedEdge}
          onNavigate={handleNavigate}
          onClearEdge={() => onSelectEdge(null)}
        />
      )}

      {/* Full node content */}
      {!loading && !error && pf && !selectedEdge && (
        <div className="drawer-content">

          {/* Role header — always visible above tabs */}
          <SectionRoleHeader pf={pf} />

          {/* Tab bar + compare button */}
          <div className="drawer-tabs">
            <button
              className={`drawer-tab${activeTab === 'pathfinder' ? ' drawer-tab--active' : ''}`}
              onClick={() => setActiveTab('pathfinder')}
            >
              Pathfinder
            </button>
            <button
              className={`drawer-tab${activeTab === 'profile' ? ' drawer-tab--active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            {onCompare && (
              <button className="drawer-compare-btn" onClick={onCompare} aria-label="Compare with another role">
                Compare with…
              </button>
            )}
          </div>

          {/* Pathfinder tab */}
          {activeTab === 'pathfinder' && (
            <>
              <SectionDoors pf={pf} onSelectEdge={onSelectEdge} nodeId={nodeId} />
              <div className="divider" />
              <SectionOnward pf={pf} onNavigate={handleNavigate} />
              {(pf.onward_region?.length > 0 || pf.is_hub) && <div className="divider" />}
              <SectionBridgeSkills pf={pf} />
              {pf.self_twin_id && <div className="divider" />}
              <SectionTwoDialects pf={pf} layoutNodes={layoutNodes} />
            </>
          )}

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <>
              <SectionWhoHiring drawerData={drawerData} stratum={pf.stratum} />
              {drawerData && <div className="divider" />}
              <SectionSeniority drawerData={drawerData} />
            </>
          )}

        </div>
      )}
    </aside>
  )
}
