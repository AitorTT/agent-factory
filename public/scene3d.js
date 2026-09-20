import * as THREE from './vendor/three.module.min.js'

const glCanvas = document.getElementById('gl')
const STATE_HEX = { working: 0x58d68d, waiting: 0xf4c542, error: 0xef5350, idle: 0x8492a6 }
const META = {
  intake: { label: 'GATEWAY', color: '#5aa9e6' },
  archive: { label: 'ARCHIVE', color: '#9b8cff' },
  dock: { label: 'DOCKS', color: '#4dd0e1' },
  workbench: { label: 'FORGE', color: '#58d68d' },
  supervisor: { label: 'COMMAND', color: '#e26fd4' },
  machineshop: { label: 'FOUNDRY', color: '#f5a623' },
  repair: { label: 'REPAIR', color: '#e74c3c' },
}
const ZONE_KEYS = Object.keys(META)

let renderer = null
let camera = null
let failed = false
let active = false
let clock = 0
let currentName = null
const scenes = {}

function makeLabel(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const g = canvas.getContext('2d')
  g.clearRect(0, 0, 256, 64)
  g.font = 'bold 30px ui-monospace, Menlo, Consolas, monospace'
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(11, 2.75, 1)
  return sprite
}

const CAMERA_ZOOM = 0.75

function fitDistance(radius) {
  const vFov = (camera.fov * Math.PI) / 180
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  return ((radius * 1.18) / Math.sin(Math.min(vFov, hFov) / 2)) * CAMERA_ZOOM
}

function placeCamera(yaw, tilt, dist) {
  const horizontal = Math.cos(Math.asin(tilt)) * dist
  camera.position.set(Math.sin(yaw) * horizontal, dist * tilt, Math.cos(yaw) * horizontal)
  camera.lookAt(0, 0, 0)
}

function moveTowards(object, target, dt, speed) {
  const before = object.position.clone()
  object.position.lerp(target, 1 - Math.exp(-speed * dt))
  const velocity = object.position.clone().sub(before)
  if (velocity.lengthSq() > 0.00001) {
    object.rotation.y = Math.atan2(velocity.x, velocity.z)
    object.rotation.x = -Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)) * 0.4
  }
  return object.position.distanceTo(target)
}

