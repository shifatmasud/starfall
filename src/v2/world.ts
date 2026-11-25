import * as THREE from 'three'
import { hasHeightField, ridgeFromField } from './heightfield'

/**
 * Every object in Starfall's eight dioramas, built as plain three geometry so the scene is one
 * tree of `InstancedMesh` and `Mesh` nodes rather than a react render per blade of grass.
 *
 * Style rules, taken from the reference sheet: real silhouettes, flat-shaded low-poly masses,
 * saturated colour, one hard key light with visible shadow. Nothing painted, nothing billboarded
 * except the clouds and the orb's glow.
 */

/** deterministic rng, so a rebuild never shuffles the world under the camera */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2

/** Filled by the stage once the CC0 art has loaded; the builders read it instead of guessing colours. */
export const shared: {
  bark?: THREE.MeshStandardMaterial
  leaf?: THREE.MeshStandardMaterial
  rock?: THREE.MeshStandardMaterial
  snow?: THREE.MeshStandardMaterial
  ground?: Record<string, THREE.MeshStandardMaterial>
} = {}

/** A soft rolling heightfield with one shallow basin in the middle, so water has somewhere to sit. */
export function makeHeight(seed: number) {
  const r = rng(seed)
  const a = r() * TAU
  const b = r() * TAU
  const c = r() * TAU
  return (x: number, z: number, basin = 0) => {
    const far = Math.min(1, Math.hypot(x, z) / 260)
    const rolls =
      Math.sin(x * 0.011 + a) * 1.5 +
      Math.cos(z * 0.013 + b) * 1.3 +
      Math.sin((x + z) * 0.019 + c) * 0.8 +
      Math.cos(x * 0.045 - z * 0.038 + a) * 0.3
    const dish = basin * -Math.exp(-(x * x + z * z) / (2 * 46 * 46)) * 7
    const ridge = THREE.MathUtils.smoothstep(far, 0.2, 1) * 26
    const swell = Math.sin(x * 0.004 + a * 2.1) * Math.cos(z * 0.0035 + b) * 9
    return (rolls + dish + swell) * (0.5 + far * 1.1) + ridge
  }
}

export type TerrainSpec = {
  height: (x: number, z: number) => number
  colorA: THREE.Color
  colorB: THREE.Color
  size?: number
  segments?: number
  /** flatten the middle to a shelf, for the meadow and the oasis */
  shelf?: number
  /** when a photographed ground material is supplied it replaces the vertex-colour material */
  material?: THREE.MeshStandardMaterial
}

export function buildTerrain(spec: TerrainSpec): THREE.Mesh {
  const size = spec.size ?? 520
  const segments = spec.segments ?? 96
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(position.count * 3)
  const low = spec.colorA.clone()
  const tmp = new THREE.Color()

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    let y = spec.height(x, z)
    if (spec.shelf !== undefined) {
      const d = Math.hypot(x, z)
      const blend = THREE.MathUtils.smoothstep(d, spec.shelf * 0.5, spec.shelf * 1.5)
      y = y * blend
    }
    position.setY(i, y)
    const dz = spec.height(x + 2, z) - y
    const dx = spec.height(x, z + 2) - y
    const slope = Math.min(1, Math.hypot(dx, dz) * 0.22)
    if (spec.material) {
      // the photograph supplies the detail; the vertex colour is only a large-scale break in
      // brightness (and a touch of warm/cool), so a 110x repeat stops reading as a grid
      const macro =
        0.86 +
        0.26 * Math.sin(x * 0.014 + Math.cos(z * 0.009) * 2.1) * Math.cos(z * 0.011 - x * 0.006) +
        0.1 * Math.sin((x + z) * 0.031)
      const shade = THREE.MathUtils.clamp((0.72 + macro * 0.42) * (1 - slope * 0.26), 0.42, 1.32)
      const warm = THREE.MathUtils.clamp(macro - 0.9, -0.12, 0.18)
      colors[i * 3] = shade * (1 + warm)
      colors[i * 3 + 1] = shade
      colors[i * 3 + 2] = shade * (1 - warm * 0.7)
      continue
    }
    const h = THREE.MathUtils.clamp((y + 8) / 20, 0, 1)
    tmp.copy(low).lerp(spec.colorB, 0.15 + h * 0.72)
    // slope darkening reads as terrain, not as a painted gradient
    tmp.multiplyScalar(1 - slope * 0.18)
    colors[i * 3] = tmp.r
    colors[i * 3 + 1] = tmp.g
    colors[i * 3 + 2] = tmp.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material =
    spec.material ??
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: false,
    })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

