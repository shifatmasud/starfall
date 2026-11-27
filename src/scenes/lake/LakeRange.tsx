import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Terrain, makeTerrainSampler } from '../scan/Terrain'
import { applyPainterlySurface } from '../scan/Fit'
import { buildSoftConifer } from './SoftConifer'
import { lakeHeight } from './LakeGround'

const SUN4: [number, number, number] = [0.64, 0.52, -0.56]

// 1. Far receding horizon peaks (left & center): pale blue silhouettes with trace snow only at the very top
const FAR_HORIZON_PEAKS = {
  lit: '#b6cce8',
  shade: '#88a2cc',
  snowLit: '#f4f9ff',
  snowShade: '#cdddf4',
  snowLine: 0.88,
  air: '#dceafa',
}

// 2. Far-left receding valley hills (no snow)
const LEFT_VALLEY_RIDGE = {
  lit: '#a8c0e2',
  shade: '#7c96c0',
  air: '#dceafa',
}

// 3. Lower sunny pasture & forested mountainside shelf sweeping down to the right lake shore
const RIGHT_PASTURE_SLOPE = {
  lit: '#92ac6c',
  shade: '#5c786e',
  snowLit: '#eef5ff',
  snowShade: '#b4cae4',
  snowLine: 0.94,
  air: '#c6dcf4',
}


