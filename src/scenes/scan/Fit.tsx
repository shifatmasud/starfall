import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { applyOcclusion, applySSS, type SSS } from './sss'

/**
 * The painterly shading model, injected into a scanned glTF's MeshStandardMaterial:
 *
 *   cavity lift   dark texels in a photogrammetry diffuse map (the baked dirt between grass blades,
 *                 the crevices of coral, bark and rock) are lifted toward a coloured shadow floor, so
 *                 a scan can never draw the black specks that give raw captures away
 *   shadow fill   the terminator is wrapped (half-Lambert) and the unlit side is filled with a
 *                 sky/bounce tint instead of falling to black: shadows are soft and coloured
 *   rim + sss     a grazing Fresnel rim and a back-lit subsurface lift, so foliage, ice and sandstone
 *                 catch a warm edge the way the reference panels do
 *
 * All terms are scaled by `soft` (0 = the untouched scan, 1 = fully painted).
 */
export function applyPainterlySurface(
  mat: THREE.MeshStandardMaterial,
  opts: { soft: number; rimColor?: string; shadowTint?: string; sunDir?: [number, number, number]; ripple?: number },
) {
  const { soft, rimColor = '#fff0d4', shadowTint = '#5a6e8c', sunDir = [0.4, 0.7, -0.5], ripple = 0 } = opts
  const key = `painterly-${soft.toFixed(2)}-${rimColor}-${shadowTint}-r${ripple.toFixed(2)}`
  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey?.bind(mat)

  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${key}`
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer)
    shader.uniforms.uPainterlySoft = { value: soft }
    shader.uniforms.uPainterlyRim = { value: new THREE.Color(rimColor) }
    shader.uniforms.uPainterlyShadow = { value: new THREE.Color(shadowTint) }
    shader.uniforms.uPainterlySun = { value: new THREE.Vector3(...sunDir).normalize() }
    shader.uniforms.uPainterlyRipple = { value: ripple }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPaintWorldNormal;
        varying vec3 vPaintWorldPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 paintWp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          paintWp = instanceMatrix * paintWp;
        #endif
        paintWp = modelMatrix * paintWp;
        vPaintWorldPos = paintWp.xyz;
        vPaintWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPaintWorldNormal;
        varying vec3 vPaintWorldPos;
        uniform float uPainterlySoft;
        uniform vec3 uPainterlyRim;
        uniform vec3 uPainterlyShadow;
        uniform vec3 uPainterlySun;
        uniform float uPainterlyRipple;`,
      )
      // wind ripples: the sand's own micro-relief, in the shading normal (a dune is never a clean gradient)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uPainterlyRipple > 0.001) {
          float rp = sin(vPaintWorldPos.x * 6.3 + sin(vPaintWorldPos.z * 2.7) * 1.4)
                   * cos(vPaintWorldPos.z * 9.1 + sin(vPaintWorldPos.x * 1.9) * 0.9);
          float rq = sin(vPaintWorldPos.x * 17.0 + vPaintWorldPos.z * 5.0) * 0.5;
          normal = normalize(normal + vec3((rp * 0.55 + rq * 0.45) * uPainterlyRipple * 0.22, rp * uPainterlyRipple * 0.12, 0.0));
          diffuseColor.rgb *= 1.0 + rp * uPainterlyRipple * 0.09;
        }`,
      )
      // lift the baked-in dark texels before lighting: no black specks, ever
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float texLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float speckLift = smoothstep(0.18, 0.01, texLum) * uPainterlySoft;
        diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb, uPainterlyShadow * 0.42), speckLift * 0.85);`,
      )
      // soft light, coloured shadow fill, grazing rim, back-lit lift
      .replace(
        '#include <opaque_fragment>',
        `vec3 pN = normalize(vPaintWorldNormal);
        vec3 pV = normalize(cameraPosition - vPaintWorldPos);
        vec3 pL = normalize(uPainterlySun);
        float wrapLight = pow(clamp(dot(pN, pL) * 0.5 + 0.5, 0.0, 1.0), 1.35);
        float backScatter = pow(clamp(dot(-pV, pL) * 0.5 + 0.5, 0.0, 1.0), 2.2);
        float fresnel = pow(1.0 - max(dot(pN, pV), 0.0), 3.0);

        vec3 bounceFill = diffuseColor.rgb * uPainterlyShadow * (0.16 * (1.0 - wrapLight) * uPainterlySoft);
        vec3 rimGlow = uPainterlyRim * fresnel * (0.07 + 0.16 * backScatter) * uPainterlySoft;
        vec3 sssGlow = diffuseColor.rgb * uPainterlyRim * (0.1 * wrapLight * backScatter) * uPainterlySoft;

        outgoingLight += bounceFill + rimGlow + sssGlow;
        #include <opaque_fragment>`,
      )
  }
  mat.needsUpdate = true
}