/** Flat-shaded low-poly rock, the workhorse for cliffs, boulders and the ocean floor. */
export function buildRock(radius: number, color: THREE.Color, seed: number): THREE.Mesh {
  const r = rng(seed)
  const geometry = new THREE.IcosahedronGeometry(radius, 1)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i)
    const n = 0.72 + r() * 0.56
    v.multiplyScalar(n)
    v.y *= 0.72
    position.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  const base = shared.rock ? shared.rock.clone() : new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
  base.color = base.color ? base.color.clone().multiply(color) : color
  const mesh = new THREE.Mesh(geometry, base)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** A conifer: dark trunk, three stacked cones, flat-shaded. */
export function buildPine(height: number, seed: number): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.035, height * 0.05, height * 0.45, 6),
    shared.bark ?? new THREE.MeshStandardMaterial({ color: '#4a3626', roughness: 0.95, flatShading: true }),
  )
  trunk.position.y = height * 0.22
  trunk.castShadow = true
  group.add(trunk)

  const needle = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f6b34'), roughness: 0.85, flatShading: true })
  const tiers = 3
  for (let i = 0; i < tiers; i += 1) {
    const f = i / tiers
    const cone = new THREE.Mesh(new THREE.ConeGeometry(height * (0.34 - f * 0.1), height * (0.44 - f * 0.06), 7), needle)
    cone.position.y = height * (0.38 + f * 0.28)
    cone.rotation.y = r() * TAU
    cone.castShadow = true
    group.add(cone)
  }
  return group
}

/** A birch: pale trunk, three soft leaf masses. */
export function buildBirch(height: number, seed: number): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.018, height * 0.028, height * 0.78, 6),
    shared.bark
      ? shared.bark.clone()
      : new THREE.MeshStandardMaterial({ color: '#e8e4d8', roughness: 0.8, flatShading: true }),
  )
  if (shared.bark) {
    // birches are pale; the shared bark map is warm, so lift it rather than tint the whole scene
    const pale = trunk.material as THREE.MeshStandardMaterial
    pale.color = new THREE.Color('#d8d2c4')
  }
  trunk.position.y = height * 0.39
  trunk.castShadow = true
  group.add(trunk)

  const leafMaterial =
    shared.leaf ?? new THREE.MeshStandardMaterial({ color: new THREE.Color('#7fbb4a'), roughness: 0.9 })
  for (let i = 0; i < 3; i += 1) {
    const size = height * (0.62 + r() * 0.2)
    const canopy = new THREE.Group()
    for (let c = 0; c < 3; c += 1) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.8), leafMaterial)
      card.rotation.y = (c / 3) * Math.PI
      card.rotation.x = 0.22
      card.castShadow = true
      canopy.add(card)
    }
    canopy.position.set((r() - 0.5) * height * 0.2, height * (0.7 + r() * 0.18), (r() - 0.5) * height * 0.2)
    group.add(canopy)
  }
  return group
}

