const SP_PLANET_KEYS = ['intake', 'archive', 'dock', 'workbench', 'supervisor', 'machineshop', 'repair']
const SP_PLANET_META = {
  intake: { label: 'GATEWAY', color: '#5aa9e6' },
  archive: { label: 'ARCHIVE', color: '#9b8cff' },
  dock: { label: 'DOCKS', color: '#4dd0e1' },
  workbench: { label: 'FORGE', color: '#58d68d' },
  supervisor: { label: 'COMMAND', color: '#e26fd4' },
  machineshop: { label: 'FOUNDRY', color: '#f5a623' },
  repair: { label: 'REPAIR', color: '#e74c3c' },
}
const SP_BASE = { x: 0.5, y: 0.78 }
const SP_MAX_PANELS = 8

let spShips = new Map()
let spPanels = []
let spCount = 0

function spRand(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function spGridFor(count) {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count === 2) return { cols: 2, rows: 1 }
  if (count <= 4) return { cols: 2, rows: 2 }
  if (count <= 6) return { cols: 3, rows: 2 }
  return { cols: 4, rows: Math.ceil(count / 4) }
}

function spPlanetAngle(key) {
  const index = SP_PLANET_KEYS.indexOf(key)
  if (index < 0) return null
  const start = 200
  const span = 140
  const step = span / (SP_PLANET_KEYS.length - 1)
  return ((start + index * step) * Math.PI) / 180
}

function spPlanetPoint(panel, key) {
  const angle = spPlanetAngle(key)
  if (angle === null) return { x: panel.x + panel.w * SP_BASE.x, y: panel.y + panel.h * SP_BASE.y }
  const nx = SP_BASE.x + Math.cos(angle) * 0.36
  const ny = SP_BASE.y + Math.sin(angle) * 0.34
  return { x: panel.x + panel.w * nx, y: panel.y + panel.h * ny }
}

function spBasePoint(panel) {
  return { x: panel.x + panel.w * SP_BASE.x, y: panel.y + panel.h * SP_BASE.y }
}

function spaceLayout() {
  const top = listTop() + listHeight() + 14
  const bottom = H - 16
  const left = 16
  const right = W - 16
  const count = Math.min(SP_MAX_PANELS, visibleWorkers().length)
  spCount = count
  spPanels = []
  if (!count) return
  const grid = spGridFor(count)
  const gap = 10
  const availW = right - left
  const availH = bottom - top
  const panelW = (availW - gap * (grid.cols - 1)) / grid.cols
  const panelH = (availH - gap * (grid.rows - 1)) / grid.rows
  for (let i = 0; i < count; i += 1) {
    const col = i % grid.cols
    const row = Math.floor(i / grid.cols)
    spPanels.push({
      x: left + col * (panelW + gap),
      y: top + row * (panelH + gap),
      w: panelW,
      h: panelH,
      index: i,
    })
  }
}

function spShipFor(id) {
  let ship = spShips.get(id)
  if (!ship) {
    ship = {
      nx: SP_BASE.x,
      ny: SP_BASE.y,
      angle: -Math.PI / 2,
      key: 'base',
      mode: 'hold',
      orbit: null,
      trail: [],
      phase: spRand(id.length * 31 + id.charCodeAt(0)) * 6.28,
    }
    spShips.set(id, ship)
  }
  return ship
}

function spKeyFor(worker) {
  if (worker.state === 'idle') return 'base'
  return SP_PLANET_KEYS.includes(worker.zone) ? worker.zone : 'base'
}

function spTargetFor(worker) {
  if (worker.state === 'idle') return SP_BASE
  const angle = spPlanetAngle(worker.zone)
  if (angle === null) return SP_BASE
  return { x: SP_BASE.x + Math.cos(angle) * 0.36, y: SP_BASE.y + Math.sin(angle) * 0.34 }
}

