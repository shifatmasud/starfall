# Starfall — 1:1 render iteration plan

Reference: 8-panel grid (`downloads/starfall-reference-grid.png`), compared panel by panel against
SwiftShader renders (`scripts/scene-shot.mjs`, 960×600 for iteration, 1440×900 for finals).

## Working setup (this round)

- Headless renders now work on the sandbox box: the bundled Playwright Chromium is missing, so
  `scripts/scene-shot.mjs`, `scripts/shot.mjs` and `scripts/scene-qa.mjs` take `CHROME_PATH`
  (system Chromium 155 is installed at `/usr/bin/chromium`).
- The frame watchdog in `SceneCanvas` rebuilt the renderer on a CPU rasterizer (5 s/frame is normal
  there); under `?qa=1` it no longer does. Without this, the heavy scenes (2, 3) produced a blank
  canvas and a 0-byte PNG.

## Scene-by-scene: current state → 1:1 gaps → ordered fixes

### 1 · Space (`Scene1Space`, `SpaceBackdrop`, `CrystalStarOrb`, `Asteroids`, `StarFlare`)

- **Rings: removed** (user instruction — no orbital rings on the orb, none are drawn now).
- Earth limb is in the right place, but the planet reads too dark and too smooth: the reference's
  disc is dominated by bright sunlit cloud banks and a luminous cyan-white atmosphere crest; ours is
  a dark blue mottle with a thin bright arc.
- The orb reads as a brown marble: the "sunlit strata" amber term of the shader dominates, the
  transmission is muddy, there is no blown-out sunward edge and the specular is soft. The reference
  orb is a clear glass ball: white-hot rim on the sunward side, cool glass on the far side, a crisp
  specular and a bright caustic.
- Asteroids are too large, too pale and too flat (broad facets catching the key light).
- The star's flare is a little too wide and too soft.

Fixes, in order: orb glass re-grade (drop the amber strata, cool clean transmission, hot sunward
limb + crisper specular + caustic); Earth lift (cloud coverage/brightness, ocean blue, brighter
atmospheric crest, warm terminator left); asteroids smaller/darker with rim light; tighten the star.

### 2 · Clouds (`Scene2Clouds`)

Baseline pending (the scene overruns the CPU budget; now renders with the watchdog off).
Known gaps from the plate: warm sunrise behind the cloud sea, sunlit cumulus tops with soft
blue-violet shadow sides, a single distant summit on the right, and a tight comet trail.

### 3 · Forest (`Scene3Forest`)

Baseline pending. Plate: strong warm godrays from the upper left through a canopy, a dark great
trunk closing the right, mossy boulders bottom-left, a glowing orb resting mid-frame on the moss,
white flowers in the lit foreground, deep green with warm highlights.

### 4 · Alpine lake (`Scene4Lake`) — largest gap

- Mountains read as low grey humps, no snow, no rock/snow contrast; the plate's range is a sharp
  snow-capped wall across the horizon.
- The right-hand "ridge" is a huge dark-green blob standing in the lake: it should be a forested
  hillside receding along the right bank, with a dark pine treeline.
- The lake is choppy grey with foam streaks: the plate is a near-mirror reflecting the range.
- Foreground meadow is coarse olive clumps with a few daisies; the plate is fine deep-green grass
  thick with white daisies.

Fixes: rebuild the far range (Alps DEM, more relief, sharp snowline, rock/snow palette), push the
right ridge back and give it a treeline, water → glassy (wind down, reflection up, no sparkle/foam),
meadow → denser smaller greener tufts + many more daisies, a few cumulus puffs over the range.

### 5 · Desert oasis (`Scene5Desert`)

- The pool is an obvious flat ellipse with a neon tiled ripple pattern and a hard edge.
- Palms read as ferns stuck on poles; the plate has real palm crowns (radiating drooping fronds,
  tapered ringed trunks) clustered on the left.
