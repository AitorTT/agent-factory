const SOL_LABELS = {
  breakroom: 'ENCAMPMENT',
  intake: 'GATEWAY',
  archive: 'ARCHIVE',
  dock: 'DOCKS',
  workbench: 'FORGE',
  supervisor: 'COMMAND',
  machineshop: 'FOUNDRY',
  repair: 'REPAIR',
}
const SOL_COLORS = {
  breakroom: '#7f8c8d',
  intake: '#5aa9e6',
  archive: '#9b8cff',
  dock: '#4dd0e1',
  workbench: '#58d68d',
  supervisor: '#e26fd4',
  machineshop: '#f5a623',
  repair: '#e74c3c',
}
const SOL_UNITS = [
  { offset: 40, phase: 0.4, kind: 'sword' },
  { offset: 18, phase: 1.9, kind: 'sword' },
  { offset: -12, phase: 3.4, kind: 'bow' },
  { offset: -38, phase: 5.2, kind: 'bow' },
]
const SOL_SLIME_TINTS = ['#6fbf73', '#7aa7e0', '#c58ad8', '#e0b05a', '#e07a7a']
const SOL_ENGAGE_RANGE = 235
const SOL_MARCH_SPEED = 34

let solArea = { x: 0, y: 0, w: 0, h: 0 }
let solSeed = 0
let solId = null
let solDistance = 0
let solVelocity = 0
let solBoundaries = []
let solZone = 'breakroom'
let solState = 'idle'
let solSlimes = []
let solArrows = []
let solSlashes = []
let solParticles = []
let solSpawnCounter = 0
let solKills = 0
let solSwordTimer = 0
let solBowTimer = 0
let solCombat = false

function solHash(value, seed = 0) {
  const out = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453
  return out - Math.floor(out)
}

function solNoise(x, seed) {
  const i = Math.floor(x)
  const f = x - i
  const a = solHash(i, seed)
  const b = solHash(i + 1, seed)
  const t = f * f * (3 - 2 * f)
  return a + (b - a) * t
}

function solHeight(worldX) {
  return solNoise(worldX * 0.006, solSeed) * 1 + solNoise(worldX * 0.021, solSeed + 9) * 0.42 + solNoise(worldX * 0.07, solSeed + 21) * 0.16
}

function solSurface(worldX) {
  const amp = Math.min(solArea.h * 0.3, 150)
  return solArea.y + solArea.h * 0.68 - solHeight(worldX) * amp * 0.55
}

function solBiomeAt(worldX) {
  let key = solBoundaries.length ? solBoundaries[0].key : solZone
  for (const boundary of solBoundaries) {
    if (boundary.dist <= worldX) key = boundary.key
    else break
  }
  return key
}

function solToScreen(worldX) {
  return solArea.x + (worldX - solDistance)
}

function solLayout() {
  solArea = {
    x: heroRect.x + 1,
    y: heroRect.y + HERO_HEADER_H,
    w: Math.max(80, heroRect.w - 2),
    h: Math.max(60, heroRect.h - HERO_HEADER_H - 1),
  }
  const focus = focusedWorker()
  if (focus && focus.id !== solId) {
    solId = focus.id
    solSeed = hash(focus.id) * 1000
    solDistance = 0
    solVelocity = 0
    solZone = focus.zone || 'breakroom'
    solBoundaries = [{ dist: -100000, key: solZone }]
    solSlimes = []
    solArrows = []
    solSlashes = []
    solParticles = []
    solSpawnCounter = 0
  }
}

function solSpawnSlime() {
  solSpawnCounter += 1
  const seed = solSeed + solSpawnCounter * 17.3
  const slime = {
    id: solSpawnCounter,
    x: solDistance + solArea.w * 0.42 + SOL_ENGAGE_RANGE + 60 + solHash(seed) * 320,
    size: 18 + solHash(seed + 1) * 13,
    hp: 4,
    maxHp: 4,
    tint: SOL_SLIME_TINTS[Math.floor(solHash(seed + 2) * SOL_SLIME_TINTS.length)],
    phase: solHash(seed + 3) * 6.28,
    squash: 0,
    hit: 0,
  }
  solSlimes.push(slime)
  return slime
}

