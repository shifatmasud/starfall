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
  radialTexture,
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

/**
 * Water: three.js's own Water object, not a shader written here.
 *
 * It renders a real mirror pass from the scene, distorts it with the Megascans water normal map, and
 * tints the body per chapter — so the lake reflects the actual sky and the actual trees on its
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

/* ── the meadow lake, composed rather than inherited from the shared template ──────────────────
 *
 * The lake is the one chapter where the camera has to stand somewhere specific: on the near bank,
 * looking out across water. The shared "one basin centred on the diorama" heightfield could not
 * express that (the basin sat behind the lens, so the frame was a green wall), so the chapter gets
 * its own ground profile and its own water surface: a curved shoreline, water that begins where the
 * land stops, a far bank that rises into the treeline.
 */

/** Water level for the lake chapter. */
const LAKE_Y = 0

/** The waterline, in local z, as a gently wandering curve across x. The lens stands 20 m back from
 *  it, so a wide meadow leads the frame and the lake sits in the middle band. */
const lakeShore = (x: number) =>
  Math.sin(x * 0.045) * 1.6 + Math.sin(x * 0.013 + 1.7) * 2.8

/** Ground for the lake: bank at the lens, bed under the water, far shore rising, hills closing the
 *  sides. Everything is a function of the same shoreline that the water mesh uses, so they meet. */
function lakeGround(x: number, z: number) {
  const s = lakeShore(x)
  const bed = -3.4 - 0.7 * Math.sin(x * 0.012) * Math.cos(z * 0.017)
  // The waterline is exactly z === s. The bank stands a little above the water there and rises
  // gently back to the lens, so the meadow reads as a shore and not as a cliff.
  const d = z - s
  const rise = 0.3 + 2.3 * THREE.MathUtils.smoothstep(d, 0, 20)
  const undulation =
    0.08 * Math.sin(x * 0.07) * Math.cos(z * 0.05) * THREE.MathUtils.smoothstep(d, 0, 6)
  let y = d >= 0 ? rise + undulation : bed * THREE.MathUtils.smoothstep(-d, 0, 7)
  // the far shore: water stops being water around 205 m out
  y += THREE.MathUtils.smoothstep(-z, 205, 305) * 26
  // side hills, so the horizon is enclosed by land instead of a hard edge
  y += THREE.MathUtils.smoothstep(Math.abs(x), 95, 230) * 13
  return y
}

