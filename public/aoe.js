const AOE_ZONES = {
  intake: { label: 'GATE', color: '#5aa9e6' },
  archive: { label: 'LIBRARY', color: '#9b8cff' },
  dock: { label: 'MARKET', color: '#4dd0e1' },
  workbench: { label: 'WORKSHOP', color: '#58d68d' },
  supervisor: { label: 'KEEP', color: '#e26fd4' },
  machineshop: { label: 'MILL', color: '#f5a623' },
  repair: { label: 'BARRACKS', color: '#e74c3c' },
}
const AOE_CENTER = { tx: 6, ty: 6 }
const AOE_BUILD_RATE = 0.12
const AOE_TREES = [[1, 1], [2, 11], [11, 2], [12, 11], [3, 1], [11, 6], [1, 8], [8, 12], [4, 12], [12, 8]]

const AOE_SHAPES = {
  town: [
    { dx: -0.55, dy: -0.55, tiles: 1.15, h: 20, c: 0.05 },
    { dx: 0.55, dy: 0.55, tiles: 1.15, h: 20, c: 0.05 },
    { dx: 0, dy: 0, tiles: 1.5, h: 14, c: 0.16 },
  ],
  intake: [
    { dx: -0.5, dy: 0, tiles: 0.5, h: 22, c: 0 },
    { dx: 0.5, dy: 0, tiles: 0.5, h: 22, c: 0 },
    { dx: 0, dy: 0, tiles: 1.1, h: 6, c: 0.18, base: 22 },
  ],
  archive: [
    { dx: -0.35, dy: -0.3, tiles: 1.2, h: 16, c: 0 },
    { dx: 0.4, dy: 0.35, tiles: 1.0, h: 26, c: -0.08 },
    { dx: 0.4, dy: 0.35, tiles: 0.6, h: 6, c: 0.2, base: 26 },
  ],
  dock: [
    { dx: -0.5, dy: -0.4, tiles: 0.8, h: 9, c: 0.05 },
    { dx: 0.5, dy: -0.2, tiles: 0.8, h: 9, c: -0.05 },
    { dx: -0.1, dy: 0.55, tiles: 0.9, h: 12, c: 0.12 },
  ],
  workbench: [
    { dx: 0, dy: 0, tiles: 1.3, h: 13, c: 0 },
    { dx: 0.35, dy: 0.35, tiles: 0.45, h: 8, c: 0.2, base: 13 },
  ],
  supervisor: [
    { dx: 0, dy: 0, tiles: 1.05, h: 34, c: 0 },
    { dx: 0, dy: 0, tiles: 1.5, h: 5, c: 0.22, base: 34 },
  ],
  machineshop: [
    { dx: -0.35, dy: 0, tiles: 1.15, h: 16, c: 0 },
    { dx: 0.5, dy: -0.35, tiles: 0.35, h: 30, c: 0.1 },
    { dx: 0.3, dy: 0.5, tiles: 0.7, h: 9, c: -0.06 },
  ],
  repair: [
    { dx: 0, dy: 0, tiles: 1.25, h: 14, c: 0 },
    { dx: 0, dy: 0, tiles: 0.7, h: 8, c: 0.18, base: 14 },
  ],
}

const aoePlots = new Map()
const aoeVillages = new Map()
let aoeVillage = null
let aoeSessionId = null

function aoeInitPlots() {
  if (aoePlots.size) return
  aoePlots.set('town', { tx: AOE_CENTER.tx, ty: AOE_CENTER.ty, key: 'town' })
  const keys = Object.keys(AOE_ZONES)
  keys.forEach((key, index) => {
    const angle = (index / keys.length) * Math.PI * 2 - Math.PI / 2
    aoePlots.set(key, {
      tx: Math.round(AOE_CENTER.tx + Math.cos(angle) * 4),
      ty: Math.round(AOE_CENTER.ty + Math.sin(angle) * 4),
      key,
    })
  })
}

function aoeNewVillage(seed) {
  const plots = {}
  for (const key of Object.keys(AOE_ZONES)) plots[key] = 0
  const villagers = []
  for (let i = 0; i < 6; i += 1) {
    villagers.push({
      tx: AOE_CENTER.tx + (aoeRand(seed + i * 3.7) - 0.5) * 1.6,
      ty: AOE_CENTER.ty + (aoeRand(seed + i * 5.1) - 0.5) * 1.6,
      ttx: AOE_CENTER.tx,
      tty: AOE_CENTER.ty,
      phase: aoeRand(seed + i * 9.3) * 6.28,
      cooldown: 0,
    })
  }
  return { plots, villagers, complete: 0 }
}

function aoeRand(seed) {
  const value = Math.sin(seed * 91.7 + 41.3) * 43758.5453
  return value - Math.floor(value)
}

function aoePlotPoint(plot) {
  return iso(plot.tx, plot.ty)
}