function planetMaterial(color, seed) {
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.82, metalness: 0.06 })
  material.onBeforeCompile = (shader) => {
    const vsOk = shader.vertexShader.includes('#include <common>') && shader.vertexShader.includes('#include <begin_vertex>')
    const fsOk =
      shader.fragmentShader.includes('#include <common>') &&
      shader.fragmentShader.includes('#include <color_fragment>') &&
      shader.fragmentShader.includes('#include <emissivemap_fragment>')
    if (!vsOk || !fsOk) return
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uSeed = { value: seed }
    shader.uniforms.uGlow = { value: new THREE.Color(color) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocalPos;
uniform float uTime;
uniform float uSeed;
uniform vec3 uGlow;
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float n31(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3(1.0,0.0,0.0)), f.x), mix(h31(i + vec3(0.0,1.0,0.0)), h31(i + vec3(1.0,1.0,0.0)), f.x), f.y),
    mix(mix(h31(i + vec3(0.0,0.0,1.0)), h31(i + vec3(1.0,0.0,1.0)), f.x), mix(h31(i + vec3(0.0,1.0,1.0)), h31(i + vec3(1.0,1.0,1.0)), f.x), f.y),
    f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float nA = n31(vLocalPos * 1.7 + uSeed);
  float nB = n31(vLocalPos * 4.1 - uTime * 0.04 + uSeed);
  float bands = 0.5 + 0.5 * sin(vLocalPos.y * 5.0 + nA * 3.0 + uTime * 0.3);
  diffuseColor.rgb *= 0.68 + 0.62 * bands;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.45, 1.25, 1.05), smoothstep(0.62, 0.92, nB));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  float rim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.6);
  totalEmissiveRadiance += uGlow * rim * 0.6;`,
      )
    material.userData.shader = shader
  }
  return material
}

function solarScene() {
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x04060d, 0.0026)
  scene.add(new THREE.AmbientLight(0x445577, 1.15))
  const key = new THREE.DirectionalLight(0xaaccff, 0.6)
  key.position.set(30, 60, 20)
  scene.add(key)

  const sun = new THREE.Mesh(new THREE.SphereGeometry(4.4, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffd27a }))
  scene.add(sun)
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(6.6, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.16 })))
  const sunLight = new THREE.PointLight(0xffd9a0, 900, 400, 2)
  scene.add(sunLight)
  const baseLabel = makeLabel('BASE', '#ffd9a0')
  baseLabel.position.set(0, 7.6, 0)
  scene.add(baseLabel)

  const planets = new Map()
  const ORBIT_BASE = 12.5
  const ORBIT_STEP = 3.7
  ZONE_KEYS.forEach((zoneKey, index) => {
    const meta = META[zoneKey]
    const radius = ORBIT_BASE + index * ORBIT_STEP
    const pivot = new THREE.Group()
    pivot.rotation.x = (index % 2 ? -1 : 1) * (0.05 + index * 0.016)
    scene.add(pivot)
    pivot.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 128 }, (_, i) => {
            const a = (i / 128) * Math.PI * 2
            return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
          }),
        ),
        new THREE.LineBasicMaterial({ color: new THREE.Color(meta.color), transparent: true, opacity: 0.22 }),
      ),
    )
    const size = Math.max(0.9, 1.85 - index * 0.12)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 36, 26), planetMaterial(meta.color, index * 1.7 + 0.5))
    pivot.add(mesh)
    const label = makeLabel(meta.label, meta.color)
    label.position.set(0, size + 1.9, 0)
    mesh.add(label)
    planets.set(zoneKey, { mesh, radius, angle: Math.random() * Math.PI * 2, speed: 0.26 / (1 + index * 0.34), size })
  })

  const positions = new Float32Array(1500 * 3)
  for (let i = 0; i < 1500; i += 1) {
    const r = 200 + Math.random() * 900
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi)
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  const stars = new THREE.BufferGeometry()
  stars.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xbcd4ff, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.75 })))

  const hull = new THREE.ConeGeometry(0.55, 1.7, 4)
  hull.rotateX(Math.PI / 2)
  const ship = new THREE.Group()
  ship.add(new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x2a6ea8, roughness: 0.4, metalness: 0.3 })))
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.9 }))
  glow.position.z = -0.9
  ship.add(glow)
  scene.add(ship)

  let dist = 120
  let shipKey = null
  let mode = 'hold'
  let orbit = 0
  const radius = 12.5 + 3.7 * (ZONE_KEYS.length - 1) + 3

  return {
    scene,
    setAspect() {
      dist = fitDistance(radius)
    },
    update(dt, worker) {
      for (const planet of planets.values()) {
        planet.angle += planet.speed * dt
        planet.mesh.position.set(Math.cos(planet.angle) * planet.radius, 0, Math.sin(planet.angle) * planet.radius)
        const shader = planet.mesh.material.userData.shader
        if (shader) shader.uniforms.uTime.value = clock
      }

      const wantKey = !worker || worker.state === 'idle' ? 'sun' : planets.has(worker.zone) ? worker.zone : 'sun'
      if (wantKey !== shipKey) {
        shipKey = wantKey
        mode = 'travel'
      }
      const target = new THREE.Vector3()
      if (wantKey === 'sun') target.set(0, 0.9, 0)
      else target.copy(planets.get(wantKey).mesh.position).setY(0.6)

      if (wantKey === 'sun' && mode !== 'travel') {
        ship.position.set(0, 0.9, 6.4)
        ship.rotation.set(0, Math.PI, 0)
      } else if (wantKey === 'sun') {
        if (moveTowards(ship, target, dt, 1.7) < 2.4) mode = 'hold'
      } else {
        const planet = planets.get(wantKey)
        const orbitRadius = planet.size + 2.1
        if (mode === 'travel') {
          if (moveTowards(ship, target, dt, 1.9) < orbitRadius + 0.9) {
            mode = 'orbit'
            orbit = Math.atan2(ship.position.z - target.z, ship.position.x - target.x)
          }
        } else {
          orbit += dt * 1.5
          const next = new THREE.Vector3(
            target.x + Math.cos(orbit) * orbitRadius,
            target.y + Math.sin(orbit * 0.7) * 0.7,
            target.z + Math.sin(orbit) * orbitRadius,
          )
          moveTowards(ship, next, dt, 40)
        }
      }

      glow.material.color.copy(new THREE.Color(worker ? STATE_HEX[worker.state] || STATE_HEX.idle : STATE_HEX.idle))
      glow.material.opacity = 0.55 + 0.35 * Math.sin(clock * (worker && worker.state === 'working' ? 9 : 2.4))
      placeCamera(Math.sin(clock * 0.05) * 0.1, 0.46, dist)
      sunLight.intensity = 860 + Math.sin(clock * 1.6) * 60
    },
  }
}

function islandsScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x7fb0d4)
  scene.fog = new THREE.FogExp2(0x7fb0d4, 0.0055)
  scene.add(new THREE.HemisphereLight(0xd6ebff, 0x27506b, 1.0))
  const sun = new THREE.DirectionalLight(0xfff0cf, 1.15)
  sun.position.set(40, 60, 25)
  scene.add(sun)

  const oceanMaterial = new THREE.MeshStandardMaterial({ color: 0x1b5a83, roughness: 0.32, metalness: 0.12 })
  oceanMaterial.onBeforeCompile = (shader) => {
    if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.vertexShader.includes('#include <beginnormal_vertex>')) return
    shader.uniforms.uTime = { value: 0 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  float wdx = cos(position.x*0.14 + uTime*0.9)*0.049 + cos((position.x+position.y)*0.07 + uTime*0.6)*0.028;
  float wdy = cos(position.y*0.19 + uTime*1.3)*0.053 + cos((position.x+position.y)*0.07 + uTime*0.6)*0.028;
  objectNormal = normalize(vec3(-wdx, -wdy, 1.0));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  transformed.z += sin(position.x*0.14 + uTime*0.9)*0.35 + sin(position.y*0.19 + uTime*1.3)*0.28 + sin((position.x+position.y)*0.07 + uTime*0.6)*0.4;`,
      )
    oceanMaterial.userData.shader = shader
  }
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 130, 130), oceanMaterial)
  ocean.rotation.x = -Math.PI / 2
  scene.add(ocean)

  function islandBase(radius) {
    const group = new THREE.Group()
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, radius, 1.7, 16), new THREE.MeshStandardMaterial({ color: 0xc9ad7c, roughness: 0.95 }))
    rock.position.y = 0.35
    group.add(rock)
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.84, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x4f8a52, roughness: 0.9 }))
    grass.position.y = 1.3
    group.add(grass)
    return group
  }

  function box(w, h, d, color, y, x = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.75 }))
    mesh.position.set(x, y, z)
    return mesh
  }

  function landmark(key) {
    const group = new THREE.Group()
    const color = META[key].color
    if (key === 'intake') {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 5, 12), new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: 0.7 }))
      tower.position.y = 4
      group.add(tower)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(color) }))
      cap.position.y = 7
      group.add(cap)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }))
      lamp.position.y = 6.4
      group.add(lamp)
      group.userData.beacon = lamp
    } else if (key === 'archive') {
      group.add(box(3.4, 2.4, 2.6, color, 2.6))
      group.add(box(2, 1.8, 1.6, color, 4.7, -0.6, 0.4))
    } else if (key === 'dock') {
      group.add(box(1.1, 0.35, 6, 0x8a6b45, 1.6, 0, 2.2))
      for (let i = 0; i < 4; i += 1) group.add(box(0.22, 1.6, 0.22, 0x6f5335, 1.6, 0.6, -0.4 + i * 1.5))
      group.add(box(2.2, 1.1, 2.2, color, 2.0, -1.6, -1.2))
      group.add(box(1.2, 0.9, 1.2, color, 3.0, -1.6, -1.2))
    } else if (key === 'workbench') {
      group.add(box(2.6, 1.5, 2.2, color, 2.1))
      group.add(box(1.6, 0.35, 3.4, 0x8a6b45, 3.1, 0.4, 0))
      group.add(box(0.22, 2.6, 0.22, 0x6f5335, 3.2, -1.1, 1.6))
    } else if (key === 'supervisor') {
      group.add(box(2, 6, 2, color, 4.4))
      group.add(box(3, 0.5, 3, color, 7.6))
      const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8ad4 }))
      antenna.position.y = 8.4
      group.add(antenna)
      group.userData.beacon = antenna
    } else if (key === 'machineshop') {
      group.add(box(3.2, 2.2, 2.4, color, 2.5))
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 4.4, 10), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.8 }))
      stack.position.set(1.1, 4.4, -0.7)
      group.add(stack)
      const vent = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffae4d, transparent: true }))
      vent.position.set(0, 2.2, 1.35)
      group.add(vent)
      group.userData.beacon = vent
    } else if (key === 'repair') {
      group.add(box(2.8, 1.9, 2.3, color, 2.3))
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 4), new THREE.MeshStandardMaterial({ color: 0x8f3b33, roughness: 0.8 }))
      roof.position.y = 3.6
      roof.rotation.y = Math.PI / 4
      group.add(roof)
      const alarm = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5a4a }))
      alarm.position.y = 4.5
      group.add(alarm)
      group.userData.beacon = alarm
    }
    return group
  }

  const islands = new Map()
  const beacons = []
  const RING = 26
  ZONE_KEYS.forEach((key, index) => {
    const angle = (index / ZONE_KEYS.length) * Math.PI * 2 + 0.4
    const radius = RING + ((index % 3) - 1) * 1.8
    const group = islandBase(3.7)
    group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    const marker = landmark(key)
    group.add(marker)
    if (marker.userData.beacon) beacons.push({ mesh: marker.userData.beacon, key })
    const label = makeLabel(META[key].label, META[key].color)
    label.position.set(0, 8.6, 0)
    group.add(label)
    scene.add(group)
    islands.set(key, { group, position: group.position.clone() })
  })

  const harbour = islandBase(5.2)
  const dockLight = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.4, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }))
  dockLight.position.set(0, 3.2, 0)
  harbour.add(dockLight)
  const harbourLabel = makeLabel('HARBOUR', '#cfe6ff')
  harbourLabel.position.set(0, 9.6, 0)
  harbour.add(harbourLabel)
  const pierA = box(1.2, 0.4, 9, 0x8a6b45, 1.8, 0, 6)
  const pierB = box(9, 0.4, 1.2, 0x8a6b45, 1.8, 6, 0)
  harbour.add(pierA)
  harbour.add(pierB)
  scene.add(harbour)

  const ship = new THREE.Group()
  const hullMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 3), new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.7 }))
  ship.add(hullMesh)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x6f5335 }))
  mast.position.y = 1.5
  ship.add(mast)
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.9), new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.9, side: THREE.DoubleSide }))
  sail.position.set(0, 1.6, 0.05)
  ship.add(sail)
  const flag = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }))
  flag.position.set(0, 2.9, 0)
  ship.add(flag)
  scene.add(ship)

  const radius = RING + 11
  let dist = 120
  let shipKey = null
  let mode = 'hold'
  let orbit = 0

  return {
    scene,
    setAspect() {
      dist = fitDistance(radius)
    },
    update(dt, worker) {
      if (oceanMaterial.userData.shader) oceanMaterial.userData.shader.uniforms.uTime.value = clock
      const wave = (x, z) => Math.sin(x * 0.14 + clock * 0.9) * 0.35 + Math.sin(z * 0.19 + clock * 1.3) * 0.28

      const activeZone = worker && worker.state !== 'idle' ? worker.zone : null
      for (const beacon of beacons) {
        beacon.mesh.material.transparent = true
        beacon.mesh.material.opacity =
          beacon.key === activeZone ? 0.45 + 0.55 * Math.abs(Math.sin(clock * 4)) : 0.5
      }

      const wantKey = !worker || worker.state === 'idle' ? 'harbour' : islands.has(worker.zone) ? worker.zone : 'harbour'
      if (wantKey !== shipKey) {
        shipKey = wantKey
        mode = 'travel'
      }

      const target = new THREE.Vector3()
      if (wantKey === 'harbour') {
        target.set(5.5, 0.75, 5.5)
      } else {
        const island = islands.get(wantKey)
        target.copy(island.position).multiplyScalar(0.82).setY(0.75)
      }

      if (wantKey === 'harbour' && mode !== 'travel') {
        ship.position.copy(target)
        ship.rotation.set(0, -Math.PI / 4, 0)
      } else if (wantKey === 'harbour') {
        if (moveTowards(ship, target, dt, 1.6) < 1.4) mode = 'hold'
      } else {
        const island = islands.get(wantKey)
        const orbitRadius = 5.2
        if (mode === 'travel') {
          if (moveTowards(ship, target, dt, 1.8) < orbitRadius + 0.8) {
            mode = 'orbit'
            orbit = Math.atan2(ship.position.z - target.z, ship.position.x - target.x)
          }
        } else {
          orbit += dt * 1.1
          const next = new THREE.Vector3(
            island.position.x + Math.cos(orbit) * orbitRadius * 0.72,
            0.75,
            island.position.z + Math.sin(orbit) * orbitRadius * 0.72,
          )
          moveTowards(ship, next, dt, 40)
        }
      }

      ship.position.y = 0.55 + wave(ship.position.x, ship.position.z) * 0.35
      ship.rotation.z = Math.sin(clock * 1.4 + ship.position.x * 0.2) * 0.06
      flag.material.color.set(worker ? STATE_HEX[worker.state] || STATE_HEX.idle : STATE_HEX.idle)
      placeCamera(Math.sin(clock * 0.04) * 0.22, 0.32, dist)
    },
  }
}

