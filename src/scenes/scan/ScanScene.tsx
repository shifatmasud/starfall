import { useTexture } from '@react-three/drei'
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { SceneCanvas } from '../../components/SceneCanvas'
import { PostFX } from '../../gl/PostFX'
import { makeBackdropTarget } from '../painted/Backdrop'
import { GlassOrb, type GlassOrbProps } from '../painted/GlassOrb'
import { LightStreak } from '../painted/LightStreak'
import { Bubbles } from '../painted/Bubbles'

/**
 * The frame scenes 3–8 share. Every surface in it is a real capture:
 *
 *   world     a photographed Poly Haven HDRI, ground-projected (drei <Environment ground>) so the
 *             photo's own floor — moss, meadow, sand, sea — is the ground under the orb, and the
 *             same HDRI lights the scans (image-based lighting)
 *   props     scanned models (Poly Haven photogrammetry, Smithsonian CC0 coral), compressed with
 *             gltf-transform and loaded through their gltfjsx components (src/scans/models)
 *   orb       the glass ball lens: it refracts a capture of this very scene, so what it shows is the
 *             world behind it, inverted the way a crystal ball does
 *   streak    the orb's light trail (optional), bubbles for the descent (optional)
 *   post      Bloom → painterly diffusion → grade → the ScreenPaint lens, the same chain as 1 and 2
 *
 * Underwater (7, 8) has no photographed sky: `water` replaces the HDRI with a depth-graded sea and
 * fog, and the scans (coral, shells, rock) carry the realism.
 *
 * Atmosphere: three's own fog chunks are patched once, here, so every standard material — terrain,
 * water, grass, scans, ruins — carries the same air: an altitude-thinned exponential haze with Mie
 * forward scattering toward the sun, and, underwater, Beer–Lambert absorption of the red channel
 * with distance. That is what dissolves the far field instead of leaving paper cut-outs.
 */

/** the atmosphere every foggy material reads (kept in three's fog uniform library) */
export const ATMOS_UNIFORMS = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.7).normalize() },
  uSunHazeColor: { value: new THREE.Color('#ffe8c8') },
  uHazeHeightFalloff: { value: 0.06 },
  uHazeBaseY: { value: 0.0 },
  uMieStrength: { value: 0.45 },
  uIsUnderwater: { value: 0.0 },
  uWaterTopColor: { value: new THREE.Color('#4ec5e6') },
}

let fogPatched = false

function ensureAtmosphericFogPatch() {
  if (fogPatched) return
  fogPatched = true

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
    #ifdef USE_FOG
      varying float vFogDepth;
      varying vec3 vAtmosWorldPos;
    #endif
  `
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
    #ifdef USE_FOG
      vFogDepth = - mvPosition.z;
      vec4 atmosWp = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        atmosWp = instanceMatrix * atmosWp;
      #endif
      atmosWp = modelMatrix * atmosWp;
      vAtmosWorldPos = atmosWp.xyz;
    #endif
  `
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
    #ifdef USE_FOG
      uniform vec3 fogColor;
      varying float vFogDepth;
      varying vec3 vAtmosWorldPos;
      uniform vec3 uSunDir;
      uniform vec3 uSunHazeColor;
      uniform float uHazeHeightFalloff;
      uniform float uHazeBaseY;
      uniform float uMieStrength;
      uniform float uIsUnderwater;
      uniform vec3 uWaterTopColor;
      #ifdef FOG_EXP2
        uniform float fogDensity;
      #else
        uniform float fogNear;
        uniform float fogFar;
      #endif
    #endif
  `
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
    #ifdef USE_FOG
      vec3 viewRay = vAtmosWorldPos - cameraPosition;
      float rayDist = max(length(viewRay), 0.001);
      vec3 rayDir = viewRay / rayDist;

      #ifdef FOG_EXP2
        float opticalDepth = fogDensity * fogDensity * vFogDepth * vFogDepth;
        float fogFactor = 1.0 - exp( - opticalDepth );
      #else
        // an exponential approach to the far limit: near objects stay crisp, the horizon dissolves
        float linT = clamp( ( vFogDepth - fogNear ) / max( fogFar - fogNear, 0.001 ), 0.0, 1.0 );
        float expT = 1.0 - exp( - linT * 2.6 );
        float fogFactor = mix( linT, expT, 0.72 );
      #endif

      // altitude: the haze pools in the valleys and on the waterline, the peaks float above it
      float relY = max(vAtmosWorldPos.y - uHazeBaseY, 0.0);
      float altAtten = mix(1.0, exp(-relY * uHazeHeightFalloff), 0.65);
      fogFactor = clamp(fogFactor * altAtten, 0.0, 0.96);

      // Mie forward scattering: the air warms and brightens toward the sun
      float sunAmt = max(dot(rayDir, normalize(uSunDir)), 0.0);
      float mie = pow(sunAmt, 5.0) * uMieStrength + pow(sunAmt, 1.6) * (uMieStrength * 0.35);
      vec3 scatterColor = mix(fogColor, uSunHazeColor, clamp(mie, 0.0, 0.85));

      if (uIsUnderwater > 0.5) {
        // Beer–Lambert: red is absorbed first, so distance turns cyan instead of yellow-green
        vec3 absorb = exp(-vec3(0.42, 0.11, 0.045) * vFogDepth);
        gl_FragColor.rgb *= mix(vec3(1.0), absorb, 0.85);
        float upLift = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
        scatterColor = mix(fogColor, uWaterTopColor, pow(upLift, 1.6) * 0.65);
      }

      gl_FragColor.rgb = mix( gl_FragColor.rgb, scatterColor, fogFactor );
    #endif
  `

  Object.assign(THREE.UniformsLib.fog as Record<string, { value: unknown }>, ATMOS_UNIFORMS)
}