/** A water surface whose near edge follows the shoreline instead of being a cut circle. */
function lakeSurfaceGeometry(half: number, far: number, wSeg = 150, dSeg = 110) {
  const position: number[] = []
  const uv: number[] = []
  const index: number[] = []
  for (let j = 0; j <= dSeg; j += 1) {
    // points bunch up near the shore, where the reflection is read closest
    const f = Math.pow(j / dSeg, 1.7)
    for (let i = 0; i <= wSeg; i += 1) {
      const u = i / wSeg
      const x = -half + u * half * 2
      const s = lakeShore(x)
      // Built in the XY plane and rotated onto the ground by the caller: three's Water reflects
      // about the plane normal (0,0,1) of its own local space, so an XZ grid mirrors nothing.
      position.push(x, -(s - 0.4 + (far - s) * f), 0)
      uv.push(u * 16, f * 12)
    }
  }
  for (let j = 0; j < dSeg; j += 1) {
    for (let i = 0; i < wSeg; i += 1) {
      const a = j * (wSeg + 1) + i
      const b = a + 1
      const c = a + wSeg + 1
      const d = c + 1
      index.push(a, b, c, b, d, c)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}


/** A scanned plant, instanced across a chapter's floor.
 *
 * Each Poly Haven plant is a small clump with its own real size, so it is scaled by height, never by
 * footprint: scaling a 0.4 m tuft by its width gave a 30 cm plant that vanished at camera distance,
 * which is why the meadow had no grass in it.
 */
function grassField(
  model: THREE.Object3D,
  count: number,
  heightAt: (x: number, z: number) => number,
  seed: number,
  near = 2,
  far = 46,
  targetHeight = 0.9,
  avoid?: (x: number, z: number) => boolean,
): THREE.Group | null {
  const k = plantScale(model, targetHeight)
  const r = rng(seed)
  const matrices: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const sv = new THREE.Vector3()
  const p = new THREE.Vector3()
  for (let i = 0; i < count; i += 1) {
    const a = r() * Math.PI * 2
    const d = near + Math.sqrt(r()) * (far - near)
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    if (avoid && avoid(x, z)) continue
    p.set(x, heightAt(x, z) - 0.03, z)
    e.set(0, r() * Math.PI * 2, 0)
    q.setFromEuler(e)
    const vary = k * (0.75 + r() * 0.6)
    sv.set(vary, vary, vary)
    matrices.push(new THREE.Matrix4().compose(p, q, sv))
  }
  return instancedPlants(model, matrices)
}

/**
 * Real scanned plants, instanced correctly.
 *
 * A Poly Haven plant is not one mesh: a grass or a fern ships as twenty-odd separate clumps, each
 * placed by its own node transform inside the model. Instancing only the first mesh (and scaling it
 * by that mesh's own bounds) is why earlier passes had 4 m reeds instead of a meadow. So every mesh
 * in the model is instanced, each carrying its own offset inside the model, and the scale comes from
 * the whole plant's bounds.
 */
function instancedPlants(model: THREE.Object3D, matrices: THREE.Matrix4[]): THREE.Group | null {
  model.updateMatrixWorld(true)
  const rootInv = new THREE.Matrix4().copy(model.matrixWorld).invert()
  const group = new THREE.Group()
  let count = 0
  model.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const local = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld)
    const instanced = new THREE.InstancedMesh(
      mesh.geometry,
      mesh.material as THREE.MeshStandardMaterial,
      matrices.length,
    )
    const m = new THREE.Matrix4()
    for (let i = 0; i < matrices.length; i += 1) {
      m.multiplyMatrices(matrices[i], local)
      instanced.setMatrixAt(i, m)
    }
    instanced.instanceMatrix.needsUpdate = true
    instanced.castShadow = false
    // thin double-sided cards shadow themselves into a black mass through the shadow map
    instanced.receiveShadow = false
    instanced.frustumCulled = false
    group.add(instanced)
    count += 1
  })
  return count ? group : null
}

/** The scale a plant needs to stand `targetHeight` tall, from the whole plant's bounds. */
function plantScale(model: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  box.getSize(size)
  return size.y > 0.0001 ? targetHeight / size.y : 1
}

