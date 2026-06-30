// ─── Plexus · src/screens/Screen3.jsx ───────────────────────────────────────
// Screen 3 — Graph / Pathfinder
// Cold state: full 32-node MDS map, all 88 within-stratum edges.
// Pinned state: node clicked → drawer opens, visual rings applied.
// confirmedRole: resolved from _services → _gcc → cold fallback.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import ReactFlow, {
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { getOverviewLayout } from '../data/loader.js'
import PlexusNode from '../components/PlexusNode.jsx'
import PlexusEdge from '../components/PlexusEdge.jsx'
import Drawer from '../components/Drawer.jsx'
import CvCompare from '../components/CvCompare.jsx'
import SplitDossier from '../components/SplitDossier.jsx'
import '../styles/Screen3.css'

// ── react-flow custom type registration ──────────────────────────────────────
const NODE_TYPES = { plexusNode: PlexusNode }
const EDGE_TYPES = { plexusEdge: PlexusEdge }

// ── Volume bucket → radius (px) ──────────────────────────────────────────────
const BUCKET_RADIUS = { v1: 18, v2: 24, v3: 30, v4: 38 }

// ── Coordinate spread ─────────────────────────────────────────────────────────
const COORD_SCALE  = 1.6   // MDS coords are tight — scale up for legibility
const GCC_OFFSET_X = 20    // nudge GCC twins right so labels don't collide
const GCC_OFFSET_Y = -15   // nudge GCC twins up

// ── Role slug → CSS hue variable ─────────────────────────────────────────────
function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

function roleColorVar(nodeId) {
  return `var(--role-${roleSlug(nodeId)})`
}

// ── Build canonical 23-node dataset from full stratified layout ───────────────
// Prefers services node per role; falls back to gcc if no services node exists.
// Solid edges = within-stratum mapped to canonical pairs.
// Cross edges = cross-stratum cross-role pairs (shown as dotted on toggle).
function buildCanonicalData(layoutData) {
  const { nodes: ln, edges: le, metadata } = layoutData

  const bySlug = {}
  ln.forEach(n => {
    const slug = roleSlug(n.id)
    if (!bySlug[slug] || n.stratum === 'services') bySlug[slug] = n
  })
  const canonNodes = Object.values(bySlug)
  const canonIdOf  = id => bySlug[roleSlug(id)]?.id

  const solidMap = new Map()
  le.filter(e => !e.is_cross_stratum).forEach(e => {
    const s = canonIdOf(e.source), t = canonIdOf(e.target)
    if (!s || !t || s === t) return
    const key = [s, t].sort().join('||')
    if (!solidMap.has(key) || e.cosine > solidMap.get(key).cosine)
      solidMap.set(key, { source: s, target: t, cosine: e.cosine, is_cross_stratum: false })
  })

  const crossMap = new Map()
  le.filter(e => e.is_cross_stratum && roleSlug(e.source) !== roleSlug(e.target)).forEach(e => {
    const s = canonIdOf(e.source), t = canonIdOf(e.target)
    if (!s || !t || s === t) return
    const key = [s, t].sort().join('||')
    if (solidMap.has(key)) return
    if (!crossMap.has(key) || e.cosine > crossMap.get(key).cosine)
      crossMap.set(key, { source: s, target: t, cosine: e.cosine, is_cross_stratum: true })
  })

  return {
    nodes:      canonNodes,
    solidEdges: [...solidMap.values()],
    crossEdges: [...crossMap.values()],
    metadata,
  }
}

