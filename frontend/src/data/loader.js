// ─── Plexus · src/data/loader.js ────────────────────────────────────────────
// Single data seam. All screen data reads go through here.
// v1: fetches static JSON from /data/
// v2: swap BASE_URL to FastAPI endpoint — nothing in screens changes.

import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'

// ── pdfjs worker (pinned to installed version 4.4.168) ───────────────────────
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── Base URL ─────────────────────────────────────────────────────────────────
// Static JSON always served from /data (Vite public folder in dev, CDN in prod).
// Set VITE_API_URL (e.g. http://localhost:8000) to route CV snap through FastAPI.
const BASE_URL = '/data'
const API_URL = import.meta.env.VITE_API_URL ?? null

// ── In-memory cache ──────────────────────────────────────────────────────────
const _cache = {}

async function _fetch(path) {
  if (_cache[path]) return _cache[path]
  const res = await fetch(`${BASE_URL}/${path}`)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  const data = await res.json()
  _cache[path] = data
  return data
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. DATA FETCHES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the full overview layout object:
 *   { nodes: [...], edges: [...], metadata: {...} }
 * Nodes carry x/y, degree, volume_bucket, stratum, twin linkage — everything
 * react-flow needs. Edges carry cosine + is_cross_stratum.
 * Cached after first call.
 */
export async function getOverviewLayout() {
  return _fetch('plexus_overview_layout.json')
}

/**
 * Returns the pathfinder entry for a single node.
 * Full pathfinder JSON is fetched once and cached; subsequent calls
 * are pure in-memory lookups.
 *
 * @param {string} nodeId  e.g. "backend_java_developer_services"
 * @returns {object}  { node_id, label, stratum, posting_count, top_skills,
 *                      low_connectivity, is_hub, self_twin_id,
 *                      has_cross_stratum, doors_top5, doors_full,
 *                      cross_stratum_doors, onward_region }
 */
export async function getPathfinder(nodeId) {
  const all = await _fetch('plexus_pathfinder.json')
  const entry = all[nodeId]
  if (!entry) throw new Error(`No pathfinder entry for node: ${nodeId}`)
  return entry
}

/**
 * Returns drawer data (companies + seniority) for a single node.
 * Full drawer JSON is fetched once and cached; subsequent calls
 * are pure in-memory lookups.
 *
 * @param {string} nodeId  e.g. "backend_java_developer_services"
 * @returns {object}  { top_companies: { services: [...], gcc: [...] },
 *                      seniority_spread: [{ bracket, count }, ...] }
 *                    Returns null (not a throw) if nodeId not found —
 *                    drawer sections 2+3 should gracefully hide when null.
 */
export async function getDrawerData(nodeId) {
  const all = await _fetch('plexus_drawer_data.json')
  return all[nodeId] ?? null
}

/**
 * Returns seniority-stratified skill profiles for all canonical roles.
 * Keyed by role_slug (e.g. "backend_java_developer").
 * Each entry: { all, junior, mid, senior, staff } where each bucket has
 * { top_skills: string[], count: number }.
 * Cached after first call.
 */
export async function getSeniorityProfiles() {
  return _fetch('plexus_seniority_profiles.json')
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. CV PARSER  (runs entirely in-browser — file never leaves the device)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Transition-language patterns (fires secondaryRole) ───────────────────────
const TRANSITION_PATTERNS = [
  /\b(transition(?:ing)?|pivot(?:ing)?|move\s+into|moving\s+into|shift(?:ing)?\s+(?:to|toward))\b/i,
  /\b(looking\s+to\s+(?:move|switch|break\s+into)|aspir(?:e|ing)\s+to)\b/i,
  /\b(career\s+change|new\s+direction|expanding\s+(?:my\s+)?(?:skills?|expertise))\b/i,
]

// ── Seniority / noise stopwords — stripped before skill matching ──────────────
const SKILL_STOPWORDS = new Set([
  'experience', 'years', 'year', 'strong', 'good', 'excellent', 'proficient',
  'knowledge', 'understanding', 'familiar', 'exposure', 'hands', 'on', 'with',
  'ability', 'skills', 'skill', 'work', 'working', 'develop', 'developing',
  'senior', 'junior', 'lead', 'manager', 'architect', 'engineer', 'developer',
  'analyst', 'consultant', 'specialist', 'professional', 'expert', 'team',
  'project', 'management', 'agile', 'scrum', 'communication', 'leadership',
  'problem', 'solving', 'analytical', 'detail', 'oriented', 'fast', 'learner',
  'motivated', 'self', 'starter', 'result', 'driven', 'collaborative',
  'responsible', 'role', 'position', 'opportunity', 'company', 'organization',
])

// ── Month names for date detection ───────────────────────────────────────────
const MONTH_NAMES =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|' +
  'jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

// Matches: "Jan 2022", "January 2022", "2022", "01/2022", "2022-01"
const DATE_RE = new RegExp(
  `(?:(?:${MONTH_NAMES})[\\s,.-]*)?(?:19|20)\\d{2}`,
  'gi'
)

// Matches a year on its own: 2010–2025
const YEAR_RE = /\b((?:19|20)\d{2})\b/g


// ── 2a. Raw text extraction ───────────────────────────────────────────────────

async function _extractTextFromPDF(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => item.str).join(' '))
  }
  return pages.join('\n')
}

