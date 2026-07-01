// ─── Plexus · src/components/TutorialTour.jsx ───────────────────────────────
// Screen 3 onboarding tour. Centered popup → 8-step spotlight walkthrough.
// The popup and every step except "click a node" are a fully blocking dimmed
// overlay; "click a node" is click-through so the user can actually pin.
// `?tour=1` bypasses the localStorage seen-flag for testing.

import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'plexus_tour_seen'

const STEPS = [
  {
    key: 'click-node',
    title: 'Click any role to begin',
    body: 'Click any node on the map to pin it and open its full profile — any node works.',
  },
  {
    key: 'legend',
    title: 'Reading the lines',
    body: "Solid lines link roles with similar skills. Dashed lines link the same job title at two different kinds of employers — an outsourcing firm versus a company's own in-house team. A gold ring means the in-house version.",
  },
  {
    key: 'doors',
    title: 'Your doors',
    body: 'These are the roles this one can realistically move into, ranked by shared skills. The proximity tag — strong, moderate, or a stretch — shows how big a leap each move is.',
    targetId: 'drawer-section-doors',
  },
  {
    key: 'onward',
    title: 'Where this opens toward',
    body: "Two steps out — the roles that open up after taking one of your doors. Shown at equal weight; the data doesn't support ranking them.",
    targetId: 'drawer-section-onward',
  },
  {
    key: 'bridge',
    title: 'Bridge skills',
    body: 'Expand this to see exactly which skills separate you from each door role — the concrete gap to close.',
    targetId: 'drawer-section-bridge',
  },
  {
    key: 'dialects',
    title: 'Same title, different market',
    body: 'This role exists at both Services firms and GCCs — and asks for genuinely different skills depending on which one is hiring.',
    targetId: 'drawer-section-dialects',
  },
  {
    key: 'compare-roles',
    title: 'Compare two roles',
    body: 'Pin a second role to see both profiles side by side.',
    targetId: 'drawer-compare-btn',
  },
  {
    key: 'compare-cv',
    title: 'Compare your CV',
    body: 'See exactly which skills you already have for any role, and which ones you’d still need.',
    targetId: 's3-cv-compare-btn',
  },
]

const DIALECTS_STEP = 5
const CV_STEP        = 7