function spaceUpdate(dt, now) {
  const list = visibleWorkers()
  if (list.length !== spCount) spaceLayout()
  const seen = new Set()
  list.forEach((worker, index) => {
    const panel = spPanels[index]
    if (!panel) return
    seen.add(worker.id)
    const ship = spShipFor(worker.id)
    const key = spKeyFor(worker)
    const anchor = spTargetFor(worker)

    if (ship.key !== key) {
      ship.key = key
      ship.mode = 'travel'
    }

    const dx = anchor.x - ship.nx
    const dy = anchor.y - ship.ny
    const dist = Math.hypot(dx, dy)

    if (ship.mode === 'travel') {
      const k = 1 - Math.exp(-2.6 * dt)
      ship.nx += dx * k
      ship.ny += dy * k
      if (dist > 0.004) ship.angle = Math.atan2(dy, dx)
      ship.trail.push({ x: ship.nx, y: ship.ny, life: 1 })
      if (ship.trail.length > 26) ship.trail.shift()
      if (dist < 0.012) {
        ship.mode = key === 'base' ? 'hold' : 'orbit'
        ship.orbit = ship.phase
      }
    } else if (ship.mode === 'hold') {
      ship.nx = anchor.x
      ship.ny = anchor.y
      ship.angle = -Math.PI / 2
    } else {
      const radius = Math.min(panel.w, panel.h) * 0.042 * 1.9
      ship.orbit += dt * 0.9
      ship.nx = anchor.x + Math.cos(ship.orbit) * (radius / panel.w)
      ship.ny = anchor.y + Math.sin(ship.orbit) * (radius / panel.h)
      ship.angle = ship.orbit + Math.PI / 2
    }

    for (const point of ship.trail) point.life -= dt * 1.6
    ship.trail = ship.trail.filter((point) => point.life > 0)
  })
  for (const id of [...spShips.keys()]) if (!seen.has(id)) spShips.delete(id)
  void now
}

