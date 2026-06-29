// ─── Plexus · src/components/PlexusNode.jsx ─────────────────────────────────
// Neural Loom visual treatment:
//   - Crystalline orb: glow filter + specular highlight + degree aura
//   - GCC nodes: full gold perimeter ring (replaces arc indicator)
//   - Two-line labels with manual line breaks per role (11px, ~80px wide)
//   - Cold ember: isolated nodes (lowConnectivity) — no aura, no glow, static
// Visual states: default | hovered | dimmed | pinned | door | onward | faded

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import {
  Server, BarChart2, Workflow, Brain, Database, Layout,
  Infinity, Code2, Users, Monitor, Layers, Smartphone,
  Network, Globe, Compass, CheckCircle, Building2, Cloud,
  Shield, Code, GitBranch, PenTool, CloudLightning,
} from 'lucide-react'

// ── Two-line label map (role_slug → [line1, line2 | null]) ───────────────────
const LABEL_LINES = {
  software_engineer_general: ['Software Engineer', '(General)'],
  sap_consultant:            ['SAP', 'Consultant'],
  full_stack_developer:      ['Full Stack', 'Developer'],
  backend_java_developer:    ['Backend / Java', 'Developer'],
  qa_test_engineer:          ['QA / Test', 'Engineer'],
  data_engineer:             ['Data', 'Engineer'],
  frontend_developer:        ['Frontend', 'Developer'],
  devops_sre:                ['DevOps / SRE', null],
  data_scientist_ml:         ['Data Scientist', '/ ML'],
  dot_net_developer:         ['.NET', 'Developer'],
  eng_manager_tech_lead:     ['Eng Manager /', 'Tech Lead'],
  solution_tech_architect:   ['Solution / Tech', 'Architect'],
  data_bi_analyst:           ['Data / BI', 'Analyst'],
  security_engineer:         ['Security', 'Engineer'],
  product_manager:           ['Product', 'Manager'],
  salesforce_developer:      ['Salesforce', 'Developer'],
  mobile_developer:          ['Mobile', 'Developer'],
  network_sys_admin:         ['Network /', 'Sys Admin'],
  ux_ui_designer:            ['UX / UI', 'Designer'],
  database_administrator:    ['Database', 'Administrator'],
  php_web_developer:         ['PHP / Web', 'Developer'],
  cloud_engineer_architect:  ['Cloud Engineer /', 'Architect'],
  database_architect:        ['Database', 'Architect'],
}

// ── Lucide icon map ───────────────────────────────────────────────────────────
const ICON_MAP = {
  backend_java_developer:    Server,
  data_bi_analyst:           BarChart2,
  data_engineer:             Workflow,
  data_scientist_ml:         Brain,
  database_administrator:    Database,
  database_architect:        Layout,
  devops_sre:                Infinity,
  dot_net_developer:         Code2,
  eng_manager_tech_lead:     Users,
  frontend_developer:        Monitor,
  full_stack_developer:      Layers,
  mobile_developer:          Smartphone,
  network_sys_admin:         Network,
  php_web_developer:         Globe,
  product_manager:           Compass,
  qa_test_engineer:          CheckCircle,
  sap_consultant:            Building2,
  salesforce_developer:      Cloud,
  security_engineer:         Shield,
  software_engineer_general: Code,
  solution_tech_architect:   GitBranch,
  ux_ui_designer:            PenTool,
  cloud_engineer_architect:  CloudLightning,
}

function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

// ── Visual state styles ───────────────────────────────────────────────────────
const STATE_STYLES = {
  default: { opacity: 1,    strokeWidth: 2,   fillOpacity: 0.38 },
  hovered: { opacity: 1,    strokeWidth: 2.5, fillOpacity: 0.52 },
  dimmed:  { opacity: 0.20, strokeWidth: 1.5, fillOpacity: 0.10 },
  pinned:  { opacity: 1,    strokeWidth: 3,   fillOpacity: 0.65 },
  door:    { opacity: 1,    strokeWidth: 2,   fillOpacity: 0.44 },
  onward:  { opacity: 0.55, strokeWidth: 2,   fillOpacity: 0.22 },
  faded:   { opacity: 0.14, strokeWidth: 1.5, fillOpacity: 0.06 },
}