async function _extractTextFromDOCX(file) {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

async function _extractRawText(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf'))  return _extractTextFromPDF(file)
  if (name.endsWith('.docx')) return _extractTextFromDOCX(file)
  throw new Error(`Unsupported file type: ${file.name}. Upload a PDF or DOCX.`)
}


// ── 2b. Section splitter ─────────────────────────────────────────────────────
// Splits raw CV text into named sections so we can:
//   - detect transition language in the objective/summary section only
//   - pair skills with job date ranges for recency weighting

const SECTION_HEADERS = {
  objective:   /\b(objective|summary|profile|about\s+me|career\s+goal)\b/i,
  experience:  /\b(experience|employment|work\s+history|professional\s+background)\b/i,
  skills:      /\b(skills?|technical\s+skills?|core\s+competenc|technologies|tools)\b/i,
  education:   /\b(education|academic|qualification|degree|university|college)\b/i,
  projects:    /\b(projects?|portfolio|achievements?|accomplishments?)\b/i,
  certifications: /\b(certifications?|licenses?|courses?|training)\b/i,
}

function _splitIntoSections(text) {
  const lines = text.split(/\n+/)
  const sections = { objective: '', experience: '', skills: '', other: '' }
  let current = 'other'

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let matched = false
    for (const [section, re] of Object.entries(SECTION_HEADERS)) {
      // A header line is short (≤60 chars) and matches the section pattern
      if (trimmed.length <= 60 && re.test(trimmed)) {
        current = section in sections ? section : 'other'
        matched = true
        break
      }
    }
    if (!matched) {
      sections[current] = (sections[current] || '') + ' ' + trimmed
    }
  }

  return sections
}


// ── 2c. Date-range extraction from experience section ────────────────────────
// Returns array of { start: year, end: year, text: string }
// where text is the chunk of text associated with that job entry.

