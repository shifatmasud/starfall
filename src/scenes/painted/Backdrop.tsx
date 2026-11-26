import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FRAME_GLSL, MAIN_GLSL } from './glsl'

/**
 * A painted backdrop: one fragment shader, baked once per viewport into a texture and shown as the
 * scene's background. On a CPU rasterizer (SwiftShader) and on a phone this is the difference between
 * one texture read per pixel per frame and a per-pixel noise storm.
 *
 * The baked texture is also what the glass orb looks *through*: it refracts this same picture.
 */

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const DISPLAY_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform sampler2D uBaked;
layout(location = 0) out vec4 fragColor;
void main() { fragColor = vec4(texture(uBaked, vUv).rgb, 1.0); }
`

export type BackdropProps = {
  /** GLSL that defines `vec3 paint(vec2 P, float px)` in plate coordinates */
  paint: string
  orb: { u: number; v: number; r: number }
  target: THREE.WebGLRenderTarget
}

export function makeBackdropTarget() {
  return new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
}

export function Backdrop({ paint, orb, target }: BackdropProps) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const uniforms = useMemo(
    () => ({
      uAspect: { value: 1.5 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uOrb: { value: new THREE.Vector2(orb.u, orb.v) },
      uOrbR: { value: orb.r },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const bakeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: `${FRAME_GLSL}\n${paint}\n${MAIN_GLSL}`,
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    [paint, uniforms],
  )

  const display = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: DISPLAY_FRAG,
        uniforms: { uBaked: { value: target.texture } },
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    [target],
  )

  const bake = useMemo(() => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [bakeMat])

  useEffect(() => () => { bakeMat.dispose(); display.dispose() }, [bakeMat, display])

  const baked = useRef('')
  useFrame(() => {
    const w = gl.domElement.width
    const h = gl.domElement.height
    if (!w || !h) return
    const key = `${w}x${h}:${orb.u.toFixed(4)}:${orb.v.toFixed(4)}:${orb.r.toFixed(4)}`
    if (key === baked.current) return
    baked.current = key
    target.setSize(w, h)
    uniforms.uAspect.value = size.width / Math.max(1, size.height)
    uniforms.uRes.value.set(w, h)
    uniforms.uOrb.value.set(orb.u, orb.v)
    uniforms.uOrbR.value = orb.r
    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(bake.scene, bake.camera)
    gl.setRenderTarget(previous)
  }, -10)

  return (
    <mesh frustumCulled={false} renderOrder={-100} material={display}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