/** A palm: leaning trunk and eight drooping fronds, each a bent ribbon. */
export function buildPalm(height: number, seed: number): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const bark = shared.bark ?? new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9, flatShading: true })
  const segments = 6
  let x = 0
  let y = 0
  for (let i = 0; i < segments; i += 1) {
    const lean = 0.1 + i * 0.035
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.022, height * 0.03, height * 0.19, 6), bark)
    seg.position.set(x + lean * 0.5, y + height * 0.09, 0)
    seg.rotation.z = -lean
    seg.castShadow = true
    group.add(seg)
    x += lean * 1.05
    y += height * 0.17
  }

  const frondMaterial =
    shared.leaf ??
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f8f52'), roughness: 0.85, side: THREE.DoubleSide })
  for (let i = 0; i < 8; i += 1) {
    const length = height * (0.42 + r() * 0.16)
    const geometry = new THREE.PlaneGeometry(length, height * 0.13, 10, 1)
    const position = geometry.attributes.position as THREE.BufferAttribute
    for (let v = 0; v < position.count; v += 1) {
      const px = position.getX(v)
      const t = (px + length / 2) / length
      // droop: the tip falls away, the way a real frond does
      position.setY(v, position.getY(v) - Math.pow(t, 1.9) * length * 0.72)
      position.setZ(v, position.getZ(v) + Math.sin(t * Math.PI) * length * 0.05)
    }
    geometry.computeVertexNormals()
    const frond = new THREE.Mesh(geometry, frondMaterial)
    frond.position.set(x, y + height * 0.04, 0)
    frond.rotation.y = (i / 8) * Math.PI * 2 + r() * 0.3
    frond.rotation.z = 0.1
    frond.castShadow = true
    group.add(frond)
  }
  return group
}

/** Kelp: two tall rippling ribbons with a slow twist, plus a holdfast. */
export function buildKelp(height: number, seed: number): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const material =
    shared.leaf ??
    new THREE.MeshStandardMaterial({ color: '#3f9a6a', roughness: 0.75, side: THREE.DoubleSide, flatShading: true })
  const blades = 2 + Math.floor(r() * 2)
  for (let b = 0; b < blades; b += 1) {
    const width = height * (0.1 + r() * 0.06)
    const geometry = new THREE.PlaneGeometry(width, height, 1, 12)
    const position = geometry.attributes.position as THREE.BufferAttribute
    const phase = r() * Math.PI * 2
    for (let v = 0; v < position.count; v += 1) {
      const py = position.getY(v)
      const t = (py + height / 2) / height
      position.setX(v, position.getX(v) + Math.sin(t * 3.1 + phase) * width * 1.4 * t)
      position.setZ(v, position.getZ(v) + Math.cos(t * 2.4 + phase) * width * 0.9 * t)
    }
    geometry.computeVertexNormals()
    const blade = new THREE.Mesh(geometry, material)
    blade.position.set((r() - 0.5) * 0.7, height / 2, (r() - 0.5) * 0.7)
    blade.rotation.y = r() * Math.PI
    blade.castShadow = true
    group.add(blade)
  }
  const hold = new THREE.Mesh(
    new THREE.SphereGeometry(height * 0.06, 6, 5),
    new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.9, flatShading: true }),
  )
  hold.position.y = height * 0.03
  group.add(hold)
  return group
}

/** A broken arch of pale stone: two columns and a lintel, plus a fallen block. */
export function buildArch(height: number, seed: number): THREE.Group {
  const r = rng(seed)
  const stone = new THREE.MeshStandardMaterial({ color: '#cfc7b2', roughness: 0.9, flatShading: true })
  const group = new THREE.Group()
  const width = height * 1.5
  for (const side of [-1, 1]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.1, height * 0.12, height, 8), stone)
    column.position.set((side * width) / 2, height / 2, 0)
    column.rotation.z = side * 0.02
    column.castShadow = true
    column.receiveShadow = true
    group.add(column)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(width * 1.15, height * 0.16, height * 0.18), stone)
  lintel.position.y = height * 1.02
  lintel.rotation.z = 0.03
  lintel.castShadow = true
  group.add(lintel)
  const block = new THREE.Mesh(new THREE.BoxGeometry(height * 0.5, height * 0.3, height * 0.4), stone)
  block.position.set(width * 0.2, height * 0.15, height * 0.5)
  block.rotation.set(r() * 0.2, r() * TAU, r() * 0.2)
  block.castShadow = true
  group.add(block)
  return group
}

/**
 * The horizon: a closed ring of mountain silhouette with noise on its crest, so every chapter has a
 * real skyline instead of a ground plane that stops.
 */