function _extractJobBlocks(experienceText) {
  if (!experienceText.trim()) return []

  // Split on lines that contain a year — heuristic for job-entry boundaries
  const lines = experienceText.split(/(?<=\n)|(?=\b(?:19|20)\d{2}\b)/)
  const blocks = []
  let current = { years: [], lines: [] }

  for (const line of lines) {
    const years = [...line.matchAll(YEAR_RE)].map(m => parseInt(m[1], 10))
    if (years.length) {
      // If we already have content, push the previous block
      if (current.lines.length > 2) {
        blocks.push({ ...current })
      }
      current = { years, lines: [line] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.length > 2) blocks.push(current)

  return blocks.map(b => ({
    start: Math.min(...b.years),
    end:   Math.max(...b.years),
    text:  b.lines.join(' '),
  }))
}


// ── 2d. Skill tokeniser ───────────────────────────────────────────────────────
// Produces a flat Set of canonical-ish skill tokens from a text chunk.
// Matches known multi-word skills first, then single meaningful tokens.

// Known multi-word tech phrases to preserve as single tokens
const MULTIWORD_SKILLS = [
  'machine learning', 'deep learning', 'natural language processing',
  'computer vision', 'data science', 'data engineering', 'data analysis',
  'big data', 'site reliability', 'spring boot', 'spring mvc',
  'react js', 'react.js', 'node.js', 'node js', 'next.js', 'vue.js',
  'angular js', 'angular.js', 'java spring', 'java development',
  'full stack', 'fullstack', 'rest api', 'restful api', 'graphql api',
  'ci/cd', 'ci cd', 'devops', 'mlops', 'power bi', 'tableau',
  'google cloud', 'amazon web services', 'microsoft azure',
  'sql server', 'ms sql', 'postgres', 'postgresql', 'mongodb',
  'elastic search', 'elasticsearch', 'apache kafka', 'apache spark',
  'spring framework', 'dot net', '.net core', 'asp.net',
]

// Single-token allowlist prefixes (tech terms that survive stopword filter)
const TECH_PREFIXES = /^(java|python|scala|kotlin|go|rust|ruby|php|swift|c\+\+|c#|r\b|sql|nosql|html|css|xml|json|yaml|bash|shell|linux|unix|aws|gcp|azure|docker|kubernetes|k8s|terraform|jenkins|git|jira|agile|scrum|kanban|sap|salesforce|react|angular|vue|node|express|django|flask|fastapi|spring|hibernate|kafka|spark|hadoop|airflow|dbt|snowflake|redshift|tableau|powerbi|excel|vba|matlab|pytorch|tensorflow|keras|sklearn|scikit|pandas|numpy|selenium|cypress|jest|junit|maven|gradle|ansible|puppet|chef|nginx|apache|tomcat|oracle|mysql|postgres|redis|mongo|cassandra|dynamo|firebase|graphql|rest|soap|grpc|microservices|blockchain|solidity|ios|android|flutter|react\s*native|unity|unreal)/i

function _tokeniseSkills(text) {
  let lower = text.toLowerCase()
  const found = new Set()

  // Pass 1: extract multi-word skills
  for (const phrase of MULTIWORD_SKILLS) {
    if (lower.includes(phrase)) {
      found.add(_titleCase(phrase))
      lower = lower.replace(new RegExp(phrase, 'g'), ' ')
    }
  }

  // Pass 2: single tokens
  const tokens = lower
    .replace(/[^a-z0-9.#+\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && t.length <= 30)

  for (const token of tokens) {
    if (SKILL_STOPWORDS.has(token)) continue
    if (TECH_PREFIXES.test(token)) {
      found.add(_titleCase(token))
    }
  }

  return found
}

function _titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}


// ── 2e. Recency weighting ─────────────────────────────────────────────────────
// Returns Map<skill, weight> where weight ∈ [1.0, 2.0].
// Skills from jobs in the last 2 years get weight 2.0.
// Skills from older jobs decay linearly to 1.0 at 10+ years ago.
// Falls back to equal weight 1.0 if no date blocks found.

const CURRENT_YEAR = new Date().getFullYear()
const RECENCY_WINDOW = 2      // years — full weight
const DECAY_FLOOR_AGE = 10    // years — weight bottoms out at 1.0

function _buildWeightedSkillMap(jobBlocks, skillsFallback) {
  const weightMap = new Map()

  if (!jobBlocks.length) {
    // Fallback: equal weight
    for (const skill of skillsFallback) weightMap.set(skill, 1.0)
    return weightMap
  }

  for (const block of jobBlocks) {
    // Use the END year of the job as the recency reference
    const age = CURRENT_YEAR - (block.end || block.start || CURRENT_YEAR)
    let weight
    if (age <= RECENCY_WINDOW) {
      weight = 2.0
    } else if (age >= DECAY_FLOOR_AGE) {
      weight = 1.0
    } else {
      // Linear decay from 2.0 → 1.0 over the window
      weight = 2.0 - ((age - RECENCY_WINDOW) / (DECAY_FLOOR_AGE - RECENCY_WINDOW))
    }

    const blockSkills = _tokeniseSkills(block.text)
    for (const skill of blockSkills) {
      // Keep the highest weight if skill appears in multiple jobs
      const existing = weightMap.get(skill) ?? 0
      if (weight > existing) weightMap.set(skill, weight)
    }
  }

  // Also pull from the skills section (no date context → weight 1.0 unless
  // already set higher from experience section)
  for (const skill of skillsFallback) {
    if (!weightMap.has(skill)) weightMap.set(skill, 1.0)
  }

  return weightMap
}


// ── 2f-remote. FastAPI cosine snap ───────────────────────────────────────────
// Posts skill list to /cv/snap; maps response back to the same shape as
// _cosineSnap so parseCV doesn't need to branch further down.

async function _cosineSnapRemote(weightMap, nodes) {
  const skills = [...weightMap.keys()]
  const res = await fetch(`${API_URL}/cv/snap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skills }),
  })
  if (!res.ok) throw new Error(`/cv/snap failed: ${res.status}`)
  const { results } = await res.json()
  if (!results.length) return null

  // Map server node_ids back to node objects from overview layout.
  // Filter to graph-present nodes only — some pipeline nodes fall below MIN_STRATUM
  // and don't appear in the graph JSON.
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const graphResults = results
    .filter(r => nodeMap[r.node_id])
    .map(r => ({ node: nodeMap[r.node_id], score: r.cosine }))

  if (!graphResults.length) return null
  return { best: graphResults[0], second: graphResults[1] ?? null }
}


// ── 2f. Cosine snap against role vectors ─────────────────────────────────────
// Each node's "vector" is its top_skills list from overview layout.
// We compute weighted dot product: sum of weights for skills present in node.
// Normalised by sqrt(sum of squares of weights) × sqrt(node vector size).

function _cosineSnap(weightMap, nodes) {
  const cvNorm = Math.sqrt(
    [...weightMap.values()].reduce((acc, w) => acc + w * w, 0)
  )
  if (cvNorm === 0) return null

  let best = null
  let second = null

  for (const node of nodes) {
    const nodeSkills = new Set(
      (node.top_skills || []).map(s => s.toLowerCase())
    )
    if (!nodeSkills.size) continue

    let dot = 0
    for (const [skill, weight] of weightMap) {
      if (nodeSkills.has(skill.toLowerCase())) dot += weight
    }
    if (dot === 0) continue

    const score = dot / (cvNorm * Math.sqrt(nodeSkills.size))

    if (!best || score > best.score) {
      second = best
      best = { node, score }
    } else if (!second || score > second.score) {
      second = { node, score }
    }
  }

  return { best, second }
}


// ── 2g. Transition language detection ────────────────────────────────────────

function _detectTransition(objectiveText) {
  if (!objectiveText) return false
  return TRANSITION_PATTERNS.some(re => re.test(objectiveText))
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. PUBLIC: parseCV
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parses a CV file (PDF or DOCX) entirely in-browser.
 * File is never sent to any server.
 *
 * @param {File} file
 * @returns {Promise<{
 *   detectedRole:     string,   // label e.g. "Backend / Java Developer"
 *   detectedRoleSlug: string,   // e.g. "backend_java_developer_services"
 *   skills:           string[], // deduplicated skill list (display chips)
 *   secondaryRole:    string|null // label of second-best match if transition
 *                                 // language detected, else null
 * }>}
 */
export async function parseCV(file) {
  // 1. Extract raw text
  const rawText = await _extractRawText(file)

  // 2. Split into sections
  const sections = _splitIntoSections(rawText)

  // 3. Extract skills from skills section (flat, for fallback + display)
  const skillsFromSection = _tokeniseSkills(
    sections.skills + ' ' + sections.other
  )

  // 4. Extract job blocks with date ranges from experience section
  const jobBlocks = _extractJobBlocks(sections.experience)

  // 5. Build recency-weighted skill map
  const weightMap = _buildWeightedSkillMap(jobBlocks, skillsFromSection)

  // 6. Load nodes (cached after first call)
  const { nodes } = await getOverviewLayout()

  // 7. Cosine snap — remote (FastAPI) if VITE_API_URL is set, else client-side
  const snap = API_URL
    ? await _cosineSnapRemote(weightMap, nodes)
    : _cosineSnap(weightMap, nodes)

  if (!snap || !snap.best) {
    throw new Error(
      'Could not match CV to any role. ' +
      'Try the "Explore without CV" path and select your role manually.'
    )
  }

  // 8. Transition detection → secondaryRole
  const hasTransition = _detectTransition(sections.objective)
  const secondaryRole = (hasTransition && snap.second)
    ? snap.second.node.label
    : null

  // 9. Return
  return {
    detectedRole:     snap.best.node.label,
    detectedRoleSlug: snap.best.node.id,
    skills:           [...weightMap.keys()].slice(0, 30), // cap display at 30
    secondaryRole,
  }
}
