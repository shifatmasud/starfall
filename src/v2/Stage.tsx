import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { MotionValue } from 'framer-motion'
import * as THREE from 'three'
import { CHAPTERS, chapterZ, live, sampleLive } from './palettes'
import { useArt } from './art'
import { useModels } from './models'
import { buildSet } from './sets'
import { Orb } from './Orb'
import { planetUniforms, rng, waterUniforms } from './world'

/**
 * The stage: one sky, one sun, eight dioramas along -Z, and a lens that falls through them.
 *
 * Scroll is the only clock. Every chapter is a self-contained set built in `sets.ts`; the camera
 * interpolates between chapter keys, and the sky, the fog and the sun interpolate with it, so the
 * voyage reads as one continuous fall rather than eight slides.
 */

const smooth = (f: number) => f * f * (3 - 2 * f)

/** QA only: `?orbzoom=1` parks the lens on the pearl so the object can be judged on its own, away
 *  from whatever chapter it happens to be sitting in. */
const ORB_ZOOM = typeof window !== 'undefined' && /orbzoom/.test(window.location.search)

function Sky() {
  const uniforms = useMemo(
    () => ({
      uHorizon: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uStars: { value: 0 },
      uOpacity: { value: 1 },
    }),
    [],
  )

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        uniforms,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uHorizon;
          uniform vec3 uMid;
          uniform vec3 uZenith;
          uniform vec3 uSunColor;
          uniform vec3 uSunDir;
          uniform float uOpacity;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, -1.0, 1.0);
            float up = smoothstep(-0.05, 0.55, h);
            vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.45, h));
            sky = mix(sky, uZenith, up * 0.92);
            float sun = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
            vec3 glow = uSunColor * pow(sun, 220.0) * 2.6;
            glow += uSunColor * pow(sun, 9.0) * 0.26;
            glow += uSunColor * pow(sun, 2.0) * 0.05;
            sky += glow;
            gl_FragColor = vec4(sky, uOpacity);
          }
        `,
      }),
    [uniforms],
  )

  useFrame(() => {
    uniforms.uHorizon.value.setRGB(live.horizon[0], live.horizon[1], live.horizon[2])
    uniforms.uMid.value.setRGB(live.mid[0], live.mid[1], live.mid[2])
    uniforms.uZenith.value.setRGB(live.zenith[0], live.zenith[1], live.zenith[2])
    uniforms.uSunColor.value.setRGB(live.sun[0], live.sun[1], live.sun[2])
    uniforms.uSunDir.value.set(live.sunDir[0], live.sunDir[1], live.sunDir[2])
    uniforms.uStars.value = live.stars
    // one dome, owned by the palette: it never hands over to a photographed sky any more
    uniforms.uOpacity.value = 1
  })

  return (
    <mesh scale={[3000, 3000, 3000]} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[1, 32, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

/** The stage's sky is the palette dome in `Sky`; there is no photographed sky in the scene. */
function Stars() {
  const geometry = useMemo(() => {
    const r = rng(7)
    const count = 2600
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const u = r() * 2 - 1
      const phi = r() * Math.PI * 2
      const y = Math.abs(u) * 0.9 + 0.02
      const rxy = Math.sqrt(1 - y * y)
      positions[i * 3] = Math.cos(phi) * rxy * 2600
      positions[i * 3 + 1] = y * 2600
      positions[i * 3 + 2] = Math.sin(phi) * rxy * 2600
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [])
  const material = useRef<THREE.PointsMaterial>(null)
  useFrame(() => {
    if (material.current) material.current.opacity = Math.max(0, live.stars) * 0.95
  })
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={-9}>
      <pointsMaterial ref={material} color="#e8f0ff" size={2.2} sizeAttenuation={false} transparent opacity={0} depthWrite={false} />
    </points>
  )
}

function Sets({ visibleIndex, art, models }: { visibleIndex: React.MutableRefObject<number>; art: ReturnType<typeof useArt>; models: ReturnType<typeof useModels> }) {
  const sets = useMemo(() => CHAPTERS.map((_, index) => buildSet(index, art, models)), [art, models])
  const refs = useRef<Array<THREE.Group | null>>([])
  useFrame(() => {
    const current = visibleIndex.current
    refs.current.forEach((group, index) => {
      if (group) group.visible = Math.abs(index - current) <= 0.9
    })
  })
  return (
    <>
      {sets.map((set, index) => (
        <primitive
          key={CHAPTERS[index].id}
          object={set.group}
          position={[0, 0, chapterZ(index)]}
          ref={(node: THREE.Group | null) => {
            refs.current[index] = node
          }}
        />
      ))}
    </>
  )
}

export function Stage({ progress }: { progress: MotionValue<number> }) {
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const sun = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const sky = useRef<THREE.AmbientLight>(null)
  const orbGroup = useRef<THREE.Group>(null)
  const chapterIndex = useRef(0)
  const art = useArt()
  const models = useModels()
  const fog = useMemo(() => new THREE.FogExp2('#000000', 0.002), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const p = THREE.MathUtils.clamp(progress.get(), 0, 1)
    const u = p * (CHAPTERS.length - 1)
    sampleLive(u)

    const i = Math.min(CHAPTERS.length - 2, Math.floor(u))
    const f = smooth(Math.min(1, Math.max(0, u - i)))
    chapterIndex.current = u
    const a = CHAPTERS[i]
    const b = CHAPTERS[i + 1]
    const za = chapterZ(i)
    const zb = chapterZ(i + 1)

    const drift = Math.sin(state.clock.elapsedTime * 0.32) * 0.5
    camera.position.set(
      THREE.MathUtils.lerp(a.cam.pos[0], b.cam.pos[0], f),
      THREE.MathUtils.lerp(a.cam.pos[1], b.cam.pos[1], f) + drift * 0.4,
      THREE.MathUtils.lerp(a.cam.pos[2] + za, b.cam.pos[2] + zb, f),
    )
    scratch.set(
      THREE.MathUtils.lerp(a.cam.look[0], b.cam.look[0], f),
      THREE.MathUtils.lerp(a.cam.look[1], b.cam.look[1], f),
      THREE.MathUtils.lerp(a.cam.look[2] + za, b.cam.look[2] + zb, f),
    )
    camera.lookAt(scratch)
    const perspective = camera as THREE.PerspectiveCamera
    const fov = THREE.MathUtils.lerp(a.cam.fov, b.cam.fov, f)
    if (Math.abs(perspective.fov - fov) > 0.01) {
      perspective.fov = fov
      perspective.updateProjectionMatrix()
    }

    if (ORB_ZOOM) {
      const ox = THREE.MathUtils.lerp(a.orb[0], b.orb[0], f)
      const oy = THREE.MathUtils.lerp(a.orb[1], b.orb[1], f)
      const oz = THREE.MathUtils.lerp(a.orb[2] + za, b.orb[2] + zb, f)
      camera.position.set(ox + 0.25, oy + 0.15, oz + 4.6)
      camera.lookAt(ox, oy, oz)
      const perspective = camera as THREE.PerspectiveCamera
      if (perspective.fov !== 40) {
        perspective.fov = 40
        perspective.updateProjectionMatrix()
      }
    }

    if (orbGroup.current) {
      orbGroup.current.scale.setScalar(live.orbScale)
      const ox = THREE.MathUtils.lerp(a.orb[0], b.orb[0], f)
      const oy = THREE.MathUtils.lerp(a.orb[1], b.orb[1], f)
      const oz = THREE.MathUtils.lerp(a.orb[2] + za, b.orb[2] + zb, f)
      orbGroup.current.position.set(ox, oy, oz)
    }

    if (sun.current) {
      const targetZ = THREE.MathUtils.lerp(za, zb, f)
      // the key light belongs to the chapter in shot, not to the world origin
      sun.current.target.position.set(0, 0, targetZ)
      sun.current.position.set(live.sunDir[0] * 150, live.sunDir[1] * 150, targetZ + live.sunDir[2] * 150)
      sun.current.target.updateMatrixWorld()
      sun.current.updateMatrixWorld()
      sun.current.intensity = live.sunPower * 3.0
      sun.current.color.setRGB(live.sun[0], live.sun[1], live.sun[2])
    }

    // a fill that rides with the lens: the faces we can see are never the faces the key light
    // reaches, and backlit foliage without fill reads as black confetti
    if (fill.current) {
      fill.current.position.set(camera.position.x - 55, camera.position.y + 60, camera.position.z + 85)
      fill.current.target.position.copy(scratch)
      fill.current.target.updateMatrixWorld()
      fill.current.intensity = 1.9 + live.sunPower * 0.22
      fill.current.color.setRGB(live.sun[0], live.sun[1], live.sun[2])
    }

    if (sky.current) {
      sky.current.intensity = 0.15 + live.ambientPower * 0.85
      sky.current.color.setRGB(live.ambient[0], live.ambient[1], live.ambient[2])
    }

    fog.color.setRGB(live.fog[0], live.fog[1], live.fog[2])
    fog.density = live.fogDensity
    scene.fog = fog

    const time = state.clock.elapsedTime
    for (const uniforms of waterUniforms) {
      ;(uniforms.uTime as { value: number }).value = time
      const sky = uniforms.uSky as { value: THREE.Color }
      sky.value.setRGB(live.horizon[0], live.horizon[1], live.horizon[2])
      const sunColor = uniforms.uSun as { value: THREE.Color }
      sunColor.value.setRGB(live.sun[0], live.sun[1], live.sun[2])
      const sunDir = uniforms.uSunDir as { value: THREE.Vector3 }
      sunDir.value.set(live.sunDir[0], live.sunDir[1], live.sunDir[2])
    }

    for (const uniforms of planetUniforms) uniforms.uTime.value = time

    // three's Water keeps its own clock
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as THREE.ShaderMaterial | undefined
      const time = material?.uniforms?.time
      if (time) time.value += delta * 0.35
    })

    // ripples drift, so a reflected sky is never a still photograph
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as THREE.MeshStandardMaterial | undefined
      const map = material?.normalMap
      if (material && map && material.transparent && material.roughness < 0.2) {
        map.offset.x += delta * 0.006
        map.offset.y += delta * 0.0035
      }
    })
  })

  return (
    <>
      <Sky />
      <Stars />
      <ambientLight ref={sky} intensity={0.6} color="#d6e8ff" />
      <hemisphereLight args={['#bfe0ff', '#4e5f38', 0.55]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2.9}
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
        shadow-camera-near={1}
        shadow-camera-far={360}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-bias={-0.0007}
      />
      <directionalLight ref={fill} intensity={0.9} color="#fff4dd" />
      <Sets visibleIndex={chapterIndex} art={art} models={models} />
      <group ref={orbGroup} position={[0, 6, 0]} scale={3.1}>
        <Orb streak={true} />
        <pointLight color="#d9e4ff" intensity={12} distance={70} decay={2} />
      </group>
    </>
  )
}
