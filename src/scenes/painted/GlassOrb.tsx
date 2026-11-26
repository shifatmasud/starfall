import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * The glass orb of the reference: a clear ball lens. It is drawn as a screen-space disc whose normal
 * is the sphere's, and it refracts the scene's own baked backdrop — so what it shows is the picture
 * behind it, flipped and magnified the way a real crystal ball does — with a Fresnel reflection of
 * the surroundings, a hard specular, a thin bright rim, the caustic crescent opposite the light,
 * an optional warm core (the seabed panel), and a soft halo.
 */

const M = 3.2 // the quad's half-size in orb radii: room for the halo

const VERT = /* glsl */ `
uniform vec2 uCenter;   // screen uv, y up
uniform float uR;       // radius, fraction of screen height
uniform float uAspect;
out vec2 vQ;
void main() {
  vQ = position.xy * ${M.toFixed(1)};
  vec2 uv = uCenter + vQ * uR * vec2(1.0 / uAspect, 1.0);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
in vec2 vQ;
uniform sampler2D tBack;
uniform vec2 uCenter;
uniform float uR;
uniform float uAspect;
uniform vec2 uLight;      // direction toward the key light, screen space
uniform vec3 uTint;       // the glass's own colour in transmission
uniform vec3 uRimCol;
uniform vec3 uCore;       // warm inner glow (colour × strength)
uniform vec3 uHaloCol;
uniform float uHalo;
uniform float uTime;
uniform float uBend;
uniform float uGain;
layout(location = 0) out vec4 fragColor;

vec3 back(vec2 uv) { return texture(tBack, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }

void main() {
  vec2 q = vQ;
  float d = length(q);
  float aa = max(fwidth(d) * 1.2, 0.004);
  vec2 scale = uR * vec2(1.0 / uAspect, 1.0);

  // the halo: light scattered around the glass, strongest just outside the rim
  float outside = max(d - 1.0, 0.0);
  vec3 halo = uHaloCol * uHalo * (exp(-outside * 3.2) * 0.55 + exp(-outside * 12.0) * 0.6) * smoothstep(1.0 - aa, 1.0 + aa, d);
  halo *= smoothstep(${M.toFixed(1)}, ${(M * 0.6).toFixed(2)}, d);

  if (d > 1.0 + aa) {
    fragColor = vec4(halo, 0.0);
    return;
  }

  float dd = min(d, 0.9999);
  vec3 n = vec3(q / max(d, 1e-4) * dd, sqrt(1.0 - dd * dd));
  vec2 L = normalize(uLight);

  // transmission: a ball lens inverts and magnifies what is behind it; toward the rim the bend grows
  // a solid glass ball (n ≈ 1.5) sees a wide field: the picture inside spans several radii of the scene
  float bend = uBend + 1.4 * dd * dd;
  vec2 refr = uCenter - q * scale * bend;
  vec2 disp = q * scale * 0.045 * dd * dd;
  vec3 trans = vec3(back(refr + disp).r, back(refr).g, back(refr - disp).b);
  // the glass gathers light: the transmitted picture is brighter and a little cleaner than the scene
  trans = trans * uTint * uGain + uHaloCol * 0.05 * (1.0 - dd * dd);

  // reflection of the surroundings: the hemisphere above and around the ball
  vec2 rdir = n.xy;
  vec2 reflUv = uCenter + vec2(rdir.x, abs(rdir.y) * 0.7 + 0.45) * scale * 3.4;
  vec3 refl = back(reflUv) * 0.85 + back(uCenter + rdir * scale * 6.0) * 0.25;
  float fres = 0.04 + 0.96 * pow(1.0 - n.z, 4.0);
  vec3 col = mix(trans, refl, clamp(fres, 0.0, 0.92));

  // the light: a sharp specular, a broad sheen, the rim and the caustic crescent opposite the light
  vec3 Ld = normalize(vec3(L, 0.9));
  vec3 H = normalize(Ld + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  float spec = pow(nh, 220.0) * 3.2 + pow(nh, 26.0) * 0.18;
  float side = dot(q / max(d, 1e-4), L);
  float rim = smoothstep(0.80, 0.985, dd) * (1.0 - smoothstep(0.985, 1.0 + aa, d) * 0.6);
  vec3 rimLight = uRimCol * rim * (0.55 + 0.65 * max(side, 0.0));
  float caustic = smoothstep(0.42, 0.90, dd) * (1.0 - smoothstep(0.90, 0.99, dd)) * pow(max(-side, 0.0), 1.5);
  col += trans * caustic * 0.9 + uRimCol * caustic * 0.18;
  col += rimLight + vec3(1.0, 0.98, 0.94) * spec;

  // a second, softer window reflection on the light's side: the reference's bright crescent
  float crescent = smoothstep(0.55, 0.92, dd) * (1.0 - smoothstep(0.92, 1.0, dd)) * pow(max(side, 0.0), 3.0);
  col += vec3(1.0) * crescent * 0.28;

  // the warm heart
  col += uCore * (exp(-dd * dd * 4.0) * 0.8 + exp(-dd * dd * 14.0) * 0.6) * (0.92 + 0.08 * sin(uTime * 1.3));

  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  fragColor = vec4(col * alpha + halo, alpha);
}
`

export type GlassOrbProps = {
  target: THREE.WebGLRenderTarget
  /** screen uv of the centre, y up */
  center: { x: number; y: number }
  /** radius as a fraction of the screen height */
  r: number
  light?: [number, number]
  tint?: string
  rim?: string
  core?: [number, number, number]
  haloColor?: string
  halo?: number
  bob?: number
  /** how wide a field the lens gathers, in orb radii at the centre */
  bend?: number
  /** brightness of the transmitted picture */
  gain?: number
  /** a live placement (screen uv centre + radius) that overrides center/r every frame */
  live?: { x: number; y: number; r: number }
}

export function GlassOrb({
  target,
  center,
  r,
  light = [-0.6, 0.7],
  tint = '#f2f8ff',
  rim = '#eaf4ff',
  core = [0, 0, 0],
  haloColor = '#cfe6ff',
  halo = 0.25,
  bob = 0.004,
  bend = 2.2,
  gain = 1.2,
  live,
}: GlassOrbProps) {
  const size = useThree((s) => s.size)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          tBack: { value: target.texture },
          uCenter: { value: new THREE.Vector2(center.x, center.y) },
          uR: { value: r },
          uAspect: { value: 1.5 },
          uLight: { value: new THREE.Vector2(...light) },
          uTint: { value: new THREE.Color(tint) },
          uRimCol: { value: new THREE.Color(rim) },
          uCore: { value: new THREE.Vector3(...core) },
          uHaloCol: { value: new THREE.Color(haloColor) },
          uHalo: { value: halo },
          uTime: { value: 0 },
          uBend: { value: bend },
          uGain: { value: gain },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendEquation: THREE.AddEquation,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const u = mat.uniforms
    u.uAspect.value = size.width / Math.max(1, size.height)
    const c = live ?? center
    u.uCenter.value.set(c.x, c.y + Math.sin(t * 0.9) * bob)
    u.uR.value = live ? live.r : r
    u.uTime.value = t
  })
  return (
    <mesh frustumCulled={false} renderOrder={20} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