export type ScanSceneProps = {
  hdri?: string
  /** ground projection of the HDRI: camera height above the photo's floor, dome radius */
  ground?: { height: number; radius: number; scale?: number }
  envIntensity?: number
  /** turn the photographed world about the vertical, degrees (lines the photo up with the panel) */
  skyYaw?: number
  /** tilt the photographed world, degrees (sinks a hillside photo's ground below a water horizon) */
  skyPitch?: number
  /** a key light for the scans, matching the photo's sun: direction it comes from, colour, intensity */
  sun?: { from: [number, number, number]; color?: string; intensity: number }
  /** light shafts and haze from a screen point (the photo's sun), drawn over the world */
  rays?: { x: number; y: number; color: string; strength: number; haze?: number }
  /** sky/ground fill for the scans */
  fill?: { sky: string; ground: string; intensity: number }
  bgIntensity?: number
  /** a sea instead of an HDRI: top and deep colours, fog density */
  water?: { top: string; deep: string; fog: number }
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number }
  /** the orb in world space */
  orb: { position: [number, number, number]; radius: number }
  look?: Omit<GlassOrbProps, 'target' | 'center' | 'r' | 'live'>
  /** toward the tail, screen space (x right, y up); len and half-width in screen heights */
  streak?: { dir: [number, number]; len: number; width?: number; color?: string; strength?: number }
  bubbles?: { dir: [number, number]; len: number; spread: number; size: number; count?: number }
  /** the orb's glow on the scans around it */
  glow?: { color: string; intensity: number; distance: number }
  /**
   * atmospheric perspective: colour and the near/far range over which it thickens, the colour the
   * haze turns toward the sun, the Mie strength and the altitude falloff
   */
  fog?: { color: string; near: number; far: number; sunColor?: string; mie?: number; heightFalloff?: number }
  clear: string
  poster: { portrait: string; landscape: string }
  bloom?: number
  exposure?: number
  soften?: { amount: number; radius: number; mist?: number; mistColor?: string }
  haze?: number
  shadowFloor?: string
  grade?: number
  children?: ReactNode
}

function FrameProbe() {
  useFrame(() => {
    window.__ORB_FRAME__ = (window.__ORB_FRAME__ ?? 0) + 1
  })
  return null
}

function Aim({ target }: { target: [number, number, number] }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.lookAt(...target)
    const yaw = Number(new URLSearchParams(location.search).get('yaw') ?? 0)
    if (yaw) camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yaw))
    camera.updateMatrixWorld()
  }, [camera, target])
  return null
}

