import { useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

/**
 * The art layer: CC0 photography from Poly Haven, used the way a renderer would use it.
 *
 * Albedo and normal maps on the ground, bark on the trunks, a cut-out leaf card for foliage, and a
 * real HDR sky driving image-based lighting, so metal, water and leaves pick up the sky instead of
 * a flat generated colour. Everything here is fetched by scripts/fetch-art.sh into public/art.
 */

const BASE = '/art'

export const GROUND_SETS: Record<string, { diff: string; nor: string }> = {
  forest: { diff: `${BASE}/forrest_ground_01_diff.jpg`, nor: `${BASE}/forrest_ground_01_nor_gl.jpg` },
  lake: { diff: `${BASE}/aerial_grass_rock_diff.jpg`, nor: `${BASE}/aerial_grass_rock_nor_gl.jpg` },
  sky: { diff: `${BASE}/aerial_grass_rock_diff.jpg`, nor: `${BASE}/aerial_grass_rock_nor_gl.jpg` },
  desert: { diff: `${BASE}/aerial_sand_diff.jpg`, nor: `${BASE}/aerial_sand_nor_gl.jpg` },
  sea: { diff: `${BASE}/aerial_sand_diff.jpg`, nor: `${BASE}/aerial_sand_nor_gl.jpg` },
  ice: { diff: `${BASE}/rocks_ground_04_diff.jpg`, nor: `${BASE}/rocks_ground_04_nor_gl.jpg` },
  deep: { diff: `${BASE}/rocks_ground_04_diff.jpg`, nor: `${BASE}/rocks_ground_04_nor_gl.jpg` },
}

const BARK = { diff: `${BASE}/bark_brown_01_diff.jpg`, nor: `${BASE}/bark_brown_01_nor_gl.jpg` }

const unique = (list: string[]) => Array.from(new Set(list))

const SNOW = { diff: `${BASE}/snow_02_diff.jpg`, nor: `${BASE}/snow_02_nor_gl.jpg` }
// Megascans Swamp Water, 2K texture set from Fab, downsampled to 1K
const WATER = { diff: `${BASE}/water_diff.jpg`, nor: `${BASE}/water_nor.jpg` }

export const ART_FILES = unique([
  ...Object.values(GROUND_SETS).flatMap((set) => [set.diff, set.nor]),
  BARK.diff,
  BARK.nor,
  SNOW.diff,
  SNOW.nor,
  WATER.diff,
  WATER.nor,
])

function tune(texture: THREE.Texture, repeat: number, srgb: boolean) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 8
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export type Art = {
  ground: Record<string, THREE.MeshStandardMaterial>
  bark: THREE.MeshStandardMaterial
  leaf: THREE.MeshStandardMaterial
  rock: THREE.MeshStandardMaterial
  snow: THREE.MeshStandardMaterial
  water: THREE.MeshStandardMaterial
  /** Megascans swamp-water normal map, used by the reflective water surface */
  waterNormals: THREE.Texture
}

/** Loads every map once and builds the shared materials. */
export function useArt(): Art {
  const textures = useLoader(THREE.TextureLoader, ART_FILES) as THREE.Texture[]

  return useMemo(() => {
    const byPath = new Map<string, THREE.Texture>()
    ART_FILES.forEach((path, index) => byPath.set(path, textures[index]))
    const map = (path: string, repeat: number, srgb: boolean) => tune(byPath.get(path)!.clone(), repeat, srgb)

    const ground: Record<string, THREE.MeshStandardMaterial> = {}
    for (const [id, set] of Object.entries(GROUND_SETS)) {
      ground[id] = new THREE.MeshStandardMaterial({
        map: map(set.diff, 110, true),
        normalMap: map(set.nor, 110, false),
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.97,
        metalness: 0,
        // the terrain's own colour attribute becomes a large-scale brightness break, which is
        // what stops a photographed ground from reading as a tiled grid
        vertexColors: true,
      })
      macroVariation(ground[id])
    }

    const bark = new THREE.MeshStandardMaterial({
      map: map(BARK.diff, 3, true),
      normalMap: map(BARK.nor, 3, false),
      roughness: 0.9,
      metalness: 0,
    })

    const leaf = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: leafTexture(),
      transparent: false,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0,
    })

    const rock = new THREE.MeshStandardMaterial({
      map: map(GROUND_SETS.ice.diff, 4, true),
      normalMap: map(GROUND_SETS.ice.nor, 4, false),
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.85,
      metalness: 0,
      flatShading: true,
    })

    const snow = new THREE.MeshStandardMaterial({
      map: map(SNOW.diff, 5, true),
      normalMap: map(SNOW.nor, 5, false),
      roughness: 0.6,
      metalness: 0,
    })

    const water = new THREE.MeshStandardMaterial({
      color: '#1c6f92',
      roughness: 0.07,
      metalness: 0.0,
      envMapIntensity: 1.55,
      transparent: true,
      opacity: 0.95,
      normalMap: tune(rippleNormal().clone(), 26, false),
      normalScale: new THREE.Vector2(0.5, 0.5),
    })

    return { ground, bark, leaf, rock, snow, water, waterNormals: tune(byPath.get(WATER.nor)!.clone(), 4, false) }
  }, [textures])
}