scenes.solar = solarScene()
scenes.islands = islandsScene()

function setTheme(name) {
  if (failed || currentName === name || !scenes[name]) return
  currentName = name
  scenes[name].setAspect()
}

function setActive(next) {
  if (failed || next === active) return
  active = next
  glCanvas.style.display = next ? 'block' : 'none'
}

function setSize(next) {
  if (failed || !renderer) return
  glCanvas.style.left = `${Math.round(next.x)}px`
  glCanvas.style.top = `${Math.round(next.y)}px`
  glCanvas.style.width = `${Math.round(next.w)}px`
  glCanvas.style.height = `${Math.round(next.h)}px`
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setSize(Math.max(1, Math.round(next.w)), Math.max(1, Math.round(next.h)), false)
  camera.aspect = Math.max(0.2, next.w / Math.max(1, next.h))
  camera.updateProjectionMatrix()
  if (currentName && scenes[currentName]) scenes[currentName].setAspect()
}

function update(dt, worker) {
  if (failed) return
  clock += dt
  const def = currentName ? scenes[currentName] : null
  if (def) def.update(dt, worker)
}

function render() {
  if (failed || !renderer || !currentName) return
  renderer.render(scenes[currentName].scene, camera)
}

try {
  scenes.solar = solarScene()
  scenes.islands = islandsScene()
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 4000)
} catch (error) {
  failed = true
  console.warn('3D themes unavailable:', error.message)
}

window.scene3d = { failed, sceneNames: Object.keys(scenes), setActive, setSize, setTheme, update, render }
