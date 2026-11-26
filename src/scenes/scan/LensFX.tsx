import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Screen-space lens effects for the scan scenes, drawn over the world as children of <ScanScene>.
 *
 *   SunShafts  god rays fanning from the photo's sun; `reach` sets how far down the frame they carry
 *              (lower = longer shafts), so a forest panel's beams can reach the orb
 *   Bokeh      out-of-focus foreground highlights: the soft discs a wide aperture makes of sunlit
 *              near leaves and flowers
 */

export type SunShaftsProps = { x: number; y: number; color: string; strength: number; haze?: number; reach?: number }

export function SunShafts({ x, y, color, strength, haze = 0.35, reach = 2.2 }: SunShaftsProps) {
  const size = useThree((s) => s.size)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uSun: { value: new THREE.Vector2(x, y) }, uCol: { value: new THREE.Color(color) }, uS: { value: strength }, uHaze: { value: haze }, uAspect: { value: 1.5 }, uTime: { value: 0 }, uFall: { value: reach } },
        vertexShader: /* glsl */ `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          precision highp float; in vec2 vUv; uniform vec2 uSun; uniform vec3 uCol; uniform float uS; uniform float uHaze; uniform float uAspect; uniform float uTime; uniform float uFall;
          layout(location=0) out vec4 o;
          float h(float n){ return fract(sin(n) * 43758.5453); }
          float vn(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h(i), h(i+1.0), f); }
          void main(){
            vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
            float r = length(d);
            float a = atan(d.x, -d.y);
            float shafts = smoothstep(0.35, 0.9, vn(a * 5.0 + uTime * 0.03)) * 0.8 + smoothstep(0.5, 0.95, vn(a * 13.0 + 7.0)) * 0.4;
            float fall = exp(-r * uFall) * smoothstep(0.0, 0.08, r);
            vec3 c = uCol * (shafts * fall * uS + exp(-r * 2.4) * uHaze + exp(-r * 18.0) * 0.8);
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

/** discs: [x, y, radius, brightness], x and y in 0..1 screen space, radius in screen heights */
export type BokehProps = { color: string; discs: [number, number, number, number][] }

export function Bokeh({ color, discs }: BokehProps) {
  const size = useThree((s) => s.size)
  const mat = useMemo(() => {
    const d = discs.slice(0, 16).map((v) => new THREE.Vector4(...v))
    while (d.length < 16) d.push(new THREE.Vector4(0, 0, 0, 0))
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uD: { value: d }, uCol: { value: new THREE.Color(color) }, uAspect: { value: 1.5 } },
      vertexShader: /* glsl */ `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; in vec2 vUv; layout(location=0) out vec4 o; uniform vec4 uD[16]; uniform vec3 uCol; uniform float uAspect;
        void main(){
          vec3 c = vec3(0.0);
          for (int i = 0; i < 16; i++) {
            vec4 b = uD[i]; if (b.z <= 0.0) continue;
            float r = length((vUv - b.xy) * vec2(uAspect, 1.0)) / b.z;
            float disc = smoothstep(1.0, 0.7, r) * (0.8 + 0.2 * smoothstep(0.5, 0.9, r));
            c += uCol * disc * b.w;
          }
          o = vec4(c, 1.0);
        }`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame(() => {
    mat.uniforms.uAspect.value = size.width / Math.max(1, size.height)
  })
  return (
    <mesh material={mat} renderOrder={6} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