- The ruined stone columns of the plate are missing.
- Dunes are smooth blobs; the plate has sharp crest lines and ridged sand.

Fixes: calm dark-teal pool with a wet-sand shoreline band and reflection; rebuild the palm crown
(radial drooping scanned fronds, tapered trunk); add sandstone ruin columns + lintel on the left;
sharpen dune crests.

### 6 · Arctic ocean (`Scene6Ice`)

- Bergs are white round blobs; the plate has angular, flat-topped tabular ice with blue-green
  underwater skirts.
- Water is dark navy with regular ripples; the plate is bright turquoise-white with a sun glitter
  path.
- The ice front is a low white ridge; the plate has a taller glacier wall and peaks.

Fixes: flat-shaded, stretched/cut berg shapes with blue skirts and more small floes; brighter
turquoise water with a sun path; taller ice front; pale warm horizon haze.

### 7 · Underwater dive (`Scene7Descent`)

- Bubbles draw as hollow rings; the plate's trail is dense, white, foamy and reads as real bubbles.
- Rays are broad grey-blue wedges; the plate has narrow bright shafts from the upper left with a
  luminous surface.
- The seafloor is a black silhouette; the plate has a lit blue-grey reef with coral and small fish.

Fixes: filled translucent bubble spheres with rim highlights and size variance; narrower brighter
rays from the upper left; lit reef floor with colour; fish silhouettes; brighter surface caustics.

### 8 · Deep seabed (`Scene8Seabed`)

- Too dark and olive: the plate is bright turquoise-blue with a warm sandy floor and a pool of light.
- Coral reads as dark blobs; the plate has pink, orange and violet coral heads and tall kelp fronds.
- Light shafts are faint and wide.

Fixes: brighter warmer sand with the shaft light pool; coloured coral tints with translucency; add
scanned-frond kelp walls; stronger, narrower vertical shafts; a warmer, cleaner orb core.

## Process

One improvement area at a time → `npm run build` → SwiftShader render of that scene next to its
reference panel → visual check → commit + push → upload the side-by-side sheet.

## State after pass 2 (renders at 1200×750 on SwiftShader)

Done and pushed:

- **1 Space** — rings gone; orb is a luminous glass body (white-gold sunward limb, crisp specular,
  refracted world in the body, warm lower-right catch-light); Earth's clouds/sea/atmosphere lifted;
  asteroids smaller. Still: the ball's dark side is darker than the plate's, and faint banding shows
  in the refraction.
- **2 Clouds** — sun upper right, warm glow, a strip of sky opens at the top left, summit in from
  the edge, smaller orb with a shorter wake. Still: cloud tops slightly grey-lavender.
- **3 Forest** — mist cut, orb glowing on the moss with a warm halo. Closest panel already.
- **4 Lake** — snow-capped range from the Alps DEM, deeper greens, calmer lake, finer meadow with
  daisies, right bank pushed back and hazed. Still: no true mountain reflection in the water, and
  the range sits lower than the plate's.
- **5 Desert** — full palm crowns, calmer pool with an irregular shoreline, ruin columns now standing
  above the sand at the pool's left edge, sharper dunes.
- **6 Ice** — flat-shaded, stretched, low-floating tabular bergs, taller ice front, brighter sea.
  Still: water reads navy rather than turquoise, sun path weak.
- **7 Descent** — filled foamy bubbles, brighter shafts from the upper left, lit reef. Still: the
  trail is dense right at the orb; no fish silhouettes yet.
- **8 Seabed** — brighter water and warm sand, pastel coral, stronger shafts. Still: sand a little
  olive, coral shapes read soft.

Open items for the next pass: scene 3 and 7 still light themselves from their own environments
(scene 3 uses `forest_slope` rather than the shared clear sky — replacing it means building the
canopy from scans, since a clear sky behind the trunks would show through); true planar reflection
for scene 4; fish for scene 7; scene 1's orb banding.
