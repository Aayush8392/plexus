import { useState, useRef, useCallback, useEffect } from 'react'
import { parseCV } from '../data/loader.js'
import '../styles/Screen2.css'

const API_URL = import.meta.env.VITE_API_URL ?? null

// ── SVG icons ──────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="drop-zone-icon" width="32" height="32" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="privacy-notice-icon" width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg className="parse-error-icon" width="28" height="28" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function GraphIcon() {
  return (
    <svg className="explore-path-icon" width="40" height="40" viewBox="0 0 60 60"
      fill="none" aria-hidden="true"
    >
      <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <circle cx="20" cy="18" r="3" fill="var(--text-accent)" opacity="0.7" />
      <circle cx="42" cy="20" r="3" fill="hsl(175,70%,52%)" opacity="0.7" />
      <circle cx="30" cy="32" r="3" fill="hsl(270,70%,68%)" opacity="0.7" />
      <circle cx="16" cy="44" r="3" fill="hsl(45,90%,60%)" opacity="0.7" />
      <circle cx="44" cy="44" r="3" fill="hsl(120,60%,52%)" opacity="0.7" />
      <line x1="20" y1="18" x2="30" y2="32" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1="42" y1="20" x2="30" y2="32" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1="30" y1="32" x2="16" y2="44" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1="30" y1="32" x2="44" y2="44" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <line x1="20" y1="18" x2="42" y2="20" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" />
    </svg>
  )
}

function JdIcon() {
  return (
    <svg className="explore-path-icon" width="40" height="40" viewBox="0 0 40 40"
      fill="none" aria-hidden="true"
    >
      <rect x="6" y="5" width="28" height="30" rx="3" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" fill="none"/>
      <line x1="11" y1="12" x2="29" y2="12" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="11" y1="17" x2="29" y2="17" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="11" y1="22" x2="22" y2="22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="28" cy="28" r="7" fill="rgba(88,166,255,0.12)" stroke="var(--text-accent)" strokeWidth="1.2"/>
      <line x1="28" y1="25" x2="28" y2="28" stroke="var(--text-accent)" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="28" cy="30.5" r="0.8" fill="var(--text-accent)"/>
    </svg>
  )
}

