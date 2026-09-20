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
const SLOTS = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
const STATE_COLOR = { working: '#58d68d', waiting: '#f4c542', error: '#ef5350', idle: '#8492a6' }
const THEMES = [
  { id: 'factory', label: 'FACTORY' },
  { id: 'space', label: 'SPACE' },
]
const HUD_H = 146
const ROW_H = 36
const LIST_PAD = 8
const HEADER_H = 16
const HERO_HEADER_H = 40
const WIDE_MIN = 820

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
let upstreamHost = ''
let dataSource = ''
let demo = false
let connected = false
let recent = []
let themeButtons = []
let stackRows = []
let heroButtons = {}
let hoverFolder = null
let hoverTheme = null
let hoverRow = null
let hudRect = { x: 20, y: 20, w: 330, h: HUD_H }
let stackRect = { x: 20, y: 0, w: 330, h: 0 }
let heroRect = { x: 0, y: 0, w: 0, h: 0 }
let focusId = null
let enabled = loadEnabled()
let theme = typeof location !== 'undefined' && new URLSearchParams(location.search).get('theme') === 'space' ? 'space' : 'factory'

function setTheme(next) {
  theme = next
  try {
    const url = new URL(location.href)
    if (next === 'factory') url.searchParams.delete('theme')
    else url.searchParams.set('theme', next)
    history.replaceState(null, '', url)
  } catch {
    /* ignore */
  }
  layout()
}

function loadEnabled() {
  try {
    return JSON.parse(window.localStorage.getItem('agent-factory:enabled') || '{}') || {}
  } catch {
    return {}
  }
}

function isEnabled(id) {
  return enabled[id] !== false
}

function setEnabled(id, value) {
  enabled[id] = value
  try {
    window.localStorage.setItem('agent-factory:enabled', JSON.stringify(enabled))
  } catch {
    /* ignore storage failures */
  }
}

function toggleSession(id) {
  setEnabled(id, !isEnabled(id))
}

function setEnabledFrom(list) {
  for (const item of list) if (!(item.id in enabled)) enabled[item.id] = true
}

function visibleWorkers() {
  const out = []
  for (const worker of workers.values()) if (isEnabled(worker.id)) out.push(worker)
  return out
}

function focusedWorker() {
  const list = visibleWorkers()
  if (!list.length) return null
  if (focusId) {
    const pinned = list.find((worker) => worker.id === focusId)
    if (pinned) return pinned
  }
  return list.reduce((best, worker) => ((worker.updated || 0) > (best.updated || 0) ? worker : best), list[0])
}

function stackWorkers() {
  return [...workers.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0))
}

function iso(tx, ty) {
  return { x: ((tx - ty) * TW) / 2, y: ((tx + ty) * TH) / 2 }
}

function computeRegions() {
  const wide = W >= WIDE_MIN
  const leftX = wide ? 20 : 10
  const leftW = wide ? 330 : Math.max(200, W - 20)
  hudRect = { x: leftX, y: 20, w: leftW, h: HUD_H }
  const maxRows = wide ? Math.max(1, Math.min(9, Math.floor((H - hudRect.y - hudRect.h - 40) / ROW_H))) : 4
  const rows = Math.min(stackWorkers().length, maxRows)
  const stackTop = hudRect.y + hudRect.h + 8
  stackRect = {
    x: leftX,
    y: stackTop,
    w: leftW,
    h: rows ? LIST_PAD * 2 + HEADER_H + rows * ROW_H : 0,
  }
  if (wide) {
    const hx = leftX + leftW + 16
    heroRect = { x: hx, y: 16, w: Math.max(80, W - hx - 16), h: Math.max(120, H - 32) }
  } else {
    const hy = stackRect.y + stackRect.h + 8
    heroRect = { x: 10, y: hy, w: Math.max(80, W - 20), h: Math.max(120, H - hy - 10) }
  }
}