// ── Force layout — runs once on canonical nodes + solid edges ─────────────────
function runForceLayout({ nodes: ln, edges: le }) {

  // Degree from solid (canonical) edges
  const degree = {}
  ln.forEach(n => degree[n.id] = 0)
  le.forEach(e => { degree[e.source] = (degree[e.source]||0)+1; degree[e.target] = (degree[e.target]||0)+1 })

  // Circular seed — nodes placed evenly on a ring sorted by MDS angle from centroid.
  // Gives force simulation maximum room; connected nodes converge naturally.
  // Deterministic: sorted by MDS angle so layout is stable across reloads.
  const SEED_R     = 500   // initial ring radius
  const ISOLATE_R  = 650   // degree-0 nodes pinned outside the settled cluster

  const mdsCx = ln.reduce((s, n) => s + n.x, 0) / ln.length
  const mdsCy = ln.reduce((s, n) => s + n.y, 0) / ln.length

  // Sort by MDS angle so angularly-close nodes start close on the ring
  const sorted = [...ln].sort((a, b) =>
    Math.atan2(a.y - mdsCy, a.x - mdsCx) - Math.atan2(b.y - mdsCy, b.x - mdsCx)
  )
  const angleOf = {}
  sorted.forEach((n, i) => { angleOf[n.id] = (2 * Math.PI * i) / sorted.length })

  const simNodes = ln.map(n => {
    const angle = angleOf[n.id]
    const r = BUCKET_RADIUS[n.volume_bucket] ?? 18

    if (degree[n.id] === 0) {
      const x = Math.cos(angle) * ISOLATE_R
      const y = Math.sin(angle) * ISOLATE_R
      return { id: n.id, x, y, r, fx: x, fy: y }
    }

    return {
      id: n.id,
      x: Math.cos(angle) * SEED_R,
      y: Math.sin(angle) * SEED_R,
      r,
    }
  })

  const nodeById = Object.fromEntries(simNodes.map(n => [n.id, n]))

  const simEdges = le
    .map(e => ({
      source:  nodeById[e.source],
      target:  nodeById[e.target],
      cosine:  e.cosine,
      isCross: e.is_cross_stratum,
    }))
    .filter(e => e.source && e.target)

  forceSimulation(simNodes)
    .force('link', forceLink(simEdges)
      .distance(d => d.isCross ? 80 : 260 - d.cosine * 150)
      .strength(d => d.isCross ? 0.6 : d.cosine * 0.6)
    )
    .force('charge', forceManyBody().strength(-600))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide().radius(d => d.r + 70).strength(0.9))
    .stop()
    .tick(500)

  return Object.fromEntries(simNodes.map(n => [n.id, { x: n.x, y: n.y }]))
}

// ── Edge obstacle avoidance ───────────────────────────────────────────────────
// Computes a quadratic bezier control point that arcs around any intermediate
// nodes blocking the direct path. Iterates: if the arc still passes through a
// node, increases the offset and flips side if needed, up to MAX_ITER times.
function computeControlPoint(sx, sy, tx, ty, allNodes, srcId, tgtId) {
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Perpendicular unit vector
  const px = -uy
  const py =  ux

  const BUFFER   = 12   // clearance beyond node radius
  const BASE     = len * 0.12
  const STEP     = len * 0.10
  const MAX_ITER = 8

  let offset = BASE
  let side   = 1

  for (let i = 0; i < MAX_ITER; i++) {
    const mx  = (sx + tx) / 2
    const my  = (sy + ty) / 2
    const cpx = mx + px * offset * side
    const cpy = my + py * offset * side

    let blocked = false
    for (const n of allNodes) {
      if (n.id === srcId || n.id === tgtId) continue
      const nr = (BUCKET_RADIUS[n.volume_bucket] ?? 18) + BUFFER
      // Sample 8 points along the quadratic bezier and check distance to node
      for (let t = 0.1; t < 1.0; t += 0.1) {
        const bx = (1-t)*(1-t)*sx + 2*(1-t)*t*cpx + t*t*tx
        const by = (1-t)*(1-t)*sy + 2*(1-t)*t*cpy + t*t*ty
        const ndx = bx - n.x
        const ndy = by - n.y
        if (Math.sqrt(ndx*ndx + ndy*ndy) < nr) {
          blocked = true
          break
        }
      }
      if (blocked) break
    }

    if (!blocked) return { cpx, cpy }

    // Alternate sides and increase offset each round
    if (side === 1) { side = -1 }
    else            { side = 1; offset += STEP }
  }

  // Fallback — return last computed control point
  const mx  = (sx + tx) / 2
  const my  = (sy + ty) / 2
  return { cpx: mx + px * offset * side, cpy: my + py * offset * side }
}