function solDamage(slime, amount, now) {
  if (slime.squash) return
  slime.hp -= amount
  slime.hit = 0.16
  solSlashes.push({ x: slime.x, t: 0 })
  for (let i = 0; i < 4; i += 1) {
    solParticles.push({
      x: slime.x,
      y: solSurface(slime.x) - slime.size,
      vx: (solHash(solSpawnCounter + i * 3.1, solSeed) - 0.5) * 90,
      vy: -60 - solHash(i * 7.7, solSeed + 3) * 70,
      life: 0.6,
      tint: slime.tint,
    })
  }
  if (slime.hp <= 0) {
    slime.squash = 0.001
    solKills += 1
  }
  void now
}

function soldierUpdate(dt, now) {
  solLayout()
  const worker = focusedWorker()
  if (!worker) return

  solState = worker.state
  const wanting = worker.state === 'working'
  const squadX = solDistance + solArea.w * 0.42

  let engaged = null
  for (const slime of solSlimes) {
    if (slime.squash) continue
    const gap = slime.x - squadX
    if (gap > -70 && gap < SOL_ENGAGE_RANGE && (!engaged || slime.x < engaged.x)) engaged = slime
  }

  const target = wanting && !engaged ? SOL_MARCH_SPEED : 0
  solVelocity += (target - solVelocity) * Math.min(1, dt * 2.4)
  solDistance += solVelocity * dt

  if (worker.zone !== solZone) {
    solZone = worker.zone
    if (!solBoundaries.length || solDistance - solBoundaries[solBoundaries.length - 1].dist > 90) {
      solBoundaries.push({ dist: solDistance, key: solZone })
      if (solBoundaries.length > 40) solBoundaries.splice(1, 1)
    } else {
      solBoundaries[solBoundaries.length - 1] = { dist: solDistance, key: solZone }
    }
  }

  if (wanting) {
    const alive = solSlimes.filter((slime) => !slime.squash && slime.x > squadX - 40).length
    if (alive < (engaged ? 1 : 2)) solSpawnSlime()
  }

  solCombat = Boolean(engaged && wanting)
  solSwordTimer -= dt
  solBowTimer -= dt
  if (solCombat && engaged) {
    if (solSwordTimer <= 0) {
      solDamage(engaged, 2, now)
      solSwordTimer = 0.5
    }
    if (solBowTimer <= 0 && solArrows.length < 4) {
      const fromX = solDistance + solArea.w * 0.42 - 12
      solArrows.push({ fromX, toX: engaged.x, x: fromX, t: 0, duration: 0.42, arc: 46, targetId: engaged.id })
      solBowTimer = 0.8
    }
  } else {
    solSwordTimer = Math.min(solSwordTimer, 0.2)
    solBowTimer = Math.min(solBowTimer, 0.3)
  }

  for (const slime of solSlimes) {
    if (slime.squash) slime.squash += dt
    if (slime.hit > 0) slime.hit -= dt
  }

  for (const arrow of solArrows) {
    arrow.t += dt / arrow.duration
    arrow.x = arrow.fromX + (arrow.toX - arrow.fromX) * arrow.t
    if (arrow.t >= 1) {
      const hit = solSlimes.find((slime) => slime.id === arrow.targetId && !slime.squash)
      if (hit) solDamage(hit, 1, now)
      arrow.done = true
    }
  }
  solArrows = solArrows.filter((arrow) => !arrow.done)
  solSlimes = solSlimes.filter((slime) => (!slime.squash || slime.squash < 0.4) && slime.x > solDistance - 300)

  for (const slash of solSlashes) slash.t += dt * 3.4
  solSlashes = solSlashes.filter((slash) => slash.t < 1)

  for (const particle of solParticles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vy += 260 * dt
    particle.life -= dt
  }
  solParticles = solParticles.filter((particle) => particle.life > 0)
  void now
}

