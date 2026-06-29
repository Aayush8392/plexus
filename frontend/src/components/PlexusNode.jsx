// ─── Plexus · src/components/PlexusNode.jsx ─────────────────────────────────
// Custom react-flow node — circle + Lucide icon + GCC arc + floating label.
// Visual states: default | hovered | dimmed | pinned | door | onward | faded

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import {
  Server, BarChart2, Workflow, Brain, Database, Layout,
  Infinity, Code2, Users, Monitor, Layers, Smartphone,
  Network, Globe, Compass, CheckCircle, Building2, Cloud,
  Shield, Code, GitBranch, PenTool, CloudLightning,
} from 'lucide-react'

// ── Lucide icon map (role_slug → component) ──────────────────────────────────
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

// ── GCC arc — upper-right quadrant SVG arc path ──────────────────────────────
// Draws a 90° arc from 0° to 90° (clock: top to right) on the node perimeter.
function GccArc({ r }) {
  // Arc from 12 o'clock (top) clockwise 90° to 3 o'clock (right)
  // SVG arc: start at (r, 0) which is top of circle, end at (r*√2/2+r, ...)
  // Using unit circle math on the SVG coordinate system:
  // top    = (cx + r*sin(0°),   cy - r*cos(0°))   = (cx,     cy - r)
  // right  = (cx + r*sin(90°),  cy - r*cos(90°))  = (cx + r, cy    )
  // SVG origin at centre of the circle container
  const cx = r
  const cy = r
  const startX = cx                // top
  const startY = cy - r
  const endX   = cx + r            // right
  const endY   = cy
  const d = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`
  return (
    <path
      d={d}
      fill="none"
      stroke="#e8d5a3"
      strokeWidth="3"
      strokeLinecap="round"
      style={{ pointerEvents: 'none' }}
    />
  )
}

// ── Opacity / stroke by visual state ─────────────────────────────────────────
const STATE_STYLES = {
  default: { opacity: 1,    strokeWidth: 2,   fillOpacity: 0.10 },
  hovered: { opacity: 1,    strokeWidth: 2.5, fillOpacity: 0.18 },
  dimmed:  { opacity: 0.20, strokeWidth: 1.5, fillOpacity: 0.06 },
  pinned:  { opacity: 1,    strokeWidth: 3,   fillOpacity: 0.22 },
  door:    { opacity: 1,    strokeWidth: 2,   fillOpacity: 0.12 },
  onward:  { opacity: 0.55, strokeWidth: 1.5, fillOpacity: 0.08 },
  faded:   { opacity: 0.18, strokeWidth: 1.5, fillOpacity: 0.05 },
}

// ── Component ─────────────────────────────────────────────────────────────────
function PlexusNode({ id, data }) {
  const {
    label,
    stratum,
    color,
    radius,
    hasGccTwin,
    degree,
    volumeBucket,
    lowConnectivity,
    visualState = 'default',
    isPinned,
  } = data

  const slug = roleSlug(id)
  const Icon = ICON_MAP[slug] ?? Code

  const style = STATE_STYLES[visualState] ?? STATE_STYLES.default
  const diameter = radius * 2

  // Stroke width encodes degree (subtle outer ring effect via strokeWidth)
  // Base strokeWidth from state, add degree signal (capped, subtle)
  const degreeBonus = Math.min(degree / 30, 1) * 1.2
  const strokeWidth = style.strokeWidth + (visualState === 'default' || visualState === 'hovered' ? degreeBonus : 0)

  // Icon size: ~55% of diameter, min 10px
  const iconSize = Math.max(Math.round(diameter * 0.52), 10)

  // Onward state gets dashed border
  const strokeDasharray = visualState === 'onward' ? '3 2' : undefined

  return (
    <div
      className={`plexus-node plexus-node--${visualState}`}
      style={{
        width: diameter,
        height: diameter,
        opacity: style.opacity,
        transition: 'opacity 200ms ease',
        position: 'relative',
      }}
    >
      {/* Centered handles — edges radiate from node center, not left/right sides */}
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: 'none', top: '50%', left: '50%' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none', top: '50%', left: '50%' }} />

      {/* Circle + icon SVG */}
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className={isPinned ? 'plexus-node-svg--pinned' : undefined}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* Main circle */}
        <circle
          cx={radius}
          cy={radius}
          r={radius - strokeWidth / 2}
          fill={color}
          fillOpacity={style.fillOpacity}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
        />

        {/* Pinned: white-hot ring */}
        {isPinned && (
          <circle
            className="plexus-pinned-ring"
            cx={radius}
            cy={radius}
            r={radius + 6}
            fill="none"
            stroke="hsl(38, 92%, 58%)"
            strokeWidth="2"
          />
        )}

        {/* GCC arc — upper-right quadrant */}
        {hasGccTwin && <GccArc r={radius - strokeWidth / 2} />}
      </svg>

      {/* Lucide icon — centred over circle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          color,
          opacity: visualState === 'faded' || visualState === 'dimmed' ? 0.5 : 0.9,
        }}
      >
        <Icon size={iconSize} strokeWidth={1.5} />
      </div>

      {/* Floating label below circle */}
      <div
        className="plexus-node-label"
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 6,
          whiteSpace: 'nowrap',
          fontSize: 'var(--text-xs)',
          color: visualState === 'faded' || visualState === 'dimmed'
            ? 'var(--text-muted)'
            : 'var(--text-secondary)',
          pointerEvents: 'none',
          userSelect: 'none',
          letterSpacing: '0.01em',
          lineHeight: 1.2,
          textAlign: 'center',
          transition: 'color 200ms ease',
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default memo(PlexusNode)