function aoeUpdate(dt, now) {
  aoeInitPlots()
  const worker = focusedWorker()
  if (!worker) return
  if (worker.id !== aoeSessionId) {
    aoeSessionId = worker.id
    if (!aoeVillages.has(worker.id)) aoeVillages.set(worker.id, aoeNewVillage(hash(worker.id) * 1000 + 7))
    aoeVillage = aoeVillages.get(worker.id)
  }
  if (!aoeVillage) return

  const activeKey = worker.state !== 'idle' && aoePlots.has(worker.zone) ? worker.zone : 'town'
  if (worker.state === 'working' && aoePlots.has(worker.zone)) {
    aoeVillage.plots[worker.zone] = Math.min(1, aoeVillage.plots[worker.zone] + AOE_BUILD_RATE * dt)
  }

  const total = Object.values(aoeVillage.plots).reduce((sum, value) => sum + value, 0)
  aoeVillage.complete = total / Object.keys(AOE_ZONES).length

  const plot = aoePlots.get(activeKey) || aoePlots.get('town')
  const working = worker.state === 'working' && activeKey !== 'town'
  for (const villager of aoeVillage.villagers) {
    villager.cooldown -= dt
    if (working) {
      villager.ttx = plot.tx + (aoeRand(villager.phase * 13.1) - 0.5) * 2.2
      villager.tty = plot.ty + (aoeRand(villager.phase * 7.7 + 3) - 0.5) * 2.2
    } else if (villager.cooldown <= 0) {
      villager.ttx = AOE_CENTER.tx + (aoeRand(now * 0.001 + villager.phase * 3.3) - 0.5) * 5
      villager.tty = AOE_CENTER.ty + (aoeRand(now * 0.0013 + villager.phase * 5.9) - 0.5) * 5
      villager.cooldown = 1.6 + aoeRand(now * 0.0007 + villager.phase) * 2.6
    }
    const dx = villager.ttx - villager.tx
    const dy = villager.tty - villager.ty
    const dist = Math.hypot(dx, dy)
    if (dist > 0.08) {
      const step = Math.min(dist, dt * 1.7)
      villager.tx += (dx / dist) * step
      villager.ty += (dy / dist) * step
      villager.moving = true
      villager.dir = Math.atan2(dy, dx)
    } else {
      villager.moving = false
    }
  }
}

