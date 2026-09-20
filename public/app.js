const ZONES = {
  intake: { label: 'INTAKE', tx: 6, ty: 1, color: '#5aa9e6' },
  archive: { label: 'ARCHIVE', tx: 1, ty: 4, color: '#9b8cff' },
  dock: { label: 'LOADING DOCK', tx: 11, ty: 4, color: '#4dd0e1' },
  workbench: { label: 'WORKBENCH', tx: 5, ty: 5, color: '#58d68d' },
  supervisor: { label: 'SUPERVISOR', tx: 7, ty: 7, color: '#e26fd4' },
  machineshop: { label: 'MACHINE SHOP', tx: 1, ty: 9, color: '#f5a623' },
  repair: { label: 'REPAIR', tx: 11, ty: 9, color: '#e74c3c' },
  breakroom: { label: 'BREAK ROOM', tx: 6, ty: 12, color: '#7f8c8d' },
}
const N = 13
const TW = 64
const TH = 32
const CENTER_Y = (N * TH) / 2
const SLOTS = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -1], [2, 1],
]
const STATE_COLOR = { working: '#58d68d', waiting: '#f4c542', error: '#ef5350', idle: '#8492a6' }

const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')

let W = 0
let H = 0
let scale = 1
let originX = 0
let originY = 0
let zoom = 1
let workers = new Map()
let stats = { sessions: 0, working: 0, waiting: 0, error: 0, idle: 0, tokens: 0, cost: 0 }
let upstream = 'starting'
let demo = false
let connected = false
let lastTargets = new Map()

function iso(tx, ty) {
  return { x: ((tx - ty) * TW) / 2, y: ((tx + ty) * TH) / 2 }
}

function layout() {
  const padX = 70
  const padTop = 150
  const padBottom = 70
  const availW = Math.max(60, W - padX * 2)
  const availH = Math.max(60, H - padTop - padBottom)
  scale = Math.min(availW / (N * TW), availH / (N * TH)) * zoom
  originX = W / 2
  originY = padTop + availH / 2
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layout()
}

function toScreen(point) {
  return { x: originX + point.x * scale, y: originY + (point.y - CENTER_Y) * scale }
}

function hash(value) {
  let out = 0
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) >>> 0
  return (out % 1000) / 1000
}