export function buildHorizonRing(radius: number, height: number, color: THREE.Color, seed: number): THREE.Mesh {
  const r = rng(seed)
  const radial = 160
  const rows = 6
  const geometry = new THREE.CylinderGeometry(radius, radius, height, radial, rows, true)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const phases = [r() * TAU, r() * TAU, r() * TAU, r() * TAU]
  const ridgeAt = (a: number) =>
    0.5 +
    0.26 * Math.abs(Math.sin(a * 2 + phases[0])) +
    0.2 * Math.abs(Math.sin(a * 5 + phases[1])) +
    0.13 * Math.abs(Math.sin(a * 11 + phases[2])) +
    0.07 * Math.abs(Math.sin(a * 23 + phases[3]))
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const a = Math.atan2(z, x)
    // one shoulder per range, so the skyline reads as mountains rather than as a sine wave
    const shoulder = 0.62 + 0.38 * Math.sin(a * 1 + phases[2] * 0.5)
    // a scanned height field, when there is one, decides where the skyline actually goes: ridges and
    // river valleys come from the terrain data, not from a hand-written waveform
    const crest = hasHeightField()
      ? 0.18 + 1.05 * ridgeFromField(a, 1, 1.7) * shoulder
      : ridgeAt(a) * shoulder
    const y = position.getY(i)
    const t = (y + height / 2) / height
    const lift = Math.max(0, crest) * height * 1.05 * Math.pow(t, 1.5)
    position.setY(i, y + lift)
    const wobble = 1 + Math.sin(a * 3 + phases[1]) * 0.05
    position.setX(i, x * wobble)
    position.setZ(i, z * wobble)
  }
  geometry.computeVertexNormals()

  // the range is atmosphere, not stone: colour runs from haze at the base up into the sky at the
  // crest, which is what aerial perspective actually does to a distant ridge
  const colors = new Float32Array(position.count * 3)
  const base = color.clone()
  const wash = new THREE.Color(1, 1, 1)
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i)
    const t = THREE.MathUtils.clamp((y + height / 2) / (height * 1.55), 0, 1)
    wash.copy(base).multiplyScalar(0.92).lerp(new THREE.Color(base.r * 1.08 + 0.06, base.g * 1.06 + 0.06, base.b * 1.05 + 0.07), t)
    colors[i * 3] = wash.r
    colors[i * 3 + 1] = wash.g
    colors[i * 3 + 2] = wash.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide }),
  )
  mesh.position.y = height * 0.12
  mesh.frustumCulled = false
  return mesh
}

/** A distant castle: a wall, four towers, lit from one side. */
export function buildCastle(scale: number, seed: number): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const pale = new THREE.MeshStandardMaterial({ color: '#d6e4f0', roughness: 0.75, flatShading: true })
  const roof = new THREE.MeshStandardMaterial({ color: '#3f6fa8', roughness: 0.6, flatShading: true })
  const keep = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.4, scale * 1.6, scale * 1.2), pale)
  keep.position.y = scale * 0.8
  keep.castShadow = true
  group.add(keep)
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + 0.4
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.22, scale * 0.26, scale * 2.1, 8), pale)
    tower.position.set(Math.cos(a) * scale * 1.1, scale * 1.05, Math.sin(a) * scale * 1.1)
    tower.castShadow = true
    group.add(tower)
    const spire = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.3, scale * 0.7, 8), roof)
    spire.position.set(tower.position.x, scale * 2.4, tower.position.z)
    spheree(spire, r)
    group.add(spire)
  }
  return group
}

const spheree = (mesh: THREE.Mesh, _r: () => number) => {
  mesh.rotation.y = _r() * TAU
  mesh.castShadow = true
}

/** A floating island: an upside-down cone of earth with a castle on the plateau. */
export function buildFloatingCastle(scale: number, seed: number): THREE.Group {
  const group = new THREE.Group()
  const rock = buildRock(scale * 1.1, new THREE.Color('#7f8fa0'), seed)
  rock.rotation.x = Math.PI
  rock.position.y = -scale * 0.55
  group.add(rock)
  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 1.05, scale * 1.0, scale * 0.16, 12),
    new THREE.MeshStandardMaterial({ color: '#7fbb5a', roughness: 0.9, flatShading: true }),
  )
  grass.position.y = scale * 0.02
  grass.receiveShadow = true
  group.add(grass)
  const castle = buildCastle(scale * 0.42, seed + 3)
  castle.position.y = scale * 0.1
  group.add(castle)
  return group
}

