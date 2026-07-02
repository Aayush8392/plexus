// ─── Plexus · src/screens/Screen3.jsx ───────────────────────────────────────
// Screen 3 — Graph / Pathfinder
// Cold state: all 38 stratified nodes, no edges.
// Pinned state: node clicked → drawer opens, ego-network edges + self-twin edge shown.
// confirmedRole: resolved from _services → _gcc → cold fallback.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
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
import TutorialTour from '../components/TutorialTour.jsx'
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
const MIN_ZOOM     = 0.4   // matches <ReactFlow minZoom>; used to size the pan boundary
const DRAWER_WIDTH = 380   // matches Drawer.css — side panel width on desktop + landscape

// ── Role slug → CSS hue variable ─────────────────────────────────────────────
function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

function roleColorVar(nodeId) {
  return `var(--role-${roleSlug(nodeId)})`
}

// ── Prepare all 38 stratified nodes + separated edge sets ─────────────────────
// solidEdges  = within-stratum (163 edges)
// crossEdges  = cross-stratum cross-role (excludes self-twin pairs)
// twinEdges   = services↔gcc pairs for the same role (shown only on pin)
// canonNodes  = 22-node canonical list (services preferred) for overlay components
function prepareGraphData(layoutData) {
  const { nodes: ln, edges: le, metadata } = layoutData

  const solidEdges = le.filter(e => !e.is_cross_stratum)
  const crossEdges = le.filter(e => e.is_cross_stratum && roleSlug(e.source) !== roleSlug(e.target))

  const bySlug = {}
  ln.forEach(n => {
    const slug = roleSlug(n.id)
    if (!bySlug[slug]) bySlug[slug] = []
    bySlug[slug].push(n)
  })
  const twinEdges = []
  Object.values(bySlug).forEach(pair => {
    if (pair.length !== 2) return
    const svc = pair.find(n => n.stratum === 'services') ?? pair[0]
    const gcc = pair.find(n => n.stratum === 'gcc')      ?? pair[1]
    twinEdges.push({ source: svc.id, target: gcc.id, cosine: 0.5, is_cross_stratum: true, is_self_twin: true })
  })

  const canonBySlug = {}
  ln.forEach(n => {
    const slug = roleSlug(n.id)
    if (!canonBySlug[slug] || n.stratum === 'services') canonBySlug[slug] = n
  })

  return { nodes: ln, canonNodes: Object.values(canonBySlug), solidEdges, crossEdges, twinEdges, metadata }
}