// ── JD Classify path ─────────────────────────────────────────────────────────
function JdPath({ nav }) {
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  const STRATUM_LABEL = { services: 'Services', gcc: 'GCC', mixed: 'Mixed' }
  const STRATUM_CLASS = { services: 'badge-services', gcc: 'badge-gcc', mixed: 'badge-mixed' }

  async function classify() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_URL}/jd/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      if (!data.top_roles?.length) throw new Error('No matching roles found — try a more detailed job description.')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // No API — show disabled state
  if (!API_URL) {
    return (
      <div className="jd-path-body jd-path-body--disabled">
        <JdIcon />
        <p className="explore-path-copy">
          Paste a job ad to decode its market stratum and closest role match.
        </p>
        <p className="jd-disabled-note">Requires the Plexus API server running locally.</p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="jd-result">
        <div className="jd-result-header">
          <span className="jd-result-label">Predicted market</span>
          <span className={`badge ${STRATUM_CLASS[result.predicted_stratum] ?? ''}`}>
            {STRATUM_LABEL[result.predicted_stratum] ?? result.predicted_stratum}
          </span>
        </div>
        <div className="jd-result-roles">
          {result.top_roles.slice(0, 3).map(r => (
            <button
              key={r.node_id}
              className="jd-result-role-btn"
              onClick={() => nav('3', { confirmedRole: r.node_id, cvData: null })}
            >
              <span className="jd-result-role-name">{r.label}</span>
              <span className="jd-result-role-cosine">{(r.cosine * 100).toFixed(0)}% match</span>
            </button>
          ))}
        </div>
        <button className="jd-retry-btn" onClick={() => { setResult(null); setText('') }}>
          ← Try another
        </button>
      </div>
    )
  }

  return (
    <div className="jd-path-body">
      <textarea
        className="jd-textarea"
        placeholder="Paste a job description here…"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
      />
      {error && <p className="jd-error">{error}</p>}
      <button
        className="explore-path-cta"
        onClick={classify}
        disabled={loading || !text.trim()}
      >
        {loading ? 'Classifying…' : 'Classify job ad'}
      </button>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export default function Screen2({ nav }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  const [dragOver, setDragOver]     = useState(false)
  const [parsing, setParsing]       = useState(false)
  const [parseFile, setParseFile]   = useState(null)
  const [error, setError]           = useState(null)
  const fileInputRef                = useRef(null)

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file) => {
    if (!file) return

    const ext = file.name.toLowerCase()
    const validType = ACCEPTED_TYPES.includes(file.type) ||
                      ext.endsWith('.pdf') ||
                      ext.endsWith('.docx')

    if (!validType) {
      setError('Upload a PDF or DOCX file.')
      return
    }

    setError(null)
    setParseFile(file)
    setParsing(true)

    try {
      const cvData = await parseCV(file)
      nav('2b', { cvData })
    } catch (err) {
      setParsing(false)
      setParseFile(null)
      setError(err.message || 'Could not parse this file. Try the explore path instead.')
    }
  }, [nav])

  // ── Drag events ──────────────────────────────────────────────────────────────

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = ()  => setDragOver(false)
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  const onFileChange = (e) => {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }

  const reset = () => {
    setParsing(false)
    setParseFile(null)
    setError(null)
  }

  // ── Upload zone content (3 states) ──────────────────────────────────────────

  const renderUploadZone = () => {
    if (parsing) {
      return (
        <div className="parsing-state">
          <div className="parsing-spinner" aria-label="Parsing CV" />
          <span className="parsing-filename">{parseFile?.name}</span>
          <span className="parsing-sub">Reading locally in your browser…</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="parse-error">
          <AlertIcon />
          <p className="parse-error-message">{error}</p>
          <button className="parse-error-retry" onClick={reset}>Try again</button>
        </div>
      )
    }

    return (
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload CV — click or drag and drop"
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <UploadIcon />
        <p className="drop-zone-text">
          <strong>Drag your CV here</strong><br />
          or click to browse
        </p>
        <span className="drop-zone-formats">PDF or DOCX</span>
        <button
          className="drop-zone-btn"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          tabIndex={-1}
          aria-hidden="true"
        >
          Select file
        </button>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="screen screen-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        className="visually-hidden"
        onChange={onFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="screen-2-container">
        <button className="screen-back-btn" onClick={() => nav('1')}>← Back</button>
        <div className="screen-2-header">
          <h1 className="screen-2-title">How would you like to start?</h1>
        </div>

        <div className="screen-2-paths screen-2-paths--three">
          {/* ── Upload CV path ── */}
          <div className="screen-2-path">
            <span className="path-label">Upload CV</span>
            {renderUploadZone()}
            <div className="privacy-notice">
              <LockIcon />
              <p className="privacy-notice-text">
                Parsed locally in your browser. Your data never leaves this device.
              </p>
            </div>
          </div>

          {/* ── Mobile divider ── */}
          <div className="path-or" aria-hidden="true">or</div>

          {/* ── Explore path ── */}
          <div className="screen-2-path">
            <span className="path-label">Explore freely</span>
            <div className="explore-path-body">
              <GraphIcon />
              <p className="explore-path-copy">
                Enter the market map directly and select a role manually.
              </p>
              <button
                className="explore-path-cta"
                onClick={() => nav('3', { cvData: null, confirmedRole: null })}
              >
                Start exploring
              </button>
            </div>
          </div>

          {/* ── Mobile divider ── */}
          <div className="path-or" aria-hidden="true">or</div>

          {/* ── JD classify path ── */}
          <div className="screen-2-path">
            <span className="path-label">Decode a job ad</span>
            <JdPath nav={nav} />
          </div>
        </div>
      </div>
    </div>
  )
}
