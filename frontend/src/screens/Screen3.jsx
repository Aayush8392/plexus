// ─── Plexus · src/screens/Screen3.jsx ───────────────────────────────────────
// Screen 3 — Graph / Pathfinder
// Cold state: full 32-node MDS map, all 88 within-stratum edges.
// Pinned state: node clicked → drawer opens, visual rings applied.
// confirmedRole: resolved from _services → _gcc → cold fallback.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
const BUCKET_RADIUS = { v1: 10, v2: 14, v3: 18, v4: 22 }

// ── Coordinate spread ─────────────────────────────────────────────────────────
const COORD_SCALE  = 2.8   // MDS coords are tight — scale up for legibility
const GCC_OFFSET_X = 20    // nudge GCC twins right so labels don't collide
const GCC_OFFSET_Y = -15   // nudge GCC twins up

// ── Role slug → CSS hue variable ─────────────────────────────────────────────
function roleSlug(nodeId) {
  return nodeId.replace(/_services$/, '').replace(/_gcc$/, '')
}

function roleColorVar(nodeId) {
  return `var(--role-${roleSlug(nodeId)})`
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
  const { fitView, setCenter, getZoom, getNode } = useReactFlow()
  const hoverTimer = useRef(null)

  // Build nodes with visual states
  useEffect(() => {
    if (!layoutData) return
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
        position: {
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

    const rfEdges = le
      .filter(e => showCrossStratum ? true : !e.is_cross_stratum)
      .map(e => {
        const srcColor = `var(--role-${roleSlug(e.source)})`
        const tgtColor = `var(--role-${roleSlug(e.target)})`

        let edgeState = 'default'
        if (selectedEdge) {
          const isSelected =
            (e.source === selectedEdge.sourceId && e.target === selectedEdge.targetId) ||
            (e.source === selectedEdge.targetId && e.target === selectedEdge.sourceId)
          edgeState = isSelected ? 'active' : 'faded'
        } else if (pinnedId) {
          const touchesPinned = e.source === pinnedId || e.target === pinnedId
          const bothAdjacent = adjacentIds.has(e.source) && adjacentIds.has(e.target)
          if (touchesPinned) edgeState = 'active'
          else if (bothAdjacent) edgeState = 'secondary'
          else edgeState = 'faded'
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
          },
        }
      })

    setNodes(rfNodes)
    setEdges(rfEdges)
  }, [layoutData, pinnedId, hoveredId, showCrossStratum, adjacentIds, onwardIds, selectedEdge])

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
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onPaneClick={onPaneClick}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      minZoom={0.3}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      attributionPosition="bottom-left"
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(255,255,255,0.03)" gap={40} size={1} />
    </ReactFlow>
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

  // Load layout data
  useEffect(() => {
    let cancelled = false
    getOverviewLayout()
      .then(data => {
        if (cancelled) return
        setLayoutData(data)
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
        <ReactFlowProvider>
          <GraphCanvas
            layoutData={layoutData}
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
