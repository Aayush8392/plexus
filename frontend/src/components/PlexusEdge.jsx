// ─── Plexus · src/components/PlexusEdge.jsx ─────────────────────────────────
// Custom react-flow edge — bezier curve with gradient blending endpoint hues.
// Width encodes cosine weight. Cosine label appears on hover only.
// Edge states: default | active | secondary | faded

import { memo, useId } from 'react'
import { EdgeLabelRenderer } from 'reactflow'

// ── Opacity by edge state ─────────────────────────────────────────────────────
const STATE_OPACITY = {
  cold:      0.15,
  default:   0.60,
  active:    0.90,
  secondary: 0.55,
  faded:     0.00,
}

// ── Stroke width from cosine ──────────────────────────────────────────────────
// cosine range in graph: ~0.20 – ~0.60
// Map to stroke width: 1.2px – 4px
function cosineToWidth(cosine) {
  const min = 0.20, max = 0.60
  const minW = 2.5,  maxW = 7.0
  const t = Math.min(Math.max((cosine - min) / (max - min), 0), 1)
  return minW + t * (maxW - minW)
}

// ── Component ─────────────────────────────────────────────────────────────────
function PlexusEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  data = {},
}) {
  const {
    cosine = 0.25,
    isCrossStratum = false,
    srcColor = 'var(--text-muted)',
    tgtColor = 'var(--text-muted)',
    edgeState = 'default',
    isHovered = false,
  } = data
  const gradientId = useId().replace(/:/g, '')

  // Control point pre-computed in Screen3 with obstacle avoidance.
  // Fall back to midpoint if not provided.
  const srcR = data.srcRadius ?? 18
  const tgtR = data.tgtRadius ?? 18
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len
  const uy = dy / len
  const sx = sourceX + ux * srcR
  const sy = sourceY + uy * srcR
  const tx = targetX - ux * tgtR
  const ty = targetY - uy * tgtR
  const cx = data.cpx ?? (sx + tx) / 2
  const cy = data.cpy ?? (sy + ty) / 2
  const edgePath = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`
  const labelX = cx
  const labelY = cy

  const opacity  = STATE_OPACITY[edgeState] ?? 0.55
  const width    = cosineToWidth(cosine)

  // Cross-stratum edges: slightly different visual — dashed, lower base opacity
  const dashArray    = isCrossStratum ? '5 4' : undefined
  const crossOpacity = isCrossStratum ? opacity * 0.75 : opacity

  return (
    <>
      {/* Gradient definition */}
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%" y1="0%"
          x2="100%" y2="0%"
        >
          <stop offset="0%"   stopColor={srcColor} />
          <stop offset="100%" stopColor={tgtColor} />
        </linearGradient>
      </defs>


      {/* Filament — thin precise line, interactive */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={width}
        strokeDasharray={dashArray}
        strokeLinecap="round"
        style={{
          opacity: crossOpacity,
          transition: 'opacity 200ms ease',
          pointerEvents: (edgeState === 'faded' || edgeState === 'cold') ? 'none' : 'stroke',
        }}
      />

      {/* Cosine label — hover only */}
      {isHovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              zIndex: 10,
              background: 'rgba(13, 17, 23, 0.88)',
              color: 'var(--text-secondary)',
              fontSize: '0.65rem',
              fontVariantNumeric: 'tabular-nums',
              padding: '2px 7px',
              borderRadius: '9999px',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(4px)',
              letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
            }}
          >
            {cosine.toFixed(3)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(PlexusEdge)
