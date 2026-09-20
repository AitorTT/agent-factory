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
const SP_BASE = { x: 0.5, y: 0.8 }

let spPanel = { x: 0, y: 0, w: 0, h: 0 }
const spShips = new Map()

function spRand(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function spPlanetAngle(key) {
  const index = SP_PLANET_KEYS.indexOf(key)
  if (index < 0) return null
  const start = 198
  const span = 144
  return ((start + index * (span / (SP_PLANET_KEYS.length - 1))) * Math.PI) / 180
}

function spPlanetPoint(key) {
  const angle = spPlanetAngle(key)
  if (angle === null) return spBasePoint()
  return {
    x: spPanel.x + spPanel.w * (SP_BASE.x + Math.cos(angle) * 0.34),
    y: spPanel.y + spPanel.h * (SP_BASE.y + Math.sin(angle) * 0.32),
  }
}

function spBasePoint() {
  return { x: spPanel.x + spPanel.w * SP_BASE.x, y: spPanel.y + spPanel.h * SP_BASE.y }
}

function spKeyFor(worker) {
  if (worker.state === 'idle') return 'base'
  return SP_PLANET_KEYS.includes(worker.zone) ? worker.zone : 'base'
}

function spTargetFor(worker) {
  return spKeyFor(worker) === 'base' ? SP_BASE : (() => {
    const angle = spPlanetAngle(worker.zone)
    return { x: SP_BASE.x + Math.cos(angle) * 0.34, y: SP_BASE.y + Math.sin(angle) * 0.32 }
  })()
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

function spaceLayout() {
  spPanel = {
    x: heroRect.x + 1,
    y: heroRect.y + HERO_HEADER_H,
    w: Math.max(60, heroRect.w - 2),
    h: Math.max(60, heroRect.h - HERO_HEADER_H - 1),
  }
}

function spaceUpdate(dt, now) {
  const worker = focusedWorker()
  if (!worker) return
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
    if (ship.trail.length > 30) ship.trail.shift()
    if (dist < 0.012) {
      ship.mode = key === 'base' ? 'hold' : 'orbit'
      ship.orbit = ship.phase
    }
  } else if (ship.mode === 'hold') {
    ship.nx = anchor.x
    ship.ny = anchor.y
    ship.angle = -Math.PI / 2
  } else {
    const radius = Math.min(spPanel.w, spPanel.h) * 0.06 * 1.9
    ship.orbit += dt * 0.9
    ship.nx = anchor.x + Math.cos(ship.orbit) * (radius / spPanel.w)
    ship.ny = anchor.y + Math.sin(ship.orbit) * (radius / spPanel.h)
    ship.angle = ship.orbit + Math.PI / 2
  }

  for (const point of ship.trail) point.life -= dt * 1.6
  ship.trail = ship.trail.filter((point) => point.life > 0)
  void now
}

function spDrawStars() {
  const count = 120
  for (let i = 0; i < count; i += 1) {
    const seed = i * 13.7
    const nx = spRand(seed)
    const ny = spRand(seed + 1)
    const r = 0.5 + spRand(seed + 2) * 1.4
    const a = 0.12 + spRand(seed + 3) * 0.5
    ctx.fillStyle = `rgba(200,220,255,${a.toFixed(2)})`
    ctx.beginPath()
    ctx.arc(spPanel.x + nx * spPanel.w, spPanel.y + ny * spPanel.h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function spDrawBase(now) {
  const point = spBasePoint()
  const s = Math.max(10, Math.min(spPanel.w, spPanel.h) * 0.055)
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

  ctx.fillStyle = 'rgba(160,200,240,0.9)'
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('BASE', 0, s * 1.6)
  ctx.restore()
}

function spDrawPlanet(key, now, active) {
  const meta = SP_PLANET_META[key]
  const point = spPlanetPoint(key)
  const s = Math.max(8, Math.min(spPanel.w, spPanel.h) * 0.042)
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
  ctx.globalAlpha = 0.95
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

  ctx.fillStyle = active ? '#e6eef8' : 'rgba(190,210,235,0.8)'
  ctx.font = `${active ? '700 ' : '600 '}11px ui-monospace, Menlo, Consolas, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(meta.label, point.x, point.y - s * 1.6)
  ctx.restore()
}

function spDrawShip(worker, ship) {
  const point = { x: spPanel.x + spPanel.w * ship.nx, y: spPanel.y + spPanel.h * ship.ny }
  const s = Math.max(6, Math.min(spPanel.w, spPanel.h) * 0.028)
  const color = STATE_COLOR[worker.state] || STATE_COLOR.idle
  ctx.save()
  ctx.translate(point.x, point.y)

  for (const trail of ship.trail || []) {
    const alpha = Math.max(0, trail.life) * 0.4
    ctx.fillStyle = `rgba(120,190,255,${alpha.toFixed(2)})`
    ctx.beginPath()
    ctx.arc(spPanel.x + spPanel.w * trail.x - point.x, spPanel.y + spPanel.h * trail.y - point.y, s * 0.4 * trail.life, 0, Math.PI * 2)
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

function spaceDraw(now) {
  ctx.save()
  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.clip()
  const gradient = ctx.createLinearGradient(0, heroRect.y, 0, heroRect.y + heroRect.h)
  gradient.addColorStop(0, '#05070f')
  gradient.addColorStop(1, '#02030a')
  ctx.fillStyle = gradient
  ctx.fillRect(heroRect.x, heroRect.y, heroRect.w, heroRect.h)

  spDrawStars()
  const worker = focusedWorker()
  const activeZone = worker && worker.state !== 'idle' ? worker.zone : null
  for (const key of SP_PLANET_KEYS) spDrawPlanet(key, now, key === activeZone)

  if (worker) {
    const target = spTargetFor(worker)
    const from = spBasePoint()
    const to = spTargetFor(worker).x !== undefined
      ? { x: spPanel.x + spPanel.w * target.x, y: spPanel.y + spPanel.h * target.y }
      : from
    ctx.strokeStyle = 'rgba(90,140,200,0.18)'
    ctx.setLineDash([4, 8])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.setLineDash([])
    spDrawBase(now)
    spDrawShip(worker, spShips.get(worker.id))
  } else {
    spDrawBase(now)
  }
  ctx.restore()

  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}