function rr(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function diamond(point, halfW, halfH) {
  const p = toScreen(point)
  const hw = halfW * scale
  const hh = halfH * scale
  ctx.beginPath()
  ctx.moveTo(p.x, p.y - hh)
  ctx.lineTo(p.x + hw, p.y)
  ctx.lineTo(p.x, p.y + hh)
  ctx.lineTo(p.x - hw, p.y)
  ctx.closePath()
  return { x: p.x, y: p.y, hw, hh }
}

function computeTargets() {
  const byZone = new Map()
  for (const worker of workers.values()) {
    if (!byZone.has(worker.zone)) byZone.set(worker.zone, [])
    byZone.get(worker.zone).push(worker.id)
  }
  const targets = new Map()
  for (const [zone, ids] of byZone) {
    ids.sort()
    const anchor = ZONES[zone] || ZONES.breakroom
    ids.forEach((id, index) => {
      const slot = SLOTS[index % SLOTS.length]
      const ring = Math.floor(index / SLOTS.length) * 0.7
      targets.set(id, iso(anchor.tx + slot[0] * (1 + ring), anchor.ty + slot[1] * (1 + ring)))
    })
  }
  return targets
}

function syncWorkers(list) {
  const seen = new Set()
  for (const incoming of list) {
    seen.add(incoming.id)
    const previous = workers.get(incoming.id)
    workers.set(incoming.id, Object.assign({ rx: 0, ry: 0, placed: false }, previous || {}, incoming))
  }
  for (const id of [...workers.keys()]) if (!seen.has(id)) workers.delete(id)
}

function update(dt, now) {
  const targets = computeTargets()
  lastTargets = targets
  const k = 1 - Math.exp(-6 * dt)
  for (const worker of workers.values()) {
    const target = targets.get(worker.id)
    if (!target) continue
    if (!worker.placed) {
      worker.rx = target.x
      worker.ry = target.y
      worker.placed = true
    } else {
      worker.rx += (target.x - worker.rx) * k
      worker.ry += (target.y - worker.ry) * k
    }
    worker.moving = Math.hypot(target.x - worker.rx, target.y - worker.ry) > 2
    worker.phase = hash(worker.id)
  }
}

function drawFloor() {
  const colors = ['#12161f', '#151a24']
  for (let tx = 0; tx <= N; tx += 1) {
    for (let ty = 0; ty <= N; ty += 1) {
      const d = diamond(iso(tx, ty), TW / 2, TH / 2)
      ctx.fillStyle = colors[(tx + ty) % 2]
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'
      ctx.lineWidth = 1
      ctx.stroke()
      void d
    }
  }
}

function drawZones() {
  for (const zone of Object.values(ZONES)) {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const tx = zone.tx + dx
        const ty = zone.ty + dy
        if (tx < 0 || ty < 0 || tx > N || ty > N) continue
        const d = diamond(iso(tx, ty), TW / 2 - 1, TH / 2 - 1)
        ctx.fillStyle = zone.color + '1f'
        ctx.fill()
        ctx.strokeStyle = zone.color + '33'
        ctx.lineWidth = 1
        ctx.stroke()
        void d
      }
    }
    const d = diamond(iso(zone.tx, zone.ty), TW / 2 - 3, TH / 2 - 3)
    ctx.fillStyle = zone.color + '33'
    ctx.fill()
    ctx.strokeStyle = zone.color + '99'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = zone.color
    ctx.fillText(zone.label, d.x, d.y - d.hh - 8)
  }
}