function spDrawStars(panel) {
  const count = 46
  for (let i = 0; i < count; i += 1) {
    const seed = panel.index * 977 + i * 13
    const nx = spRand(seed)
    const ny = spRand(seed + 1)
    const r = 0.5 + spRand(seed + 2) * 1.3
    const a = 0.15 + spRand(seed + 3) * 0.5
    ctx.fillStyle = `rgba(200,220,255,${a.toFixed(2)})`
    ctx.beginPath()
    ctx.arc(panel.x + nx * panel.w, panel.y + ny * panel.h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function spDrawBase(panel, now) {
  const point = spBasePoint(panel)
  const s = Math.max(8, Math.min(panel.w, panel.h) * 0.055)
  ctx.save()
  ctx.translate(point.x, point.y)
  const glow = 0.35 + 0.15 * Math.sin(now / 700)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3.2)
  grad.addColorStop(0, `rgba(90,169,230,${glow.toFixed(2)})`)
  grad.addColorStop(1, 'rgba(90,169,230,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, s * 3.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'rgba(150,200,255,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 2.1, s * 0.8, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#8fb8e8'
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.lineTo(s * 0.85, 0)
  ctx.lineTo(0, s)
  ctx.lineTo(-s * 0.85, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#cfe6ff'
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(160,200,240,0.85)'
  ctx.font = '600 9px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('BASE', 0, s * 1.6)
  ctx.restore()
}

function spDrawPlanet(panel, key, now, active) {
  const meta = SP_PLANET_META[key]
  const point = spPlanetPoint(panel, key)
  const s = Math.max(6, Math.min(panel.w, panel.h) * 0.042)
  const pulse = active ? 0.55 + 0.35 * Math.sin(now / 300) : 0.18
  ctx.save()
  const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, s * 3)
  glow.addColorStop(0, meta.color + '66')
  glow.addColorStop(1, meta.color + '00')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(point.x, point.y, s * 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = meta.color
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.arc(point.x, point.y, s, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.strokeStyle = meta.color
  ctx.globalAlpha = pulse
  ctx.lineWidth = active ? 2 : 1
  ctx.beginPath()
  ctx.ellipse(point.x, point.y, s * 1.7, s * 0.6, -0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.fillStyle = 'rgba(190,210,235,0.8)'
  ctx.font = '600 9px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(meta.label, point.x, point.y - s * 1.6)
  ctx.restore()
}

function spDrawShip(panel, worker, ship) {
  const point = { x: panel.x + panel.w * ship.nx, y: panel.y + panel.h * ship.ny }
  const s = Math.max(5, Math.min(panel.w, panel.h) * 0.032)
  const color = STATE_COLOR[worker.state] || STATE_COLOR.idle
  ctx.save()
  ctx.translate(point.x, point.y)

  for (const trail of ship.trail || []) {
    const alpha = Math.max(0, trail.life) * 0.4
    ctx.fillStyle = `rgba(120,190,255,${alpha.toFixed(2)})`
    ctx.beginPath()
    ctx.arc(panel.x + panel.w * trail.x - point.x, panel.y + panel.h * trail.y - point.y, s * 0.4 * trail.life, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.rotate(ship.angle)
  if (ship.mode === 'travel') {
    ctx.fillStyle = 'rgba(255,190,120,0.85)'
    ctx.beginPath()
    ctx.moveTo(-s * 1.1, 0)
    ctx.lineTo(-s * 2.1, s * 0.5)
    ctx.lineTo(-s * 2.1, -s * 0.5)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(s * 1.4, 0)
  ctx.lineTo(-s * 0.9, s * 0.85)
  ctx.lineTo(-s * 0.4, 0)
  ctx.lineTo(-s * 0.9, -s * 0.85)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(s * 0.35, 0, s * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (worker.state === 'waiting') {
    const pulse = 0.4 + 0.4 * Math.sin(Date.now() / 200)
    ctx.strokeStyle = `rgba(244,197,66,${pulse.toFixed(2)})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(point.x, point.y, s * 2.4, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function spDrawHeader(panel, worker) {
  const color = STATE_COLOR[worker.state] || STATE_COLOR.idle
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(226,238,248,0.94)'
  ctx.fillText(worker.title || worker.id.slice(-6), panel.x + 10, panel.y + 14)
  ctx.font = '10px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(140,160,185,0.9)'
  const detail = worker.tool ? `${worker.tool}${worker.file ? ' · ' + worker.file : ''}` : worker.state
  ctx.fillText(String(detail).slice(0, 40), panel.x + 10, panel.y + 29)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(panel.x + panel.w - 14, panel.y + 14, 4, 0, Math.PI * 2)
  ctx.fill()
}

function spDrawPanel(panel, worker, now) {
  const ship = spShips.get(worker.id)
  rr(panel.x, panel.y, panel.w, panel.h, 10)
  ctx.fillStyle = 'rgba(9,12,24,0.92)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,150,200,0.16)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.save()
  rr(panel.x, panel.y, panel.w, panel.h, 10)
  ctx.clip()
  spDrawStars(panel)

  const activeZone = worker.state === 'idle' ? null : worker.zone
  for (const key of SP_PLANET_KEYS) spDrawPlanet(panel, key, now, key === activeZone)

  const target = spTargetFor(worker)
  const from = spBasePoint(panel)
  const to = { x: panel.x + panel.w * target.x, y: panel.y + panel.h * target.y }
  ctx.strokeStyle = 'rgba(90,140,200,0.16)'
  ctx.setLineDash([3, 6])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.setLineDash([])

  spDrawBase(panel, now)
  if (ship) spDrawShip(panel, worker, ship)
  ctx.restore()

  spDrawHeader(panel, worker)
}

function spaceDraw(now) {
  const list = visibleWorkers()
  if (spPanels.length !== Math.min(SP_MAX_PANELS, list.length)) spaceLayout()
  const gradient = ctx.createLinearGradient(0, 0, 0, H)
  gradient.addColorStop(0, '#05060f')
  gradient.addColorStop(1, '#02030a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)

  drawHud(now, { legend: false })
  drawSessionList()

  spPanels.forEach((panel, index) => {
    const worker = list[index]
    if (worker) spDrawPanel(panel, worker, now)
  })

  if (list.length > spPanels.length) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace'
    ctx.fillStyle = 'rgba(140,160,185,0.8)'
    ctx.fillText(`+${list.length - spPanels.length} more sessions`, W / 2, H - 4)
  }
}