// ── Force layout — runs once on all 38 nodes ──────────────────────────────────
// Seed from MDS coordinates (topology-derived, no geometric bias).
// Simulation refines overlap + cross-stratum bridging; MDS does the heavy lifting.
function runForceLayout({ nodes: ln, solidEdges, crossEdges }) {
  const allEdges = [...solidEdges, ...crossEdges]

  const degree = {}
  ln.forEach(n => degree[n.id] = 0)
  solidEdges.forEach(e => {
    degree[e.source] = (degree[e.source] || 0) + 1
    degree[e.target] = (degree[e.target] || 0) + 1
  })

  // MDS seed: topology-derived coordinates from plexus_overview_layout.json.
  // Tiny deterministic jitter breaks exact degeneracies without adding geometry.
  const hashId = str => {
    let h = 5381
    for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
    return h
  }

  const simNodes = ln.map(n => {
    const r = BUCKET_RADIUS[n.volume_bucket] ?? 18
    const jitter = ((hashId(n.id) % 100) / 1000) - 0.05
    return {
      id: n.id,
      x: (n.x * COORD_SCALE) + jitter,
      y: (n.y * COORD_SCALE) + jitter,
      r,
    }
  })

  const nodeById = Object.fromEntries(simNodes.map(n => [n.id, n]))

  const simEdges = allEdges
    .map(e => ({
      source:  nodeById[e.source],
      target:  nodeById[e.target],
      cosine:  e.cosine,
      isCross: !!e.is_cross_stratum,
    }))
    .filter(e => e.source && e.target)

  const sim = forceSimulation(simNodes)
    .force('link', forceLink(simEdges)
      .distance(d => d.isCross ? 350 : 240 - d.cosine * 120)
      .strength(d => d.isCross ? 0.04 : d.cosine * 0.8)
    )
    .force('charge', forceManyBody().strength(-600))
    .force('center', forceCenter(0, 0).strength(0.03))
    .force('x', forceX(0).strength(0.01))
    .force('y', forceY(0).strength(0.01))
    .force('collide', forceCollide().radius(d => d.r + 55).strength(0.6))
    .alphaDecay(0.005)
    .velocityDecay(0.2)
    .alphaMin(0.0001)
    .stop()

  sim.tick(1200)

  // Post-sim: place isolates near their strongest cross-stratum neighbor.
  // Force physics can't bound zero-solid-edge nodes reliably — manual placement
  // guarantees they sit close to the cluster without being inside it.
  const posMap = Object.fromEntries(simNodes.map(n => [n.id, n]))
  const isolateIds = new Set(simNodes.filter(n => degree[n.id] === 0).map(n => n.id))

  // Build a lookup: isolateId → best cross-stratum neighbor id (highest cosine)
  const isolateNeighbor = {}
  crossEdges.forEach(e => {
    const isSrcIsolate = isolateIds.has(e.source)
    const isTgtIsolate = isolateIds.has(e.target)
    if (!isSrcIsolate && !isTgtIsolate) return
    const isolateId  = isSrcIsolate ? e.source : e.target
    const neighborId = isSrcIsolate ? e.target  : e.source
    if (!isolateNeighbor[isolateId] || e.cosine > isolateNeighbor[isolateId].cosine) {
      isolateNeighbor[isolateId] = { neighborId, cosine: e.cosine }
    }
  })

  // Compute main cluster centroid (connected nodes only) for fallback placement
  const connectedNodes = simNodes.filter(n => !isolateIds.has(n.id))
  const cx = connectedNodes.reduce((s, n) => s + n.x, 0) / (connectedNodes.length || 1)
  const cy = connectedNodes.reduce((s, n) => s + n.y, 0) / (connectedNodes.length || 1)

  isolateIds.forEach(id => {
    const best = isolateNeighbor[id]
    let anchorX, anchorY
    if (best && posMap[best.neighborId]) {
      anchorX = posMap[best.neighborId].x
      anchorY = posMap[best.neighborId].y
    } else {
      // No edges at all — find nearest connected node by Euclidean distance
      const self = posMap[id]
      let minDist = Infinity, nearest = null
      connectedNodes.forEach(n => {
        const d = Math.hypot(n.x - self.x, n.y - self.y)
        if (d < minDist) { minDist = d; nearest = n }
      })
      anchorX = nearest ? nearest.x : cx
      anchorY = nearest ? nearest.y : cy
    }
    // Place outward from centroid so isolate never lands inside the cluster.
    // Small hash jitter (±25°) prevents all isolates stacking on the same ray.
    const baseAngle = Math.atan2(anchorY - cy, anchorX - cx)
    const jitter = ((hashId(id) % 1000) / 1000 - 0.5) * (Math.PI / 3.6)
    const angle = baseAngle + jitter
    posMap[id].x = anchorX + Math.cos(angle) * 260
    posMap[id].y = anchorY + Math.sin(angle) * 260
  })

  simNodes.forEach(n => {
    n.x *= 1.35
    n.y *= 0.84
  })

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
  graphData,
  layoutData,
  forcedPositions,
  confirmedRole,
  pinnedId,
  setPinnedId,
  hoveredId,
  setHoveredId,
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
    // Pad = full viewport size at the most-zoomed-out level (minZoom). This is what lets
    // panning carry the outermost node all the way to the opposite edge of the screen —
    // a small margin only keeps it barely in frame, it doesn't leave room to traverse
    // a full screen-width past the node's own position.
    const padX = window.innerWidth / MIN_ZOOM / 2.5
    const padY = window.innerHeight / MIN_ZOOM / 2.5
    const positions = Object.values(forcedPositions)
    const xs = positions.map(p => p.x)
    const ys = positions.map(p => p.y)
    return [
      [Math.min(...xs) - padX, Math.min(...ys) - padY],
      [Math.max(...xs) + padX, Math.max(...ys) + padY],
    ]
  }, [forcedPositions])
  const { fitView, setCenter, getZoom, getNode, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow()

  function panBy(dx, dy) {
    const { x, y, zoom } = getViewport()
    setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 150 })
  }
  const hoverTimer = useRef(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null)
  const userPannedRef = useRef(false)

  // Build nodes + edges with visual states from all 38 stratified nodes
  useEffect(() => {
    if (!graphData || !forcedPositions) return
    const { nodes: ln, solidEdges, crossEdges, twinEdges } = graphData
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

    const nodesWithPos = ln.map(n => ({
      ...n,
      x: forcedPositions[n.id]?.x ?? n.x * COORD_SCALE,
      y: forcedPositions[n.id]?.y ?? n.y * COORD_SCALE,
    }))

    // Skeleton: strongest within-stratum neighbour per node (cold-state hint)
    const bestForNode = {}
    solidEdges.forEach(e => {
      if (!bestForNode[e.source] || e.cosine > bestForNode[e.source].cosine) bestForNode[e.source] = e
      if (!bestForNode[e.target] || e.cosine > bestForNode[e.target].cosine) bestForNode[e.target] = e
    })
    const skeletonEdgeIds = new Set(
      Object.values(bestForNode).map(e => `${e.source}--${e.target}`)
    )

    // All solid + cross edges visible on hover/pin; cold state = skeleton only
    const regularEdges = [...solidEdges, ...crossEdges]

    // Self-twin edges — all visible as skeleton in cold state only; filtered on pin/hover
    const activeTwinEdges = pinnedId
      ? twinEdges.filter(e => e.source === pinnedId || e.target === pinnedId)
      : hoveredId
        ? twinEdges.filter(e => e.source === hoveredId || e.target === hoveredId)
        : twinEdges

    const buildRfEdge = (e) => {
      const slug = roleSlug(e.source)
      const srcColor = `var(--role-${roleSlug(e.source)})`
      const tgtColor = `var(--role-${roleSlug(e.target)})`
      const isTwin = !!e.is_self_twin

      const eid = `${e.source}--${e.target}`
      const isSkeletonEdge = skeletonEdgeIds.has(eid)
      let edgeState = (!pinnedId && !hoveredId)
        ? (isSkeletonEdge ? 'skeleton' : 'cold')
        : 'default'
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
      if (isTwin && (pinnedId || hoveredId)) edgeState = 'active'
      if (isTwin && !pinnedId && !hoveredId) edgeState = 'skeleton'

      const srcR = BUCKET_RADIUS[nodeMap[e.source]?.volume_bucket] ?? 18
      const tgtR = BUCKET_RADIUS[nodeMap[e.target]?.volume_bucket] ?? 18
      const sp = forcedPositions[e.source]
      const tp = forcedPositions[e.target]

      // Self-twin edges are very short — skip obstacle avoidance, use midpoint
      const cp = (() => {
        if (!sp || !tp) return {}
        if (isTwin) return { cpx: (sp.x + tp.x) / 2, cpy: (sp.y + tp.y) / 2 }
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
          isSelfTwin: isTwin,
          srcColor,
          tgtColor,
          edgeState,
          srcRadius: srcR,
          tgtRadius: tgtR,
          ...cp,
          isHovered: !!pinnedId && edgeState === 'active' && !isTwin &&
            (hoveredEdgeId === `${e.source}--${e.target}` || hoveredEdgeId === `${e.target}--${e.source}`),
        },
      }
    }

    setNodes(rfNodes)
    setEdges([...regularEdges.map(buildRfEdge), ...activeTwinEdges.map(buildRfEdge)])
  }, [graphData, forcedPositions, pinnedId, hoveredId, hoveredEdgeId, adjacentIds, onwardIds, selectedEdge, compareId])

  // Fit view on initial load
  useEffect(() => {
    if (layoutData) {
      const isMobile = window.innerWidth < 640
      setTimeout(() => fitView({ padding: isMobile ? 0.08 : 0.25, duration: 400 }), 100)
    }
  }, [layoutData])

  // Pan to pinned node — on mobile offset upward so node sits in the graph area above the sheet
  useEffect(() => {
    if (!pinnedId) return
    userPannedRef.current = false
    // Short delay only to let React re-render and register the newly pinned node with
    // react-flow (getNode would return undefined a tick too early). This does NOT need
    // to wait for the drawer's CSS width transition — the drawer's final width is a
    // known constant (DRAWER_WIDTH), so we compute the target directly instead of
    // measuring a container that may still be mid-animation.
    const t = setTimeout(() => {
      // If the user already panned/zoomed manually during the wait, don't fight them —
      // stomping their input with a delayed auto-center is what caused the "snap back".
      if (userPannedRef.current) return
      const node = getNode(pinnedId)
      if (!node) return
      const r = BUCKET_RADIUS[node.data.volumeBucket] ?? 14
      const isMobilePortrait = window.innerWidth <= 680
      // On mobile portrait the bottom sheet takes 45dvh — shift the target y up by ~25%
      // of screen so the pinned node lands above the sheet, not behind it.
      const yOffset = isMobilePortrait ? window.innerHeight * 0.225 : 0
      const zoom = Math.max(getZoom(), 1.0)
      const targetX = node.position.x + r
      const targetY = node.position.y + r + yOffset / zoom
      // Desktop + landscape mobile: drawer is a fixed-width side panel eating the right
      // DRAWER_WIDTH px. Mobile portrait: drawer is a bottom sheet, full width unaffected.
      const availableWidth = isMobilePortrait ? window.innerWidth : window.innerWidth - DRAWER_WIDTH
      setViewport({
        x: availableWidth / 2 - targetX * zoom,
        y: window.innerHeight / 2 - targetY * zoom,
        zoom,
      }, { duration: 600 })
    }, 50)
    return () => clearTimeout(t)
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
      onMoveStart={(event) => { if (event) userPannedRef.current = true }}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      minZoom={MIN_ZOOM}
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
  const [graphData, setGraphData]         = useState(null)   // 38-node data for canvas
  const [canonData, setCanonData]         = useState(null)   // 22-node data for overlays
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
  const [legendOpen, setLegendOpen]           = useState(false)
  const [tourGateOpen, setTourGateOpen]       = useState(false) // CV auto-pin waits for the tour's popup decision
  const [tourReplayToken, setTourReplayToken] = useState(0)
  const [cvBtnOffset, setCvBtnOffset]         = useState(null) // mobile: tracks the legend's real top edge

  // Compare-my-CV button — mobile only — sits just above the legend and
  // moves up when the legend expands, tracking its actual measured position.
  // Legend itself is untouched (plain CSS, no JS) — only CV is derived from
  // it, so there's no circularity. Tracks regardless of drawerOpen (cold
  // state included) so they stay stacked whether or not a node is pinned.
  useEffect(() => {
    function measure() {
      if (window.innerWidth > 680) { setCvBtnOffset(null); return }
      const el = document.getElementById('graph-legend-tour-target')
      if (!el) { setCvBtnOffset(null); return }
      const r = el.getBoundingClientRect()
      setCvBtnOffset(window.innerHeight - r.top + 8)
    }
    measure()
    // Re-measure after the browser's actual layout settles, not just once
    // synchronously on mount — the very first measurement (e.g. right as
    // the CV-path tour popup appears, before any pin/unpin cycle) can land
    // before layout is fully ready. Same double-rAF fix already used for
    // the tutorial's own spotlight cutout targeting.
    let raf1 = requestAnimationFrame(() => {
      raf1 = requestAnimationFrame(measure)
    })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf1)
      window.removeEventListener('resize', measure)
    }
  }, [legendOpen, drawerOpen, cvData])

  // Load layout data
  useEffect(() => {
    let cancelled = false
    getOverviewLayout()
      .then(data => {
        if (cancelled) return
        const prepared = prepareGraphData(data)
        setLayoutData(data)
        setGraphData(prepared)
        // Canonical 22-node shape for overlay components (CvCompare, SplitDossier)
        const canonIds = new Set(prepared.canonNodes.map(n => n.id))
        setCanonData({
          nodes: prepared.canonNodes,
          solidEdges: prepared.solidEdges.filter(e => canonIds.has(e.source) && canonIds.has(e.target)),
          crossEdges: [],
          metadata: prepared.metadata,
        })
        setForcedPositions(runForceLayout(prepared))
        setLoading(false)
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  // Resolve confirmedRole once layout is loaded — waits for the tour popup
  // decision (Start/Skip) so the CV-path auto-pin doesn't fire underneath it.
  useEffect(() => {
    if (!layoutData || !confirmedRole || !tourGateOpen) return
    const nodeMap = Object.fromEntries(layoutData.nodes.map(n => [n.id, n]))
    const resolved = resolveConfirmedRole(confirmedRole, nodeMap)
    if (resolved) {
      setPinnedId(resolved)
      setDrawerOpen(true)
    }
  }, [layoutData, confirmedRole, tourGateOpen])

  // Derive adjacency for visual rings — includes twin edges so self-twin lights up on pin
  const { adjacentIds, onwardIds } = useMemo(() => {
    if (!graphData || !pinnedId) return { adjacentIds: new Set(), onwardIds: new Set() }
    const allEdges = [...graphData.solidEdges, ...graphData.crossEdges, ...graphData.twinEdges]
    const doorSet = new Set()
    const onwardSet = new Set()
    for (const e of allEdges) {
      if (e.source === pinnedId) doorSet.add(e.target)
      if (e.target === pinnedId) doorSet.add(e.source)
    }
    for (const e of allEdges) {
      if (doorSet.has(e.source) && !doorSet.has(e.target) && e.target !== pinnedId) onwardSet.add(e.target)
      if (doorSet.has(e.target) && !doorSet.has(e.source) && e.source !== pinnedId) onwardSet.add(e.source)
    }
    return { adjacentIds: doorSet, onwardIds: onwardSet }
  }, [graphData, pinnedId])

  // Does the pinned node have a services<->gcc twin? (drives tour step skip)
  const pinnedHasTwin = useMemo(() => {
    if (!graphData || !pinnedId) return false
    return graphData.twinEdges.some(e => e.source === pinnedId || e.target === pinnedId)
  }, [graphData, pinnedId])

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
  const meta        = graphData?.metadata ?? {}
  const withinCount = graphData?.solidEdges.length ?? 0
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
    <div className={`screen screen-3${drawerOpen && !compareId ? ' drawer-open' : ''}${showCvCompare ? ' cv-compare-open' : ''}${compareId ? ' compare-open' : ''}${cvData ? ' has-cv-btn' : ''}`}>

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
            graphData={graphData}
            layoutData={layoutData}
            forcedPositions={forcedPositions}
            confirmedRole={confirmedRole}
            pinnedId={pinnedId}
            setPinnedId={setPinnedId}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
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
      <div
        id="graph-legend-tour-target"
        className={`graph-legend${legendOpen ? ' graph-legend--open' : ''}`}
      >
        <button
          className="graph-legend-trigger"
          onClick={() => setLegendOpen(v => !v)}
          aria-expanded={legendOpen}
        >
          Legend
        </button>
        {legendOpen && (
          <div className="graph-legend-panel">
            <div className="graph-legend-item">
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="5" fill="rgba(139,148,158,0.15)" stroke="#8b949e" strokeWidth="1.5"/>
              </svg>
              <span>Services</span>
            </div>
            <div className="graph-legend-item">
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="4" fill="rgba(139,148,158,0.15)" stroke="#8b949e" strokeWidth="1.5"/>
                <circle cx="7" cy="7" r="6.5" fill="none" stroke="#e8d5a3" strokeWidth="1.5"/>
              </svg>
              <span>GCC (gold ring)</span>
            </div>
            <div className="graph-legend-item">
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <line x1="1" y1="7" x2="13" y2="7" stroke="#8b949e" strokeWidth="1.5"/>
              </svg>
              <span>Within-stratum</span>
            </div>
            <div className="graph-legend-item">
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <line x1="1" y1="7" x2="13" y2="7" stroke="#8b949e" strokeWidth="1.5" strokeDasharray="3,2"/>
              </svg>
              <span>Cross-stratum / twin</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Nav buttons (top-left) ── */}
      <div className="s3-nav-btns">
        <button className="s3-nav-btn" onClick={() => nav('1')}>← Home</button>
        <button className="s3-nav-btn" onClick={() => nav(entryScreen ?? '2')}>← Back</button>
        <button
          id="s3-map-guide-btn"
          className={`s3-nav-btn s3-info-btn${showInfo ? ' active' : ''}`}
          onClick={() => setShowInfo(v => !v)}
          aria-label="About this map"
        >ⓘ Map guide</button>
      </div>


      {/* ── Info panel ── */}
      {showInfo && (
        <div className="s3-info-panel">
          <button className="s3-info-close" onClick={() => setShowInfo(false)} aria-label="Close">✕</button>

          <button
            className="s3-info-replay-tour"
            onClick={() => { setTourReplayToken(t => t + 1); setShowInfo(false) }}
          >
            Watch tutorial →
          </button>

          <h3 className="s3-info-heading">What is this?</h3>
          <p className="s3-info-body">A structural map of the Indian IT job market built from 130,757 real job postings. Each node is a role. Each edge is a measure of skill overlap between two roles — the stronger the overlap, the more reachable one role is from the other. Roles that share more skills tend to sit closer together, but the positions are approximate — trust the edges, not the distance. Roles at the edges of the map have few strong connections in this dataset; that's a structural finding, not a data gap.</p>

          <h3 className="s3-info-heading">Navigating the map</h3>
          <p className="s3-info-body">Hover a node to see its connections. Click to pin it and open a full breakdown — your doors, where they lead, and the skills that bridge the gap. With a node pinned, shift-click any other node to compare both roles side by side (desktop only).</p>

          <h3 className="s3-info-heading">How it works</h3>
          <p className="s3-info-body">Edges are weighted by cosine similarity — how much two roles share the same skills. 0 means nothing in common, 1 means identical skill profiles. This map shows edges at 0.20 and above. A score of 0.20–0.35 is a stretch move. 0.35–0.50 is a natural door. Above 0.50, the roles are nearly interchangeable.</p>
          <p className="s3-info-body">One of the map's core findings is that the same job title means a different role depending on who's hiring. Indian IT services firms (Wipro, Infosys, TCS) and Global Capability Centres — multinationals running their own in-house tech teams in India (Walmart Tech, JP Morgan, Google) — hire for the same titles but with meaningfully different skill profiles. Both employer-type nodes are on the map: plain circles are Services roles, gold-ringed circles are GCC roles. Pin either to explore its specific doors and skill profile.</p>
        </div>
      )}

      {/* ── Right-side controls (top-right stack) ── */}
      <div
        className="s3-right-controls"
        style={cvBtnOffset != null ? { bottom: cvBtnOffset } : undefined}
      >
        {cvData && (
          <button
            id="s3-cv-compare-btn"
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

      {/* ── Onboarding tour ── */}
      <TutorialTour
        pinnedId={pinnedId}
        hasTwin={pinnedHasTwin}
        hasCv={!!cvData}
        legendOpen={legendOpen}
        setLegendOpen={setLegendOpen}
        legendTargetId="graph-legend-tour-target"
        drawerOpen={drawerOpen}
        onGateOpen={() => setTourGateOpen(true)}
        replayToken={tourReplayToken}
      />

    </div>
  )
}
