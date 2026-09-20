import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT || 5100)
const BIND = process.env.BIND || '127.0.0.1'
const OPENCODE = (process.env.OPENCODE_HOST || 'http://127.0.0.1:4096').replace(/\/+$/, '')
const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1'
const TICK_MS = 100
const WINDOW_MS = Number(process.env.ACTIVE_MINUTES || 15) * 60 * 1000
const MAX_WORKERS = Number(process.env.MAX_WORKERS || 80)

const TOOL_ZONE = {
  read: 'archive', list: 'archive', glob: 'archive', grep: 'archive', codesearch: 'archive', lsp: 'archive',
  edit: 'workbench', write: 'workbench', patch: 'workbench', multiedit: 'workbench',
  bash: 'machineshop', shell: 'machineshop',
  webfetch: 'dock', websearch: 'dock',
  task: 'intake',
  todowrite: 'supervisor', todoread: 'supervisor',
}

const zoneForTool = (tool) => TOOL_ZONE[tool] || 'workbench'
const markDirty = () => { dirty = true }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const baseName = (value) => {
  if (!value) return ''
  const parts = String(value).replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}
const short = (value, max = 22) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return text.length > max ? `${text.slice(0, max - 1)}~` : text
}

const workers = new Map()
const creditedSteps = new Set()
const clients = new Set()
let upstreamStatus = 'starting'
let dirty = true

function upsertSession(info) {
  if (!info || !info.id) return null
  let worker = workers.get(info.id)
  if (!worker) {
    worker = {
      id: info.id,
      state: 'idle',
      zone: 'breakroom',
      tool: null,
      file: null,
      tokens: 0,
      cost: 0,
      parentID: info.parentID || null,
      note: null,
      todos: 0,
      todosDone: 0,
      lastActivity: 0,
    }
    workers.set(info.id, worker)
  }
  const stamp = info.time?.updated && info.time.updated > 0 ? info.time.updated : Date.now()
  worker.lastActivity = Math.max(worker.lastActivity || 0, stamp)
  if (info.title) worker.title = short(info.title)
  worker.dir = baseName(info.directory)
  if (info.parentID) worker.parentID = info.parentID
  markDirty()
  return worker
}

function applyStatus(sessionID, status) {
  const worker = workers.get(sessionID)
  if (!worker || !status) return
  worker.lastActivity = Date.now()
  if (status.type === 'idle') {
    worker.state = 'idle'
    worker.zone = 'breakroom'
    worker.tool = null
    worker.file = null
    worker.note = null
  } else if (status.type === 'retry') {
    worker.state = 'error'
    worker.zone = 'repair'
    worker.note = `retry ${status.attempt}`
  } else if (status.type === 'busy') {
    if (worker.state !== 'waiting' && worker.state !== 'error') {
      worker.state = 'working'
      if (!worker.tool) worker.zone = 'intake'
    }
  }
  markDirty()
}

function applyToolPart(part) {
  let worker = workers.get(part.sessionID)
  if (!worker) worker = upsertSession({ id: part.sessionID, title: 'session' })
  if (!worker) return
  worker.lastActivity = Date.now()
  worker.tool = part.tool
  const input = part.state?.input || {}
  const named = input.filePath || input.path || input.pattern || part.state?.title
  if (named) worker.file = baseName(named) || short(named, 18)
  if (part.state?.status === 'error') {
    worker.state = 'error'
    worker.zone = 'repair'
    worker.note = 'tool error'
  } else if (worker.state !== 'waiting') {
    worker.state = 'working'
    worker.zone = zoneForTool(part.tool)
  }
  markDirty()
}

function applyStepPart(part) {
  if (creditedSteps.has(part.id)) return
  creditedSteps.add(part.id)
  const worker = workers.get(part.sessionID)
  if (!worker) return
  const tokens = part.tokens || {}
  worker.tokens += (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0)
  worker.cost += part.cost || 0
  markDirty()
}