/** An iceberg: a low-poly prism, white over blue. */
export function buildIceberg(size: number, seed: number): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const ice = new THREE.MeshStandardMaterial({ color: '#dff2fb', roughness: 0.35, metalness: 0.02, flatShading: true })
  const shards = 3 + Math.floor(r() * 3)
  for (let i = 0; i < shards; i += 1) {
    const h = size * (0.5 + r() * 0.9)
    const shard = new THREE.Mesh(new THREE.ConeGeometry(size * (0.3 + r() * 0.4), h, 5), ice)
    shard.position.set((r() - 0.5) * size, h * 0.35 - size * 0.15, (r() - 0.5) * size)
    shard.rotation.set((r() - 0.5) * 0.25, r() * TAU, (r() - 0.5) * 0.25)
    shard.castShadow = true
    shard.receiveShadow = true
    group.add(shard)
  }
  return group
}

/** Coarse grass: instanced blade clusters close enough to fill the bottom of the frame. */
export function buildGrass(count: number, heightAt: (x: number, z: number) => number, seed: number, near = 3, far = 34): THREE.InstancedMesh {
  const r = rng(seed)
  const geometry = new THREE.ConeGeometry(0.07, 0.85, 3)
  geometry.translate(0, 0.42, 0)
  const material = new THREE.MeshStandardMaterial({ color: '#5f9e3c', roughness: 0.9, flatShading: true })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s = new THREE.Vector3(1, 1, 1)
  const p = new THREE.Vector3()
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU
    const d = near + Math.sqrt(r()) * (far - near)
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    p.set(x, heightAt(x, z), z)
    e.set((r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4)
    q.setFromEuler(e)
    s.set(0.7 + r() * 0.9, 0.6 + r() * 1.1, 0.7 + r() * 0.9)
    m.compose(p, q, s)
    mesh.setMatrixAt(i, m)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  return mesh
}

/** A pale flower head on a thin stem — one instanced mesh per meadow. */
export function buildFlowers(count: number, heightAt: (x: number, z: number) => number, seed: number): THREE.InstancedMesh {
  const r = rng(seed)
  const geometry = new THREE.IcosahedronGeometry(0.14, 0)
  const material = new THREE.MeshStandardMaterial({ color: '#fbf7ea', roughness: 0.7, emissive: '#3a3a30', emissiveIntensity: 0.12 })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3(1, 1, 1)
  const p = new THREE.Vector3()
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU
    const d = 4 + r() * 52
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    p.set(x, heightAt(x, z) + 0.35, z)
    s.setScalar(0.6 + r() * 0.8)
    m.compose(p, q, s)
    mesh.setMatrixAt(i, m)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/** Instances a builder around a chapter's ground. */
export function scatter(
  builder: (index: number) => THREE.Object3D,
  count: number,
  heightAt: (x: number, z: number) => number,
  seed: number,
  opts: {
    radius?: number
    near?: number
    scale?: [number, number]
    spin?: boolean
    sink?: number
    avoid?: (x: number, z: number) => boolean
  } = {},
): THREE.Group {
  const r = rng(seed)
  const radius = opts.radius ?? 90
  const near = opts.near ?? 6
  const [smin, smax] = opts.scale ?? [0.8, 1.3]
  const group = new THREE.Group()
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU
    const d = near + Math.sqrt(r()) * (radius - near)
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    if (opts.avoid && opts.avoid(x, z)) continue
    const node = builder(i)
    const y = heightAt(x, z) - (opts.sink ?? 0)
    node.position.set(x, y, z)
    if (opts.spin !== false) node.rotation.y = r() * TAU
    node.scale.setScalar(smin + r() * (smax - smin))
    group.add(node)
  }
  return group
}

/** A soft radial sprite texture, drawn once, for the orb's halo and the clouds. */
export function radialTexture(inner: string, outer: string, size = 128, power = 2): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, inner)
    gradient.addColorStop(Math.min(0.55, 0.6 / power), outer)
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A cauliflower cumulus drawn into a canvas: hard base, lobed top, soft edge. */
export function buildCloudTexture(seed = 1): THREE.Texture {
  const r = rng(seed)
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, size, size)
    const lobes = 16
    for (let i = 0; i < lobes; i += 1) {
      const cx = size * (0.16 + (i / (lobes - 1)) * 0.68) + (r() - 0.5) * 14
      const base = size * 0.62
      const ry = size * (0.16 + r() * 0.16) * (1 - Math.abs(i / lobes - 0.5) * 0.6)
      const rx = size * (0.1 + r() * 0.08)
      const gradient = context.createRadialGradient(cx, base - ry, 0, cx, base - ry, Math.max(rx, ry))
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.62, 'rgba(246,250,255,0.98)')
      gradient.addColorStop(1, 'rgba(226,238,252,0)')
      context.fillStyle = gradient
      context.beginPath()
      context.ellipse(cx, base - ry, rx, ry, 0, 0, TAU)
      context.fill()
    }
    // flat base: cut everything below with a clean line
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = '#000'
    context.fillRect(0, size * 0.63, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function cloudSprite(texture: THREE.Texture, scale: number, opacity: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    color: '#ffffff',
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(scale, scale * 0.62, 1)
  return sprite
}

/** Water: fresnel sky reflection over a deep body, moving ripples, one hard sun glitter. */
export const waterUniforms: Array<Record<string, { value: unknown }>> = []

export function buildWater(radius: number, shallow: THREE.Color, deep: THREE.Color): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 96)
  geometry.rotateX(-Math.PI / 2)
  const uniforms = {
    uShallow: { value: shallow.clone() },
    uDeep: { value: deep.clone() },
    uSky: { value: new THREE.Color('#cfe8ff') },
    uSun: { value: new THREE.Color('#ffffff') },
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7) },
    uTime: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSky;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        float t = uTime;
        float nx = sin(vWorld.x * 0.18 + t * 0.9) * 0.06 + sin(vWorld.z * 0.31 - t * 0.6) * 0.04;
        float nz = cos(vWorld.z * 0.21 + t * 0.7) * 0.06 + cos(vWorld.x * 0.27 + t * 0.5) * 0.04;
        vec3 normal = normalize(vec3(nx, 1.0, nz));
        float fres = pow(1.0 - max(dot(normal, view), 0.0), 3.2);
        float depthFade = smoothstep(0.0, 40.0, length(vWorld.xz));
        vec3 body = mix(uShallow, uDeep, clamp(depthFade, 0.0, 1.0));
        vec3 color = mix(body, uSky, clamp(fres * 0.55, 0.0, 0.45));
        vec3 halfV = normalize(normalize(uSunDir) + view);
        float spec = pow(max(dot(normal, halfV), 0.0), 220.0);
        color += uSun * spec * 2.4;
        float band = pow(max(dot(normal, normalize(uSunDir)), 0.0), 8.0) * 0.12;
        color += uSun * band;
        gl_FragColor = vec4(color, 0.97);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  waterUniforms.push(uniforms as unknown as Record<string, { value: unknown }>)
  return mesh
}