function aoeDrawPlot(plot, progress, now) {
  const color = plot.key === 'town' ? '#d8c39a' : AOE_ZONES[plot.key].color
  const base = diamond(aoePlotPoint(plot), TW / 2 - 4, TH / 2 - 4)
  ctx.fillStyle = plot.key === 'town' ? 'rgba(216,195,154,0.22)' : color + '22'
  ctx.fill()
  ctx.strokeStyle = color + '66'
  ctx.lineWidth = 1
  ctx.stroke()
  void base

  if (progress <= 0.001) {
    const p = toScreen(aoePlotPoint(plot))
    ctx.strokeStyle = 'rgba(200,215,235,0.35)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.rect(p.x - 9 * scale, p.y - 6 * scale, 18 * scale, 12 * scale)
    ctx.stroke()
    ctx.setLineDash([])
    return
  }

  const shape = AOE_SHAPES[plot.key] || AOE_SHAPES.workbench
  const rise = plot.key === 'town' ? 1 : Math.max(0.12, progress)
  for (const part of shape) {
    isoBox(plot.tx + part.dx, plot.ty + part.dy, part.tiles, part.h * rise, shade(color, part.c), (part.base || 0) * rise)
  }

  if (plot.key !== 'town' && progress < 0.98) {
    const p = toScreen(aoePlotPoint(plot))
    const top = p.y - 40 * scale
    ctx.strokeStyle = 'rgba(214,190,140,0.75)'
    ctx.lineWidth = 1.4
    for (const dx of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(p.x + dx * 16 * scale, p.y)
      ctx.lineTo(p.x + dx * 16 * scale, top)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(p.x - 16 * scale, top + 8 * scale)
    ctx.lineTo(p.x + 16 * scale, top + 8 * scale)
    ctx.moveTo(p.x - 16 * scale, top + 20 * scale)
    ctx.lineTo(p.x + 16 * scale, top + 20 * scale)
    ctx.stroke()
    ctx.fillStyle = `rgba(255,220,150,${(0.25 + 0.2 * Math.sin(now / 240)).toFixed(2)})`
    ctx.beginPath()
    ctx.arc(p.x + 18 * scale, p.y - 4 * scale, 4 * scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

function aoeDrawVillager(villager, now, working) {
  const point = toScreen(iso(villager.tx, villager.ty))
  const s = Math.max(0.8, Math.min(2.2, scale)) * 0.6
  const bob = villager.moving ? Math.sin(now / 90 + villager.phase) * 2 * s : Math.sin(now / 700 + villager.phase) * 0.8 * s

  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(point.x, point.y, 7 * s, 3 * s, 0, 0, Math.PI * 2)
  ctx.fill()

  const bodyH = 12 * s
  ctx.fillStyle = '#c0aa86'
  rr(point.x - 4.5 * s, point.y - bodyH + bob, 9 * s, bodyH, 3 * s)
  ctx.fill()
  ctx.fillStyle = '#8f6f4c'
  rr(point.x - 4.5 * s, point.y - bodyH * 0.5 + bob, 9 * s, bodyH * 0.5, 2.5 * s)
  ctx.fill()

  const headY = point.y - bodyH - 3 * s + bob
  ctx.fillStyle = '#e8c9a0'
  ctx.beginPath()
  ctx.arc(point.x, headY, 3.6 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6b4f33'
  ctx.beginPath()
  ctx.arc(point.x, headY - 1.6 * s, 3.7 * s, Math.PI, 0)
  ctx.fill()

  if (working) {
    const swing = Math.sin(now / 150 + villager.phase)
    ctx.strokeStyle = '#d8d2c4'
    ctx.lineWidth = 1.6 * s
    ctx.beginPath()
    ctx.moveTo(point.x + 3 * s, point.y - bodyH * 0.8 + bob)
    ctx.lineTo(point.x + (7 + swing * 2) * s, point.y - (bodyH * 1.1 + swing * 3) * s + bob)
    ctx.stroke()
    ctx.fillStyle = '#7d7f86'
    rr(point.x + (6 + swing * 2) * s, point.y - (bodyH * 1.2 + swing * 3) * s + bob, 4 * s, 3 * s, 1)
    ctx.fill()
    if (Math.floor(now / 240 + villager.phase) % 4 === 0) {
      ctx.fillStyle = 'rgba(255,230,170,0.7)'
      ctx.beginPath()
      ctx.arc(point.x + (7 + swing * 2) * s, point.y - (bodyH * 1.25 + swing * 3) * s + bob, 1.6 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function aoeDrawGrass() {
  for (let tx = 0; tx <= N; tx += 1) {
    for (let ty = 0; ty <= N; ty += 1) {
      const d = diamond(iso(tx, ty), TW / 2, TH / 2)
      const tint = (tx + ty) % 2 ? '#1d2a1c' : '#22301f'
      ctx.fillStyle = tint
      ctx.fill()
      ctx.strokeStyle = 'rgba(120,160,120,0.05)'
      ctx.lineWidth = 1
      ctx.stroke()
      void d
    }
  }
}

function aoeDrawTree(tx, ty) {
  const p = toScreen(iso(tx, ty))
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(p.x, p.y, 8 * scale, 3.5 * scale, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5a4326'
  ctx.fillRect(p.x - 2 * scale, p.y - 10 * scale, 4 * scale, 10 * scale)
  ctx.fillStyle = '#2f5d33'
  ctx.beginPath()
  ctx.arc(p.x, p.y - 16 * scale, 8 * scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3d7440'
  ctx.beginPath()
  ctx.arc(p.x - 3 * scale, p.y - 19 * scale, 5 * scale, 0, Math.PI * 2)
  ctx.fill()
}

function aoeDraw(now) {
  const worker = focusedWorker()
  if (!worker) return
  layout()
  aoeInitPlots()
  if (!aoeVillage) aoeUpdate(0, now)

  ctx.save()
  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.clip()
  const sky = ctx.createLinearGradient(0, heroRect.y, 0, heroRect.y + heroRect.h)
  sky.addColorStop(0, '#0e1622')
  sky.addColorStop(1, '#080b10')
  ctx.fillStyle = sky
  ctx.fillRect(heroRect.x, heroRect.y, heroRect.w, heroRect.h)
  aoeDrawGrass()

  for (const [tx, ty] of AOE_TREES) {
    if (tx > N || ty > N) continue
    aoeDrawTree(tx, ty)
  }

  const activeKey = worker.state !== 'idle' && aoePlots.has(worker.zone) ? worker.zone : 'town'
  const ordered = [...aoePlots.values()].sort((a, b) => a.tx + a.ty - (b.tx + b.ty))
  for (const plot of ordered) {
    const progress = plot.key === 'town' ? 1 : aoeVillage.plots[plot.key]
    aoeDrawPlot(plot, progress, now)
  }

  const p = toScreen(iso(AOE_CENTER.tx, AOE_CENTER.ty))
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#e8d9b8'
  ctx.fillText('TOWN CENTRE', p.x, p.y - 44 * scale)

  if (activeKey !== 'town') {
    const plot = aoePlots.get(activeKey)
    const label = toScreen(iso(plot.tx, plot.ty))
    ctx.fillStyle = AOE_ZONES[activeKey].color
    ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(AOE_ZONES[activeKey].label, label.x, label.y - 46 * scale)
  }

  const working = worker.state === 'working' && activeKey !== 'town'
  for (const villager of aoeVillage.villagers) aoeDrawVillager(villager, now, working && !villager.moving)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillStyle = 'rgba(190,210,235,0.8)'
  ctx.fillText(`VILLAGE ${Math.round(aoeVillage.complete * 100)}%`, heroRect.x + 14, heroRect.y + HERO_HEADER_H + 8)
  ctx.restore()

  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}
