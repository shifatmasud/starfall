# Star Fall

Eight scenes, one per chapter of a fall from space to the ocean floor. Each scene is its own
full-bleed WebGL2 picture, mounted alone by `?scene=N`, with no interface on top of it.

**Scene 1 is built: `?scene=1`** — a crystal star over the Earth's limb.
**Scene 2 is built: `?scene=2`** — the star diving through a morning cloud sea, trailing a comet wake.

```
npm install
npm run dev        # http://localhost:5173/?scene=1  (or ?scene=2)
npm run build      # tsc --noEmit && vite build
npm run qa:scene   # headless SwiftShader screenshots of ?scene=1, desktop + mobile
```

## What is in the repository

```
src/
  main.tsx                     ?scene=1..8 → one scene, nothing else
  App.tsx                      the shell: a fixed 100vw×100vh canvas, no UI at all
  scenes/
    Scene1Space.tsx            scene 1: backdrop, rocks, flare, orb, post chain
    Scene2Clouds.tsx           scene 2: baked morning sky, diving orb, comet wake
    CloudSea.tsx               the painted cloudscape, baked once per viewport
    CometOrb.tsx               the diving crystal and its luminous wake
    SpaceBackdrop.tsx          sky, star field and the Earth's limb, baked once into a texture
    Asteroids.tsx              seven instances of three scanned rocks
    StarFlare.tsx              the bright star and the orb's halo
    layout.ts                  the composition in screen units (phone ↔ desktop)
  components/
    CrystalStarOrb.tsx         the glass star and its ring system
    rock/MoonRock0{1,3,5}.tsx  gltfjsx components for the Poly Haven scans
    rock/rockMaterial.ts       the scan's shader (colour + normal + roughness maps)
  gl/
    PostFX.tsx                 Bloom → Final grade/ACES → ScreenPaint distortion → SMAA
    fluidTrail.ts              the cursor trail's simulation (surface-tension / Lusion ScreenPaint)
public/models/                 the three scans, base64 (decoded to .glb by vite.config.ts)
```

## Assets

Real scans, not procedural shapes: Poly Haven's CC0 **Moon Rock 01 / 03 / 05**, fetched at 1k,
converted with `npx gltfjsx <file>.gltf --types --transform --resolution 512 --simplify --ratio 0.4`,
then resized to 512 px textures (webp) and Draco-compressed — **100 / 64 / 79 KB**.

They travel as `.glb.b64` and are decoded into `public/models/*.glb` at build time: the only write
path available to this repository from where the scene is built is text-only, and a binary pushed
through it arrives corrupt.

## Post chain

The order is Lusion's (handbook ch.8): **Bloom (10) → Final grade / ACES (30) → ScreenPaint
distortion (75) → SMAA (500)**, built on `postprocessing`.

The trail is the full ScreenPaint simulation — 4 RGBA8 targets at 1/4 and 1/8, capsule brush, brush
velocity, the blurred low-res push, gradient-noise curl, per-frame dissipations, the 8-bit weight
floor, the exact 0.5 clear, the separable 9-tap blur and the 2× cubic B-spline display field — with
the distortion pass (blue-noise dither, nine jittered taps, the wake fringe) reading that field.

## Scene 1 notes

- The sky, the stars and the planet are one shader, rendered once per viewport into a texture. On a
  CPU rasterizer this is the difference between a slideshow and a scene.
- Stars are a hashed grid in device pixels, so they stay crisp at any DPR.
- The Earth's clouds use arc-length coordinates along the limb, which is what keeps them painterly
  instead of radially stretched.

## Scene 2 notes

- The sky, the sun, the range and the cloud banks are one shader baked into a texture once per
  viewport, for the same reason as scene 1's backdrop: on a CPU rasterizer the difference between a
  slideshow and a scene.
- Each bank of cumulus is a density field biased by height, shaded by the field's own slope: the
  normal comes from three samples of the same noise, so the crowns are lit cream, the bodies warm
  grey and only the hollows fall to violet.
- The comet wake is a tapered additive sheet: stretched filaments for the strands, hashed points for
  the sparkles, and a head glow that melts into the orb.

## The trail

The wake is a liquid lens over the finished frame, not a smear of the paint itself. The field's own
weight gradient gives the surface's tilt, the frame is displaced down that slope with a per-channel
difference, and the bead under the finger magnifies what it crosses. Outside the field's footprint
the pass returns the frame untouched, to the pixel. A stroke begins where the hand is: the first
contact snaps the brush instead of dragging it from the last position, and release clears the stroke.
`node scripts/trail-origin-qa.mjs` captures a touch scrub from the centre-right and diffs the frame
to prove nothing is painted at the origin.