/**
 * The planet: one sphere, shaded in the fragment shader with drifting cloud bands, continents of
 * noise and a lit limb. A painted dome cannot do this — the reference's Earth is the whole reason
 * the first chapter reads as space rather than as a blue backdrop.
 */
export const planetUniforms: Array<{ uTime: { value: number } }> = []

export function buildPlanet(radius: number, sunDir: [number, number, number]): THREE.Mesh {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    uAtmo: { value: new THREE.Color('#6fb8ff') },
    uTime: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vView;
      void main() {
        vObj = normalize(position);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uAtmo;
      uniform float uTime;
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vView;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vObj);
        float lat = d.y;
        float spin = uTime * 0.004;
        vec3 q = vec3(d.x * cos(spin) - d.z * sin(spin), d.y, d.x * sin(spin) + d.z * cos(spin));

        float land = fbm(q * 2.4);
        float mask = smoothstep(0.50, 0.56, land + 0.09 * sin(lat * 5.0));

        vec3 ocean = mix(vec3(0.008, 0.055, 0.19), vec3(0.03, 0.20, 0.52), smoothstep(-0.85, 0.85, lat));
        ocean += vec3(0.02, 0.10, 0.18) * fbm(q * 7.0);
        vec3 soil = mix(vec3(0.10, 0.22, 0.10), vec3(0.38, 0.33, 0.18), fbm(q * 5.0));
        vec3 col = mix(ocean, soil, mask);

        // ice caps
        float cap = smoothstep(0.80, 0.93, abs(lat));
        col = mix(col, vec3(0.92, 0.96, 1.0), cap);

        // cloud bands: two shells at different scales, drifting at different speeds
        float c1 = smoothstep(0.50, 0.72, fbm(q * 3.1 + vec3(uTime * 0.01, 0.0, 0.0)));
        float c2 = smoothstep(0.58, 0.78, fbm(q * 6.4 - vec3(0.0, 0.0, uTime * 0.008)));
        float cloud = clamp(c1 * 0.85 + c2 * 0.35, 0.0, 1.0) * (1.0 - cap * 0.6);
        col = mix(col, vec3(1.0, 1.0, 1.0), cloud * 0.96);

        float ndl = clamp(dot(normalize(vNormalW), normalize(uSunDir)), 0.0, 1.0);
        float wrap = pow(clamp(ndl * 1.15, 0.0, 1.0), 1.25);
        col *= 0.05 + 1.18 * wrap;
        // warm the lit side, cool the shadow side
        col *= mix(vec3(0.72, 0.84, 1.05), vec3(1.08, 1.0, 0.92), wrap);

        float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 3.4);
        col += uAtmo * rim * 1.9;
        // the bright band of atmosphere right at the limb
        float band = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 9.0);
        col += vec3(0.55, 0.78, 1.0) * band * 1.4;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), material)
  planetUniforms.push(uniforms as unknown as { uTime: { value: number } })
  return mesh
}