/** the hero alpine peak's own height field, shared by the mesh and by everything placed on it */
export function heroHeight(x: number, z: number): number {
  const dx1 = (x - 26) / 34
  const dz1 = (z + 84) / 22
  const mainCone = Math.max(0, 1 - Math.pow(Math.hypot(dx1, dz1), 0.88)) * 24.5
  const dx2 = (x - 2) / 28
  const dz2 = (z + 88) / 20
  const westShoulder = Math.max(0, 1 - Math.pow(Math.hypot(dx2, dz2), 0.92)) * 13.5
  const baseMass = Math.max(mainCone, westShoulder)
  const ang = Math.atan2(z + 84, x - 26)
  const spur1 = Math.abs(Math.sin(ang * 5.0 + x * 0.08)) * 0.34
  const spur2 = Math.abs(Math.cos(ang * 9.0 - z * 0.11)) * 0.18
  const ridgeFactor = 1.0 - (spur1 + spur2) * THREE.MathUtils.smoothstep(baseMass, 2.0, 18.0)
  const zSkirt = THREE.MathUtils.smoothstep(z, -54, -66) * (1 - THREE.MathUtils.smoothstep(z, -102, -110))
  return -0.8 + baseMass * ridgeFactor * zSkirt
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

/**
 * Procedural ridged alpine hero mountain (right of center, matching ref4_range):
 * Sharp pointed summit, radiating dark ridge spurs, eroded gullies, lower green pasture shelf,
 * and trace snow in high couloirs — pure high-subdivision geometry + vertex shading (~12k tris).
 */
function HeroAlpinePeak({ sunDir = SUN4 }: { sunDir?: [number, number, number] }) {
  const { geo, mat } = useMemo(() => {
    const segX = 96
    const segZ = 64
    const g = new THREE.PlaneGeometry(118, 56, segX, segZ)
    g.rotateX(-Math.PI / 2)
    g.translate(22, -0.8, -82)

    const pos = g.attributes.position as THREE.BufferAttribute
    const count = pos.count
    const colors = new Float32Array(count * 3)
    const sun = new THREE.Vector3(...sunDir).normalize()

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)

      pos.setY(i, heroHeight(x, z))
    }
    pos.needsUpdate = true
    g.computeVertexNormals()

    const norm = g.attributes.normal as THREE.BufferAttribute
    const cPastureLit = new THREE.Color('#86a266')
    const cPastureShade = new THREE.Color('#4f6c64')
    const cRockLit = new THREE.Color('#8fa2be')
    const cRockShade = new THREE.Color('#526888')
    const cSnowTrace = new THREE.Color('#eef4fc')
    const cAir = new THREE.Color('#cce0f6')
    const tmp = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const nx = norm.getX(i)
      const ny = norm.getY(i)
      const nz = norm.getZ(i)

      const ndotl = nx * sun.x + ny * sun.y + nz * sun.z
      const sunFace = THREE.MathUtils.smoothstep(ndotl, -0.15, 0.72)

      // Lower slopes are alpine pasture/forest; upper steep ribs are grey-blue alpine rock
      const rockMix = THREE.MathUtils.smoothstep(y, 5.5, 11.5)
      const pastureCol = cPastureShade.clone().lerp(cPastureLit, sunFace)
      const rockCol = cRockShade.clone().lerp(cRockLit, sunFace)
      tmp.copy(pastureCol).lerp(rockCol, rockMix)

      // Trace snow only in high sheltered gullies (ny > 0.78 and y > 15.5)
      const snowMask = THREE.MathUtils.smoothstep(y, 15.5, 20.5) * THREE.MathUtils.smoothstep(ny, 0.74, 0.9) * 0.55
      tmp.lerp(cSnowTrace, snowMask)

      // forest speckle on the pasture belt, rock ribs higher up: painted texture, not a flat gradient
      {
        const x = pos.getX(i)
        const n1 = Math.sin(x * 1.1 + z * 0.45 + Math.sin(z * 0.6) * 2.0) * 0.5 + 0.5
        const n2 = Math.sin(x * 2.6 - z * 1.3 + Math.sin(x * 0.9)) * 0.5 + 0.5
        const forest = (1 - rockMix) * (n1 * 0.6 + n2 * 0.4)
        tmp.lerp(tmp.clone().multiplyScalar(0.58 + 0.22 * n2), forest * 0.9)
        tmp.multiplyScalar(0.94 + 0.12 * n2)
      }

      // Distance aerial perspective
      const airMix = THREE.MathUtils.smoothstep(-z, 62.0, 108.0) * 0.42
      tmp.lerp(cAir, airMix)

      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // baked like the rest of the range: the vertex colours already carry the sun, so no live
    // lambert pass can turn the mountain into a dark navy cut-out
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })

    /**
     * The hillside is painted per fragment, not per vertex: at 1 m between vertices the vertex
     * colours could only ever be a green blob. Slope (from screen-space derivatives of the world
     * position, so no normal attribute is needed), height and two rotated octaves of brushwork mix
     * the meadow olive, dry ochre and alpine slate into pasture, dry grass and rock, and the baked
     * sun/shade is carried through as a ratio, so the slope still catches the light.
     */
    const PAINT = /* glsl */ `
      varying vec3 vHillPos;
      uniform vec3 uMeadow;
      uniform vec3 uOlive;
      uniform vec3 uOchre;
      uniform vec3 uSlate;
      uniform vec3 uBase;
      float hg(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec2 hg2(vec2 p){ return vec2(hg(p), hg(p + 19.19)); }
      float gn(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        vec2 g00 = normalize(hg2(i) - 0.5), g10 = normalize(hg2(i + vec2(1.0, 0.0)) - 0.5);
        vec2 g01 = normalize(hg2(i + vec2(0.0, 1.0)) - 0.5), g11 = normalize(hg2(i + vec2(1.0, 1.0)) - 0.5);
        float n00 = dot(g00, f), n10 = dot(g10, f - vec2(1.0, 0.0));
        float n01 = dot(g01, f - vec2(0.0, 1.0)), n11 = dot(g11, f - vec2(1.0, 1.0));
        return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y) * 2.0;
      }
      float fbm2(vec2 p){
        mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
        return gn(p) * 0.72 + gn(r * (p * 1.7) + 9.1) * 0.38;
      }
    `
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uMeadow = { value: new THREE.Color('#a6c06a') }
      shader.uniforms.uOlive = { value: new THREE.Color('#55663a') }
      shader.uniforms.uOchre = { value: new THREE.Color('#a89a62') }
      shader.uniforms.uSlate = { value: new THREE.Color('#6c7a82') }
      shader.uniforms.uBase = { value: new THREE.Color('#8ba468') }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vHillPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHillPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PAINT}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 hN = normalize(cross(dFdx(vHillPos), dFdy(vHillPos)));
            if (hN.y < 0.0) hN = -hN;
            float slope = 1.0 - clamp(hN.y, 0.0, 1.0);
            vec2 wp = vHillPos.xz;
            float m1 = fbm2(wp * 0.075);
            float m2 = fbm2(wp * 0.19 + 4.3);
            float h = vHillPos.y;
            float m3 = fbm2(wp * 0.55 + 11.7);
            vec3 c = mix(uMeadow, uOlive, smoothstep(-0.2, 0.6, m1) * 0.72 + 0.1);
            c = mix(c, uOchre, smoothstep(0.15, 0.8, m2) * 0.5);
            c = mix(c, uOlive, smoothstep(0.3, 0.85, m3) * 0.3);
            // steep ground dries to ochre gravel, high ground to slate rock
            c = mix(c, uOchre, smoothstep(0.22, 0.55, slope) * 0.62);
            c = mix(c, uSlate, smoothstep(0.42, 0.85, slope) * 0.85 + smoothstep(7.0, 15.0, h) * 0.6);
            // clumps of pasture woodland, painted in: a soft dark mottle where trees would stand
            float clump = smoothstep(0.35, 0.9, fbm2(wp * 0.34 - 6.1));
            c = mix(c, c * vec3(0.62, 0.72, 0.68), clump * 0.55 * (1.0 - smoothstep(0.3, 0.55, slope)));
            // carry the baked sun/shade through as a ratio to the palette's base
            diffuseColor.rgb *= c / uBase;
          }`,
        )
    }
    m.customProgramCacheKey = () => 'hero-alpine-painted-v2'

    return { geo: g, mat: m }
  }, [sunDir])

  return <mesh geometry={geo} material={mat} />
}

/**
 * The hillside forest: real conifers in overlapping clusters down the hero peak's right flank and
 * along its foot at the water, the way the reference panel's belt sits — dense, varied in height,
 * grouped rather than spaced out in a row.
 */
function ForestBelt({ sunDir = SUN4 }: { sunDir?: [number, number, number] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const [instances, setInstances] = useState<TreeInstance[]>([])

  const { geo, mat } = useMemo(() => {
    const g = buildSoftConifer({ seed: 21, tiers: 7, perTier: 4, seg: [5, 3], lift: 0.02, width: 0.4 })
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    })
    applyPainterlySurface(m, {
      soft: 0.85,
      rimColor: '#e8f2ff',
      shadowTint: '#40586a',
      sunDir,
      brush: 1,
      brushScale: 16,
    })
    return { geo: g, mat: m }
  }, [sunDir])

  // The forest stands on ground that is already drawn: the right pasture terrain (sampled from its
  // own DEM) up the hillside, and the lake's far bank (sampled from the meadow field) at the water.
  useEffect(() => {
    let live = true
    const pasture = makeTerrainSampler({
      dem: '/tex/dem/ridge-h.webp',
      size: [68, 48],
      relief: 13,
      position: [30, -0.8, -46],
      yaw: 0.78,
    })
    const slope = makeTerrainSampler({
      dem: '/tex/dem/ridge-h.webp',
      size: [64, 42],
      relief: 7.5,
      position: [32, -0.7, -38],
      yaw: 0.75,
    })
    Promise.all([pasture, slope]).then(([hill, terrace]) => {
      if (!live) return
      const ground = (x: number, z: number) => {
        const h = hill(x, z)
        const t = terrace(x, z)
        const bank = lakeHeight(x, z)
        return h > 0.35 ? h : t > 0.35 ? t : bank
      }
      const list: TreeInstance[] = []
      const cNearTint = new THREE.Color('#cfe0c4')
      const cFarTint = new THREE.Color('#9fbcd8')
      let i = 0
      const pushTree = (x: number, z: number, hMin: number, hMax: number, haze: number, maxY = 3.2) => {
        i++
        const y = ground(x, z)
        if (y < 0.1 || y > maxY) return
        const h = hMin + (hMax - hMin) * hash(i * 5.13, 2.91)
        list.push({
          x,
          y: y - 0.12,
          z,
          sx: h * (0.6 + 0.28 * hash(i * 3.1, 1.7)),
          sy: h,
          yaw: hash(i * 3.91, 6.47) * Math.PI * 2,
          tilt: (hash(i * 7.7, 2.3) - 0.5) * 0.05,
          tint: cNearTint.clone().lerp(cFarTint, haze * 0.55),
        })
      }

      // 1. the treeline at the water: it follows the far shore's own curve, two or three trees deep,
      //    so the lake's edge is a dark band of firs instead of a bare grass line
      for (let k = 0; k <= 44; k++) {
        const x = -26 + k * 1.55
        const shoreZ = -42.2 + Math.sin(x * 0.09) * 3.5 + Math.cos(x * 0.19) * 1.8
        const depth = 2 + 6 * hash(k * 2.3, 5.7)
        const z = shoreZ - depth
        pushTree(x + (hash(k * 1.7, 3.1) - 0.5) * 1.1, z, 2.4, 5.2, 0.35)
        if (hash(k * 4.1, 8.3) > 0.35) pushTree(x + (hash(k * 5.3, 1.9) - 0.5) * 1.4, z - 1.6, 1.9, 4.4, 0.4)
        if (hash(k * 6.7, 2.9) > 0.6) pushTree(x + (hash(k * 8.1, 4.7) - 0.5) * 1.6, z + 1.2, 1.6, 3.6, 0.3)
        if (hash(k * 9.3, 3.7) > 0.25) pushTree(x + (hash(k * 2.9, 6.1) - 0.5) * 1.8, z - 3.4, 2.2, 4.8, 0.48)
        if (hash(k * 11.1, 7.3) > 0.55) pushTree(x + (hash(k * 4.3, 2.1) - 0.5) * 2.0, z - 5.2, 2.0, 4.2, 0.52)
      }

      setInstances(list)
    })
    return () => {
      live = false
    }
  }, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    instances.forEach((item, idx) => {
      dummy.position.set(item.x, item.y, item.z)
      dummy.rotation.set(item.tilt, item.yaw, item.tilt * 0.6)
      dummy.scale.set(item.sx, item.sy, item.sx)
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
      mesh.setColorAt(idx, item.tint)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  if (!instances.length) return null
  return <instancedMesh ref={ref} args={[geo, mat, instances.length]} />
}

type TreeInstance = {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  yaw: number
  tilt: number
  tint: THREE.Color
}

export function LakeRange() {
  return (
    <group>
      {/* Far receding pale-blue horizon ridges to the left with only trace snow */}
      <Terrain
        dem="/tex/dem/alps-h.webp"
        size={[280, 64]}
        segments={[96, 32]}
        relief={22}
        floor={0.08}
        position={[-34, -0.9, -132]}
        yaw={Math.PI}
        sun={SUN4}
        haze={0.35}
        palette={FAR_HORIZON_PEAKS}
      />

      {/* Dominant ridged alpine peak right of center (ref4_range hero summit) */}
      <HeroAlpinePeak sunDir={SUN4} />

      {/* Far-left receding blue-haze valley hills (no snow) */}
      <Terrain
        dem="/tex/dem/ridge-h.webp"
        size={[80, 44]}
        segments={[72, 28]}
        relief={12.0}
        floor={0.04}
        position={[-42, -0.7, -80]}
        yaw={0.35}
        sun={SUN4}
        haze={0.35}
        palette={LEFT_VALLEY_RIDGE}
      />

      {/* Right sunny pasture & forested mountainside sweeping down to the shore */}
      <Terrain
        dem="/tex/dem/ridge-h.webp"
        size={[68, 48]}
        segments={[72, 30]}
        relief={13.0}
        floor={0.03}
        position={[30, -0.8, -46]}
        yaw={0.78}
        sun={SUN4}
        haze={0.22}
        palette={RIGHT_PASTURE_SLOPE}
        forest={0.95}
      />

      {/* clustered conifer forest down the peak's right flank and along its foot */}
      <ForestBelt sunDir={SUN4} />
    </group>
  )
}
