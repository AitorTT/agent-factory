const RM_ZONES = {
  intake: { label: 'GATEWAY', color: '#5aa9e6' },
  archive: { label: 'ARCHIVE', color: '#9b8cff' },
  dock: { label: 'DOCKS', color: '#4dd0e1' },
  workbench: { label: 'FORGE', color: '#58d68d' },
  supervisor: { label: 'COMMAND', color: '#e26fd4' },
  machineshop: { label: 'FOUNDRY', color: '#f5a623' },
  repair: { label: 'REPAIR', color: '#e74c3c' },
}

let rmArea = { x: 0, y: 0, w: 0, h: 0 }
let rmMaze = null
let rmCell = { w: 0, h: 0 }
let rmRooms = new Map()
let rmSeed = 0
const rmRat = { gx: 0.5, gy: 0.5, path: [], index: 0, dir: 0, moving: false, targetKey: null, arrived: true }

function rmRand(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

function rmIdx(x, y) {
  return y * rmMaze.cols + x
}

function rmGenerate(cols, rows) {
  const cells = []
  for (let i = 0; i < cols * rows; i += 1) cells.push({ n: true, e: true, s: true, w: true, visited: false })
  const stack = []
  let cx = 0
  let cy = 0
  cells[0].visited = true
  let guard = 0
  while (guard < cols * rows * 12) {
    guard += 1
    const options = []
    if (cy > 0 && !cells[(cy - 1) * cols + cx].visited) options.push(['n', cx, cy - 1])
    if (cx < cols - 1 && !cells[cy * cols + cx + 1].visited) options.push(['e', cx + 1, cy])
    if (cy < rows - 1 && !cells[(cy + 1) * cols + cx].visited) options.push(['s', cx, cy + 1])
    if (cx > 0 && !cells[cy * cols + cx - 1].visited) options.push(['w', cx - 1, cy])
    if (options.length) {
      const pick = options[Math.floor(rmRand(rmSeed + guard * 7.3) * options.length)]
      const [dir, nx, ny] = pick
      const a = cells[cy * cols + cx]
      const b = cells[ny * cols + nx]
      if (dir === 'n') {
        a.n = false
        b.s = false
      } else if (dir === 'e') {
        a.e = false
        b.w = false
      } else if (dir === 's') {
        a.s = false
        b.n = false
      } else {
        a.w = false
        b.e = false
      }
      b.visited = true
      stack.push([cx, cy])
      cx = nx
      cy = ny
    } else if (stack.length) {
      const back = stack.pop()
      cx = back[0]
      cy = back[1]
    } else {
      break
    }
  }
  let braid = 0
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (x < cols - 1 && rmRand(rmSeed + (y * cols + x) * 3.1) < 0.09) {
        cells[y * cols + x].e = false
        cells[y * cols + x + 1].w = false
        braid += 1
      }
    }
  }
  void braid
  return { cols, rows, cells }
}

function mazeLayout() {
  rmArea = {
    x: heroRect.x + 1,
    y: heroRect.y + HERO_HEADER_H,
    w: Math.max(80, heroRect.w - 2),
    h: Math.max(60, heroRect.h - HERO_HEADER_H - 1),
  }
  const cols = Math.max(11, Math.min(23, Math.round(rmArea.w / 52)))
  const rows = Math.max(9, Math.min(17, Math.round(rmArea.h / 52)))
  rmCell = { w: rmArea.w / cols, h: rmArea.h / rows }

  const signature = `${cols}x${rows}`
  if (rmMaze && rmMaze.signature === signature) return
  const focus = focusedWorker()
  rmSeed = focus ? hash(focus.id) * 1000 : 7
  rmMaze = rmGenerate(cols, rows)
  rmMaze.signature = signature

  const midX = Math.floor(cols / 2)
  const midY = Math.floor(rows / 2)
  rmRooms = new Map([
    ['intake', { x: 0, y: 0 }],
    ['supervisor', { x: midX, y: 0 }],
    ['archive', { x: cols - 1, y: 0 }],
    ['dock', { x: cols - 1, y: midY }],
    ['repair', { x: 0, y: midY }],
    ['workbench', { x: 0, y: rows - 1 }],
    ['machineshop', { x: cols - 1, y: rows - 1 }],
  ])
  rmRooms.set('nest', { x: midX, y: rows - 1 })
  rmRat.path = []
  rmRat.index = 0
  rmRat.targetKey = null
  rmRat.gx = midX + 0.5
  rmRat.gy = rows - 1 + 0.5
}

