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

// ── Force layout — runs once on layoutData, returns settled node positions ────
function runForceLayout(layoutData) {
  const { nodes: ln, edges: le } = layoutData

  // Compute centroid of all seed positions so everything starts around (0,0)
  const rawPositions = ln.map(n => ({
    x: n.x * COORD_SCALE + (n.stratum === 'gcc' ? GCC_OFFSET_X : 0),
    y: n.y * COORD_SCALE + (n.stratum === 'gcc' ? GCC_OFFSET_Y : 0),
  }))
  const cx = rawPositions.reduce((s, p) => s + p.x, 0) / rawPositions.length
  const cy = rawPositions.reduce((s, p) => s + p.y, 0) / rawPositions.length

  const simNodes = ln.map((n, i) => {
    const x = rawPositions[i].x - cx
    const y = rawPositions[i].y - cy
    return {
      id: n.id,
      x,
      y,
      r: BUCKET_RADIUS[n.volume_bucket] ?? 18,
      // Pin isolated nodes near their centred MDS position — no edges means
      // charge would otherwise blow them to infinity
      ...(n.low_connectivity ? { fx: x, fy: y } : {}),
    }
  })

  // Build id→node map so forceLink gets direct object refs — string lookup
  // can fail silently in d3-force, leaving cross-stratum edges unresolved.
  const nodeById = Object.fromEntries(simNodes.map(n => [n.id, n]))

  const simEdges = le
    .map(e => ({
      source:  nodeById[e.source],
      target:  nodeById[e.target],
      cosine:  e.cosine,
      isCross: e.is_cross_stratum,
    }))
    .filter(e => e.source && e.target)  // drop any unresolved refs

  forceSimulation(simNodes)
    .force('link', forceLink(simEdges)
      .distance(d => d.isCross ? 160 : 260 - d.cosine * 150)
      .strength(d => d.isCross ? 0.25 : d.cosine * 0.45)
    )
    .force('charge', forceManyBody().strength(-380))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide().radius(d => d.r + 55).strength(0.9))
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

  // Build nodes with visual states
  useEffect(() => {
    if (!layoutData || !forcedPositions) return
    const { nodes: ln, edges: le } = layoutData
    const nodeMap = Object.fromEntries(ln.map(n => [n.id, n]))

    const rfNodes = ln.map(n => {
      const r = BUCKET_RADIUS[n.volume_bucket] ?? 10
      const slug = roleSlug(n.id)
      const color = `var(--role-${slug})`

      let visualState = 'default'
      if (pinnedId && selectedEdge) {
        if (n.id === selectedEdge.sourceId) visualState = 'pinned'
        else if (n.id === selectedEdge.targetId) visualState = 'door'
        else visualState = 'faded'
      } else if (pinnedId) {
        if (n.id === pinnedId) visualState = 'pinned'
        else if (adjacentIds.has(n.id)) {
          visualState = onwardIds.has(n.id) ? 'onward' : 'door'
        }
        else visualState = 'faded'
      } else if (hoveredId) {
        if (n.id === hoveredId) visualState = 'hovered'
        else visualState = 'dimmed'
      }

      const isGcc = n.stratum === 'gcc'
      return {
        id: n.id,
        type: 'plexusNode',
        position: forcedPositions?.[n.id] ?? {
          x: n.x * COORD_SCALE + (isGcc ? GCC_OFFSET_X : 0),
          y: n.y * COORD_SCALE + (isGcc ? GCC_OFFSET_Y : 0),
        },
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
          isPinned: n.id === pinnedId,
        },
      }
    })

    // Build node list with settled positions for obstacle avoidance
    const nodesWithPos = ln.map(n => ({
      ...n,
      x: forcedPositions?.[n.id]?.x ?? n.x * COORD_SCALE,
      y: forcedPositions?.[n.id]?.y ?? n.y * COORD_SCALE,
    }))

    const rfEdges = le
      .filter(e => showCrossStratum ? true : !e.is_cross_stratum)
      .map(e => {
        const srcColor = `var(--role-${roleSlug(e.source)})`
        const tgtColor = `var(--role-${roleSlug(e.target)})`

        let edgeState = (!pinnedId && !hoveredId) ? 'faded' : 'default'
        if (selectedEdge) {
          const isSelected =
            (e.source === selectedEdge.sourceId && e.target === selectedEdge.targetId) ||
            (e.source === selectedEdge.targetId && e.target === selectedEdge.sourceId)
          edgeState = isSelected ? 'active' : 'faded'
        } else if (pinnedId) {
          const touchesPinned = e.source === pinnedId || e.target === pinnedId
          edgeState = touchesPinned ? 'active' : 'faded'
        } else if (hoveredId) {
          const touchesHovered = e.source === hoveredId || e.target === hoveredId
          edgeState = touchesHovered ? 'active' : 'faded'
        }

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
            srcRadius: BUCKET_RADIUS[nodeMap[e.source]?.volume_bucket] ?? 18,
            tgtRadius: BUCKET_RADIUS[nodeMap[e.target]?.volume_bucket] ?? 18,
            ...(() => {
              const sp = forcedPositions?.[e.source]
              const tp = forcedPositions?.[e.target]
              if (!sp || !tp) return {}
              const srcR = BUCKET_RADIUS[nodeMap[e.source]?.volume_bucket] ?? 18
              const tgtR = BUCKET_RADIUS[nodeMap[e.target]?.volume_bucket] ?? 18
              const ddx = tp.x - sp.x, ddy = tp.y - sp.y
              const ll = Math.sqrt(ddx*ddx + ddy*ddy) || 1
              const uux = ddx/ll, uuy = ddy/ll
              return computeControlPoint(
                sp.x + uux * srcR, sp.y + uuy * srcR,
                tp.x - uux * tgtR, tp.y - uuy * tgtR,
                nodesWithPos, e.source, e.target
              )
            })(),
            isHovered: hoveredEdgeId === `${e.source}--${e.target}` || hoveredEdgeId === `${e.target}--${e.source}`,
          },
        }
      })

    setNodes(rfNodes)
    setEdges(rfEdges)
  }, [layoutData, forcedPositions, pinnedId, hoveredId, hoveredEdgeId, showCrossStratum, adjacentIds, onwardIds, selectedEdge])

  // Fit view on initial load
  useEffect(() => {
    if (layoutData) {
      setTimeout(() => fitView({ padding: 0.12, duration: 400 }), 100)
    }
  }, [layoutData])

  // Pan to pinned node
  useEffect(() => {
    if (!pinnedId) return
    setTimeout(() => {
      const node = getNode(pinnedId)
      if (!node) return
      const r = BUCKET_RADIUS[node.data.volumeBucket] ?? 14
      setCenter(node.position.x + r, node.position.y + r, {
        zoom: Math.max(getZoom(), 1.0),
        duration: 600,
      })
    }, 120)
  }, [pinnedId])

  const onNodeClick = useCallback((_, node) => {
    if (node.id === pinnedId) {
      setPinnedId(null)
    } else {
      setPinnedId(node.id)
      onSelectEdge(null)
    }
  }, [pinnedId, setPinnedId, onSelectEdge])

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
    setPinnedId(null)
    onSelectEdge(null)
  }, [setPinnedId, onSelectEdge])

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
      fitViewOptions={{ padding: 0.12 }}
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
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [pinnedId, setPinnedId]           = useState(null)
  const [hoveredId, setHoveredId]         = useState(null)
  const [showCrossStratum, setShowCrossStratum] = useState(false)
  const [ghostDismissed, setGhostDismissed]     = useState(false)
  const [drawerOpen, setDrawerOpen]       = useState(false)
  const [selectedEdge, setSelectedEdge]   = useState(null)
  const [forcedPositions, setForcedPositions] = useState(null)

  // Load layout data
  useEffect(() => {
    let cancelled = false
    getOverviewLayout()
      .then(data => {
        if (cancelled) return
        setLayoutData(data)
        setForcedPositions(runForceLayout(data))
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
      setGhostDismissed(true)
    }
    // If neither _services nor _gcc exists → cold state, no pin
  }, [layoutData, confirmedRole])

  // Derive adjacency for visual rings when a node is pinned
  const { adjacentIds, onwardIds } = useMemo(() => {
    if (!layoutData || !pinnedId) return { adjacentIds: new Set(), onwardIds: new Set() }
    // Door nodes = direct within-stratum neighbours
    const doorSet = new Set()
    const onwardSet = new Set()
    for (const e of layoutData.edges) {
      if (e.is_cross_stratum) continue
      if (e.source === pinnedId) doorSet.add(e.target)
      if (e.target === pinnedId) doorSet.add(e.source)
    }
    // Onward = 2-hop nodes reachable through doors (not direct neighbours, not pinned)
    for (const e of layoutData.edges) {
      if (e.is_cross_stratum) continue
      if (doorSet.has(e.source) && !doorSet.has(e.target) && e.target !== pinnedId) {
        onwardSet.add(e.target)
      }
      if (doorSet.has(e.target) && !doorSet.has(e.source) && e.source !== pinnedId) {
        onwardSet.add(e.source)
      }
    }
    return { adjacentIds: doorSet, onwardIds: onwardSet }
  }, [layoutData, pinnedId])

  // Open/close drawer with pin
  useEffect(() => {
    if (pinnedId) {
      setDrawerOpen(true)
      setGhostDismissed(true)
    } else {
      setDrawerOpen(false)
    }
  }, [pinnedId])

  // Metadata for annotation bar
  const meta = layoutData?.metadata ?? {}
  const withinCount = meta.within_stratum_edges ?? 88
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
    <div className={`screen screen-3${drawerOpen ? ' drawer-open' : ''}`}>

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

        {/* Canvas legend — top-centre, explains Services vs GCC */}
        <div className="graph-legend">
          <div className="graph-legend-item">
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5" fill="rgba(139,148,158,0.15)" stroke="#8b949e" strokeWidth="1.5"/>
            </svg>
            <span>Role (Services)</span>
          </div>
          <div className="graph-legend-item">
            <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5" fill="rgba(139,148,158,0.15)" stroke="#8b949e" strokeWidth="1.5"/>
              <circle cx="7" cy="7" r="6.5" fill="none" stroke="#e8d5a3" strokeWidth="1.5"/>
            </svg>
            <span>Role (GCC)</span>
          </div>
        </div>

        <ReactFlowProvider>
          <GraphCanvas
            layoutData={layoutData}
            forcedPositions={forcedPositions}
            confirmedRole={confirmedRole}
            pinnedId={pinnedId}
            setPinnedId={setPinnedId}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
            showCrossStratum={showCrossStratum}
            adjacentIds={adjacentIds}
            onwardIds={onwardIds}
            selectedEdge={selectedEdge}
            onSelectEdge={setSelectedEdge}
          />
          <MapControls />
        </ReactFlowProvider>
      </div>

      {/* ── Nav buttons (top-left) ── */}
      <div className="s3-nav-btns">
        <button className="s3-nav-btn" onClick={() => nav('0')}>← Home</button>
        <button className="s3-nav-btn" onClick={() => nav(entryScreen ?? '2')}>← Back</button>
      </div>

      {/* ── Ghost prompt (cold state, first visit) ── */}
      {!ghostDismissed && !pinnedId && (
        <div
          className="s3-ghost-prompt"
          onClick={() => setGhostDismissed(true)}
          aria-label="Dismiss hint"
        >
          Click any role to explore its doors
        </div>
      )}

      {/* ── Annotation bar ── */}
      <div className="s3-annotation">
        <span>
          edges shown: cosine ≥ {threshold.toFixed(2)} · {withinCount} within-stratum
          {showCrossStratum && ` + cross-stratum`}
        </span>
        <span className="s3-annotation-sep">·</span>
        <span>layout is approximate · edges carry exact similarities · clustering finds no stable partition</span>
      </div>

      {/* ── Cross-stratum toggle ── */}
      <button
        className={`s3-cross-toggle${showCrossStratum ? ' active' : ''}`}
        onClick={() => setShowCrossStratum(v => !v)}
        aria-pressed={showCrossStratum}
      >
        {showCrossStratum ? 'Hide GCC overlaps' : 'Show GCC overlaps'}
      </button>

      {/* ── Drawer ── */}
      {drawerOpen && pinnedId && (
        <Drawer
          nodeId={pinnedId}
          layoutData={layoutData}
          onClose={() => { setPinnedId(null); setSelectedEdge(null) }}
          onNavigate={(id) => { setPinnedId(id); setSelectedEdge(null) }}
          selectedEdge={selectedEdge}
          onSelectEdge={setSelectedEdge}
        />
      )}

    </div>
  )
}