export default function TutorialTour({
  pinnedId,
  hasTwin,
  hasCv,
  legendOpen,
  setLegendOpen,
  legendTargetId,
  drawerOpen,
  onGateOpen,
  replayToken,
}) {
  const [phase, setPhase]         = useState(null) // null | 'popup' | 'stepping'
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect]           = useState(null)
  const [isMobilePortrait, setIsMobilePortrait] = useState(window.innerWidth <= 680)
  const prevLegendOpen = useRef(false)
  const gateOpenedRef  = useRef(false)

  const openGate = useCallback(() => {
    if (gateOpenedRef.current) return
    gateOpenedRef.current = true
    onGateOpen?.()
  }, [onGateOpen])

  // Decide once, on mount, whether to show the popup. If it won't show (real
  // seen-flag path), open the gate immediately so the CV-path auto-pin isn't
  // stuck waiting forever. Both branches live in one effect — splitting this
  // into two effects races, since both would read the same initial `null`
  // phase in the same render pass and openGate() would fire before the user
  // ever sees the popup.
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('tour') === '1'
    const seen = localStorage.getItem(STORAGE_KEY)
    const shouldShow = forced || !seen
    if (shouldShow) setPhase('popup')
    else openGate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onResize() { setIsMobilePortrait(window.innerWidth <= 680) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // "Watch tutorial →" in the Map guide panel — re-show the popup, not the
  // steps directly. replayToken starts at 0 so this never fires on mount.
  useEffect(() => {
    if (replayToken > 0) setPhase('popup')
  }, [replayToken])

  const exitTour = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setPhase(null)
    setLegendOpen(prevLegendOpen.current)
    openGate()
    // The tour scrolls the drawer through several sections — leave it as
    // found (top) rather than wherever the last step left it.
    document.querySelector('.drawer-content')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [setLegendOpen, openGate])

  function startTour() {
    // Use hasCv, not pinnedId — the CV-path pin only fires once openGate() runs
    // (below, same tick), so pinnedId is still null here even on the CV path.
    setStepIndex(hasCv ? 1 : 0)
    setPhase('stepping')
    openGate()
  }

  // Step 1 (click a node) advances automatically once a real pin lands
  useEffect(() => {
    if (phase === 'stepping' && stepIndex === 0 && pinnedId) setStepIndex(1)
  }, [phase, stepIndex, pinnedId])

  // Force the legend open for the legend step, restore prior state on leaving it
  useEffect(() => {
    if (phase !== 'stepping') return
    if (stepIndex === 1) {
      prevLegendOpen.current = legendOpen
      setLegendOpen(true)
    } else if (stepIndex === 2) {
      setLegendOpen(prevLegendOpen.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIndex])

  // Skip "same title, different market" if the pinned role has no GCC twin
  useEffect(() => {
    if (phase === 'stepping' && stepIndex === DIALECTS_STEP && !hasTwin) {
      setStepIndex(DIALECTS_STEP + 1)
    }
  }, [phase, stepIndex, hasTwin])

  // Skip "compare your CV" on the cold-graph route (no CV data)
  useEffect(() => {
    if (phase === 'stepping' && stepIndex === CV_STEP && !hasCv) {
      exitTour()
    }
  }, [phase, stepIndex, hasCv, exitTour])

  function advance() {
    if (stepIndex >= STEPS.length - 1) { exitTour(); return }
    setStepIndex(i => i + 1)
  }

  // Step 1 ("click a node") is never a valid Prev target — it auto-advances
  // the instant a real pin exists, which on either path is already true by
  // the time Prev could be pressed, so landing there would immediately snap
  // back forward. Floor Prev at step 2 (index 1) instead.
  function goBack() {
    if (stepIndex <= 1) return
    let target = stepIndex - 1
    if (target === DIALECTS_STEP && !hasTwin) target -= 1
    setStepIndex(Math.max(target, 1))
  }

  // Measure + scroll to the current step's target. Instant scroll + double
  // rAF (not a fixed timeout) so we never measure mid-animation — that
  // mismatch was what caused the cutout to land in the wrong place.
  useEffect(() => {
    if (phase !== 'stepping') { setRect(null); return }
    const step = STEPS[stepIndex]
    const id = stepIndex === 1 ? legendTargetId : step.targetId
    if (!id) { setRect(null); return }

    let cancelled = false
    const PAD = 8
    function measure() {
      if (cancelled) return
      const el = document.getElementById(id)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      let top = r.top - PAD, left = r.left - PAD
      let right = r.right + PAD, bottom = r.bottom + PAD

      // .drawer clips its own content (overflow: hidden) — clamp the highlight
      // to the drawer's real bounds so the padded box never bleeds past the
      // drawer's edge into the graph area for sections that sit close to it.
      const drawerEl = el.closest('.drawer')
      if (drawerEl) {
        const d = drawerEl.getBoundingClientRect()
        top = Math.max(top, d.top)
        left = Math.max(left, d.left)
        right = Math.min(right, d.right)
        bottom = Math.min(bottom, d.bottom)
      }

      setRect({ top, left, width: right - left, height: bottom - top })
    }

    const el = document.getElementById(id)
    if (!el) { setRect(null); return }
    // Instant scroll, not smooth — smooth scrolling's variable/unreliable
    // 'scrollend' timing raced the measurement and brought back the cutout
    // mismeasurement bug. Not worth the polish; correctness wins.
    el.scrollIntoView({ behavior: 'auto', block: 'center' })
    let raf1 = requestAnimationFrame(() => {
      raf1 = requestAnimationFrame(measure)
    })
    window.addEventListener('resize', measure)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      window.removeEventListener('resize', measure)
    }
    // drawerOpen is a dependency because the legend's position shifts (right
    // on desktop, floats above the sheet on mobile) one render cycle after
    // the pin lands — measuring only on stepIndex change could catch the
    // legend in its pre-shift position. legendOpen is a dependency for the
    // same reason: forcing it open round-trips through the parent, so the
    // very first measurement can land before the panel actually expands.
  }, [phase, stepIndex, legendTargetId, drawerOpen, legendOpen])

  // Esc = skip, while a step or the popup is showing
  useEffect(() => {
    if (!phase) return
    function onKey(e) { if (e.key === 'Escape') exitTour() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, exitTour])

  if (!phase) return null

  if (phase === 'popup') {
    return (
      <>
        <div className="tour-blocker tour-blocker--dim" />
        <div className="tour-popup">
          <div className="tour-popup-title">Want a quick tour?</div>
          <p className="tour-popup-body">
            A 60-second walkthrough of doors, onward roles, and the services↔GCC divide.
          </p>
          <div className="tour-popup-actions">
            <button className="tour-skip" onClick={exitTour}>Skip</button>
            <button className="tour-next" onClick={startTour}>Start</button>
          </div>
        </div>
      </>
    )
  }

  const step = STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep  = stepIndex === STEPS.length - 1

  // Step 1 — click-through, no cutout, compact bar so it doesn't sit over the graph
  if (isFirstStep) {
    return (
      <>
        <div className="tour-blocker tour-blocker--clickthrough" />
        <div className="tour-callout tour-callout--compact">
          <span className="tour-callout-compact-text">
            <strong>{step.title}</strong> — {step.body}
          </span>
          <button className="tour-skip" onClick={exitTour}>Skip</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={`tour-blocker${rect ? '' : ' tour-blocker--dim'}`} />
      {rect && (
        <div
          className="tour-cutout"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div className={`tour-callout tour-callout--docked${isMobilePortrait ? ' tour-callout--docked-mobile' : ' tour-callout--docked-desktop'}`}>
        <div className="tour-callout-step">{stepIndex + 1} / {STEPS.length}</div>
        <div className="tour-callout-title">{step.title}</div>
        <p className="tour-callout-body">{step.body}</p>
        <div className="tour-callout-actions">
          <button className="tour-skip" onClick={exitTour}>Skip</button>
          <div className="tour-callout-nav-buttons">
            {stepIndex >= 2 && <button className="tour-prev" onClick={goBack}>Prev</button>}
            <button className="tour-next" onClick={advance}>{isLastStep ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </>
  )
}