/** A cut-out cluster of leaves, drawn once: the silhouette reads as foliage, not as a cone. */
export function leafTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, size, size)
    let seed = 1337
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let i = 0; i < 150; i += 1) {
      const cx = size * (0.12 + rand() * 0.76)
      const cy = size * (0.12 + rand() * 0.76)
      const r = 6 + rand() * 13
      const shade = 70 + Math.floor(rand() * 90)
      context.fillStyle = `rgb(${Math.floor(shade * 0.55)}, ${shade + 40}, ${Math.floor(shade * 0.6)})`
      context.beginPath()
      context.ellipse(cx, cy, r, r * (0.55 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2)
      context.fill()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Large-scale colour noise, injected into a standard material.
 *
 * A photographed ground tiles, whatever its repeat, and the eye finds the seam immediately on a
 * big open plane. Multiplying the albedo by world-space noise at two scales, plus a slow hue
 * drift, breaks the period without touching the photograph's detail.
 */
function macroVariation(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm2(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float macro = fbm2(vWorldPos.xz * 0.014) * 0.85 + fbm2(vWorldPos.xz * 0.05) * 0.3;
        diffuseColor.rgb *= 0.74 + macro * 0.55;
        float drift = smoothstep(0.45, 0.95, fbm2(vWorldPos.xz * 0.007 + 11.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.14, 1.05, 0.84), drift);`,
      )
  }
  material.customProgramCacheKey = () => 'ground-macro'
}

/**
 * A ripple normal map, drawn once: two crossed wave trains at different frequencies, so the water's
 * reflection breaks up the way a lake's does instead of mirroring the sky like polished chrome.
 */
export function rippleNormal(size = 256): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const image = context.createImageData(size, size)
    const height = (x: number, y: number) =>
      Math.sin(x * 0.16 + Math.sin(y * 0.07) * 1.6) * 0.5 +
      Math.sin(y * 0.23 + Math.cos(x * 0.05) * 1.2) * 0.35 +
      Math.sin((x + y) * 0.41) * 0.15
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = height(x + 1, y) - height(x - 1, y)
        const dy = height(x, y + 1) - height(x, y - 1)
        const nx = -dx * 255
        const ny = -dy * 255
        const nz = 255
        const length = Math.hypot(nx, ny, nz)
        const i = (y * size + x) * 4
        image.data[i] = (nx / length) * 127.5 + 127.5
        image.data[i + 1] = (ny / length) * 127.5 + 127.5
        image.data[i + 2] = (nz / length) * 127.5 + 127.5
        image.data[i + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** Image-based lighting from a real sky, so reflections and bounce are the sky's, not a guess. */
export function Environment({ intensity = 0.55 }: { intensity?: number }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const hdr = useLoader(RGBELoader, `${BASE}/sky.hdr`) as THREE.DataTexture

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const target = pmrem.fromEquirectangular(hdr)
    scene.environment = target.texture
    scene.environmentIntensity = intensity
    return () => {
      target.dispose()
      pmrem.dispose()
    }
  }, [gl, hdr, scene, intensity])

  useEffect(() => {
    scene.environmentIntensity = intensity
  }, [scene, intensity])

  return null
}