/** A sea for the underwater panels: bright toward the surface, deep blue below, light from above. */
function Sea({ top, deep, fog }: { top: string; deep: string; fog: number }) {
  const scene = useThree((s) => s.scene)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: new THREE.Color(top) }, uDeep: { value: new THREE.Color(deep) } },
        vertexShader: /* glsl */ `out vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          precision highp float; in vec3 vDir; uniform vec3 uTop; uniform vec3 uDeep;
          layout(location=0) out vec4 o;
          void main(){
            float y = vDir.y;
            vec3 c = mix(uDeep, uTop, smoothstep(-0.35, 0.85, y));
            c += vec3(0.45, 0.82, 1.0) * pow(max(y, 0.0), 5.0) * 0.55; // the bright surface overhead
            o = vec4(c, 1.0);
          }`,
      }),
    [top, deep],
  )
  useEffect(() => {
    const fogCol = new THREE.Color(deep).lerp(new THREE.Color(top), 0.38)
    scene.fog = new THREE.FogExp2(fogCol, fog)
    ATMOS_UNIFORMS.uIsUnderwater.value = 1.0
    ATMOS_UNIFORMS.uWaterTopColor.value.set(top)
    return () => {
      scene.fog = null
      ATMOS_UNIFORMS.uIsUnderwater.value = 0.0
    }
  }, [scene, top, deep, fog])
  return (
    <mesh material={mat} renderOrder={-50} frustumCulled={false}>
      <sphereGeometry args={[40, 32, 16]} />
    </mesh>
  )
}

export function Orb({ orb, look, streak, bubbles, glow }: Pick<ScanSceneProps, 'orb' | 'look' | 'streak' | 'bubbles' | 'glow'>) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const target = useMemo(() => makeBackdropTarget(), [])
  useEffect(() => () => target.dispose(), [target])
  const fx = useRef<THREE.Group>(null)
  const live = useMemo(() => ({ x: 0.5, y: 0.5, r: 0.1 }), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const frames = useRef(0)
  const lastSize = useRef('')

  // place the screen-space orb where the world-space orb projects
  useFrame(() => {
    tmp.set(...orb.position).project(camera)
    live.x = tmp.x * 0.5 + 0.5
    live.y = tmp.y * 0.5 + 0.5
    const d = camera.position.distanceTo(new THREE.Vector3(...orb.position))
    live.r = orb.radius / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  }, -20)

  // capture the scene without the orb: what the glass refracts. The world is still, so it is
  // captured every frame while the scans stream in, then every 30 frames (cheap on a CPU rasterizer).
  useFrame(() => {
    const w = gl.domElement.width
    const h = gl.domElement.height
    if (!w || !h) return
    const key = `${w}x${h}`
    frames.current++
    if (key !== lastSize.current) {
      lastSize.current = key
      target.setSize(w, h)
      frames.current = 0
    } else if (frames.current > 12 && frames.current % 30 !== 0) return // scans stream in: settle, then refresh
    if (fx.current) fx.current.visible = false
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(prev)
    if (fx.current) fx.current.visible = true
  }, -10)

  return (
    <>
      {glow ? <pointLight position={orb.position} color={glow.color} intensity={glow.intensity} distance={glow.distance} decay={2} /> : null}
      <group ref={fx}>
        {streak ? (
          <LightStreak head={live} dir={streak.dir} len={streak.len} width={streak.width ?? 0.05} color={streak.color} strength={streak.strength} bob={0} />
        ) : null}
        {bubbles ? <Bubbles head={live} {...bubbles} /> : null}
        <GlassOrb target={target} center={live} r={live.r} live={live} {...look} />
      </group>
    </>
  )
}

/** The photographed world: the HDRI as background (ground-projected when asked) and as the IBL. */
function World({ hdri, ground, envIntensity, bgIntensity, yaw, pitch }: { hdri: string; ground?: ScanSceneProps['ground']; envIntensity: number; bgIntensity: number; yaw: number; pitch: number }) {
  const scene = useThree((s) => s.scene)
  const tex = useTexture(hdri)
  const sky = useMemo(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    if (!ground) return null
    const g = new GroundedSkybox(tex, ground.height, ground.radius, 96)
    g.position.y = ground.height - 0.01
    const m = g.material as THREE.MeshBasicMaterial
    m.color.setScalar(bgIntensity)
    m.depthWrite = false
    m.fog = false
    g.renderOrder = -60
    g.rotation.y = THREE.MathUtils.degToRad(yaw)
    return g
  }, [tex, ground, bgIntensity, yaw])
  useEffect(() => {
    scene.environment = tex
    scene.environmentIntensity = envIntensity
    scene.environmentRotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ')
    scene.backgroundRotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ')
    if (!sky) {
      scene.background = tex
      scene.backgroundIntensity = bgIntensity
    }
    return () => {
      scene.environment = null
      scene.background = null
    }
  }, [scene, tex, sky, envIntensity, bgIntensity, yaw, pitch])
  return sky ? <primitive object={sky} /> : null
}