function applyEvent(payload) {
  if (!payload || !payload.type) return
  const properties = payload.properties || {}
  switch (payload.type) {
    case 'session.created':
    case 'session.updated':
      upsertSession(properties.info)
      break
    case 'session.deleted':
      if (properties.info?.id) {
        workers.delete(properties.info.id)
        markDirty()
      }
      break
    case 'session.status':
      applyStatus(properties.sessionID, properties.status)
      break
    case 'session.idle':
      applyStatus(properties.sessionID, { type: 'idle' })
      break
    case 'session.error': {
      const worker = workers.get(properties.sessionID)
      if (worker) {
        worker.state = 'error'
        worker.zone = 'repair'
        worker.note = 'error'
        worker.lastActivity = Date.now()
        markDirty()
      }
      break
    }
    case 'permission.updated': {
      const worker = workers.get(properties.sessionID)
      if (worker) {
        worker.state = 'waiting'
        worker.zone = 'supervisor'
        worker.note = properties.title ? short(properties.title, 18) : 'permission'
        worker.lastActivity = Date.now()
        markDirty()
      }
      break
    }
    case 'permission.replied': {
      const worker = workers.get(properties.sessionID)
      if (worker) {
        worker.state = worker.tool ? 'working' : 'idle'
        worker.zone = worker.tool ? zoneForTool(worker.tool) : 'breakroom'
        worker.note = null
        markDirty()
      }
      break
    }
    case 'todo.updated': {
      const worker = workers.get(properties.sessionID)
      if (worker && Array.isArray(properties.todos)) {
        const done = properties.todos.filter((todo) => todo?.status === 'completed').length
        worker.todos = properties.todos.length
        worker.todosDone = done
        worker.note = `todos ${done}/${properties.todos.length}`
        markDirty()
      }
      break
    }
    case 'message.part.updated': {
      const part = properties.part
      if (!part) break
      if (part.type === 'tool') applyToolPart(part)
      else if (part.type === 'step-finish') applyStepPart(part)
      else if (part.type === 'subtask') {
        const worker = workers.get(part.sessionID)
        if (worker) {
          worker.state = 'working'
          worker.zone = 'intake'
          worker.note = short(part.description || part.agent || 'subtask', 18)
          markDirty()
        }
      }
      break
    }
    default:
      break
  }
}

function computeStats() {
  const result = { sessions: workers.size, working: 0, waiting: 0, error: 0, idle: 0, tokens: 0, cost: 0 }
  for (const worker of workers.values()) {
    if (worker.state === 'working') result.working += 1
    else if (worker.state === 'waiting') result.waiting += 1
    else if (worker.state === 'error') result.error += 1
    else result.idle += 1
    result.tokens += worker.tokens || 0
    result.cost += worker.cost || 0
  }
  return result
}

function snapshot() {
  return JSON.stringify({
    type: 'state',
    now: Date.now(),
    upstream: upstreamStatus,
    demo: DEMO,
    workers: [...workers.values()].map((worker) => ({
      id: worker.id,
      title: worker.title || '',
      dir: worker.dir || '',
      zone: worker.zone,
      state: worker.state,
      tool: worker.tool,
      file: worker.file,
      parentID: worker.parentID || null,
      tokens: worker.tokens || 0,
      cost: Number((worker.cost || 0).toFixed(4)),
      note: worker.note || null,
    })),
    stats: computeStats(),
  })
}

function send(res, data) {
  try {
    res.write(`data: ${data}\n\n`)
  } catch {
    clients.delete(res)
  }
}

function broadcast() {
  const frame = snapshot()
  for (const res of clients) send(res, frame)
}

async function reconcile() {
  try {
    const [listRes, statusRes] = await Promise.all([
      fetch(`${OPENCODE}/session`),
      fetch(`${OPENCODE}/session/status`),
    ])
    if (!listRes.ok) throw new Error(`session list ${listRes.status}`)
    const sessions = await listRes.json()
    if (!Array.isArray(sessions)) throw new Error('unexpected session list')
    const statusMap = statusRes.ok ? ((await statusRes.json()) || {}) : {}
    const now = Date.now()
    const alive = new Set()
    for (const session of sessions) {
      const status = statusMap[session.id]
      const active = status && status.type !== 'idle'
      const recent = (session.time?.updated || 0) > now - WINDOW_MS
      if (!active && !recent) continue
      if (upsertSession(session)) alive.add(session.id)
    }
    for (const id of [...workers.keys()]) if (!alive.has(id)) workers.delete(id)
    for (const [id, status] of Object.entries(statusMap)) applyStatus(id, status)
    upstreamStatus = 'connected'
  } catch {
    upstreamStatus = 'offline'
  }
  markDirty()
}

function handleBlock(block) {
  const text = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
    .trim()
  if (!text) return
  try {
    const parsed = JSON.parse(text)
    applyEvent(parsed.payload ?? parsed)
  } catch {
    /* ignore malformed frames */
  }
}

async function pump(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      handleBlock(block)
    }
  }
}

