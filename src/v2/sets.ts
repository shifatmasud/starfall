import * as THREE from 'three'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { CHAPTERS, chapterZ } from './palettes'
import type { Art } from './art'
import { instance, type Models } from './models'
import {
  buildBubbles,
  buildCloudSea,
  buildCloudTexture,
  buildHorizonRing,
  buildKelp,
  buildLightShafts,
  buildPalm,
  buildPlanet,
  buildRock,
  buildTerrain,
  cloudSprite,
  makeHeight,
  rng,
  scatter,
  shared,
} from './world'

/**
 * One diorama per chapter, built explicitly rather than from a shared template.
 *
 * The reference sheet gives each stop its own subject — a planet limb, a cloud sea, a forest floor,
 * a meadow lake, an oasis, an ice sea, open water, an ocean floor — so each stop gets its own
 * composition. A single "ground plus scattered props" builder is why the first passes all looked
 * like the same field in different colours.
 */

export type Set = {
  center: THREE.Vector3
  group: THREE.Group
  water: THREE.Mesh | null
}

/** Grass from a real scan, instanced: one draw call for a whole chapter's ground cover.
 *
 * The Poly Haven clump is a 5.6 m wide strip of blades, so it must be scaled by its footprint, not
 * its height: scaling to a target height blew it up 4x and turned the meadow into black hedges.
 */
function grassField(
  model: THREE.Object3D,
  count: number,
  heightAt: (x: number, z: number) => number,
  seed: number,
  near = 2,
  far = 46,
  spread = 2,
): THREE.InstancedMesh | null {
  let source: THREE.Mesh | null = null
  model.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!source && mesh.isMesh) source = mesh
  })
  if (!source) return null
  const mesh = source as THREE.Mesh
  // Alpha-blended cards turn into black silhouettes once they are instanced and shadow-casting:
  // the depth pass writes nothing, so every blade shades against itself. Cut-out alpha fixes the
  // read without touching the scan's own albedo or normal map.
  const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
  mat.transparent = false
  mat.alphaTest = 0.45
  mat.side = THREE.DoubleSide
  mat.depthWrite = true
  const instanced = new THREE.InstancedMesh(mesh.geometry, mat, count)
  const r = rng(seed)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const box = new THREE.Box3().setFromObject(mesh)
  const size = new THREE.Vector3()
  box.getSize(size)
  const footprint = Math.max(0.001, Math.max(size.x, size.z))
  for (let i = 0; i < count; i += 1) {
    const a = r() * Math.PI * 2
    const d = near + Math.sqrt(r()) * (far - near)
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    p.set(x, heightAt(x, z) - 0.04, z)
    e.set((r() - 0.5) * 0.22, r() * Math.PI * 2, (r() - 0.5) * 0.22)
    q.setFromEuler(e)
    const k = (spread * (0.7 + r() * 0.7)) / footprint
    s.set(k, k, k)
    m.compose(p, q, s)
    instanced.setMatrixAt(i, m)
  }
  instanced.instanceMatrix.needsUpdate = true
  instanced.castShadow = false
  instanced.receiveShadow = true
  instanced.frustumCulled = false
  return instanced
}

/**
 * Water: three.js's own Water object, not a shader written here.
 *
 * It renders a real mirror pass from the scene, distorts it with the Megascans water normal map, and
 * tints the body per chapter — so the lake reflects the actual sky and the actual castle on its
 * shore, which is what makes a lake read as water rather than as a blue band.
 */
function water(
  set: THREE.Group,
  chapter: (typeof CHAPTERS)[number],
  radius: number,
  y: number,
  art: Art,
  sunDir: [number, number, number],
  sunColor: string,
): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 96)
  const surface = new Water(geometry, {
    textureWidth: 256,
    textureHeight: 256,
    waterNormals: art.waterNormals,
    sunDirection: new THREE.Vector3(...sunDir).normalize(),
    sunColor: new THREE.Color(sunColor),
    waterColor: new THREE.Color(chapter.waterDeep ?? chapter.water ?? '#1c6f92'),
    distortionScale: 3.2,
    fog: true,
  })
  surface.rotation.x = -Math.PI / 2
  surface.position.y = y
  const material = surface.material as THREE.ShaderMaterial
  material.uniforms.size.value = 6
  material.transparent = true
  material.uniforms.alpha = { value: 0.94 }
  set.add(surface)
  return surface
}