function rmFindPath(fromX, fromY, toX, toY) {
  const start = rmIdx(fromX, fromY)
  const goal = rmIdx(toX, toY)
  if (start === goal) return [{ x: fromX, y: fromY }]
  const prev = new Map()
  const seen = new Set([start])
  const queue = [[fromX, fromY]]
  let head = 0
  while (head < queue.length) {
    const [x, y] = queue[head]
    head += 1
    const cell = rmMaze.cells[rmIdx(x, y)]
    const moves = []
    if (!cell.n) moves.push([x, y - 1])
    if (!cell.e) moves.push([x + 1, y])
    if (!cell.s) moves.push([x, y + 1])
    if (!cell.w) moves.push([x - 1, y])
    for (const [nx, ny] of moves) {
      const key = rmIdx(nx, ny)
      if (seen.has(key)) continue
      seen.add(key)
      prev.set(key, [x, y])
      if (key === goal) {
        const out = []
        let node = [toX, toY]
        while (node) {
          out.push({ x: node[0], y: node[1] })
          const keyNode = rmIdx(node[0], node[1])
          if (keyNode === start) break
          node = prev.get(keyNode)
        }
        return out.reverse()
      }
      queue.push([nx, ny])
    }
  }
  return [{ x: toX, y: toY }]
}

function mazeUpdate(dt, now) {
  if (!rmMaze) mazeLayout()
  const focus = focusedWorker()
  const targetKey = !focus || focus.state === 'idle' ? 'nest' : rmRooms.has(focus.zone) ? focus.zone : 'nest'
  if (targetKey !== rmRat.targetKey) {
    rmRat.targetKey = targetKey
    const from = { x: Math.floor(rmRat.gx), y: Math.floor(rmRat.gy) }
    const room = rmRooms.get(targetKey)
    if (room) rmRat.path = rmFindPath(from.x, from.y, room.x, room.y)
    rmRat.index = 0
  }

  const step = dt * 3.4
  rmRat.moving = false
  if (rmRat.path.length) {
    const node = rmRat.path[rmRat.index]
    const tx = node.x + 0.5
    const ty = node.y + 0.5
    const dx = tx - rmRat.gx
    const dy = ty - rmRat.gy
    const dist = Math.hypot(dx, dy)
    if (dist < 0.04) {
      rmRat.gx = tx
      rmRat.gy = ty
      if (rmRat.index < rmRat.path.length - 1) rmRat.index += 1
      else rmRat.path = []
    } else {
      const move = Math.min(step, dist)
      rmRat.gx += (dx / dist) * move
      rmRat.gy += (dy / dist) * move
      rmRat.dir = Math.atan2(dy, dx)
      rmRat.moving = true
    }
  }
  void now
}

function rmDrawRoom(key, room, now, active) {
  const meta = RM_ZONES[key] || { label: 'NEST', color: '#8fb8e8' }
  const cx = rmArea.x + (room.x + 0.5) * rmCell.w
  const cy = rmArea.y + (room.y + 0.5) * rmCell.h
  const w = rmCell.w * 0.92
  const h = rmCell.h * 0.92
  if (active) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h))
    glow.addColorStop(0, meta.color + '55')
    glow.addColorStop(1, meta.color + '00')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(w, h), 0, Math.PI * 2)
    ctx.fill()
  }
  rr(cx - w / 2, cy - h / 2, w, h, 6)
  ctx.fillStyle = active ? meta.color + '44' : meta.color + '22'
  ctx.fill()
  ctx.strokeStyle = active ? meta.color : meta.color + '66'
  ctx.lineWidth = active ? 2 : 1
  ctx.stroke()

  if (key === 'nest') {
    ctx.strokeStyle = 'rgba(200,220,240,0.5)'
    ctx.lineWidth = 1
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath()
      ctx.arc(cx, cy, (i + 1) * Math.min(w, h) * 0.16, 0.4, Math.PI - 0.4)
      ctx.stroke()
    }
  }

  ctx.font = '600 9px ui-monospace, Menlo, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = active ? '#e6eef8' : meta.color + 'cc'
  ctx.fillText(meta.label, cx, cy + h / 2 - 11)
  void now
}