/** A sea of cumulus below the lens: layered sprites on a disc, so chapter two has cloud depth. */
export function buildCloudSea(texture: THREE.Texture, count: number, seed: number, radius = 460): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU
    const d = 25 + Math.pow(r(), 0.6) * radius
    const scale = 60 + r() * 120
    const sprite = cloudSprite(texture, scale, 0.9)
    sprite.position.set(Math.cos(a) * d, -6 + r() * 26 - d * 0.02, Math.sin(a) * d)
    sprite.material.rotation = r() * 0.4
    group.add(sprite)
  }
  return group
}

/** Shafts of light through water: tall cones, additive, barely visible, which is the point. */
export function buildLightShafts(
  count: number,
  seed: number,
  height = 90,
  opts: { color?: string; tiltX?: number; tiltZ?: number; spread?: number; near?: number; opacity?: number } = {},
): THREE.Group {
  const r = rng(seed)
  const group = new THREE.Group()
  const spread = opts.spread ?? 70
  const near = opts.near ?? 8
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU
    const d = near + r() * spread
    const width = 6 + r() * 12
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(opts.color ?? '#bcecff'),
      transparent: true,
      opacity: (opts.opacity ?? 0.06) * (0.7 + r() * 0.8),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(width, height, 12, 1, true), material)
    shaft.position.set(Math.cos(a) * d, height * 0.42, Math.sin(a) * d)
    shaft.rotation.z = (r() - 0.5) * 0.22 + (opts.tiltZ ?? 0)
    shaft.rotation.x = (r() - 0.5) * 0.22 + (opts.tiltX ?? 0)
    group.add(shaft)
  }
  return group
}

/** Rising bubbles: tiny bright points, cheap and they sell the water more than fog does. */
export function buildBubbles(count: number, seed: number, radius = 40): THREE.Points {
  const r = rng(seed)
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU
    const d = Math.sqrt(r()) * radius
    positions[i * 3] = Math.cos(a) * d
    positions[i * 3 + 1] = r() * 40
    positions[i * 3 + 2] = Math.sin(a) * d
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: '#dff4ff',
    size: 0.22,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Points(geometry, material)
}