function solDrawLayers(referenceX, offset, baseY, color, step, drift) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(solArea.x, solArea.y + solArea.h)
  for (let x = -10; x <= solArea.w + 10; x += step) {
    const worldX = referenceX * offset + x
    const y = baseY - (solNoise(worldX * 0.004, solSeed + drift) * 0.7 + solNoise(worldX * 0.013, solSeed + drift + 5) * 0.3) * solArea.h * 0.24
    ctx.lineTo(solArea.x + x, y)
  }
  ctx.lineTo(solArea.x + solArea.w + 10, solArea.y + solArea.h)
  ctx.closePath()
  ctx.fill()
}

function solDrawGround(referenceX) {
  ctx.save()
  rr(solArea.x, solArea.y, solArea.w, solArea.h, 10)
  ctx.clip()

  const sky = ctx.createLinearGradient(0, solArea.y, 0, solArea.y + solArea.h)
  sky.addColorStop(0, shade(SOL_COLORS[solZone] || '#5a6b7a', -0.76))
  sky.addColorStop(0.5, shade(SOL_COLORS[solZone] || '#5a6b7a', -0.86))
  sky.addColorStop(1, '#07080d')
  ctx.fillStyle = sky
  ctx.fillRect(solArea.x, solArea.y, solArea.w, solArea.h)

  solDrawLayers(referenceX, 0.22, solArea.y + solArea.h * 0.62, shade(SOL_COLORS[solZone] || '#5a6b7a', -0.88), 18, 31)
  solDrawLayers(referenceX, 0.45, solArea.y + solArea.h * 0.66, shade(SOL_COLORS[solZone] || '#5a6b7a', -0.92), 14, 17)

  ctx.fillStyle = '#211d15'
  ctx.beginPath()
  ctx.moveTo(solArea.x - 10, solArea.y + solArea.h)
  for (let x = -10; x <= solArea.w + 10; x += 5) {
    ctx.lineTo(solArea.x + x, solSurface(referenceX + x))
  }
  ctx.lineTo(solArea.x + solArea.w + 10, solArea.y + solArea.h)
  ctx.closePath()
  ctx.fill()

  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let x = -10; x <= solArea.w + 10; x += 5) {
    const worldX = referenceX + x
    const key = solBiomeAt(worldX)
    ctx.strokeStyle = shade(SOL_COLORS[key] || '#5a6b7a', -0.3)
    ctx.beginPath()
    ctx.moveTo(solArea.x + x, solSurface(worldX))
    ctx.lineTo(solArea.x + x + 6, solSurface(worldX + 6))
    ctx.stroke()
  }

  ctx.lineWidth = 2
  for (let x = -10; x <= solArea.w + 10; x += 8) {
    const worldX = referenceX + x
    const key = solBiomeAt(worldX)
    ctx.strokeStyle = shade(SOL_COLORS[key] || '#5a6b7a', 0.1)
    ctx.beginPath()
    ctx.moveTo(solArea.x + x, solSurface(worldX))
    ctx.lineTo(solArea.x + x + 9, solSurface(worldX + 9))
    ctx.stroke()
  }

  for (const boundary of solBoundaries) {
    const sx = solToScreen(boundary.dist)
    if (sx < solArea.x + 12 || sx > solArea.x + solArea.w - 12) continue
    const y = solSurface(boundary.dist)
    ctx.strokeStyle = 'rgba(20,24,32,0.9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(sx, y)
    ctx.lineTo(sx, y - 34)
    ctx.stroke()
    const color = SOL_COLORS[boundary.key] || '#8899aa'
    rr(sx - 34, y - 50, 68, 17, 4)
    ctx.fillStyle = 'rgba(10,13,20,0.88)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = '600 9px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(SOL_LABELS[boundary.key] || boundary.key, sx, y - 41)
  }

  for (let x = -10; x <= solArea.w + 10; x += 52) {
    const worldX = referenceX + x
    const r = solHash(Math.floor(worldX / 52), solSeed + 5)
    if (r < 0.6) continue
    const y = solSurface(worldX)
    ctx.fillStyle = 'rgba(90,86,74,0.55)'
    ctx.beginPath()
    ctx.ellipse(solArea.x + x, y + 2, 5 + r * 5, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function solDrawSlime(slime, now, engaged) {
  const sx = solToScreen(slime.x)
  if (sx < solArea.x - 70 || sx > solArea.x + solArea.w + 70) return
  const groundY = solSurface(slime.x)
  const dying = slime.squash
  const squash = dying ? Math.min(1, dying / 0.4) : 0
  const wobble = 1 + Math.sin(now / 240 + slime.phase) * 0.07
  const rx = slime.size * (1 + squash * 0.85) * wobble
  const ry = slime.size * 0.86 * (1 - squash * 0.82)
  const cy = groundY - ry * 0.8
  const outline = shade(slime.tint, -0.42)
  const shaded = shade(slime.tint, -0.2)
  const lit = shade(slime.tint, 0.18)

  ctx.save()
  ctx.globalAlpha = dying ? Math.max(0, 1 - squash) : 1

  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.beginPath()
  ctx.ellipse(sx, groundY + 1, rx * 0.9, ry * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(sx - rx, groundY - ry * 0.15)
  ctx.quadraticCurveTo(sx - rx * 1.12, cy - ry * 0.5, sx - rx * 0.55, cy - ry)
  ctx.quadraticCurveTo(sx, cy - ry * 1.24, sx + rx * 0.55, cy - ry)
  ctx.quadraticCurveTo(sx + rx * 1.12, cy - ry * 0.5, sx + rx, groundY - ry * 0.15)
  ctx.quadraticCurveTo(sx + rx * 0.6, groundY + ry * 0.3, sx + rx * 0.28, groundY - ry * 0.02)
  ctx.quadraticCurveTo(sx, groundY + ry * 0.34, sx - rx * 0.3, groundY - ry * 0.02)
  ctx.quadraticCurveTo(sx - rx * 0.62, groundY + ry * 0.28, sx - rx, groundY - ry * 0.15)
  ctx.closePath()
  ctx.fillStyle = slime.hit > 0 ? '#ffe9a8' : slime.tint
  ctx.fill()
  ctx.strokeStyle = outline
  ctx.lineWidth = Math.max(1.5, rx * 0.09)
  ctx.stroke()

  ctx.fillStyle = shaded
  ctx.beginPath()
  ctx.ellipse(sx, groundY - ry * 0.22, rx * 0.86, ry * 0.3, 0, 0, Math.PI)
  ctx.fill()

  ctx.fillStyle = lit
  ctx.beginPath()
  ctx.ellipse(sx + rx * 0.34, cy - ry * 0.62, rx * 0.24, ry * 0.2, -0.5, 0, Math.PI * 2)
  ctx.fill()

  for (const [ox, h] of [[-0.42, 0.5], [-0.05, 0.66], [0.35, 0.46]]) {
    const bx = sx + rx * ox
    const by = cy - ry * 0.92
    ctx.fillStyle = outline
    ctx.beginPath()
    ctx.moveTo(bx - rx * 0.13, by + ry * 0.1)
    ctx.lineTo(bx, by - ry * h)
    ctx.lineTo(bx + rx * 0.13, by + ry * 0.1)
    ctx.closePath()
    ctx.fill()
  }

  const facing = -1
  const eyeY = cy - ry * 0.38
  const eyeR = Math.max(2, rx * 0.15)
  const eyeColor = solState === 'error' ? '#ff5252' : '#1d1418'
  const brows = [
    { ox: 0.2, flip: false },
    { ox: 0.62, flip: true },
  ]
  for (const brow of brows) {
    const ex = sx + facing * rx * brow.ox
    ctx.fillStyle = eyeColor
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, eyeR * 0.86, eyeR, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.beginPath()
    ctx.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.34, eyeR * 0.26, 0, Math.PI * 2)
    ctx.fill()

    const high = eyeY - ry * 0.3
    const low = eyeY - ry * 0.13
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(2, rx * 0.1)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ex - facing * rx * 0.17, brow.flip ? low : high)
    ctx.lineTo(ex + facing * rx * 0.17, brow.flip ? high : low)
    ctx.stroke()
  }

  const stretch = 1 + Math.sin(now / 380 + slime.phase) * 0.14
  const mouthY = cy + ry * 0.14
  const mouthLeft = sx - rx * 0.64 * stretch
  const mouthRight = sx - rx * 0.08
  ctx.strokeStyle = eyeColor
  ctx.lineWidth = Math.max(2, rx * 0.11)
  ctx.beginPath()
  ctx.moveTo(mouthLeft, mouthY + ry * 0.06)
  ctx.quadraticCurveTo((mouthLeft + mouthRight) / 2, mouthY - ry * 0.3, mouthRight, mouthY + ry * 0.06)
  ctx.stroke()

  if (!dying && slime.hp < slime.maxHp) {
    const w = rx * 1.5
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(sx - w / 2, cy - ry * 1.35, w, 3.5)
    ctx.fillStyle = '#e0574f'
    ctx.fillRect(sx - w / 2, cy - ry * 1.35, w * (slime.hp / slime.maxHp), 3.5)
  }
  void engaged
  ctx.restore()
}

function solDrawSword(handX, handY, angle, size, attacking) {
  ctx.save()
  ctx.translate(handX, handY)
  ctx.rotate(angle)

  ctx.strokeStyle = '#4a3826'
  ctx.lineWidth = Math.max(2, size * 0.14)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-size * 0.26, 0)
  ctx.lineTo(-size * 0.02, 0)
  ctx.stroke()

  ctx.fillStyle = '#c9a45c'
  ctx.beginPath()
  ctx.arc(-size * 0.3, 0, size * 0.075, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#aeb8c4'
  ctx.lineWidth = Math.max(2, size * 0.11)
  ctx.beginPath()
  ctx.moveTo(0, -size * 0.17)
  ctx.lineTo(0, size * 0.17)
  ctx.stroke()

  const len = size * 1.2
  ctx.beginPath()
  ctx.moveTo(size * 0.02, -size * 0.085)
  ctx.lineTo(len * 0.8, -size * 0.055)
  ctx.lineTo(len, 0)
  ctx.lineTo(len * 0.8, size * 0.055)
  ctx.lineTo(size * 0.02, size * 0.085)
  ctx.closePath()
  const blade = ctx.createLinearGradient(0, -size * 0.09, 0, size * 0.09)
  blade.addColorStop(0, '#f2f6fb')
  blade.addColorStop(0.5, '#cdd6e0')
  blade.addColorStop(1, '#9aa6b5')
  ctx.fillStyle = blade
  ctx.fill()
  ctx.strokeStyle = 'rgba(50,60,75,0.85)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = Math.max(1, size * 0.028)
  ctx.beginPath()
  ctx.moveTo(size * 0.1, -size * 0.02)
  ctx.lineTo(len * 0.86, -size * 0.012)
  ctx.stroke()

  if (attacking) {
    ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.35 * Math.abs(Math.sin(angle * 3))).toFixed(2)})`
    ctx.lineWidth = Math.max(1, size * 0.03)
    ctx.beginPath()
    ctx.moveTo(size * 0.1, size * 0.03)
    ctx.lineTo(len * 0.9, size * 0.02)
    ctx.stroke()
  }
  ctx.restore()
}

function solDrawShield(cx, y, size, raised) {
  const sx = cx - size * 0.46
  const sy = y - size * (raised ? 0.68 : 0.56)
  const w = size * 0.46
  const h = size * 0.66

  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate(raised ? -0.12 : 0.06)

  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  ctx.quadraticCurveTo(w / 2, h * 0.16, 0, h / 2)
  ctx.quadraticCurveTo(-w / 2, h * 0.16, -w / 2, -h / 2)
  ctx.closePath()
  const fill = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
  fill.addColorStop(0, '#8d99a8')
  fill.addColorStop(0.5, '#c3ccd8')
  fill.addColorStop(1, '#7d8896')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = '#5a6572'
  ctx.lineWidth = Math.max(1.4, size * 0.06)
  ctx.stroke()

  ctx.fillStyle = '#3f6fa8'
  ctx.fillRect(-w * 0.1, -h / 2, w * 0.2, h * 0.78)

  ctx.fillStyle = '#e0c060'
  ctx.beginPath()
  ctx.arc(0, -h * 0.08, Math.max(1.6, size * 0.09), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function solDrawSoldier(cx, groundY, size, walking, attacking, kind, now, phase) {
  const bob = walking ? Math.sin(now / 70 + phase) * size * 0.08 : Math.sin(now / 800 + phase) * size * 0.02
  const y = groundY + bob

  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(cx, groundY + 1, size * 0.55, size * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()

  const lean = attacking ? 0.13 + Math.sin(now / 90 + phase) * 0.05 : 0
  ctx.save()
  ctx.translate(cx, groundY)
  ctx.rotate(lean)
  ctx.translate(-cx, -groundY)

  ctx.strokeStyle = '#4a5568'
  ctx.lineWidth = Math.max(1.6, size * 0.15)
  ctx.lineCap = 'round'
  const stride = walking ? Math.sin(now / 80 + phase) : 0
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx, y - size * 0.26)
    ctx.lineTo(cx + side * stride * size * 0.34, groundY)
    ctx.stroke()
  }

  if (kind === 'sword') solDrawShield(cx, y, size, attacking)

  ctx.fillStyle = '#8b98a8'
  rr(cx - size * 0.3, y - size * 0.78, size * 0.6, size * 0.54, size * 0.18)
  ctx.fill()
  ctx.fillStyle = '#5f6b7c'
  rr(cx - size * 0.32, y - size * 0.52, size * 0.64, size * 0.2, size * 0.1)
  ctx.fill()

  const headY = y - size * 0.92
  ctx.fillStyle = '#e0c39c'
  ctx.beginPath()
  ctx.arc(cx, headY, size * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9aa6b5'
  ctx.beginPath()
  ctx.arc(cx, headY - size * 0.05, size * 0.24, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#7d8896'
  rr(cx - size * 0.26, headY - size * 0.16, size * 0.52, size * 0.12, size * 0.05)
  ctx.fill()

  if (kind === 'bow') {
    ctx.strokeStyle = '#c9a06a'
    ctx.lineWidth = Math.max(1.3, size * 0.11)
    ctx.beginPath()
    ctx.arc(cx + size * 0.34, y - size * 0.6, size * 0.36, -1.3, 1.3)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(230,238,248,0.7)'
    ctx.lineWidth = 1
    const pull = attacking ? size * 0.22 : 0
    ctx.beginPath()
    ctx.moveTo(cx + size * 0.34 + Math.cos(-1.3) * size * 0.36, y - size * 0.6 + Math.sin(-1.3) * size * 0.36)
    ctx.lineTo(cx + size * 0.34 - pull, y - size * 0.6)
    ctx.lineTo(cx + size * 0.34 + Math.cos(1.3) * size * 0.36, y - size * 0.6 + Math.sin(1.3) * size * 0.36)
    ctx.stroke()
  } else {
    const swing = attacking ? -1.15 + (Math.sin(now / 90 + phase) * 0.5 + 0.5) * 2.3 : -0.6
    const shoulderX = cx + size * 0.18
    const shoulderY = y - size * 0.62
    const handX = shoulderX + Math.cos(swing) * size * 0.46
    const handY = shoulderY + Math.sin(swing) * size * 0.46

    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = Math.max(1.6, size * 0.14)
    ctx.beginPath()
    ctx.moveTo(shoulderX, shoulderY)
    ctx.lineTo(handX, handY)
    ctx.stroke()

    solDrawSword(handX, handY, swing, size, attacking)

    if (attacking) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(cx + size * 0.6, y - size * 0.62, size * 0.85, swing - 0.7, swing + 1.2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function solDrawCombat(now) {
  for (const arrow of solArrows) {
    const sx = solToScreen(arrow.x)
    const groundY = solSurface(arrow.x)
    const y = groundY - 34 - Math.sin(Math.PI * arrow.t) * arrow.arc
    const dir = arrow.toX >= arrow.fromX ? 1 : -1
    ctx.strokeStyle = '#d8c39a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - dir * 9, y - 2)
    ctx.lineTo(sx, y)
    ctx.stroke()
    ctx.fillStyle = '#e8eef8'
    ctx.beginPath()
    ctx.moveTo(sx + dir * 4, y)
    ctx.lineTo(sx - dir * 2, y - 3)
    ctx.lineTo(sx - dir * 2, y + 3)
    ctx.closePath()
    ctx.fill()
  }

  for (const slash of solSlashes) {
    const sx = solToScreen(slash.x)
    const y = solSurface(slash.x) - 22
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - slash.t)).toFixed(2)})`
    ctx.lineWidth = 3 * (1 - slash.t) + 1
    ctx.beginPath()
    ctx.arc(sx, y, 14 + slash.t * 12, -1.2 + slash.t, 1.2 + slash.t)
    ctx.stroke()
  }

  for (const particle of solParticles) {
    const sx = solToScreen(particle.x)
    ctx.fillStyle = particle.tint || '#9adf9a'
    ctx.globalAlpha = Math.max(0, particle.life / 0.6)
    ctx.beginPath()
    ctx.arc(sx, particle.y, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  void now
}

function soldierDraw(now) {
  const worker = focusedWorker()
  if (!worker) return
  if (!solArea.w) solLayout()

  const referenceX = solDistance
  ctx.save()
  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.clip()
  ctx.fillStyle = '#06080d'
  ctx.fillRect(heroRect.x, heroRect.y, heroRect.w, heroRect.h)

  solDrawGround(referenceX)

  const squadX = solDistance + solArea.w * 0.42
  const order = [...solSlimes].sort((a, b) => a.x - b.x)
  for (const slime of order) {
    if (slime.x < squadX - 20) solDrawSlime(slime, now, false)
  }

  const size = Math.max(15, Math.min(solArea.w, solArea.h) * 0.076)
  const attacking = solCombat
  const walking = solState === 'working' && solVelocity > 4
  for (const unit of SOL_UNITS) {
    const cx = solArea.x + solArea.w * 0.42 + unit.offset * (size / 20)
    const worldX = referenceX + (cx - solArea.x)
    solDrawSoldier(cx, solSurface(worldX), size, walking, attacking, unit.kind, now, unit.phase)
  }

  for (const slime of order) {
    if (slime.x >= squadX - 20) solDrawSlime(slime, now, true)
  }

  solDrawCombat(now)

  if (solState === 'waiting') {
    const pulse = 0.45 + 0.4 * Math.sin(now / 220)
    const cx = solArea.x + solArea.w * 0.42
    ctx.fillStyle = `rgba(244,197,66,${pulse.toFixed(2)})`
    rr(cx - 26, solArea.y + 14, 52, 20, 5)
    ctx.fill()
    ctx.fillStyle = '#1b1b1b'
    ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('HOLD', cx, solArea.y + 24)
  }
  if (solState === 'error') {
    const gradient = ctx.createLinearGradient(0, solArea.y, 0, solArea.y + solArea.h)
    gradient.addColorStop(0, 'rgba(200,40,40,0.28)')
    gradient.addColorStop(0.6, 'rgba(200,40,40,0.06)')
    gradient.addColorStop(1, 'rgba(200,40,40,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(solArea.x, solArea.y, solArea.w, solArea.h)
  }

  const banner = `${SOL_LABELS[solZone] || solZone}  ·  ${Math.round(solDistance / 10)}m  ·  ${solKills} slain`
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(190,205,225,0.78)'
  ctx.fillText(banner, solArea.x + 12, solArea.y + solArea.h - 20)
  ctx.restore()

  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}