function drawLinks() {
  ctx.save()
  ctx.setLineDash([5, 6])
  ctx.lineWidth = 1.5
  for (const worker of workers.values()) {
    if (!worker.parentID) continue
    const parent = workers.get(worker.parentID)
    if (!parent) continue
    const a = toScreen({ x: parent.rx, y: parent.ry })
    const b = toScreen({ x: worker.rx, y: worker.ry })
    ctx.strokeStyle = 'rgba(120,150,200,0.35)'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawWorker(worker, now) {
  const point = toScreen({ x: worker.rx, y: worker.ry })
  const s = Math.max(0.75, Math.min(2.1, scale))
  const color = STATE_COLOR[worker.state] || STATE_COLOR.idle
  const bob = worker.moving ? Math.sin(now / 90 + worker.phase * 6.28) * 2 * s : 0

  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(point.x, point.y + 1, 12 * s, 5 * s, 0, 0, Math.PI * 2)
  ctx.fill()

  const bodyH = 22 * s
  const bodyW = 16 * s
  ctx.fillStyle = color
  rr(point.x - bodyW / 2, point.y - bodyH + bob, bodyW, bodyH, 5 * s)
  ctx.fill()

  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  rr(point.x - bodyW / 2, point.y - bodyH * 0.55 + bob, bodyW, bodyH * 0.55, 4 * s)
  ctx.fill()

  const headY = point.y - bodyH - 6 * s + bob
  ctx.fillStyle = '#f0e2cc'
  ctx.beginPath()
  ctx.arc(point.x, headY, 6 * s, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = color
  rr(point.x - 5 * s, headY - 2.5 * s, 10 * s, 4 * s, 2 * s)
  ctx.fill()

  if (worker.state === 'waiting') {
    const pulse = 0.6 + 0.4 * Math.sin(now / 220)
    ctx.globalAlpha = pulse
    ctx.fillStyle = '#f4c542'
    rr(point.x + 8 * s, headY - 26 * s, 20 * s, 18 * s, 5 * s)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(point.x + 12 * s, headY - 8 * s)
    ctx.lineTo(point.x + 16 * s, headY - 8 * s)
    ctx.lineTo(point.x + 12 * s, headY - 3 * s)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#1b1b1b'
    ctx.font = `700 ${Math.round(12 * s)}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', point.x + 18 * s, headY - 17 * s)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(230,238,248,0.92)'
  ctx.fillText(worker.title || worker.id.slice(-6), point.x, headY - 12 * s)

  const detail = worker.tool ? `${worker.tool}${worker.file ? ' ' + worker.file : ''}` : worker.note || ''
  if (detail) {
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace'
    ctx.fillStyle = color
    ctx.fillText(detail.slice(0, 26), point.x, headY - 1 * s)
  }
}

function drawWorkers(now) {
  const list = [...workers.values()].sort((a, b) => a.ry - b.ry)
  for (const worker of list) drawWorker(worker, now)
}

function formatTokens(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function drawHud(now) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  rr(20, 20, 316, 108, 12)
  ctx.fillStyle = 'rgba(14,18,26,0.82)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#e6eef8'
  ctx.font = '700 18px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillText('HERMES FACTORY', 38, 44)

  const live = upstream === 'connected'
  const dotColor = demo ? '#5aa9e6' : live ? '#58d68d' : '#ef5350'
  ctx.fillStyle = dotColor
  ctx.beginPath()
  ctx.arc(292, 44, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = '#8492a6'
  const statusText = demo ? 'demo stream' : live ? 'live' : 'upstream offline'
  ctx.fillText(statusText, 38, 66)

  ctx.font = '13px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(
    `agents ${stats.sessions}   working ${stats.working}   waiting ${stats.waiting}   error ${stats.error}`,
    38,
    90,
  )
  ctx.fillStyle = '#7f8fa6'
  ctx.fillText(`tokens ${formatTokens(stats.tokens)}   cost $${(stats.cost || 0).toFixed(3)}`, 38, 110)

  const legendY = H - 24 - Object.keys(ZONES).length * 0
  void legendY

  const zoneNames = Object.keys(ZONES)
  const counts = new Map()
  for (const worker of workers.values()) counts.set(worker.zone, (counts.get(worker.zone) || 0) + 1)
  const baseY = H - 30 - Math.ceil(zoneNames.length / 2) * 20
  zoneNames.forEach((name, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = 24 + col * 210
    const y = baseY + row * 20
    ctx.fillStyle = ZONES[name].color
    ctx.fillRect(x, y - 5, 10, 10)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace'
    ctx.fillText(`${ZONES[name].label}  ${counts.get(name) || 0}`, x + 18, y)
  })

  if (!workers.size) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(148,163,184,0.7)'
    ctx.font = '600 20px ui-monospace, Menlo, Consolas, monospace'
    ctx.fillText(demo ? 'starting demo...' : 'waiting for agent sessions...', W / 2, H / 2)
  }
  ctx.restore()
  void now
}

function draw(now) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H)
  gradient.addColorStop(0, '#0d1220')
  gradient.addColorStop(1, '#080a10')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)
  drawFloor()
  drawZones()
  drawLinks()
  drawWorkers(now)
  drawHud(now)
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  update(dt, now)
  draw(now)
  requestAnimationFrame(frame)
}

function connect() {
  const source = new EventSource('/api/events')
  source.onopen = () => { connected = true }
  source.onerror = () => { connected = false }
  source.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      if (message.type !== 'state') return
      upstream = message.upstream
      demo = message.demo
      stats = message.stats
      syncWorkers(message.workers)
    } catch {
      /* ignore malformed frames */
    }
  }
}

window.addEventListener('resize', resize)
canvas.addEventListener('wheel', (event) => {
  event.preventDefault()
  zoom = Math.max(0.4, Math.min(4, zoom * (event.deltaY < 0 ? 1.12 : 0.9)))
  layout()
}, { passive: false })
window.addEventListener('keydown', (event) => {
  if (event.key === 'f' || event.key === 'F') {
    if (!document.fullscreenElement) canvas.requestFullscreen?.()
    else document.exitFullscreen?.()
  }
})

resize()
connect()
requestAnimationFrame(frame)
void lastTargets
void connected