/** Screen-space sun shafts and atmospheric haze: soft additive beams fanning from the sun. */
function Rays({ x, y, color, strength, haze = 0.35 }: NonNullable<ScanSceneProps['rays']>) {
  const size = useThree((s) => s.size)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uSun: { value: new THREE.Vector2(x, y) }, uCol: { value: new THREE.Color(color) }, uS: { value: strength }, uHaze: { value: haze }, uAspect: { value: 1.5 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          precision highp float; in vec2 vUv; uniform vec2 uSun; uniform vec3 uCol; uniform float uS; uniform float uHaze; uniform float uAspect; uniform float uTime;
          layout(location=0) out vec4 o;
          float h(float n){ return fract(sin(n) * 43758.5453); }
          float vn(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h(i), h(i+1.0), f); }
          void main(){
            vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
            float r = length(d);
            float a = atan(d.x, -d.y);
            // two soft octaves of beams, so the shafts feather into the water instead of cutting spokes
            float b1 = smoothstep(0.25, 0.92, vn(a * 3.8 + uTime * 0.025));
            float b2 = smoothstep(0.30, 0.95, vn(a * 8.5 + 4.2));
            float shafts = pow(b1 * 0.65 + b2 * 0.35, 1.6);
            float fall = exp(-r * 1.85) * smoothstep(0.0, 0.14, r);
            vec3 c = uCol * (shafts * fall * uS + exp(-r * 2.1) * uHaze + exp(-r * 12.0) * 0.45);
            o = vec4(c, 1.0);
          }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useFrame((st) => {
    mat.uniforms.uAspect.value = size.width / Math.max(1, size.height)
    mat.uniforms.uTime.value = st.clock.elapsedTime
  })
  return (
    <mesh material={mat} renderOrder={5} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

function Inner(props: ScanSceneProps) {
  ensureAtmosphericFogPatch()
  const { hdri, ground, envIntensity = 1, bgIntensity = 1, skyYaw = 0, skyPitch = 0, sun, fill, water, camera, bloom = 0.4, exposure = 1, children } = props

  useEffect(() => {
    if (sun) ATMOS_UNIFORMS.uSunDir.value.set(...sun.from).normalize()
    ATMOS_UNIFORMS.uSunHazeColor.value.set(props.fog?.sunColor ?? sun?.color ?? '#ffe8c8')
    ATMOS_UNIFORMS.uMieStrength.value = props.fog?.mie ?? 0.45
    ATMOS_UNIFORMS.uHazeHeightFalloff.value = props.fog?.heightFalloff ?? 0.06
  }, [sun, props.fog?.sunColor, props.fog?.mie, props.fog?.heightFalloff])

  return (
    <>
      <Aim target={camera.target} />
      {hdri ? (
        <Suspense fallback={null}>
          <World hdri={hdri} ground={ground} envIntensity={envIntensity} bgIntensity={bgIntensity} yaw={skyYaw} pitch={skyPitch} />
        </Suspense>
      ) : null}
      {props.fog ? <fog attach="fog" args={[props.fog.color, props.fog.near, props.fog.far]} /> : null}
      {water ? <Sea {...water} /> : null}
      {sun ? <directionalLight position={sun.from} color={sun.color ?? '#fff4e0'} intensity={sun.intensity} /> : null}
      {props.rays ? <Rays {...props.rays} /> : null}
      {fill ? <hemisphereLight args={[fill.sky, fill.ground, fill.intensity]} /> : null}
      <Suspense fallback={null}>{children}</Suspense>
      <Orb orb={props.orb} look={props.look} streak={props.streak} bubbles={props.bubbles} glow={props.glow} />
      <FrameProbe />
      {new URLSearchParams(location.search).has('nopost') ? null : (
        <PostFX
          bloom={bloom}
          exposure={exposure}
          soften={props.soften}
          haze={props.haze}
          shadowFloor={props.shadowFloor}
          grade={props.grade}
        />
      )}
    </>
  )
}

export function ScanScene(props: ScanSceneProps) {
  return (
    <SceneCanvas clear={props.clear} camera={{ position: props.camera.position, fov: props.camera.fov, near: 0.02, far: 9000 }} poster={props.poster}>
      <Inner {...props} />
    </SceneCanvas>
  )
}
