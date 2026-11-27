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
    Scene2Clouds.tsx           scene 2: sky, scanned range, drei cloud sea, diving orb
    scene2/Sky.tsx             the low sun, the gradient and the cirrus, baked once
    scene2/Range.tsx           the range, displaced from a scanned elevation model
    scene2/CloudSea.tsx        the sea of cumulus — drei <Clouds>/<Cloud>, three tones per billow
    scene2/frame.ts            frame coordinates (u, v) → world, at any depth
    CometOrb.tsx               the diving crystal and its luminous wake
    SpaceBackdrop.tsx          sky, star field and the Earth's limb, baked once into a texture
    Asteroids.tsx              seven instances of three scanned rocks
    StarFlare.tsx              the bright star and the orb's halo
    layout.ts                  the composition in screen units (phone ↔ desktop)
  components/
    SceneCanvas.tsx            the frame around every scene: capability probe, context-loss recovery,
                               still fallback — a black page is never an acceptable answer
    CrystalStarOrb.tsx         the glass star and its ring system
    rock/MoonRock0{1,3,5}.tsx  gltfjsx components for the Poly Haven scans
    rock/rockMaterial.ts       the scan's shader (colour + normal + roughness maps)
  gl/
    capabilities.ts            what this device can actually do, measured with a real framebuffer
    PostFX.tsx                 Bloom → Final grade → ScreenPaint distortion → SMAA
    fluidTrail.ts              the cursor trail's simulation (surface-tension / Lusion ScreenPaint)
public/models/                 the three scans, base64 (decoded to .glb by vite.config.ts)
public/tex/                    the cloud sprite and the range's heightmap, base64
public/poster/                 the stills shown when a device cannot run WebGL
```

## Scene 2's range is real ground

`public/tex/dem/alps-h.webp` is an 8 KB heightmap built by `scripts/build-dem.py` from **AWS Open
Data's terrain tiles** (`elevation-tiles-prod`, terrarium-encoded PNG, SRTM/GMTED) around the
Matterhorn and Monte Rosa massif at zoom 12 — 1593 m to 4352 m. `Range.tsx` displaces a heightfield
mesh from it, bakes snow above the real snow line on the slopes shallow enough to hold it, bakes the
low sun into the vertex colours, and lets the scene's fog do the aerial perspective. Nothing in that
silhouette is noise: every peak is a place.

## Assets

Real scans, not procedural shapes: Poly Haven's CC0 **Moon Rock 01 / 03 / 05**, fetched at 1k,
converted with `npx gltfjsx <file>.gltf --types --transform --resolution 512 --simplify --ratio 0.4`,
then resized to 512 px textures (webp) and Draco-compressed — **100 / 64 / 79 KB**.

They travel as `.glb.b64` and are decoded into `public/models/*.glb` at build time: the only write
path available to this repository from where the scene is built is text-only, and a binary pushed
through it arrives corrupt.

## Drawing on a phone

`gl/capabilities.ts` measures the device before the first canvas — a real RGBA16F framebuffer, checked
for completeness and read back, never an extension string — and `components/SceneCanvas.tsx` uses it:
DPR and the post chain's pixel budget come down on phone-class GPUs, SMAA and 16-bit buffers are
desktop-only, a lost context remounts the renderer, a stalled frame counter does the same, and a device
that cannot create a context at all gets a rendered still of the scene with one quiet line of text.

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

## Credits

The scanned and modelled assets shipped in `public/` are third-party work:

- Poly Haven (CC0) — HDRI skies, scanned rocks, grass, ferns, palm trunk and palm leaf crowns, tree stump.
- Smithsonian Open Access (CC0) — the coral specimens (Acropora, Pocillopora, Porites, Favia) and the conch shell.
- ambientCG (CC0) — the moss carpet scan.
- **vinish.dev, "Date Palm", "Royal Palm", "Coconut Palm" (CC BY 4.0)** — the oasis palms, via
  https://vinish.dev/free-3d-models/palms, downloaded as glTF, optimised with gltf-transform (meshopt
  geometry, WebP textures), converted with gltfjsx. Attribution: models by vinish.dev, licensed under
  CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
- NOAA NDBC (public domain) — the measured wave spectra that drive the water (`src/physics/waveSpectra.ts`).

Binary assets that had to travel through a text-only contents API are committed base64-encoded
(`*.b64`) and decoded to their real form by `vite.config.ts` at build time.

## The painterly pass (2026-11-27)

The user's note on pass 3 was "looks disgusting, harsh". The cause was structural, not a matter of
taste knobs, and the fixes are now in the shared frame plus the four worst panels:

- **Grade (`src/gl/PostFX.tsx`).** `FinalShader` lifts the toe: 0.0 becomes a coloured shadow floor
  (`uShadowFloor`, per scene) instead of black, with a pastel roll-off that desaturates the extremes
  and a gentle knee so highlights glow. `PainterlyShader` replaces the old 24-tap disc blur with an
  8-tap four-quadrant Kuwahara-lite: the lowest-variance direction wins, so scan gravel and leaf noise
  flatten into strokes of tone while silhouettes stay put, plus a highlight bleed and a tinted veil.
- **Atmosphere (`src/scenes/scan/ScanScene.tsx`).** The three.js fog chunks (`fog_pars_vertex`,
  `fog_vertex`, `fog_pars_fragment`, `fog_fragment`) are patched once at module load, so every standard
  material — terrain, water, grass, scans — carries the same air: an exponential approach to the far
  limit, thinned by altitude (`uHazeHeightFalloff`), with Mie forward scattering toward the sun
  (`uSunHazeColor`, `uMieStrength`), and, underwater, Beer–Lambert absorption of the red channel.
- **Surfaces (`src/scenes/scan/Fit.tsx`).** `applyPainterlySurface` injects into each scan's
  MeshStandardMaterial: a cavity lift of baked-dark texels (the black specks), a wrapped terminator
  with a coloured shadow fill, a sun-grazing Fresnel rim, a back-lit subsurface lift, and optional
  wind ripples in the shading normal. It chains with `applySSS` / `applyOcclusion`.
- **Light (`src/scenes/painted/LightStreak.tsx`).** The trail is light in air: a soft diffused core
  inside a wide sheath, not a laser wire.
- **Scene 5 rebuilt without scans** (`src/scenes/oasis/`): `DuneField` (wind-crested dunes, carved
  basin, shore capillary band, analytical cast shadows baked into the ground), `DatePalm` (ringed
  tapered trunk, pinnate drooping fronds generated as geometry), `Ruins` (a real Doric order with
  entasis, flutes, capitals, broken shafts and fallen drums) and `OasisFoliage` (reed clusters and
  stratified sandstone boulders), with `SoftShadow` contact shade under every prop. The pool and the
  other panels keep the measured NOAA NDBC spectrum — no synthetic wave model was reintroduced.
- **Orb.** The glass rim is a soft gradient that melts into its halo instead of a bright hoop; the
  orbital rings remain removed.