// ── confirmedRole resolution ──────────────────────────────────────────────────
// Screen2b passes `${selectedSlug}_services`. Resolve against actual graph nodes.
function resolveConfirmedRole(confirmedRole, nodeMap) {
  if (!confirmedRole) return null
  if (nodeMap[confirmedRole]) return confirmedRole
  // Try gcc fallback
  const gccFallback = confirmedRole.replace(/_services$/, '_gcc')
  if (nodeMap[gccFallback]) return gccFallback
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Inner graph component (needs useReactFlow — must be inside ReactFlowProvider)
// ═══════════════════════════════════════════════════════════════════════════════

function GraphCanvas({
  canonData,
  layoutData,
  forcedPositions,
  confirmedRole,
  pinnedId,
  setPinnedId,
  hoveredId,
  setHoveredId,
  showCrossStratum,
  adjacentIds,
  onwardIds,
  selectedEdge,
  onSelectEdge,
  compareId,
  setCompareId,
  comparePickMode,
  setComparePickMode,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const translateExtent = useMemo(() => {
    if (!forcedPositions) return [[-Infinity, -Infinity], [Infinity, Infinity]]
    const pad = 300
    const positions = Object.values(forcedPositions)
    const xs = positions.map(p => p.x)
    const ys = positions.map(p => p.y)
    return [
      [Math.min(...xs) - pad, Math.min(...ys) - pad],
      [Math.max(...xs) + pad, Math.max(...ys) + pad],
    ]
  }, [forcedPositions])
  const { fitView, setCenter, getZoom, getNode, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow()

  function panBy(dx, dy) {
    const { x, y, zoom } = getViewport()
    setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 150 })
  }
  const hoverTimer = useRef(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null)

  // Build nodes + edges with visual states from canonical data
  useEffect(() => {
    if (!canonData || !forcedPositions) return
    const { nodes: ln, solidEdges, crossEdges } = canonData
    const nodeMap = Object.fromEntries(ln.map(n => [n.id, n]))

    const rfNodes = ln.map(n => {
      const r = BUCKET_RADIUS[n.volume_bucket] ?? 10
      const slug = roleSlug(n.id)
      const color = `var(--role-${slug})`

      let visualState = 'default'
      if (compareId) {
        if (n.id === pinnedId || n.id === compareId) visualState = 'pinned'
        else visualState = 'faded'
      } else if (pinnedId && selectedEdge) {
        if (n.id === selectedEdge.sourceId) visualState = 'pinned'
        else if (n.id === selectedEdge.targetId) visualState = 'door'
        else visualState = 'faded'
      } else if (pinnedId) {
        if (n.id === pinnedId) visualState = 'pinned'
        else if (adjacentIds.has(n.id)) visualState = onwardIds.has(n.id) ? 'onward' : 'door'
        else visualState = 'faded'
      } else if (hoveredId) {
        if (n.id === hoveredId) visualState = 'hovered'
        else visualState = 'dimmed'
      }

      return {
        id: n.id,
        type: 'plexusNode',
        position: forcedPositions[n.id] ?? { x: n.x * COORD_SCALE, y: n.y * COORD_SCALE },
        draggable: false,
        selectable: true,
        data: {
          label: n.label,
          stratum: n.stratum,
          color,
          radius: r,
          hasGccTwin: n.has_gcc_twin,
          degree: n.degree,
          volumeBucket: n.volume_bucket,
          lowConnectivity: n.low_connectivity,
          visualState,
          isPinned: n.id === pinnedId || n.id === compareId,
        },
      }
    })

    // Positions list for obstacle avoidance
    const nodesWithPos = ln.map(n => ({
      ...n,
      x: forcedPositions[n.id]?.x ?? n.x * COORD_SCALE,
      y: forcedPositions[n.id]?.y ?? n.y * COORD_SCALE,
    }))

    // Active edges: solid always; cross only when toggle is on
    const activeEdges = showCrossStratum
      ? [...solidEdges, ...crossEdges]
      : solidEdges

    const rfEdges = activeEdges.map(e => {
      const srcColor = `var(--role-${roleSlug(e.source)})`
      const tgtColor = `var(--role-${roleSlug(e.target)})`

      let edgeState = (!pinnedId && !hoveredId) ? 'cold' : 'default'
      if (selectedEdge) {
        const isSelected =
          (e.source === selectedEdge.sourceId && e.target === selectedEdge.targetId) ||
          (e.source === selectedEdge.targetId && e.target === selectedEdge.sourceId)
        edgeState = isSelected ? 'active' : 'faded'
      } else if (pinnedId) {
        edgeState = (e.source === pinnedId || e.target === pinnedId) ? 'active' : 'faded'
      } else if (hoveredId) {
        edgeState = (e.source === hoveredId || e.target === hoveredId) ? 'active' : 'faded'
      }

      const srcR = BUCKET_RADIUS[nodeMap[e.source]?.volume_bucket] ?? 18
      const tgtR = BUCKET_RADIUS[nodeMap[e.target]?.volume_bucket] ?? 18
      const sp = forcedPositions[e.source]
      const tp = forcedPositions[e.target]
      const cp = (() => {
        if (!sp || !tp) return {}
        const ddx = tp.x - sp.x, ddy = tp.y - sp.y
        const ll = Math.sqrt(ddx*ddx + ddy*ddy) || 1
        return computeControlPoint(
          sp.x + ddx/ll * srcR, sp.y + ddy/ll * srcR,
          tp.x - ddx/ll * tgtR, tp.y - ddy/ll * tgtR,
          nodesWithPos, e.source, e.target
        )
      })()

      return {
        id: `${e.source}--${e.target}`,
        source: e.source,
        target: e.target,
        type: 'plexusEdge',
        data: {
          cosine: e.cosine,
          isCrossStratum: e.is_cross_stratum,
          srcColor,
          tgtColor,
          edgeState,
          srcRadius: srcR,
          tgtRadius: tgtR,
          ...cp,
          isHovered: !!pinnedId && edgeState === 'active' &&
            (hoveredEdgeId === `${e.source}--${e.target}` || hoveredEdgeId === `${e.target}--${e.source}`),
        },
      }
    })

    setNodes(rfNodes)
    setEdges(rfEdges)
  }, [canonData, forcedPositions, pinnedId, hoveredId, hoveredEdgeId, showCrossStratum, adjacentIds, onwardIds, selectedEdge, compareId])

  // Fit view on initial load
  useEffect(() => {
    if (layoutData) {
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 100)
    }
  }, [layoutData])

  // Pan to pinned node — on mobile offset upward so node sits in the graph area above the sheet
  useEffect(() => {
    if (!pinnedId) return
    setTimeout(() => {
      const node = getNode(pinnedId)
      if (!node) return
      const r = BUCKET_RADIUS[node.data.volumeBucket] ?? 14
      const isMobile = window.innerWidth <= 680
      // On mobile the bottom sheet takes 45dvh — shift the target y up by ~25% of screen
      // so the pinned node lands in the visible graph area, not behind the sheet
      const yOffset = isMobile ? window.innerHeight * 0.225 : 0
      const zoom = Math.max(getZoom(), 1.0)
      setCenter(node.position.x + r, node.position.y + r + yOffset / zoom, {
        zoom,
        duration: 600,
      })
    }, 120)
  }, [pinnedId])

  const onNodeClick = useCallback((event, node) => {
    // Pick mode (mobile compare) — tap any other node to compare
    if (comparePickMode && pinnedId && node.id !== pinnedId) {
      setCompareId(node.id)
      setComparePickMode(false)
      return
    }
    // Shift-click with a pinned node → compare mode (desktop)
    if (event.shiftKey && pinnedId && node.id !== pinnedId) {
      setCompareId(node.id)
      return
    }
    // Normal click — clear compare state
    setCompareId(null)
    setComparePickMode(false)
    if (node.id === pinnedId) {
      setPinnedId(null)
    } else {
      setPinnedId(node.id)
      onSelectEdge(null)
    }
  }, [pinnedId, setPinnedId, onSelectEdge, setCompareId, comparePickMode, setComparePickMode])

  const onNodeMouseEnter = useCallback((_, node) => {
    if (pinnedId) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoveredId(node.id), 80)
  }, [pinnedId, setHoveredId])

  const onNodeMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoveredId(null), 80)
  }, [setHoveredId])

  const onPaneClick = useCallback(() => {
    if (comparePickMode) { setComparePickMode(false); return }
    setPinnedId(null)
    setCompareId(null)
    onSelectEdge(null)
  }, [setPinnedId, setCompareId, onSelectEdge, comparePickMode, setComparePickMode])

  const onEdgeClick = useCallback((_, edge) => {
    let sourceId, targetId
    if (pinnedId === edge.source || pinnedId === edge.target) {
      sourceId = pinnedId
      targetId = pinnedId === edge.source ? edge.target : edge.source
    } else {
      sourceId = edge.source
      targetId = edge.target
      setPinnedId(sourceId)
    }
    onSelectEdge({ sourceId, targetId })
  }, [pinnedId, setPinnedId, onSelectEdge])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
      onEdgeMouseLeave={() => setHoveredEdgeId(null)}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onPaneClick={onPaneClick}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      minZoom={0.3}
      maxZoom={2.5}
      translateExtent={translateExtent}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      attributionPosition="bottom-left"
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(255,255,255,0.03)" gap={40} size={1} />
    </ReactFlow>
  )
}

