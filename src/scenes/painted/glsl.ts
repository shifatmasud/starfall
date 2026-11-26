/**
 * The shared GLSL toolkit for the painted scenes (3–8): hashes, value noise, fbm, ridged noise,
 * jittered cells and the plate's coordinate frame.
 *
 * Every painted scene authors its picture in *plate* coordinates: x 0..1 across a 3:2 frame, y 0..1
 * down, the same frame as the reference panel. The display covers the viewport with that plate — a
 * wider screen sees more of it left and right, a phone sees its middle — so the composition is the
 * reference's at every size.
 */
export const PLATE_ASPECT = 1.5

export const NOISE_GLSL = /* glsl */ `
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 h22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s / 0.96875;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s / 0.875;
}
/** ridged noise, 0..1, sharp crests: mountain skylines and rock */
float ridge(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { float n = 1.0 - abs(vn(p) * 2.0 - 1.0); s += a * n * n; p = p * 2.07 + vec2(3.1, 1.3); a *= 0.5; }
  return s / 0.96875;
}
/** nearest jittered point of a grid: x = distance (cell units), yz = cell id */
vec3 cells(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float best = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = h22(i + g) * 0.8 + 0.1;
    float d = length(g + o - f);
    if (d < best) { best = d; id = i + g; }
  }
  return vec3(best, id);
}
vec3 saturate3(vec3 c, float s) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, s); }
/** a soft round light: bokeh, glints, sun discs */
float disc(vec2 p, vec2 c, float r, float soft) { return 1.0 - smoothstep(r - soft, r + soft, length(p - c)); }
`

/**
 * The bake's frame: `P` is the plate point under this pixel, `px` the size of one screen pixel in
 * plate units, `uOrb`/`uOrbR` where the orb sits (so the ground can catch its light).
 */
export const FRAME_GLSL = /* glsl */ `
precision highp float;
in vec2 vUv;
uniform float uAspect;
uniform vec2 uRes;
uniform vec2 uOrb;
uniform float uOrbR;
layout(location = 0) out vec4 fragColor;
${NOISE_GLSL}
`

/** the bake's main(): calls the scene's `vec3 paint(vec2 P, float px)` */
export const MAIN_GLSL = /* glsl */ `
void main() {
  vec2 P = vec2(0.5 + (vUv.x - 0.5) * uAspect / ${PLATE_ASPECT.toFixed(1)}, 1.0 - vUv.y);
  float px = 1.0 / uRes.y;
  vec3 col = paint(P, px);
  // a 1/255 dither so the long gradients never band
  col += (h21(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(max(col, 0.0), 1.0);
}
`