async function upstreamLoop() {
  for (;;) {
    try {
      await reconcile()
      const res = await fetch(`${OPENCODE}/global/event`, { headers: { Accept: 'text/event-stream' } })
      if (!res.ok || !res.body) throw new Error(`event stream ${res.status}`)
      upstreamStatus = 'connected'
      markDirty()
      await pump(res.body)
    } catch {
      upstreamStatus = 'offline'
      markDirty()
    }
    await sleep(2000)
  }
}

function startDemo() {
  const seeds = [
    { id: 'ses_forge', title: 'Build auth service', directory: '/demo/auth' },
    { id: 'ses_atlas', title: 'Refactor server core', directory: '/demo/server' },
    { id: 'ses_pixel', title: 'Fix renderer bug', directory: '/demo/ui' },
    { id: 'ses_relay', title: 'Write integration tests', directory: '/demo/tests' },
  ]
  for (const seed of seeds) applyEvent({ type: 'session.created', properties: { info: seed } })
  const tools = ['read', 'edit', 'bash', 'grep', 'webfetch', 'write', 'glob', 'task', 'todowrite']
  const ids = seeds.map((seed) => seed.id)
  const children = []
  let counter = 0
  setInterval(() => {
    const id = ids[Math.floor(Math.random() * ids.length)]
    const roll = Math.random()
    if (roll < 0.06) {
      applyEvent({ type: 'permission.updated', properties: { sessionID: id, title: 'Bash: rm -rf build' } })
    } else if (roll < 0.14) {
      applyEvent({ type: 'session.idle', properties: { sessionID: id } })
    } else if (roll < 0.2) {
      applyEvent({ type: 'session.error', properties: { sessionID: id } })
    } else if (roll < 0.28 && children.length < 3) {
      counter += 1
      const childId = `ses_child_${counter}`
      children.push(childId)
      applyEvent({ type: 'session.created', properties: { info: { id: childId, title: `subagent ${counter}`, directory: '/demo/auth', parentID: id } } })
      applyEvent({ type: 'session.status', properties: { sessionID: childId, status: { type: 'busy' } } })
    } else {
      counter += 1
      const tool = tools[Math.floor(Math.random() * tools.length)]
      applyEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } })
      applyEvent({
        type: 'message.part.updated',
        properties: {
          part: {
            id: `prt_${counter}`,
            sessionID: id,
            type: 'tool',
            tool,
            state: { status: 'running', input: { filePath: `/demo/${tool}-${counter}.ts` }, title: `${tool}.ts`, time: { start: Date.now() } },
          },
        },
      })
      if (Math.random() < 0.5) {
        applyEvent({
          type: 'message.part.updated',
          properties: {
            part: {
              id: `stp_${counter}`,
              sessionID: id,
              type: 'step-finish',
              reason: 'stop',
              cost: Math.random() * 0.02,
              tokens: { input: 200 + ((Math.random() * 800) | 0), output: 50 + ((Math.random() * 300) | 0), reasoning: 0, cache: { read: 0, write: 0 } },
            },
          },
        })
      }
    }
  }, 900)
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 2000\n\n')
    clients.add(res)
    send(res, snapshot())
    req.on('close', () => clients.delete(res))
    return
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(snapshot())
    return
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^[/\\]+/, '')
  const file = path.resolve(PUBLIC, rel)
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('forbidden')
    return
  }

  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  }
})

function reap() {
  const now = Date.now()
  let changed = false
  for (const [id, worker] of [...workers.entries()]) {
    if (worker.state === 'idle' && now - (worker.lastActivity || 0) > WINDOW_MS) {
      workers.delete(id)
      changed = true
    }
  }
  if (workers.size > MAX_WORKERS) {
    const sorted = [...workers.entries()].sort((a, b) => (b[1].lastActivity || 0) - (a[1].lastActivity || 0))
    for (const [id] of sorted.slice(MAX_WORKERS)) {
      workers.delete(id)
      changed = true
    }
  }
  if (changed) markDirty()
}

setInterval(() => {
  if (dirty && clients.size) {
    broadcast()
    dirty = false
  }
}, TICK_MS)

setInterval(reap, 5000)

setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': ping\n\n')
    } catch {
      clients.delete(res)
    }
  }
}, 15000)

server.listen(PORT, BIND, () => {
  console.log(`HERMES factory  ->  http://${BIND}:${PORT}`)
  console.log(DEMO ? 'mode: demo (synthetic events)' : `mode: live (upstream ${OPENCODE})`)
})

if (DEMO) startDemo()
else upstreamLoop()