function rmDrawMaze(now, activeKey) {
  const left = rmArea.x
  const top = rmArea.y
  const cellW = rmCell.w
  const cellH = rmCell.h

  ctx.save()
  rr(rmArea.x, rmArea.y, rmArea.w, rmArea.h, 12)
  ctx.clip()
  ctx.fillStyle = '#0a0d14'
  ctx.fillRect(rmArea.x, rmArea.y, rmArea.w, rmArea.h)
  ctx.fillStyle = 'rgba(255,255,255,0.022)'
  for (let y = 0; y < rmMaze.rows; y += 1) {
    for (let x = 0; x < rmMaze.cols; x += 1) {
      if ((x + y) % 2) continue
      ctx.fillRect(left + x * cellW, top + y * cellH, cellW, cellH)
    }
  }

  for (const [key, room] of rmRooms) rmDrawRoom(key, room, now, key === activeKey)

  ctx.strokeStyle = '#4d5a6e'
  ctx.lineWidth = Math.max(2, Math.min(cellW, cellH) * 0.12)
  ctx.lineCap = 'square'
  ctx.beginPath()
  for (let y = 0; y < rmMaze.rows; y += 1) {
    for (let x = 0; x < rmMaze.cols; x += 1) {
      const cell = rmMaze.cells[rmIdx(x, y)]
      const px = left + x * cellW
      const py = top + y * cellH
      if (cell.n) {
        ctx.moveTo(px, py)
        ctx.lineTo(px + cellW, py)
      }
      if (cell.w) {
        ctx.moveTo(px, py)
        ctx.lineTo(px, py + cellH)
      }
      if (y === rmMaze.rows - 1 && cell.s) {
        ctx.moveTo(px, py + cellH)
        ctx.lineTo(px + cellW, py + cellH)
      }
      if (x === rmMaze.cols - 1 && cell.e) {
        ctx.moveTo(px + cellW, py)
        ctx.lineTo(px + cellW, py + cellH)
      }
    }
  }
  ctx.stroke()
  ctx.restore()
}

function rmDrawRat(worker, now) {
  const cx = rmArea.x + rmRat.gx * rmCell.w
  const cy = rmArea.y + rmRat.gy * rmCell.h
  const size = Math.min(rmCell.w, rmCell.h) * 0.52
  const color = STATE_COLOR[worker.state] || STATE_COLOR.idle
  const moving = rmRat.moving
  const bob = moving ? Math.sin(now / 70) * size * 0.07 : Math.sin(now / 800) * size * 0.03

  ctx.save()
  ctx.translate(cx, cy + bob)
  ctx.rotate(rmRat.dir)
  ctx.scale(size / 20, size / 20)

  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(0, 2, 15, 8, 0, 0, Math.PI * 2)
  ctx.fill()

  const tailWag = moving ? Math.sin(now / 60) * 6 : Math.sin(now / 420) * 2.5
  ctx.strokeStyle = '#c99a9a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-11, 0)
  ctx.quadraticCurveTo(-18, tailWag, -26, tailWag * 1.6)
  ctx.stroke()

  ctx.fillStyle = moving ? '#b9c1cb' : '#a7aeb8'
  ctx.beginPath()
  ctx.ellipse(-1, 0, 11, 7.5, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#c7ced7'
  ctx.beginPath()
  ctx.ellipse(7, -0.5, 6.5, 5.5, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#d9dee5'
  ctx.beginPath()
  ctx.arc(4, -6, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(4, 6, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8a3b3'
  ctx.beginPath()
  ctx.arc(4, -6, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(4, 6, 1.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#2a2f36'
  ctx.beginPath()
  ctx.arc(11.5, -0.5, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(230,238,248,0.65)'
  ctx.lineWidth = 0.7
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(12.5, side * 1)
    ctx.lineTo(20, side * 4 + (moving ? Math.sin(now / 80) * 1.2 : 0))
    ctx.stroke()
  }
  ctx.restore()

  if (worker.state === 'waiting') {
    const pulse = 0.4 + 0.4 * Math.sin(now / 200)
    ctx.strokeStyle = `rgba(244,197,66,${pulse.toFixed(2)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, size * 0.75, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = `rgba(244,197,66,${pulse.toFixed(2)})`
    ctx.font = '700 14px ui-monospace, Menlo, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('!', cx, cy - size * 0.75)
  }
  if (worker.state === 'error') {
    ctx.fillStyle = 'rgba(239,83,80,0.28)'
    ctx.beginPath()
    ctx.arc(cx, cy, size * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  void color
}

function mazeDraw(now) {
  const worker = focusedWorker()
  if (!worker) return
  if (!rmMaze) mazeLayout()
  const activeKey = worker.state === 'idle' ? 'nest' : rmRooms.has(worker.zone) ? worker.zone : 'nest'

  ctx.save()
  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.clip()
  const gradient = ctx.createLinearGradient(0, heroRect.y, 0, heroRect.y + heroRect.h)
  gradient.addColorStop(0, '#0b0f18')
  gradient.addColorStop(1, '#070910')
  ctx.fillStyle = gradient
  ctx.fillRect(heroRect.x, heroRect.y, heroRect.w, heroRect.h)
  rmDrawMaze(now, activeKey)
  rmDrawRat(worker, now)
  ctx.restore()

  rr(heroRect.x, heroRect.y, heroRect.w, heroRect.h, 12)
  ctx.strokeStyle = 'rgba(120,150,200,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
}