/**
 * Places a scan by real size: scales its children so the largest side of their bounding box is
 * `size` world units, centres it on x/z and sits its base on y = 0 — scans arrive in their own units
 * (Poly Haven in metres, Smithsonian specimens in millimetres). `tint` multiplies every material's
 * colour (ice from rock, wet from dry); `emissive` adds a glow tint (bioluminescent coral).
 */
export function Fit({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  tint,
  emissive,
  roughness,
  sss,
  /** hemisphere sky occlusion, 0..1 (solid bodies: crevices and under-hangs fall into shade) */
  occlude,
  strip,
  clipBelow,
  soft = 0,
  /** painterly surface: the warm edge colour, the shadow-bounce colour, the light direction */
  rimColor,
  shadowTint,
  sunDir,
  stretch = 1,
  flat,
  children,
}: {
  size: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  tint?: string
  emissive?: [string, number]
  roughness?: number
  /** translucency (leaves, ice): see sss.ts */
  sss?: SSS
  /** sky occlusion strength for solid bodies (ice, rock) */
  occlude?: number
  /** drop the scan's diffuse map and replace it with this flat colour (ice cut from a rock's massing) */
  strip?: string
  /** cut the scan off below this height above its own base (a museum plinth buried in the sand) */
  clipBelow?: number
  /** painterly softening, 0..1: eased normal detail, soft roughness, the painted shading model */
  soft?: number
  rimColor?: string
  shadowTint?: string
  sunDir?: [number, number, number]
  /** extra vertical stretch after fitting (a slab of rock stood up into a berg) */
  stretch?: number
  /** flat shading: the faceted look of cut ice */
  flat?: boolean
  children: ReactNode
}) {
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (clipBelow === undefined) return
    gl.localClippingEnabled = true
    const start = performance.now()
    let id = 0
    const tick = () => {
      const g = outer.current
      let meshes = 0
      if (g) {
        g.updateWorldMatrix(true, true)
        const base = new THREE.Vector3()
        g.getWorldPosition(base)
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base.y + clipBelow))
        g.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          meshes++
          const mat = m.material as THREE.Material
          if (mat.clippingPlanes?.length !== 1) {
            mat.clippingPlanes = [plane]
            mat.needsUpdate = true
          }
        })
      }
      // the glTF arrives after the effect runs: keep watching for it, then leave the cut in place
      if (meshes === 0 && performance.now() - start < 30000) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [clipBelow, gl])

  useLayoutEffect(() => {
    const g = inner.current
    if (!g) return
    g.scale.setScalar(1)
    g.position.set(0, 0, 0)
    g.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(g)
    const dim = box.getSize(new THREE.Vector3())
    const s = size / Math.max(dim.x, dim.y, dim.z, 1e-6)
    const c = box.getCenter(new THREE.Vector3())
    g.scale.set(s, s * stretch, s)
    g.position.set(-c.x * s, -box.min.y * s * stretch, -c.z * s)
    if (tint || emissive || roughness !== undefined || sss || flat || occlude || strip || soft > 0) {
      g.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        if (strip) {
          mat.map = null
          mat.color = new THREE.Color(strip)
          mat.needsUpdate = true
        }
        if (soft > 0) {
          // the dreamy pass: the scan keeps its shape and its colour, but its high-frequency detail is
          // eased back so it reads as painted light rather than photographed gravel
          const ns = 0.22 * (1 - soft * 0.4)
          if (mat.normalScale) mat.normalScale.set(ns, ns)
          mat.roughness = Math.max(0.62, Math.min(1, (mat.roughness ?? 0.85) + 0.14 * soft))
          mat.metalness = 0
        }
        if (tint) mat.color.multiply(new THREE.Color(tint))
        if (emissive) {
          mat.emissive = new THREE.Color(emissive[0])
          mat.emissiveIntensity = emissive[1]
        }
        if (roughness !== undefined) mat.roughness = roughness
        if (sss) applySSS(mat, sss)
        if (occlude) applyOcclusion(mat, occlude)
        // last, so it wraps whatever the other injections did
        if (soft > 0) applyPainterlySurface(mat, { soft, rimColor, shadowTint, sunDir })
        if (flat) {
          mat.flatShading = true
          mat.needsUpdate = true
        }
        if (clipBelow !== undefined) {
          gl.localClippingEnabled = true
          const base = new THREE.Vector3()
          ;(outer.current as THREE.Object3D).getWorldPosition(base)
          mat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(base.y + clipBelow))]
          mat.needsUpdate = true
        }
        m.material = mat
      })
    }
  })
  return (
    <group ref={outer} position={position} rotation={rotation}>
      <group ref={inner}>{children}</group>
    </group>
  )
}
