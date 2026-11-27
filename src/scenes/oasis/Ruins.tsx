import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyPainterlySurface } from '../scan/Fit'

function paintStone(geo: THREE.BufferGeometry, baseHex: string, aoBottom = 0.25, aoTop = 0.08): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  g.computeBoundingBox()
  const bb = g.boundingBox!
  const h = Math.max(bb.max.y - bb.min.y, 1e-4)
  const pos = g.attributes.position as THREE.BufferAttribute
  const norm = g.attributes.normal as THREE.BufferAttribute
  const cols = new Float32Array(pos.count * 3)

  const cLit = new THREE.Color(baseHex)
  const cShade = new THREE.Color('#8c6d5e')
  const tmp = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const ny = norm.getY(i)
    const t = THREE.MathUtils.clamp((y - bb.min.y) / h, 0, 1)

    // Ground-contact AO at bottom + under-lintel overhang shadow when normal points down
    const bottomMask = 1 - THREE.MathUtils.smoothstep(t, 0, 0.28)
    const overhang = THREE.MathUtils.clamp(-ny, 0, 1)
    const ao = THREE.MathUtils.clamp(bottomMask * aoBottom + overhang * 0.42 + (1 - t) * aoTop, 0, 0.72)

    tmp.copy(cLit).lerp(cShade, ao)
    // Subtle block-to-block warm/cool stone variation
    const grain = Math.sin(pos.getX(i) * 3.7 + pos.getY(i) * 5.1 + pos.getZ(i) * 2.9) * 0.035
    tmp.offsetHSL(grain * 0.25, 0, grain)

    cols[i * 3] = tmp.r
    cols[i * 3 + 1] = tmp.g
    cols[i * 3 + 2] = tmp.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  return g
}