/** Plants scattered through a rectangle of ground, skipping anything below the waterline. */
function plantField(
  model: THREE.Object3D,
  count: number,
  heightAt: (x: number, z: number) => number,
  seed: number,
  zone: { x0: number; x1: number; z0: number; z1: number },
  targetHeight: number,
  minY = LAKE_Y + 0.08,
  avoid?: (x: number, z: number) => boolean,
): THREE.Group | null {
  const k = plantScale(model, targetHeight)
  const r = rng(seed)
  const matrices: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const sv = new THREE.Vector3()
  const p = new THREE.Vector3()
  let tries = 0
  while (matrices.length < count && tries < count * 6) {
    tries += 1
    const x = zone.x0 + r() * (zone.x1 - zone.x0)
    const z = zone.z0 + r() * (zone.z1 - zone.z0)
    const y = heightAt(x, z)
    if (y < minY) continue
    if (avoid && avoid(x, z)) continue
    p.set(x, y - 0.03, z)
    e.set(0, r() * Math.PI * 2, 0)
    q.setFromEuler(e)
    const vary = k * (0.75 + r() * 0.6)
    sv.set(vary, vary, vary)
    matrices.push(new THREE.Matrix4().compose(p, q, sv))
  }
  if (!matrices.length) return null
  return instancedPlants(model, matrices)
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
  // The lake chapter's ground is its own profile: a bank at the lens, a bed under the water, and a
  // shoreline the water mesh can actually meet. Everything else keeps the shared rolling field.
  const heightAt = (x: number, z: number) =>
    id === 'lake'
      ? lakeGround(x, z)
      : id === 'forest'
        ? // the forest floor is a flat shelf in the clearing, so the lens sits at a known height and
          // the ground under the pearl is level; hills rise outside it, which is what closes the view
          height(x, z, 0) * THREE.MathUtils.smoothstep(Math.hypot(x, z), 30, 90)
        : height(x, z, basin)
  const shelf = id === 'forest' ? 60 : chapter.water && id !== 'lake' ? 46 : undefined

  const groundMaterial = art.ground[id] ? (art.ground[id].clone() as THREE.MeshStandardMaterial) : undefined
  if (groundMaterial && id === 'lake') {
    // 110 repeats over a 460 m plane is 4 m a tile, which reads as mown stripes at this distance;
    // the meadow wants one big broad tile instead.
    for (const key of ['map', 'normalMap'] as const) {
      const texture = groundMaterial[key]
      if (texture) {
        const copy = texture.clone()
        copy.repeat.set(26, 26)
        copy.needsUpdate = true
        groundMaterial[key] = copy
      }
    }
  }
  if (groundMaterial) {
    // A wash of white toward the chapter's colour kills the photograph underneath and leaves a flat
    // painted card. Keep the scan's own albedo and only tint it lightly.
    groundMaterial.color = new THREE.Color(chapter.groundAlt)
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

  addGround(
    id === 'lake' ? 460 : id === 'ice' ? 420 : 340,
    id === 'lake' ? 230 : id === 'deep' ? 130 : 110,
  )
  // Water belongs to the chapters that have a lake or a sea in them. Keying it off a palette flag put
  // a mirror plane in the middle of the forest floor, and a 130 m circle of it drowned the whole
  // meadow: the lake is a lake, with the camera standing on the shore.
  const qaSkipWater = typeof window !== 'undefined' && /nowater/.test(window.location.search)
  if (id === 'lake' && !qaSkipWater) {
    const surface = new Water(lakeSurfaceGeometry(320, -320), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: art.waterNormals,
      sunDirection: new THREE.Vector3(...chapter.sunDir).normalize(),
      sunColor: new THREE.Color('#fff4da'),
      waterColor: new THREE.Color('#2a7ea2'),
      distortionScale: 2.4,
      fog: true,
    })
    surface.rotation.x = -Math.PI / 2
    surface.position.y = LAKE_Y
    const material = surface.material as THREE.ShaderMaterial
    material.uniforms.size.value = 3.0
    material.transparent = true
    material.uniforms.alpha = { value: 0.9 }
    group.add(surface)
  } else if (id === 'desert' || id === 'ice') {
    water(
      group,
      chapter,
      id === 'ice' ? 220 : 90,
      id === 'desert' ? -1.2 : 0.15,
      art,
      chapter.sunDir,
      chapter.sun,
    )
  }

  // ── 03 · forest: shot from inside the stand ─────────────────────────────────────────────────
  // Read off the reference frame: a big trunk as a column at the left edge, more trunks receding,
  // a mossy floor with ferns at the sides and daisies in the near grass, and the pearl resting in
  // an open clearing in the middle band with light falling through the canopy onto it. The lens is
  // low and wide, so the floor leads and the canopy closes the top.
  if (id === 'forest') {
    const orbAt = new THREE.Vector3(chapter.orb[0], chapter.orb[1], chapter.orb[2])
    // Nothing tall stands between the lens and the pearl, or in the pearl's own pool of light.
    // Without this the floor plantings close over the subject and the chapter reads as a bush.
    // the sight line runs from the lens (chapter.cam.pos) to the pearl, so the corridor is measured
    // against that segment rather than straight down the axis: a tree 20 m from the pearl can still
    // stand exactly in front of it
    const lensX = chapter.cam.pos[0]
    const lensZ = chapter.cam.pos[2]
    const segX = orbAt.x - lensX
    const segZ = orbAt.z - lensZ
    const segLen2 = segX * segX + segZ * segZ
    const clearing = (x: number, z: number) => {
      const dx = x - orbAt.x
      const dz = z - orbAt.z
      // nothing stands within 7 m of the lens either: a 30 m trunk three metres from the camera is
      // a black wall, which is exactly what the last pass was
      if (Math.hypot(x - lensX, z - lensZ) < 7) return true
      if (dx * dx + dz * dz < 70) return true
      const t = THREE.MathUtils.clamp(((x - lensX) * segX + (z - lensZ) * segZ) / segLen2, 0, 1)
      const px = lensX + segX * t
      const pz = lensZ + segZ * t
      return Math.hypot(x - px, z - pz) < 2.2
    }

    // Hero trunks: columns at the frame edges, placed by angle from the lens rather than by eye.
    // At 9 m a 22 m trunk fills the left edge; at 3 m a 30 m trunk is a black wall, which is what
    // the last two passes were. Each one sits at ~78% of the frame's half width for its distance.
    for (const [x, z, h, tilt] of [
      [-11.5, 1, 21, 0.03],
      [-20, -9, 23, -0.02],
      [11, -2, 21, -0.03],
      [20.5, -13, 23, 0.02],
    ] as const) {
      const trunk = instance(models.spruce, h)
      trunk.position.set(x, heightAt(x, z) - 0.4, z)
      trunk.rotation.z = tilt
      group.add(trunk)
    }
    // The stand: dense in the middle distance so the horizon is trunks in haze, not lawn. Nothing
    // inside 30 m of the chapter centre, so no trunk lands on the lens.
    group.add(
      scatter((i) => instance(models.spruce, 20 + (i % 7) * 3.5), 42, heightAt, 21, {
        radius: 150,
        near: 30,
        scale: [0.85, 1.5],
        sink: 0.3,
        avoid: clearing,
      }),
    )
    // Canopy: needle-bearing trees standing ahead of the lens, tall enough that their crowns close
    // the top of the frame and cut the sun into patches. They are exclusions-tested against the
    // sightline, so no crown sits between the camera and the pearl.
    {
      const r = rng(1337)
      const canopy = new THREE.Group()
      let placed = 0
      let guard = 0
      while (placed < 34 && guard < 900) {
        guard += 1
        const x = -34 + r() * 68
        const z = -52 + r() * 46
        if (Math.hypot(x - orbAt.x, z - orbAt.z) < 10) continue
        if (clearing(x, z)) continue
        const tree = instance(models.pine, 14 + r() * 9)
        tree.position.set(x, heightAt(x, z) - 0.3, z)
        tree.rotation.y = r() * Math.PI * 2
        canopy.add(tree)
        placed += 1
      }
      group.add(canopy)
    }
    // Deadfall lies in the litter at the sides, never across the sightline.
    group.add(
      scatter((i) => instance(models.deadTrunk, 0.7 + (i % 3) * 0.5), 8, heightAt, 71, {
        radius: 40,
        near: 5,
        scale: [0.9, 1.4],
        sink: 0.35,
        avoid: clearing,
      }),
    )
    group.add(
      scatter((i) => instance(models.msBoulder, 1.1 + (i % 5) * 0.9), 30, heightAt, 45, {
        radius: 70,
        near: 3.5,
        scale: [0.7, 1.7],
        sink: 0.4,
        avoid: clearing,
      }),
    )
    group.add(
      scatter((i) => instance(models.msBoulder, 2.4 + (i % 4) * 1.3), 10, heightAt, 51, {
        radius: 80,
        near: 7,
        scale: [0.8, 1.4],
        sink: 0.45,
        avoid: clearing,
      }),
    )

    // The floor, in layers: moss carpet under everything, fern banks at the sides framing the
    // clearing, long grass in the near band, and daisies where the lens reads them at the bottom.
    // moss is the carpet under the grass: scaled to a real groundcover height, it is what stops the
    // floor reading as bare green paint between the tufts
    const moss = grassField(models.moss, 1200, heightAt, 78, 1, 40, 0.28)
    if (moss) group.add(moss)
    // floor litter: the scanned ground already carries the moss and leaf colour, so it is not
    // repainted, only broken up
    const fernLeft = plantField(models.fern, 170, heightAt, 91, { x0: -22, x1: -2.8, z0: -10, z1: 16 }, 1.15)
    if (fernLeft) group.add(fernLeft)
    const fernRight = plantField(models.fern, 170, heightAt, 92, { x0: 2.8, x1: 24, z0: -10, z1: 16 }, 1.15)
    if (fernRight) group.add(fernRight)
    const fernBack = plantField(models.fern, 150, heightAt, 94, { x0: -30, x1: 30, z0: -34, z1: -16 }, 1)
    if (fernBack) group.add(fernBack)
    // the floor itself: long grass, near and dense, thinning into the trees. This is what the
    // reference's forest is actually made of, and a bare moss shelf reads as a lawn.
    // green scan, not the dry one: grass_medium_02 is tan straw, and a straw floor reads as dead
    const grassNear = grassField(models.grassClump, 6400, heightAt, 61, 1.2, 18, 0.95, clearing)
    if (grassNear) group.add(grassNear)
    const grassMid = grassField(models.wildGrass, 5200, heightAt, 62, 6, 44, 1.05, clearing)
    if (grassMid) group.add(grassMid)
    const grassFar = grassField(models.wildGrass, 2400, heightAt, 63, 30, 95, 0.8, clearing)
    if (grassFar) group.add(grassFar)
    // the pearl's own pool of light on the floor: a soft radial glow laid on the ground, not a hard
    // disc, because a flat circle with an edge reads as a white pancake
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(226,232,255,0.95)', 'rgba(190,205,255,0.22)', 256, 2.2),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(orbAt.x, heightAt(orbAt.x, orbAt.z) + 0.06, orbAt.z)
    group.add(pool)
    const daisies = plantField(models.daisy, 900, heightAt, 95, { x0: -14, x1: 14, z0: 0, z1: 15 }, 0.42)
    if (daisies) group.add(daisies)
    // blades right under the lens: the reference frame's bottom edge is out-of-focus grass, and
    // without it the floor reads as a lawn viewed from standing height
    const grassLens = plantField(models.grassGreen, 1600, heightAt, 96, { x0: -10, x1: 10, z0: 9, z1: 16 }, 0.8)
    if (grassLens) group.add(grassLens)
    // the visible floor as one field: the ring scatter alone left a bare carpet down the middle of
    // the frame, which reads as a path nobody asked for
    const grassFloor = plantField(
      models.grassGreen,
      3200,
      heightAt,
      97,
      { x0: -26, x1: 26, z0: -16, z1: 16 },
      0.42,
      -100,
      clearing,
    )
    if (grassFloor) group.add(grassFloor)

    // Sun coming through the canopy: a haze card over the clearing rather than cone geometry, which
    // engulfed the lens and washed the frame white.
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 60),
      new THREE.MeshBasicMaterial({
        color: '#fff6d8',
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    )
    haze.position.set(-6, 14, -46)
    group.add(haze)

    // distance: a scanned ridge behind the stand, so the horizon is a landform and not a gradient
    const ridge = instance(models.ridge, 95)
    ridge.position.set(-120, -18, -560)
    group.add(ridge)
    const ridgeB = instance(models.ridge, 70)
    ridgeB.position.set(180, -14, -620)
    ridgeB.rotation.y = 1.2
    group.add(ridgeB)
  }

  // ── 04 · meadow lake ────────────────────────────────────────────────────────────────────────
  // Read off the reference frame: long grass and daisies filling the bottom edge, the waterline a
  // few metres out, water to a treed far bank, mountains behind it, sky in the top third. Camera on
  // the bank at 2.1 m, so the meadow is the foreground and the lake is the subject.
  if (id === 'lake') {
    // meadow — a narrow band on the bank, so grass frames the bottom edge instead of walling off the
    // water. Density is highest where the lens reads it.
    const grassNear = plantField(
      models.grassGreen,
      2600,
      heightAt,
      63,
      { x0: -12, x1: 12, z0: 1, z1: 19 },
      0.5,
    )
    if (grassNear) group.add(grassNear)
    const grassMid = plantField(
      models.grassGreen,
      2200,
      heightAt,
      64,
      { x0: -46, x1: 46, z0: -1, z1: 19 },
      0.44,
    )
    if (grassMid) group.add(grassMid)
    const grassFar = plantField(
      models.grassGreen,
      2200,
      heightAt,
      65,
      { x0: -120, x1: 120, z0: -2, z1: 17 },
      0.4,
    )
    if (grassFar) group.add(grassFar)
    // the waterline fringe: short tufts at the edge, which is what makes a shore read as a shore
    const fringe = plantField(
      models.grassGreen,
      900,
      heightAt,
      66,
      { x0: -70, x1: 70, z0: -1.4, z1: 0.8 },
      0.28,
    )
    if (fringe) group.add(fringe)
    const ferns = plantField(models.fern, 240, heightAt, 93, { x0: -32, x1: 32, z0: 0, z1: 19 }, 0.45)
    if (ferns) group.add(ferns)

    // rocks at the waterline, some of them half in it
    const shoreRocks = new THREE.Group()
    const rr = rng(45)
    for (let i = 0; i < 30; i += 1) {
      const x = -95 + rr() * 190
      const s = lakeShore(x)
      const z = s + 0.5 + rr() * 2.4
      const size = 0.4 + rr() * 1.0
      const rock = instance(models.rock, size)
      rock.position.set(x, heightAt(x, z) - size * 0.3, z)
      rock.rotation.y = rr() * Math.PI * 2
      shoreRocks.add(rock)
    }
    for (let i = 0; i < 12; i += 1) {
      const x = -80 + rr() * 160
      const z = lakeShore(x) - 0.5 - rr() * 1.6
      const size = 0.5 + rr() * 0.9
      const rock = instance(models.rock, size)
      rock.position.set(x, LAKE_Y - size * 0.55, z)
      rock.rotation.y = rr() * Math.PI * 2
      shoreRocks.add(rock)
    }
    group.add(shoreRocks)

    // far bank: not a row but a wood. Three depth bands with their own size ranges, clumped with a
    // coarse noise field so the canopy opens and closes the way a treeline does, and a few trees
    // standing in the shallows at the water's edge.
    const treeline = new THREE.Group()
    const tr = rng(71)
    const clump = (x: number, z: number) =>
      Math.sin(x * 0.021 + z * 0.004) * 0.5 + Math.sin(x * 0.008 - z * 0.011) * 0.35 + 0.15
    const bands: Array<{ z0: number; z1: number; h0: number; h1: number; n: number }> = [
      { z0: -206, z1: -222, h0: 7, h1: 15, n: 54 },
      { z0: -226, z1: -252, h0: 14, h1: 26, n: 60 },
      { z0: -256, z1: -296, h0: 22, h1: 40, n: 52 },
    ]
    for (const band of bands) {
      for (let i = 0; i < band.n; i += 1) {
        const x = -300 + tr() * 600
        const z = band.z0 + tr() * (band.z1 - band.z0)
        if (clump(x, z) < 0.06) continue
        const y = heightAt(x, z)
        if (y < LAKE_Y + 0.2) continue
        const conifer = tr() < 0.7
        const scale = band.h0 + tr() * (band.h1 - band.h0)
        const tree = instance(conifer ? models.pine : models.leafTree, scale)
        tree.position.set(x, y - 0.5, z)
        tree.rotation.y = tr() * Math.PI * 2
        treeline.add(tree)
      }
    }
    group.add(treeline)

    // shrubs at the water's edge, so the land-water line breaks up instead of running as a rule
    const shoreBrush = new THREE.Group()
    const br = rng(88)
    for (let i = 0; i < 60; i += 1) {
      const x = -160 + br() * 320
      const s0 = lakeShore(x)
      const z = s0 - 2.4 - br() * 2.2
      const y = heightAt(x, z)
      if (y < LAKE_Y - 0.6) continue
      const bush = instance(br() < 0.5 ? models.fern : models.moss, 0.9 + br() * 1.6)
      bush.position.set(x, Math.max(y, LAKE_Y - 0.5) - 0.15, z)
      bush.rotation.y = br() * Math.PI * 2
      shoreBrush.add(bush)
    }
    group.add(shoreBrush)

    // mountains behind the far bank: scanned ridges, pushed out far enough to sit in haze
    const ridge = instance(models.ridge, 88)
    ridge.position.set(-240, -6, -430)
    ridge.rotation.y = 0.4
    group.add(ridge)
    const ridgeB = instance(models.ridge, 70)
    ridgeB.position.set(230, -8, -470)
    ridgeB.rotation.y = -0.7
    group.add(ridgeB)
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