function layout() {
  computeRegions()
  if (theme === 'space' && typeof spaceLayout === 'function') {
    spaceLayout()
    return
  }
  const padX = 50
  const padTop = HERO_HEADER_H + 24
  const padBottom = 44
  const availW = Math.max(40, heroRect.w - padX * 2)
  const availH = Math.max(40, heroRect.h - padTop - padBottom)
  scale = Math.min(availW / (N * TW), availH / (N * TH)) * zoom
  originX = heroRect.x + heroRect.w / 2
  originY = heroRect.y + padTop + availH / 2
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

function insideRect(rect, x, y) {
  return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
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

function syncWorkers(list) {
  const seen = new Set()
  for (const incoming of list) {
    seen.add(incoming.id)
    const previous = workers.get(incoming.id)
    workers.set(incoming.id, Object.assign({ rx: 0, ry: 0, placed: false }, previous || {}, incoming))
  }
  for (const id of [...workers.keys()]) if (!seen.has(id)) workers.delete(id)
  setEnabledFrom(list)
}

function update(dt, now) {
  if (theme === 'space' && typeof spaceUpdate === 'function') {
    spaceUpdate(dt, now)
    return
  }
  const worker = focusedWorker()
  if (!worker) return
  const anchor = ZONES[worker.zone] || ZONES.breakroom
  const target = iso(anchor.tx, anchor.ty)
  const k = 1 - Math.exp(-6 * dt)
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

function drawZones(worker) {
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
    const active = worker && worker.zone === Object.keys(ZONES).find((key) => ZONES[key] === zone)
    const d = diamond(iso(zone.tx, zone.ty), TW / 2 - 3, TH / 2 - 3)
    ctx.fillStyle = active ? zone.color + '55' : zone.color + '22'
    ctx.fill()
    ctx.strokeStyle = active ? zone.color : zone.color + '88'
    ctx.lineWidth = active ? 3 : 2
    ctx.stroke()

    ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = active ? zone.color : zone.color + 'cc'
    ctx.fillText(zone.label, d.x, d.y - d.hh - 8)
  }
}

function drawWorker(worker, now) {
  const point = toScreen({ x: worker.rx, y: worker.ry })
  const s = Math.max(1.1, Math.min(3.4, scale))
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
  ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(230,238,248,0.92)'
  ctx.fillText(worker.title || worker.id.slice(-6), point.x, headY - 12 * s)

  const detail = worker.tool ? `${worker.tool}${worker.file ? ' ' + worker.file : ''}` : worker.note || ''
  if (detail) {
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace'
    ctx.fillStyle = color
    ctx.fillText(detail.slice(0, 34), point.x, headY - 1 * s)
  }
}

function drawLegend(worker) {
  const zoneNames = Object.keys(ZONES)
  const y = heroRect.y + heroRect.h - 14 - Math.ceil(zoneNames.length / 2) * 18
  zoneNames.forEach((name, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = heroRect.x + 14 + col * 168
    const yy = y + row * 18
    const active = worker && worker.zone === name
    ctx.fillStyle = active ? ZONES[name].color : ZONES[name].color + '99'
    ctx.fillRect(x, yy - 5, 10, 10)
    ctx.fillStyle = active ? '#e6eef8' : '#94a3b8'
    ctx.font = `${active ? '600 ' : ''}12px ui-monospace, Menlo, Consolas, monospace`
    ctx.fillText(ZONES[name].label, x + 18, yy)
  })
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

  rr(hudRect.x, hudRect.y, hudRect.w, hudRect.h, 12)
  ctx.fillStyle = 'rgba(14,18,26,0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#e6eef8'
  ctx.font = '700 18px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillText('HERMES FACTORY', hudRect.x + 18, hudRect.y + 24)

  const live = upstream === 'connected'
  const dotColor = demo ? '#5aa9e6' : live ? '#58d68d' : '#ef5350'
  ctx.fillStyle = dotColor
  ctx.beginPath()
  ctx.arc(hudRect.x + hudRect.w - 24, hudRect.y + 24, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = '#8492a6'
  ctx.fillText(demo ? 'demo stream' : live ? `live · ${dataSource || 'sse'}` : 'upstream offline', hudRect.x + 18, hudRect.y + 46)

  ctx.font = '13px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(
    `agents ${stats.sessions}   working ${stats.working}   waiting ${stats.waiting}   error ${stats.error}`,
    hudRect.x + 18,
    hudRect.y + 70,
  )
  ctx.fillStyle = '#7f8fa6'
  ctx.fillText(`tokens ${formatTokens(stats.tokens)}   cost $${(stats.cost || 0).toFixed(3)}`, hudRect.x + 18, hudRect.y + 90)

  themeButtons = []
  const buttonW = (hudRect.w - 36 - 8) / 2
  const buttonY = hudRect.y + hudRect.h - 34
  THEMES.forEach((item, index) => {
    const bx = hudRect.x + 18 + index * (buttonW + 8)
    const active = theme === item.id
    const hot = hoverTheme === item.id
    rr(bx, buttonY, buttonW, 26, 6)
    ctx.fillStyle = active ? 'rgba(90,169,230,0.3)' : hot ? 'rgba(120,150,200,0.16)' : 'rgba(120,150,200,0.08)'
    ctx.fill()
    ctx.strokeStyle = active ? 'rgba(120,190,255,0.75)' : 'rgba(120,150,200,0.22)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = active ? '#cfe6ff' : 'rgba(150,170,195,0.9)'
    ctx.fillText(item.label, bx + buttonW / 2, buttonY + 13)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    themeButtons.push({ id: item.id, x: bx, y: buttonY, w: buttonW, h: 26 })
  })
  ctx.restore()
  void now
}

function shortTitle(value, max) {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}~` : text
}

function agoText(updated) {
  if (!updated) return ''
  const minutes = Math.max(0, Math.round((Date.now() - updated) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function drawStack(now) {
  stackRows = []
  if (!stackRect.h) return
  const focus = focusedWorker()
  const list = stackWorkers()
  const rows = Math.floor((stackRect.h - LIST_PAD * 2 - HEADER_H) / ROW_H)

  rr(stackRect.x, stackRect.y, stackRect.w, stackRect.h, 12)
  ctx.fillStyle = 'rgba(14,18,26,0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(120,150,200,0.7)'
  ctx.fillText('SESSIONS', stackRect.x + 14, stackRect.y + LIST_PAD + HEADER_H / 2)

  list.slice(0, rows).forEach((session, index) => {
    const rowY = stackRect.y + LIST_PAD + HEADER_H + index * ROW_H
    const rowRect = { x: stackRect.x + 6, y: rowY + 2, w: stackRect.w - 12, h: ROW_H - 4 }
    const toggle = { x: stackRect.x + 14, y: rowY + ROW_H / 2 - 7, w: 28, h: 14 }
    const folder = { x: stackRect.x + stackRect.w - 32, y: rowY + ROW_H / 2 - 10, w: 22, h: 20 }
    stackRows.push({ id: session.id, rect: rowRect, toggle, folder })

    const on = isEnabled(session.id)
    const isFocus = focus && focus.id === session.id
    const cy = rowY + ROW_H / 2
    const hot = hoverRow === session.id || hoverFolder === session.id

    rr(rowRect.x, rowRect.y, rowRect.w, rowRect.h, 8)
    ctx.fillStyle = isFocus ? 'rgba(90,169,230,0.16)' : hot ? 'rgba(120,150,200,0.1)' : 'rgba(255,255,255,0.02)'
    ctx.fill()
    if (isFocus) {
      ctx.strokeStyle = 'rgba(120,190,255,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#5aa9e6'
      ctx.fillRect(rowRect.x + 1, rowRect.y + 6, 3, rowRect.h - 12)
    }

    rr(toggle.x, toggle.y, toggle.w, toggle.h, 7)
    ctx.fillStyle = on ? 'rgba(88,214,141,0.28)' : 'rgba(120,135,155,0.18)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(on ? toggle.x + 21 : toggle.x + 7, toggle.y + 7, 6, 0, Math.PI * 2)
    ctx.fillStyle = on ? '#58d68d' : '#7f8c9b'
    ctx.fill()

    ctx.font = `${isFocus ? '700 ' : ''}12px ui-monospace, Menlo, Consolas, monospace`
    ctx.fillStyle = on ? '#dbe6f3' : '#5f6b7c'
    ctx.fillText(shortTitle(session.title || session.id.slice(-6), 25), stackRect.x + 52, cy - 6)

    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace'
    ctx.fillStyle = on ? 'rgba(132,146,166,0.95)' : 'rgba(95,107,124,0.8)'
    const detail = session.tool ? `${session.tool}${session.file ? ' · ' + session.file : ''}` : session.dir || '—'
    ctx.fillText(shortTitle(detail, 20), stackRect.x + 52, cy + 8)

    ctx.beginPath()
    ctx.arc(stackRect.x + stackRect.w - 46, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = STATE_COLOR[session.state] || STATE_COLOR.idle
    ctx.fill()

    ctx.textAlign = 'right'
    ctx.fillStyle = on ? 'rgba(132,146,166,0.9)' : 'rgba(95,107,124,0.75)'
    ctx.fillText(agoText(session.updated), stackRect.x + stackRect.w - 54, cy)
    ctx.textAlign = 'left'

    const fhot = hoverFolder === session.id
    rr(folder.x, folder.y, folder.w, folder.h, 5)
    ctx.fillStyle = fhot ? 'rgba(90,169,230,0.28)' : 'rgba(120,150,200,0.1)'
    ctx.fill()
    ctx.strokeStyle = fhot ? 'rgba(120,190,255,0.7)' : 'rgba(120,150,200,0.24)'
    ctx.lineWidth = 1
    ctx.stroke()
    const fx = folder.x + 5
    const fy = folder.y + 6
    ctx.fillStyle = fhot ? '#9fd0ff' : 'rgba(150,175,205,0.8)'
    ctx.fillRect(fx, fy, 6, 2.5)
    rr(fx, fy + 2, 12, 8, 1.5)
    ctx.fill()
  })
  void now
}

function drawHeroHeader(worker) {
  heroButtons = {}
  if (!worker) return
  const hx = heroRect.x + 1
  const hy = heroRect.y + 1
  const hw = heroRect.w - 2
  const color = STATE_COLOR[worker.state] || STATE_COLOR.idle

  ctx.save()
  rr(hx, hy, hw, HERO_HEADER_H, 12)
  ctx.clip()
  ctx.fillStyle = 'rgba(10,13,22,0.82)'
  ctx.fillRect(hx, hy, hw, HERO_HEADER_H)
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '700 15px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = '#e6eef8'
  ctx.fillText(worker.title || worker.id.slice(-6), hx + 14, hy + 15)

  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(140,160,185,0.95)'
  const info = [worker.dir || '—', worker.state, worker.tool].filter(Boolean).join(' · ')
  ctx.fillText(shortTitle(info, 52), hx + 14, hy + 30)

  ctx.beginPath()
  ctx.arc(hx + 8, hy + 30, 3, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  let bx = hx + hw - 12
  const autoRect = { x: bx - 52, y: hy + 10, w: 52, h: 20 }
  bx -= 58
  const folderRect = { x: bx - 26, y: hy + 10, w: 26, h: 20 }
  bx -= 32
  const toggleRect = { x: bx - 30, y: hy + 11, w: 30, h: 18 }

  const pinned = Boolean(focusId)
  rr(autoRect.x, autoRect.y, autoRect.w, autoRect.h, 6)
  ctx.fillStyle = pinned ? 'rgba(120,150,200,0.1)' : 'rgba(90,169,230,0.28)'
  ctx.fill()
  ctx.strokeStyle = pinned ? 'rgba(120,150,200,0.25)' : 'rgba(120,190,255,0.7)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = '600 10px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = pinned ? 'rgba(150,170,195,0.9)' : '#cfe6ff'
  ctx.fillText(pinned ? 'PINNED' : 'AUTO', autoRect.x + autoRect.w / 2, autoRect.y + 10)

  const fhot = hoverFolder === '__hero__'
  rr(folderRect.x, folderRect.y, folderRect.w, folderRect.h, 5)
  ctx.fillStyle = fhot ? 'rgba(90,169,230,0.28)' : 'rgba(120,150,200,0.1)'
  ctx.fill()
  ctx.strokeStyle = fhot ? 'rgba(120,190,255,0.7)' : 'rgba(120,150,200,0.24)'
  ctx.stroke()
  ctx.fillStyle = fhot ? '#9fd0ff' : 'rgba(150,175,205,0.8)'
  ctx.fillRect(folderRect.x + 6, folderRect.y + 6, 6, 2.5)
  rr(folderRect.x + 6, folderRect.y + 8, 14, 9, 1.5)
  ctx.fill()

  const on = isEnabled(worker.id)
  rr(toggleRect.x, toggleRect.y, toggleRect.w, toggleRect.h, 9)
  ctx.fillStyle = on ? 'rgba(88,214,141,0.28)' : 'rgba(120,135,155,0.18)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(on ? toggleRect.x + 21 : toggleRect.x + 9, toggleRect.y + 9, 7, 0, Math.PI * 2)
  ctx.fillStyle = on ? '#58d68d' : '#7f8c9b'
  ctx.fill()

  ctx.textAlign = 'left'
  heroButtons = { auto: autoRect, folder: folderRect, toggle: toggleRect }
}

function drawEmptyState() {
  if (workers.size && visibleWorkers().length) return
  const cx = heroRect.x + heroRect.w / 2
  const cy = heroRect.y + heroRect.h / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fullHost = upstreamHost || 'http://127.0.0.1:4096'
  const bareHost = fullHost.replace(/^https?:\/\//, '')
  const dbSource = dataSource === 'db'
  const noWorkers = !workers.size
  const title = demo
    ? 'starting demo...'
    : noWorkers
      ? upstream !== 'connected'
        ? dbSource
          ? 'cannot read opencode.db'
          : `upstream unreachable: ${bareHost}`
        : dbSource
          ? 'no recent agent activity'
          : `no active sessions on ${bareHost}`
      : 'all sessions hidden'
  ctx.fillStyle = 'rgba(148,163,184,0.8)'
  ctx.font = '600 20px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillText(title, cx, cy - 16)
  ctx.fillStyle = 'rgba(120,150,200,0.9)'
  ctx.font = '14px ui-monospace, Menlo, Consolas, monospace'
  if (demo) return
  ctx.fillText(
    noWorkers
      ? dbSource
        ? 'watching opencode.db for any agent activity'
        : `run:  opencode attach ${fullHost}`
      : 'toggle a session on in the list at the top left',
    cx,
    cy + 16,
  )
}

function drawBg() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H)
  gradient.addColorStop(0, '#0b0f1a')
  gradient.addColorStop(1, '#06080e')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)
}

function drawFactoryHero(now) {
  const worker = focusedWorker()
  ctx.save()
  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.clip()
  const gradient = ctx.createLinearGradient(0, heroRect.y, 0, heroRect.y + heroRect.h)
  gradient.addColorStop(0, '#0d1220')
  gradient.addColorStop(1, '#080a10')
  ctx.fillStyle = gradient
  ctx.fillRect(heroRect.x, heroRect.y, heroRect.w, heroRect.h)
  drawFloor()
  drawZones(worker)
  if (worker) drawWorker(worker, now)
  drawLegend(worker)
  ctx.restore()
  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function draw(now) {
  computeRegions()
  drawBg()
  if (theme === 'space' && typeof spaceDraw === 'function') spaceDraw(now)
  else drawFactoryHero(now)
  drawHeroHeader(focusedWorker())
  drawHud(now)
  drawStack(now)
  drawEmptyState()
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
      upstreamHost = message.host || ''
      dataSource = message.source || ''
      demo = message.demo
      stats = message.stats
      recent = message.recent || []
      syncWorkers(message.workers)
    } catch {
      /* ignore malformed frames */
    }
  }
}

function openFolder(id) {
  try {
    fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  } catch {
    /* ignore */
  }
}

function focusSession(id) {
  focusId = id
  if (!isEnabled(id)) setEnabled(id, true)
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
  if (event.key === 't' || event.key === 'T') setTheme(theme === 'space' ? 'factory' : 'space')
})

function handleClick(event) {
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  for (const button of themeButtons) {
    if (insideRect(button, x, y)) {
      setTheme(button.id)
      return
    }
  }
  if (insideRect(heroButtons.toggle, x, y)) {
    const worker = focusedWorker()
    if (worker) toggleSession(worker.id)
    return
  }
  if (insideRect(heroButtons.folder, x, y)) {
    const worker = focusedWorker()
    if (worker) openFolder(worker.id)
    return
  }
  if (insideRect(heroButtons.auto, x, y)) {
    focusId = focusId ? null : (focusedWorker() ? focusedWorker().id : null)
    return
  }
  for (const row of stackRows) {
    if (insideRect(row.folder, x, y)) {
      openFolder(row.id)
      return
    }
  }
  for (const row of stackRows) {
    if (insideRect(row.toggle, x, y)) {
      toggleSession(row.id)
      return
    }
  }
  for (const row of stackRows) {
    if (insideRect(row.rect, x, y)) {
      focusSession(row.id)
      return
    }
  }
}

function handleMove(event) {
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  let folderHot = null
  for (const row of stackRows) {
    if (insideRect(row.folder, x, y)) { folderHot = row.id; break }
  }
  if (insideRect(heroButtons.folder, x, y)) folderHot = '__hero__'
  hoverFolder = folderHot

  let rowHot = null
  for (const row of stackRows) {
    if (insideRect(row.rect, x, y) && !insideRect(row.folder, x, y) && !insideRect(row.toggle, x, y)) { rowHot = row.id; break }
  }
  hoverRow = rowHot

  let themeHot = null
  for (const button of themeButtons) {
    if (insideRect(button, x, y)) { themeHot = button.id; break }
  }
  hoverTheme = themeHot

  const overHeroButton = insideRect(heroButtons.auto, x, y) || insideRect(heroButtons.toggle, x, y) || insideRect(heroButtons.folder, x, y)
  const pointer = folderHot || rowHot || themeHot || overHeroButton
  if (canvas.style) canvas.style.cursor = pointer ? 'pointer' : 'default'
}

canvas.addEventListener('click', handleClick)
canvas.addEventListener('mousemove', handleMove)

resize()
connect()
requestAnimationFrame(frame)
void recent
void connected