/** Builds a single fluted sandstone column with torus base, entasis shaft, and flared capital */
function buildColumn(height: number, radius: number, broken = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  // Attic base plinth + torus
  const plinth = new THREE.BoxGeometry(radius * 2.8, radius * 0.55, radius * 2.8)
  plinth.translate(0, radius * 0.275, 0)
  parts.push(paintStone(plinth, '#dfbe92', 0.45, 0.1))

  const torus = new THREE.CylinderGeometry(radius * 1.24, radius * 1.32, radius * 0.42, 18)
  torus.translate(0, radius * 0.72, 0)
  parts.push(paintStone(torus, '#e5c69b', 0.35, 0.1))

  // Fluted shaft with classical entasis
  const shaftH = broken ? height * 0.56 : height - radius * 1.75
  const shaft = new THREE.CylinderGeometry(radius * 0.84, radius * 1.02, shaftH, 24, 16)
  shaft.translate(0, radius * 0.92 + shaftH * 0.5, 0)

  const pos = shaft.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const t = THREE.MathUtils.clamp((y - radius * 0.92) / Math.max(shaftH, 1e-4), 0, 1)
    const ang = Math.atan2(z, x)
    const entasis = 1 + Math.sin(t * Math.PI) * 0.045
    const flute = 1 - Math.max(0, Math.cos(ang * 16)) * 0.048 * THREE.MathUtils.smoothstep(t, 0.04, 0.12)
    // Fractured top edge if broken
    const jag = broken && t > 0.92 ? (Math.sin(ang * 3 + 0.7) * 0.14 + Math.cos(ang * 5) * 0.07) * (t - 0.92) * 10 : 0
    pos.setXYZ(i, x * entasis * flute, y + jag, z * entasis * flute)
  }
  pos.needsUpdate = true
  shaft.computeVertexNormals()
  parts.push(paintStone(shaft, '#edd0a4', 0.28, 0.14))

  if (!broken) {
    // Echinus flared capital + abacus slab
    const capY = radius * 0.92 + shaftH
    const echinus = new THREE.CylinderGeometry(radius * 1.35, radius * 0.86, radius * 0.48, 20)
    echinus.translate(0, capY + radius * 0.24, 0)
    parts.push(paintStone(echinus, '#e6c69a', 0.22, 0.18))

    const abacus = new THREE.BoxGeometry(radius * 2.85, radius * 0.36, radius * 2.85)
    abacus.translate(0, capY + radius * 0.64, 0)
    parts.push(paintStone(abacus, '#f0d5ad', 0.18, 0.25))
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

export function Ruins({
  position = [-5.4, 0, -13.4],
  yaw = 0.22,
  scale = 1.0,
  sunDir = [-5, 6.5, -3],
}: {
  position?: [number, number, number]
  yaw?: number
  scale?: number
  sunDir?: [number, number, number]
}) {
  const { geo, mat } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []

    // 1. Three-stepped stylobate platform
    const steps: [number, number, number, number][] = [
      [4.5, 0.22, 2.5, 0.11],
      [4.15, 0.20, 2.2, 0.31],
      [3.82, 0.18, 1.92, 0.49],
    ]
    for (const [w, h, d, y] of steps) {
      const box = new THREE.BoxGeometry(w, h, d)
      box.translate(0, y, 0)
      parts.push(paintStone(box, '#e5c598', 0.48, 0.12))
    }

    const baseTop = 0.58
    const colH = 2.55
    const colR = 0.18

    // 2. Front colonnade (4 columns across front, 1 broken on right) + 2 rear return columns
    const colSpecs: [number, number, boolean][] = [
      [-1.52, 0.62, false],
      [-0.52, 0.62, false],
      [0.48, 0.62, false],
      [1.48, 0.62, true], // snapped column shaft
      [-1.52, -0.58, false],
      [0.48, -0.58, false],
    ]
    for (const [cx, cz, broken] of colSpecs) {
      const col = buildColumn(colH, colR, broken)
      col.translate(cx, baseTop, cz)
      parts.push(col)
    }

    // 3. Architrave & weathered cornice beams spanning the standing columns
    const lintel1 = new THREE.BoxGeometry(2.65, 0.28, 0.54)
    lintel1.translate(-0.52, baseTop + colH + 0.12, 0.62)
    parts.push(paintStone(lintel1, '#efd3aa', 0.2, 0.35))

    const cornice1 = new THREE.BoxGeometry(2.82, 0.20, 0.68)
    cornice1.translate(-0.52, baseTop + colH + 0.34, 0.62)
    parts.push(paintStone(cornice1, '#f6dec0', 0.14, 0.2))

    // Left return architrave
    const lintelSide = new THREE.BoxGeometry(0.54, 0.26, 1.65)
    lintelSide.translate(-1.52, baseTop + colH + 0.11, 0.02)
    parts.push(paintStone(lintelSide, '#e8c89c', 0.22, 0.32))

    // 4. Fallen fluted column drum lying in the sand beside the broken column
    const drum = new THREE.CylinderGeometry(colR * 0.88, colR * 0.94, 0.92, 18)
    drum.rotateZ(Math.PI * 0.47)
    drum.rotateY(0.55)
    drum.translate(2.15, 0.16, 0.95)
    parts.push(paintStone(drum, '#dfb98c', 0.52, 0.15))

    // 5. Adjacent stepped sanctuary wall & weathered dome (mirrors ref structure right of colonnade)
    const shrineBase = new THREE.BoxGeometry(2.2, 1.35, 1.75)
    shrineBase.translate(3.25, 0.65, -0.55)
    parts.push(paintStone(shrineBase, '#e4c294', 0.45, 0.16))

    const shrineUpper = new THREE.BoxGeometry(1.65, 0.72, 1.35)
    shrineUpper.translate(3.25, 1.65, -0.55)
    parts.push(paintStone(shrineUpper, '#ecd0a6', 0.32, 0.18))

    const dome = new THREE.SphereGeometry(0.68, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55)
    dome.translate(3.25, 1.98, -0.55)
    parts.push(paintStone(dome, '#f5dec2', 0.22, 0.1))

    // Low perimeter wall blocks framing the temple yard
    const wallLeft = new THREE.BoxGeometry(1.35, 0.68, 0.45)
    wallLeft.translate(-2.75, 0.32, 0.45)
    parts.push(paintStone(wallLeft, '#deb98c', 0.5, 0.15))

    const merged = mergeGeometries(parts, false)
    parts.forEach((p) => p.dispose())

    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0,
    })
    applyPainterlySurface(m, {
      soft: 0.9,
      rimColor: '#fff2d8',
      shadowTint: '#8d6c5e',
      sunDir,
      brush: 0.75,
    })

    return { geo: merged, mat: m }
  }, [sunDir])

  return (
    <group position={position} rotation={[0, yaw, 0]} scale={scale}>
      <mesh geometry={geo} material={mat} />
    </group>
  )
}