// ── Map controls — zoom + d-pad (must be inside ReactFlowProvider) ────────────
function MapControls() {
  const { zoomIn, zoomOut, getViewport, setViewport, getNodes } = useReactFlow()
  const holdTimer  = useRef(null)
  const flowBounds = useRef(null)

  // Compute node bounding box in flow coordinates once nodes are placed
  useEffect(() => {
    const t = setTimeout(() => {
      const nodes = getNodes()
      if (!nodes.length) return
      const xs = nodes.map(n => n.position.x)
      const ys = nodes.map(n => n.position.y)
      flowBounds.current = {
        minX: Math.min(...xs) - 80,
        maxX: Math.max(...xs) + 80,
        minY: Math.min(...ys) - 80,
        maxY: Math.max(...ys) + 80,
      }
    }, 650)
    return () => clearTimeout(t)
  }, [])

  function panBy(dx, dy) {
    const { x, y, zoom } = getViewport()
    let newX = x + dx
    let newY = y + dy

    if (flowBounds.current) {
      const { minX, maxX, minY, maxY } = flowBounds.current
      const W = window.innerWidth
      const H = window.innerHeight
      // Convert flow bounds to viewport limits at current zoom.
      // screen = flow * zoom + viewport, so viewport = screen - flow * zoom
      newX = Math.max(-maxX * zoom + W * 0.1, Math.min(-minX * zoom + W * 0.9, newX))
      newY = Math.max(-maxY * zoom + H * 0.1, Math.min(-minY * zoom + H * 0.9, newY))
    }

    setViewport({ x: newX, y: newY, zoom }, { duration: 0 })
  }

  function startHold(action) {
    action()
    holdTimer.current = setInterval(action, 80)
  }

  function stopHold() {
    clearInterval(holdTimer.current)
    holdTimer.current = null
  }

  function hold(action) {
    return {
      onMouseDown:  () => startHold(action),
      onMouseUp:    stopHold,
      onMouseLeave: stopHold,
      onTouchStart: (e) => { e.preventDefault(); startHold(action) },
      onTouchEnd:   stopHold,
    }
  }

  return (
    <div className="map-controls">
      {/* Zoom */}
      <button className="map-ctrl-btn" title="Zoom in"  {...hold(() => zoomIn({ duration: 0 }))}>＋</button>
      <button className="map-ctrl-btn" title="Zoom out" {...hold(() => zoomOut({ duration: 0 }))}>－</button>

      {/* D-pad */}
      <div className="map-dpad">
        <div />
        <button className="map-ctrl-btn" title="Pan up"    {...hold(() => panBy(0,  80))}>▲</button>
        <div />
        <button className="map-ctrl-btn" title="Pan left"  {...hold(() => panBy( 80, 0))}>◀</button>
        <div />
        <button className="map-ctrl-btn" title="Pan right" {...hold(() => panBy(-80, 0))}>▶</button>
        <div />
        <button className="map-ctrl-btn" title="Pan down"  {...hold(() => panBy(0, -80))}>▼</button>
        <div />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Screen3 — outer shell, state, data loading
// ═══════════════════════════════════════════════════════════════════════════════

export default function Screen3({ nav, confirmedRole, cvData, entryScreen }) {
  const [layoutData, setLayoutData]       = useState(null)
  const [canonData, setCanonData]         = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [pinnedId, setPinnedId]           = useState(null)
  const [hoveredId, setHoveredId]         = useState(null)
  const [showInfo, setShowInfo]           = useState(false)
  const [drawerOpen, setDrawerOpen]       = useState(false)
  const [selectedEdge, setSelectedEdge]   = useState(null)
  const [forcedPositions, setForcedPositions] = useState(null)
  const [showCvCompare, setShowCvCompare]     = useState(false)
  const [compareId, setCompareId]             = useState(null)
  const [comparePickMode, setComparePickMode] = useState(false)

  // Load layout data
  useEffect(() => {
    let cancelled = false
    getOverviewLayout()
      .then(data => {
        if (cancelled) return
        const canon = buildCanonicalData(data)
        setLayoutData(data)
        setCanonData(canon)
        setForcedPositions(runForceLayout({ nodes: canon.nodes, edges: canon.solidEdges }))
        setLoading(false)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  // Resolve confirmedRole once layout is loaded
  useEffect(() => {
    if (!layoutData || !confirmedRole) return
    const nodeMap = Object.fromEntries(layoutData.nodes.map(n => [n.id, n]))
    const resolved = resolveConfirmedRole(confirmedRole, nodeMap)
    if (resolved) {
      setPinnedId(resolved)
      setDrawerOpen(true)
    }
    // If neither _services nor _gcc exists → cold state, no pin
  }, [layoutData, confirmedRole])

  // Derive adjacency for visual rings when a node is pinned
  const { adjacentIds, onwardIds } = useMemo(() => {
    if (!canonData || !pinnedId) return { adjacentIds: new Set(), onwardIds: new Set() }
    const doorSet = new Set()
    const onwardSet = new Set()
    for (const e of canonData.solidEdges) {
      if (e.source === pinnedId) doorSet.add(e.target)
      if (e.target === pinnedId) doorSet.add(e.source)
    }
    for (const e of canonData.solidEdges) {
      if (doorSet.has(e.source) && !doorSet.has(e.target) && e.target !== pinnedId) onwardSet.add(e.target)
      if (doorSet.has(e.target) && !doorSet.has(e.source) && e.source !== pinnedId) onwardSet.add(e.source)
    }
    return { adjacentIds: doorSet, onwardIds: onwardSet }
  }, [canonData, pinnedId])

  // Open/close drawer with pin; clear compare when pin clears
  useEffect(() => {
    if (pinnedId) {
      setDrawerOpen(true)
    } else {
      setDrawerOpen(false)
      setCompareId(null)
      setComparePickMode(false)
    }
  }, [pinnedId])

  // Metadata for annotation bar
  const meta        = canonData?.metadata ?? {}
  const withinCount = canonData?.solidEdges.length ?? 0
  const threshold   = meta.threshold ?? 0.20

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="screen screen-3 screen-3-loading">
        <div className="s3-loader">
          <div className="s3-loader-spinner" />
          <span>Building market map…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen screen-3 screen-3-error">
        <p>Failed to load graph data: {error}</p>
        <button className="btn btn-ghost" onClick={() => nav('1')}>Back to start</button>
      </div>
    )
  }

  return (
    <div className={`screen screen-3${drawerOpen && !compareId ? ' drawer-open' : ''}${showCvCompare ? ' cv-compare-open' : ''}${compareId ? ' compare-open' : ''}`}>

      {/* ── Graph canvas ── */}
      <div className="s3-graph-area">

        {/* SVG filter definitions — referenced by PlexusNode + PlexusEdge */}
        <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
          <defs>
            <filter id="plexus-node-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="plexus-aura-blur" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6"/>
            </filter>
            <filter id="plexus-edge-glow" x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="22"/>
            </filter>
          </defs>
        </svg>

        <ReactFlowProvider>
          <GraphCanvas
            canonData={canonData}
            layoutData={layoutData}
            forcedPositions={forcedPositions}
            confirmedRole={confirmedRole}
            pinnedId={pinnedId}
            setPinnedId={setPinnedId}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
            showCrossStratum={false}
            adjacentIds={adjacentIds}
            onwardIds={onwardIds}
            selectedEdge={selectedEdge}
            onSelectEdge={setSelectedEdge}
            compareId={compareId}
            setCompareId={setCompareId}
            comparePickMode={comparePickMode}
            setComparePickMode={setComparePickMode}
          />
          <MapControls />
        </ReactFlowProvider>
      </div>

      {/* ── Legend ── */}
      <div className="graph-legend">
        <div className="graph-legend-item">
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" fill="rgba(139,148,158,0.15)" stroke="#8b949e" strokeWidth="1.5"/>
            <circle cx="7" cy="7" r="6.5" fill="none" stroke="#e8d5a3" strokeWidth="1.5"/>
          </svg>
          <span>Also active in GCCs</span>
        </div>
      </div>

      {/* ── Nav buttons (top-left) ── */}
      <div className="s3-nav-btns">
        <button className="s3-nav-btn" onClick={() => nav('0')}>← Home</button>
        <button className="s3-nav-btn" onClick={() => nav(entryScreen ?? '2')}>← Back</button>
        <button
          className={`s3-nav-btn s3-info-btn${showInfo ? ' active' : ''}`}
          onClick={() => setShowInfo(v => !v)}
          aria-label="About this map"
        >ⓘ How to read this map</button>
      </div>


      {/* ── Info panel ── */}
      {showInfo && (
        <div className="s3-info-panel">
          <button className="s3-info-close" onClick={() => setShowInfo(false)} aria-label="Close">✕</button>

          <h3 className="s3-info-heading">What is this?</h3>
          <p className="s3-info-body">A structural map of the Indian IT job market built from 130,757 real job postings. Each node is a role. Each edge is a measure of skill overlap between two roles — the stronger the overlap, the more reachable one role is from the other. Roles that share more skills tend to sit closer together, but the layout is an approximation — the exact strength of any connection is shown on the edge when you hover it, not by how near two nodes appear. Roles at the edges of the map have few strong connections in this dataset; that's a structural finding, not a data gap.</p>

          <h3 className="s3-info-heading">Navigating the map</h3>
          <p className="s3-info-body">Hover a node to see its connections. Click to pin it and open a full breakdown — your doors, where they lead, and the skills that bridge the gap. With a node pinned, shift-click any other node to compare both roles side by side.</p>

          <h3 className="s3-info-heading">How it works</h3>
          <p className="s3-info-body">Edges are weighted by cosine similarity — how much two roles share the same skills. 0 means nothing in common, 1 means identical skill profiles. This map shows edges at 0.20 and above. A score of 0.20–0.35 is a stretch move. 0.35–0.50 is a natural door. Above 0.50, the roles are nearly interchangeable.</p>
          <p className="s3-info-body">One of the map's core findings is that the same job title means a different role depending on who's hiring. Indian IT services firms (Wipro, Infosys, TCS) and Global Capability Centres — multinationals running their own in-house tech teams in India (Walmart Tech, JP Morgan, Google) — hire for the same titles but with meaningfully different skill profiles. The "Show GCC overlaps" toggle reveals the cross-connections between the two.</p>
        </div>
      )}

      {/* ── Right-side controls (top-right stack) ── */}
      <div className="s3-right-controls">
        {cvData && (
          <button
            className={`s3-nav-btn s3-cv-compare-btn${showCvCompare ? ' active' : ''}`}
            onClick={() => setShowCvCompare(v => !v)}
          >
            Compare my CV
          </button>
        )}
      </div>

      {/* ── CV Compare overlay ── */}
      {showCvCompare && cvData && (
        <CvCompare
          cvData={cvData}
          canonData={canonData}
          onClose={() => setShowCvCompare(false)}
        />
      )}

      {/* ── Compare pick-mode banner ── */}
      {comparePickMode && (
        <div className="s3-pick-banner">
          <span>Tap any role to compare</span>
          <button className="s3-pick-cancel" onClick={() => setComparePickMode(false)}>Cancel</button>
        </div>
      )}

      {/* ── Drawer (hidden when compare mode active) ── */}
      {drawerOpen && pinnedId && !compareId && !comparePickMode && (
        <Drawer
          nodeId={pinnedId}
          layoutData={layoutData}
          cvData={cvData}
          onClose={() => { setPinnedId(null); setSelectedEdge(null) }}
          onNavigate={(id) => { setPinnedId(id); setSelectedEdge(null) }}
          selectedEdge={selectedEdge}
          onSelectEdge={setSelectedEdge}
          onCompare={() => setComparePickMode(true)}
        />
      )}

      {/* ── Split Dossier (compare mode) ── */}
      {compareId && pinnedId && (
        <SplitDossier
          nodeIdA={pinnedId}
          nodeIdB={compareId}
          canonData={canonData}
          onClose={() => setCompareId(null)}
          onNavigate={(id) => { setCompareId(null); setPinnedId(id); setSelectedEdge(null) }}
        />
      )}

    </div>
  )
}