// ── Component ─────────────────────────────────────────────────────────────────
function PlexusNode({ id, data }) {
  const {
    label,
    stratum,
    color,
    radius,
    degree,
    lowConnectivity,
    visualState = 'default',
    isPinned,
  } = data

  const slug     = roleSlug(id)
  const Icon     = ICON_MAP[slug] ?? Code
  const lines    = LABEL_LINES[slug]
  const style    = STATE_STYLES[visualState] ?? STATE_STYLES.default
  const diameter = radius * 2
  const isGcc      = stratum === 'gcc'
  const isIsolated = lowConnectivity
  const isActive   = visualState !== 'faded' && visualState !== 'dimmed'

  // Degree aura — scales with connection count, absent on cold embers
  const auraR       = radius + 18 + Math.min(degree / 35, 1) * 20
  const auraOpacity = (!isIsolated && isActive)
    ? Math.max(0.10, Math.min(degree / 35, 1) * 0.30)
    : 0

  const iconSize        = Math.max(Math.round(diameter * 0.50), 10)
  const strokeDasharray = visualState === 'onward' ? '3 2' : undefined

  // CSS drop-shadow — values are in the node's flow-coordinate space.
  // Large values needed so glow survives at fitView zoom (~0.38).
  const cssGlow = 'none'

  return (
    <div
      className={`plexus-node plexus-node--${visualState}`}
      style={{
        width: diameter,
        height: diameter,
        opacity: style.opacity,
        filter: cssGlow,
        transition: 'opacity 200ms ease, filter 200ms ease',
        position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none', top: '50%', left: '50%' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none', top: '50%', left: '50%' }} />

      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className={isPinned ? 'plexus-node-svg--pinned' : undefined}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* Degree aura — soft outer glow */}
        {auraOpacity > 0 && (
          <circle
            cx={radius} cy={radius} r={auraR}
            fill={color} fillOpacity={auraOpacity}
            stroke="none"
            filter="url(#plexus-aura-blur)"
          />
        )}

        {/* Main circle */}
        <circle
          cx={radius} cy={radius}
          r={radius - style.strokeWidth / 2}
          fill={color}
          fillOpacity={style.fillOpacity}
          stroke={color}
          strokeWidth={style.strokeWidth}
          strokeDasharray={strokeDasharray}
        />

        {/* Specular highlight — crystalline orb effect */}
        {isActive && !isIsolated && (
          <ellipse
            cx={radius * 0.60} cy={radius * 0.40}
            rx={radius * 0.28} ry={radius * 0.17}
            fill="white" fillOpacity={0.28}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* GCC full perimeter ring — replaces arc, on GCC nodes only */}
        {isGcc && (
          <circle
            cx={radius} cy={radius}
            r={radius + style.strokeWidth + 3}
            fill="none"
            stroke="#e8d5a3"
            strokeWidth="2"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Pinned ring — amber, enlarged, animated via CSS */}
        {isPinned && (
          <circle
            className="plexus-pinned-ring"
            cx={radius} cy={radius}
            r={radius + 9}
            fill="none"
            stroke="hsl(38, 92%, 58%)"
            strokeWidth="2.5"
          />
        )}
      </svg>

      {/* Lucide icon */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          color,
          opacity: (visualState === 'faded' || visualState === 'dimmed') ? 0.35 : 0.88,
        }}
      >
        <Icon size={iconSize} strokeWidth={1.5} />
      </div>

      {/* Two-line label */}
      <div
        className="plexus-node-label"
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 7,
          fontSize: '11px',
          lineHeight: 1.25,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          color: (visualState === 'faded' || visualState === 'dimmed')
            ? 'var(--text-muted)'
            : 'var(--text-secondary)',
          pointerEvents: 'none',
          userSelect: 'none',
          transition: 'color 200ms ease',
        }}
      >
        {lines ? (
          <>
            <span style={{ display: 'block' }}>{lines[0]}</span>
            {lines[1] && <span style={{ display: 'block' }}>{lines[1]}</span>}
          </>
        ) : label}
      </div>
    </div>
  )
}

export default memo(PlexusNode)
