// ─── Plexus · src/components/PlexusEdge.jsx ─────────────────────────────────
// Custom react-flow edge — bezier curve with gradient blending endpoint hues.
// Width encodes cosine weight. Cosine label appears on hover only.
// Edge states: default | active | secondary | faded

import { memo, useState, useId } from 'react'
import { getBezierPath, EdgeLabelRenderer } from 'reactflow'

// ── Opacity by edge state ─────────────────────────────────────────────────────
const STATE_OPACITY = {
  default:   0.25,
  active:    0.90,
  secondary: 0.40,
  faded:     0.08,
}

// ── Stroke width from cosine ──────────────────────────────────────────────────
// cosine range in graph: ~0.20 – ~0.60
// Map to stroke width: 1.2px – 4px
function cosineToWidth(cosine) {
  const min = 0.20, max = 0.60
  const minW = 1.2,  maxW = 4.0
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
  } = data

  const [hovered, setHovered] = useState(false)
  const gradientId = useId().replace(/:/g, '')

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    curvature: 0.55,
  })

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

      {/* Invisible wider hit area for hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(width + 10, 14)}
        style={{ cursor: 'default' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {/* Visible edge */}
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
          pointerEvents: 'none',
        }}
      />

      {/* Cosine label — hover only */}
      {hovered && (
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