export function buildSet(index: number, art: Art, models: Models): Set {
  const chapter = CHAPTERS[index]
  const id = chapter.id
  shared.bark = art.bark
  shared.leaf = art.leaf
  shared.rock = art.rock
  shared.snow = art.snow
  const group = new THREE.Group()
  const height = makeHeight(11 + index * 7)
  const basin = chapter.water ? 1 : 0
  const heightAt = (x: number, z: number) => height(x, z, basin)
  const shelf = chapter.water ? 46 : undefined

  const groundMaterial = art.ground[id] ? (art.ground[id].clone() as THREE.MeshStandardMaterial) : undefined
  if (groundMaterial) {
    groundMaterial.color = new THREE.Color(chapter.groundAlt).lerp(new THREE.Color('#ffffff'), 0.86)
  }

  const addGround = (size = 340, segments = 110) => {
    const ground = buildTerrain({
      height: heightAt,
      colorA: new THREE.Color(chapter.ground),
      colorB: new THREE.Color(chapter.groundAlt),
      size,
      segments,
      shelf,
      material: groundMaterial,
    })
    group.add(ground)
    return ground
  }

  // ── 01 · space: a planet limb, not a sky dome ────────────────────────────────────────────────
  if (id === 'space') {
    const planet = buildPlanet(900, chapter.sunDir)
    planet.position.set(30, -930, -170)
    group.add(planet)
    return { center: new THREE.Vector3(0, 0, chapterZ(index)), group, water: null }
  }

  // ── 02 · the cloud sea: no ground at all, just weather ──────────────────────────────────────
  if (id === 'sky') {
    const texture = buildCloudTexture(9)
    const sea = buildCloudSea(texture, 55, 13, 520)
    sea.position.y = -34
    group.add(sea)
    const banks = new THREE.Group()
    const r = rng(31)
    for (let i = 0; i < 34; i += 1) {
      const a = r() * Math.PI * 2
      const d = 70 + r() * 300
      const sprite = cloudSprite(texture, 30 + r() * 55, 0.55)
      sprite.position.set(Math.cos(a) * d, 6 + r() * 80, Math.sin(a) * d - 40)
      banks.add(sprite)
    }
    group.add(banks)
    const towers = new THREE.Group()
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2 + 0.3
      const d = 260 + (i % 3) * 60
      const tower = new THREE.Group()
      for (let k = 0; k < 5; k += 1) {
        const sprite = cloudSprite(texture, 70 - k * 7, 0.6)
        sprite.position.set((k % 2) * 18, k * 26, (k % 3) * 12)
        tower.add(sprite)
      }
      tower.position.set(Math.cos(a) * d, -30, Math.sin(a) * d - 60)
      towers.add(tower)
    }
    group.add(towers)
    const haze = new THREE.Color(chapter.groundAlt).lerp(new THREE.Color(chapter.horizon), 0.5)
    const ring = buildHorizonRing(420, 150, haze, 401 + index)
    ring.position.y = -40
    group.add(ring)
    return { center: new THREE.Vector3(0, 0, chapterZ(index)), group, water: null }
  }

  // ── 07 · open sea: water to the horizon, icebergs, no shore ─────────────────────────────────
  if (id === 'sea') {
    water(group, chapter, 600, -2.5, art, chapter.sunDir, chapter.sun)
    group.add(
      scatter(
        (i) => buildRock(2.5 + (i % 3) * 2, new THREE.Color('#4a6a72'), i * 31 + index),
        8,
        () => -2.5,
        91 + index,
        { radius: 180, near: 60, scale: [0.8, 2.2], sink: 2.6 },
      ),
    )
    const haze = new THREE.Color(chapter.horizon).lerp(new THREE.Color(chapter.mid), 0.4)
    const ring = buildHorizonRing(520, 190, haze, 401 + index)
    ring.position.y = -14
    group.add(ring)
    return { center: new THREE.Vector3(0, 0, chapterZ(index)), group, water: null }
  }

  addGround(id === 'ice' ? 420 : 340, id === 'deep' ? 130 : 110)
  if (chapter.water) {
    water(group, chapter, id === 'lake' ? 130 : id === 'ice' ? 220 : 90, id === 'desert' ? -1.2 : 0.15, art, chapter.sunDir, chapter.sun)
  }

  // ── 03 · forest: real scanned firs, dense, with the floor in shot ───────────────────────────
  if (id === 'forest') {
    // The leaved scan is the forest; the trunk-only scan is only ever a trunk at the lens edge.
    group.add(
      scatter((i) => instance(models.broadleaf, 12 + (i % 5) * 4), 52, heightAt, 21, {
        radius: 130,
        near: 8,
        scale: [0.8, 1.4],
        sink: 0.3,
      }),
    )
    group.add(
      scatter((i) => instance(models.fir, 9 + (i % 4) * 3), 26, heightAt, 33, {
        radius: 110,
        near: 10,
        scale: [0.9, 1.4],
        sink: 0.3,
      }),
    )
    // two trunks close enough to the lens to carry the frame
    for (const [x, z, s] of [
      [-7.5, 7, 1.7],
      [9.5, 1, 1.45],
      [-13, -9, 1.3],
    ] as const) {
      const trunk = instance(models.fir, 16 * s)
      trunk.position.set(x, heightAt(x, z) - 0.2, z)
      group.add(trunk)
    }
    group.add(
      scatter((i) => instance(models.boulder, 1.1 + (i % 4) * 0.9), 14, heightAt, 45, {
        radius: 70,
        near: 5,
        scale: [0.7, 1.6],
        sink: 0.45,
      }),
    )
    // Lush long grass: the ground itself has to read as greenery, not as bare terrain with tufts on it.
    // Three layers — a tall fringe at the lens, dense mid-field, thin far wash — all from the one scan.
    const grassNear = grassField(models.grass, 1200, heightAt, 61, 1.2, 20, 1.2)
    if (grassNear) group.add(grassNear)
    const grass = grassField(models.grass, 2000, heightAt, 62, 12, 85, 1.7)
    if (grass) group.add(grass)
    const haze = new THREE.Color('#8fb27a').lerp(new THREE.Color(chapter.fog), 0.45)
    const ring = buildHorizonRing(330, 130, haze, 301)
    ring.position.y = -8
    group.add(ring)
  }

  // ── 04 · meadow lake ────────────────────────────────────────────────────────────────────────
  if (id === 'lake') {
    group.add(
      scatter((i) => instance(models.broadleaf, 6.5 + (i % 4) * 2.2), 26, heightAt, 33, {
        radius: 120,
        near: 14,
        scale: [0.85, 1.3],
        sink: 0.1,
      }),
    )
    group.add(
      scatter((i) => instance(models.fir, 9 + (i % 4) * 3), 18, heightAt, 21, {
        radius: 130,
        near: 26,
        scale: [0.8, 1.3],
        sink: 0.3,
      }),
    )
    group.add(
      scatter(
        (i) => instance(models.boulder, 1.4 + (i % 4) * 1.1),
        12,
        heightAt,
        45,
        { radius: 60, near: 5, scale: [0.7, 1.6], sink: 0.4 },
      ),
    )
    const grassNear = grassField(models.grass, 1100, heightAt, 63, 1.2, 18, 1.2)
    if (grassNear) group.add(grassNear)
    const grass = grassField(models.grass, 1900, heightAt, 64, 10, 80, 1.7)
    if (grass) group.add(grass)
    const haze = new THREE.Color('#9fc48a').lerp(new THREE.Color(chapter.fog), 0.4)
    const ring = buildHorizonRing(340, 130, haze, 303)
    ring.position.y = -6
    group.add(ring)
  }

  // ── 05 · desert oasis ───────────────────────────────────────────────────────────────────────
  if (id === 'desert') {
    group.add(
      scatter((i) => buildPalm(10 + (i % 5) * 2, i * 23 + index), 22, heightAt, 57, {
        radius: 46,
        near: 9,
        scale: [0.85, 1.3],
        sink: 0.2,
      }),
    )
    group.add(
      scatter(
        (i) => instance(models.boulder, 1.2 + (i % 4) * 1.4),
        16,
        heightAt,
        46,
        { radius: 80, near: 6, scale: [0.7, 1.8], sink: 0.5 },
      ),
    )
    const haze = new THREE.Color('#d9b98a').lerp(new THREE.Color(chapter.fog), 0.4)
    const ring = buildHorizonRing(330, 140, haze, 305)
    ring.position.y = -10
    group.add(ring)
  }

  // ── 06 · ice sea ────────────────────────────────────────────────────────────────────────────
  if (id === 'ice') {
    group.add(
      scatter(
        (i) => instance(models.boulder, 1.6 + (i % 3) * 1.6),
        10,
        heightAt,
        47,
        { radius: 70, near: 8, scale: [0.8, 1.8], sink: 0.5 },
      ),
    )
    const haze = new THREE.Color('#dcefff').lerp(new THREE.Color(chapter.fog), 0.3)
    const ring = buildHorizonRing(380, 210, haze, 307)
    ring.position.y = -10
    group.add(ring)
  }

  // ── 08 · ocean floor ────────────────────────────────────────────────────────────────────────
  if (id === 'deep') {
    group.add(
      scatter(
        (i) => instance(models.boulder, 1.8 + (i % 4) * 1.7),
        22,
        heightAt,
        46,
        { radius: 70, near: 5, scale: [0.8, 2.0], sink: 0.6 },
      ),
    )
    group.add(
      scatter((i) => buildKelp(6 + (i % 5) * 3, i * 29 + index), 34, heightAt, 61, {
        radius: 60,
        near: 4,
        scale: [0.8, 1.5],
        sink: 0.1,
      }),
    )
    group.add(buildLightShafts(9, 13, 110))
    const bubbles = buildBubbles(600, 17, 55)
    group.add(bubbles)
  }

  return { center: new THREE.Vector3(0, 0, chapterZ(index)), group, water: null }
}
