# REFERENCES — real-world visual specs for ORB-Journey

Working notes for building ORB-Journey's world against **real plants, real water and real
light**. Every entry gives: what it is in the journey, the botanical/physical facts that a
model must hit, what to look at in a photograph, the links that were actually read, and how
to build it inside the house style (2–3 flat value steps, thin ink only on subjects, no ink
on plants or grass — see `REUSE_AUDIT.md` §1.9 / `love-letter/notes/style.md`).

**How to use this file.** Open the links, look at the photos *before* writing any code, and
keep the numbers. When a plant and a photo disagree, the photo wins for silhouette and
lighting, the spec wins for scale. Save the frames you actually look at into
`orb-journey/docs/refs/<species>.jpg` (nothing was downloaded into the repo here except the
source code copies, which sit in `orb-journey/src-repos/`).

House palette anchor (from `love-letter/notes/style.md`): forest greens are three values
sampled from one painted pine, never more; warm accents only on subjects; far layers are
lighter and bluer; no sun disc anywhere — the sky gradient carries the light.

---

## A. Meadow and wetland (beats 1–2)

### 1. Meadow Fescue — *Festuca pratensis* (now *Lolium pratense* / *Schedonorus pratensis*)

- **Role**: the base "tall grass" mass the orb first drifts over; the mid-value field the
  daisies and buttercups sit in.
- **Spec**: tufted perennial bunchgrass **30–140 cm** tall (commonly 0.5–1.2 m); culms erect
  or knee-bent at the base, 2–4 nodes. Leaf blades **linear, 10–45 cm long, 2–8 mm wide**,
  2–7 mm on field plants, rough/sandpapery above, dull green to grey-blue; **whitened
  clasping auricles** at the base, ligule 0.2–1.5 mm. Inflorescence a **nodding, open
  lanceolate/ovate panicle, (6–)10–35 cm long**, spikelets 9–20 mm, green to purplish.
- **Look at in photos**: the panicle is loose and one-sided, drooping at the tip — it reads
  as a fine, broken spray, *not* a solid ear. The clump base is dense and dark; the top
  third is where the light catches.
- **Sources**: Virginia Tech weed ID (habit, blades, auricles, seed head) —
  https://weedid.cals.vt.edu/profile/478/ ; AusGrass key (full morphology, numbers) —
  https://keys.lucidcentral.org/keys/v3/AusGrass/key/AusGrass/Media/Html/FESTUCA/FESPRA.HTML ;
  photos — https://commons.wikimedia.org/wiki/Category:Festuca_pratensis
- **Build note**: one clump = 9–14 curved blades, each a 2-segment ribbon that bends with
  `uSway`; draw the panicle as 5–7 thin quads at the tip. Three greens only: shade
  `#2C3B2A`, mid `#4C5F3C`, lit `#7C8D55` (proposal — sample from the painted pine).

### 2. Tall Foxtail — *Alopecurus pratensis* (meadow foxtail)

- **Role**: the height and the *silhouette interest* at the meadow's back edge; it is the
  plant that moves most in the wind because its head is soft.
- **Spec**: tufted perennial **30–100 cm**; leaves mostly basal, blades ridged and rough
  above, **auricles absent**, ligule membranous. Seed head a **spike-like panicle,
  cylindrical, blunt, soft, 2–10 cm long × 5–10 mm wide**, green or purple-flushed, silky
  hairs, straw-coloured and chaffy after flowering; each floret has a single awn from its
  centre.
- **Look at in photos**: a bottle-brush — parallel soft bristles, a *blunt rounded tip*, and
  the whole head leaning as one piece. Purple flush appears on the shaded side.
- **Sources**: UMass weed ID — https://www.umass.edu/agriculture-food-environment/landscape/publications-resources/weed-identification/meadow-foxtail--alopecurus-pratensis ;
  NatureSpot (numbers + the "pointing finger" ID) — https://www.naturespot.org/species/meadow-foxtail ;
  photo — https://commons.wikimedia.org/wiki/Category:Alopecurus_pratensis
- **Build note**: head = a capsule of ~40 instanced 1-px-wide quads with a sinusoidal
  per-quad tilt; keep the tip blunt (do not taper to a point). Flush purple `#6E5F72` only
  on the shadow side.

### 3. Oxeye Daisy — *Leucanthemum vulgare*

- **Role**: the single bright white accent in the meadow; the "child's drawing" flower that
  tells the viewer this is a meadow, not a lawn.
- **Spec**: upright perennial **30–80 cm** (some sources 20–80 cm); basal rosette of dark
  green spoon-shaped leaves 5–15 cm; upper stem leaves smaller, toothed; stem usually
  unbranched, **one head per stem, 3–5 cm across** (3–6 cm), **up to ~40 white ray florets**
  around a **bright yellow, slightly domed disc**; ray florets 15–25 mm long × 4–7 mm wide.
  Flowers May–August. At dusk the white rays appear to glow against dark grass (high
  reflectivity, the "moon daisy" effect) — useful for the dusk beat.
- **Look at in photos**: rays are *not* evenly spaced — they overlap, some are shorter, and
  the disc is a shallow dome with a faint darker ring at its edge. The stem is thin enough
  to disappear; the head floats.
- **Sources**: Kew Grow Wild — https://growwild.kew.org/plants/oxeye-daisy ; SDSU Open
  PRAIRIE botanical description — https://openprairie.sdstate.edu/nativeplant/321 ;
  photos — https://commons.wikimedia.org/wiki/Category:Leucanthemum_vulgare
- **Build note**: two crossed quads per head is enough at 2–4 m; for the close beat, 13–17
  ray petals with a 2-value white (`#F7F3E8` lit / `#D9D6C8` shade) and a disc of 4 flat
  tones (`#E8C24A` → `#B98A2C`). **No ink around petals** — the value step against the
  grass does the edge.

### 4. Wild Lavender — *Lavandula angustifolia*

- **Role**: the violet mass at the meadow's edge that introduces the orb's own purple; also
  the plant that gives the bee-hum/air sound a visual home.
- **Spec**: evergreen subshrub **20–75 cm** (up to 120–180 cm in cultivation); woody for
  half its height; leaves **linear to linear-lanceolate, 2–4.5 cm long**, grey-tomentose,
  margins rolled under. Flowers **9–12 mm**, blue-purple (rarely pink/white), in **2–8 cm
  interrupted spikes** (verticillasters of 6–12 flowers), bracts brown-reddish. June–August.
- **Look at in photos**: the spikes are *interrupted* — little rings of flowers with gaps of
  grey stem between them, and every spike leans a few degrees off vertical in a different
  direction. The grey foliage is the same value as the sky haze at distance.
- **Sources**: Monaco Nature Encyclopedia — https://www.monaconatureencyclopedia.com/lavandula-angustifolia/?lang=en ;
  Wilde Planten (NL, numbers) — https://wilde-planten.nl/echtelavendel.htm ;
  photos — https://commons.wikimedia.org/wiki/Category:Lavandula_angustifolia
- **Build note**: reuse the foxtail head geometry with 4–5 gaps; colour `#7B6A9B` lit /
  `#4A3F63` shade; foliage `#8C9384` with a blue haze mix at distance. The orb's purple must
  not match this exactly — lavender is a *duller, greyer* violet, which is what makes the orb
  read as a light source.

### 5. Buttercup — *Ranunculus acris* (meadow buttercup)

- **Role**: the small warm glint low in the grass; the "gold" that balances the daisy's white.
- **Spec**: hairy upright perennial **20–90 cm**; leaves alternate, round-to-kidney in
  outline, palmately divided 3–7 lobes, long-stalked below, smaller/sessile above; flowers
  **5 overlapping glossy golden-yellow petals, ~2.5 cm across**, in open terminal clusters;
  stems hollow, branching from the base. Early–midsummer.
- **Look at in photos**: the gloss — a buttercup is *specular*, with one bright crescent on
  the upper petal and a near-orange underside, which is why it reads at 20 m. It grows in
  loose colonies, never as a carpet.
- **Sources**: UMass weed ID — https://www.umass.edu/agriculture-food-environment/landscape/publications-resources/weed-identification/tall-buttercup--ranunculus-acris ;
  RHS profile (size + flower) — https://www.rhs.org.uk/plants/50360/ranunculus-acris/details ;
  photos — https://commons.wikimedia.org/wiki/Category:Ranunculus_acris
- **Build note**: 5 petals as one bent disc mesh with a `uGloss` term: `pow(dot(n,h),28)`
  in warm white; base `#E8B93A`, shade `#A87516`. Only the buttercup and the orb get a
  specular highlight in the meadow — everything else is flat steps.

### 6. White Clover — *Trifolium repens*

- **Role**: the ground cover that makes the meadow *walkable* — it appears where the camera
  comes low, and its round heads give the ground a soft texture instead of blades.
- **Spec**: low creeping perennial **5–20 cm** high, spreading by stolons that root at every
  node; leaves trifoliate, leaflets **1–2 cm**, rounded tip, finely toothed, usually with a
  **pale white crescent band**; flower heads white (aging pink-brown from the bottom),
  **1.5–2 cm across, 40–80 florets**, on a bare leafless stalk. Flowers early summer.
- **Look at in photos**: the heads are spheres of tiny pea-flowers, not flat discs; the
  crescent on each leaflet is *irregular* and often only on two of the three.
- **Sources**: Clemson HGIC — https://hgic.clemson.edu/factsheet/white-clover/ ; Mossfield
  (heights, head size) — https://www.mossfield.ca/plants/white-clover ;
  photos — https://commons.wikimedia.org/wiki/Category:Trifolium_repens
- **Build note**: one instanced "clover patch" of 12–20 leaf triples + 2–3 heads; the
  crescent is a lighter step `#C9D6B4` on the leaf's `#5E7548`. Heads fade to `#B79C93` as
  the beat advances (a single uniform, no per-floret work).

### 7. Blue Flag Iris — *Iris versicolor*

- **Role**: the wetland marker at the water's edge — the first sign that the journey is
  arriving at the river/lake, and the only strong blue-violet in the meadow.
- **Spec**: clump-forming perennial **up to ~90 cm** (2–3 ft); **sword-shaped, bluish-green
  leaves up to 1.2 m long**, arching, arising from a basal fan. Flowers deep blue to purple
  (rarely white), on a sturdy 2–4-flowered stem; **spreading sepals with purple veins
  narrowing to a white base, and a greenish-yellow ("pubescent") signal**; style arms arch
  over the sepals. Late spring. Wet meadows, lake shores, shallow water.
- **Look at in photos**: three "falls" hang down and three standards stand up; the yellow
  signal is a *small patch at the throat*, not a stripe; the leaves form a flat fan seen
  edge-on, so the plant nearly disappears from the side.
- **Sources**: USDA Forest Service — https://www.fs.usda.gov/wildflowers/beauty/iris/Blue_Flag/iris_versicolor.shtml ;
  Lady Bird Johnson Wildflower Center — https://www.wildflower.org/plants/result.php?id_plant=irve2 ;
  photos — https://commons.wikimedia.org/wiki/Category:Iris_versicolor
- **Build note**: 3 falls + 3 standards as 6 bent quads; violet `#5B4C93` lit / `#332A5C`
  shade, signal `#D9C24E`. Veins: 3–4 thin darker lines per fall at close range only.

### 8. Cattails — *Typha latifolia* (broadleaf cattail)

- **Role**: vertical rhythm at the water margin; the "sausage" silhouette that reads
  instantly at any distance and anchors the seam between land and water.
- **Spec**: tall perennial herb **1.5–3 m**; leaves **light green, strap-shaped, up to 2.5 cm
  wide and 2–2.5 m long**, emerging in a cylindrical roll (iris emerges in a fan); flower
  head = a **brown cylindrical terminal spike (female) with the male tassel directly above
  and touching it** (no gap — that gap is *T. angustifolia*); after flowering the male part
  falls, leaving the familiar brown sausage; seed heads persist through winter, then break
  into fluff. Flowers May–July. Grows in up to 0.75–1 m of water.
- **Look at in photos**: the spike is **matte brown**, slightly narrower at the top, and the
  leaves lean out at 10–20° from vertical — a stand is never parallel. Backlit, the leaf
  edges glow and the spike stays dark.
- **Sources**: NC State wetland guide — https://harvest.cals.ncsu.edu/plantguidedb/index.cfm?ViewPlantID=10763 ;
  Wikipedia (dimensions, spike structure) — https://en.wikipedia.org/wiki/Typha_latifolia ;
  photos — https://commons.wikimedia.org/wiki/Category:Typha_latifolia
- **Build note**: 6–9 leaves as long tapered ribbons with a slow twist; the spike is one
  capsule, colour `#6B4A32` with a lit left edge `#9A7150` and no ink. Put a shallow
  reflection of the stand in the water — cheaper than modelling the base.

---

## B. Trees and shrub (beats 1–4, the "forest" register)

### 9. Lady Fern — *Athyrium filix-femina*

- **Role**: the near-camera framing plant in the woodland beat — the "repoussoir" that
  brackets the frame and gives scale to the trees.
- **Spec**: clump-forming (cespitose) fern; fronds **light yellow-green, 20–90 cm long ×
  5–25 cm broad** (garden plants 1.3–2 m in rich soil), **3-pinnate**, elliptical, with the
  lowest pinnae shorter than the middle ones; grooved rachis, burgundy stems on many forms;
  **sori in 1–6 narrow ovate dots per pinnule** under a kidney-shaped indusium.
- **Look at in photos**: the frond is *see-through* — you read the rachis and then a haze of
  pinnae; the overall shape is a narrow egg, and the tips droop under their own weight. A
  backlit fern is the best "light" reference in this list.
- **Sources**: KPU Plant DB — https://plantdatabase.kpu.ca/Plant/atff ; Wikipedia —
  https://en.wikipedia.org/wiki/Athyrium_filix-femina ;
  photos — https://commons.wikimedia.org/wiki/Category:Athyrium_filix-femina
- **Build note**: never model pinnules. One frond = a **9–13-quad ladder** along a curved
  spine, each quad an alpha-tested painted pinna texture; two crossed ladders per clump for
  volume. Ink none; the silhouette plus the alpha is the whole effect.

### 10. Hazel Shrub — *Corylus avellana*

- **Role**: the understorey mass that closes the middle distance and hides the thread
  between the meadow and the pines.
- **Spec**: large deciduous shrub / small multi-stemmed tree, typically **4–8 m** (to 12 m
  when left alone); **many stems from the base**, smooth grey-brown bark peeling with age,
  bendy hairy twigs; leaves **round to oval, doubly toothed, pointed, soft and downy
  underneath**, turning yellow in autumn; **yellow male catkins to 6 cm, hanging in clusters
  from mid-February before the leaves**; nuts in leafy husks.
- **Look at in photos**: the shrub is a *dome of arcs* — stems leave the ground at 30–45°
  and arch back down; leaves overlap in flat sprays, so the mass reads as layered plates
  rather than a sphere. Catkins are the only vertical lines.
- **Sources**: RHS — https://www.rhs.org.uk/plants/4511/corylus-avellana-f/details ;
  Woodland Trust — https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/hazel/ ;
  photos — https://commons.wikimedia.org/wiki/Category:Corylus_avellana
- **Build note**: 7–11 arcs (2-segment tubes) + 3 leaf-card clusters; two value steps
  (`#3A4A32` / `#5F7145`) and one lighter rim `#8C9A63` on the sun side. No ink.

### 11. Scots Pine — *Pinus sylvestris*

- **Role**: the tall verticals of the forest beat; the tree whose trunk the camera cranes
  past. The single most important tree for "northern" atmosphere.
- **Spec**: **up to 35–40 m** (matures ~36 m); young trees conical, old ones a tall straight
  trunk with an **open, rounded crown and the lower branches shed**; bark **flaky grey-brown
  when young, upper trunk turning orange-red**, lower trunk thick and deeply fissured;
  needles **blue-green, in pairs, slightly twisted, 4–8 cm**; cones oval, woody, 2–4 in
  clusters pointing backwards along the stem.
- **Look at in photos**: the orange-red upper trunk is a *narrow band* between the grey base
  and the first branches — that band is the signature. The crown is a set of flat, horizontal
  needle plates at different heights ("pagoda"), not a cone; the sky is always visible through
  it.
- **Sources**: Forestry England — https://www.forestryengland.uk/tree-species/scots-pine ;
  Forestry and Land Scotland — https://forestryandland.gov.scot/living-and-working/learning-and-education/trees/scots-pine ;
  photos — https://commons.wikimedia.org/wiki/Category:Pinus_sylvestris
- **Build note**: 3–5 horizontal plate "shelves" per tree (each a cluster of instanced
  needle cards), a trunk cylinder with a 3-band colour ramp (grey `#6B6259` → orange
  `#B06A44` → shaded top), and a **silhouette that stays broken** — never a solid cone. This
  is the one tree where a thin ink line on the trunk is allowed (it is a "subject" when the
  camera passes it).

### 12. Silver Birch — *Betula pendula*

- **Role**: the light, bright vertical that contrasts the pines; where the orb passes, the
  birch is what sets the key of the frame.
- **Spec**: medium deciduous tree **to 30 m**; **silvery-white papery bark** that sheds in
  layers, turning black and rugged at the base and developing **dark diamond-shaped
  fissures** with age; twigs smooth with small dark warts; branches **drooping**;
  leaves **~5 cm, diamond/triangular, vivid green, doubly toothed**, turning bright yellow in
  autumn; male catkins ~6 cm yellow-brown hanging in 2–4s, females ~3 cm bright green erect.
- **Look at in photos**: the crown is a *haze* — the light comes through it, so a birch never
  reads as a solid mass; the white trunk has grey and black *horizontal* breaks and one dark
  side. The whole tree has a slight lean and a soft, weeping tip.
- **Sources**: Kew — https://www.kew.org/plants/silver-birch ; Woodland Trust —
  https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/silver-birch/ ;
  photos — https://commons.wikimedia.org/wiki/Category:Betula_pendula
- **Build note**: trunk = tapered tube, base colour `#E9E6DC` with `#8E8A80` shade band and
  3–5 black fissure decals (alpha quads); canopy = 4–6 semi-transparent leaf-card clusters,
  `#7E9B4F` with `#A8BF6A` rim. Draw the canopy with alpha *blend*, not alpha test, so light
  passes through — this is the one plant where the "drawn twice / lacy" look must be avoided.

### 13. English Oak — *Quercus robur*

- **Role**: the far background tree that gives the landscape its scale and its "old" feeling.
- **Spec**: large deciduous tree **20–40 m**, **broad spreading crown** with sturdy branches
  low down; leaves **~10 cm, 4–5 deep rounded lobes with smooth edges**, almost no stalk,
  bunched; acorns **2–2.5 cm on long stalks** in cupules; long yellow catkins in spring.
- **Look at in photos**: the crown is *wider than tall* in open ground; the branch structure
  is visible through the leaves at the edges; the mass is a dark, warm green that goes
  blue-grey at distance, never yellow-green.
- **Sources**: Woodland Trust — https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/english-oak/ ;
  RHS — https://www.rhs.org.uk/plants/14294/quercus-robur/details ;
  photos — https://commons.wikimedia.org/wiki/Category:Quercus_robur
- **Build note**: at distance it is a **painted card**, not geometry — 2 value steps plus
  haze mix. Reuse love-letter's `cardFrag` with `uInkFade` 0.6 and `uFog` 0.3.

### 14. Weeping Willow — *Salix babylonica*

- **Role**: the water's-edge tree for the arrival beat; the one plant that makes the
  air/water seam readable because its branches *touch* the water.
- **Spec**: deciduous tree **to 20 m** (often 9–12 m with a similar spread); trunk grey-black,
  irregularly furrowed, usually dividing near the ground; **crown open, branches pendulous**
  ("weeping") nearly to the ground; leaves **linear-lanceolate, 7.5–16 cm × 0.5–2 cm**, finely
  serrate, long-tapered, light green above and grey-green below; catkins ~2 cm.
- **Look at in photos**: it is a *curtain* — hundreds of near-parallel hanging strands whose
  density increases toward the outside; the light breaks into vertical stripes through it.
  Where a strand meets the water it drags a narrow wake.
- **Sources**: Oregon State Landscape Plants — https://landscapeplants.oregonstate.edu/plants/salix-babylonica ;
  World Agroforestry species profile — https://apps.worldagroforestry.org/treedb2/speciesprofile.php?Spid=18057 ;
  photos — https://commons.wikimedia.org/wiki/Category:Salix_babylonica
- **Build note**: strands = 40–70 instanced **2-segment ribbons** with a gravity bend and a
  phase-shifted sway (`sin(t*0.6 + i)`); colour `#8FA05A` lit, `#5A6B3A` shade, one lighter
  rim. Add 3–4 strands that reach the water plane and drive a small ripple ring where they
  touch (reuse `RippleSim`'s drops with 4 slots).

---

## C. Underwater (beat 3–4)

### 15. Giant Kelp — *Macrocystis pyrifera*

- **Role**: the underwater "forest" the orb falls through; the verticals that replace the
  pines when the camera crosses the surface.
- **Spec**: the largest seaweed, **to 45–60 m** long; a massive **holdfast**, **2–100+
  vine-like fronds**, each an ~**0.5–1 cm rope-like stipe** with **leaflike blades attached
  basally to gas-filled pneumatocysts** on pedicels; blades **corrugated**, largest
  300–400 cm² near mid-frond; can elongate **up to 60 cm/day** (45 m in a season). Fronds
  reach the surface and spread into a **canopy**.
- **Look at in photos**: the canopy is the subject — you look *up* a colonnade of stipes at
  10–20 m spacing, each with a ladder of blades and a single amber pneumatocyst at each
  blade base, and the sun arrives as **shafts between the stipes**. Colours: olive-brown
  blades, amber floats, deep blue-green water, and a bright (nearly white) ceiling.
- **Sources**: NHM Wildlife Photographer of the Year 2024, "Underwater Sanctuary" (Sage Ono,
  Monterey) — https://www.nhm.ac.uk/wpy/gallery/2024-underwater-sanctuary ; UNH Phycokey
  morphology — https://www.cfb.unh.edu/phycokey/Choices/Fucophyceae/MACROCYSTIS/Macrocystis_key.htm ;
  structure + photography notes — https://www.uwphotographyguide.com/book/underwater-photography-guide/marine-life/giant-kelp-forests/ ;
  more frames — https://www.oceanlight.com/log/kelp-forest-reminiscing.html
- **Build note**: 12–18 stipes as instanced ribbons with a slow S-sway; blades as alpha cards
  alternating left/right every ~1.2 m; the pneumatocyst is a **small ellipsoid with one
  specular dot** (it is the sparkle that sells kelp). Tint by depth with the same
  Beer-Lambert ramp as the water (`exp(-k·d)`, red first) — do not hand-pick colours.

### 16. Underwater caustics

- **Role**: the light pattern on the sand/rock at the bottom of the water beat, and the
  "focus" that drives the god-rays.
- **Physics**: the wavy surface is an array of **positive and negative lenses**: bright
  blotches where rays converge, dark where they diverge. **Dispersion** (n differs per
  wavelength) is partly why real caustics show colour fringes. The effect is **strongest when
  the water depth ≈ 5× the crest-to-crest distance** of the waves — at other depths the cells
  blur or fragment.
- **Look at in photos**: a **cellular network of thin bright lines** with soft bright pools
  inside, moving slowly and never repeating; edges of the bright lines are *hard*, the
  interiors are *soft*.
- **Sources**: EPOD "Patterns of Light in a Salt Water Pool" (depth ≈ 5× wavelength) —
  https://epod.usra.edu/blog/2006/12/patterns-of-light-in-a-salt-water-pool.html ; David
  Parker / Science Photo Library pool caustics — https://sciencephotogallery.com/featured/caustic-refractions-in-swimming-pool-science-photo-library.html ;
  EGU Imaggeo refractive caustic network — https://imaggeo.egu.eu/view/120/
- **Build note**: do not simulate — use a **baked tile** and the shade-verse animation
  (`REUSE_AUDIT.md` §4.4): two rotated copies drifting apart, `min()` to keep lines thin, a
  ±0.003 UV per-channel offset for the fringe. shade-verse's `public/caustics.png` is already
  a physically made tile and can be copied.

### 17. Air–water meniscus / the seam

- **Role**: the "one seam" of beat 3 — the line where the journey changes medium.
- **Physics / optics**: at a **container wall** water curves up (concave meniscus) because
  adhesion beats cohesion; the curve's height is millimetric on a glass and invisible on a
  lake. What you actually *see* at a large water body is an **over/under split**: a bright,
  slightly wavy line where the lens crosses the surface, above it air (often blown out),
  below it water (darker, tinted), with a **thin meniscus band of distorted, compressed
  detail** right at the line. Photographers shoot it with a **large dome port** (8–9 in)
  precisely to keep that band thin and straight; smaller ports make a thicker, wavier line.
- **Look at in photos**: the line is **not horizontal** — it bows with the swell and it is
  sharper on the sunny side; the underwater half is 1–2 stops darker and shifted
  green-cyan; objects that cross the line are *refracted and displaced* just above it.
- **Sources**: Amateur Photographer split-level guide (dome size → waterline thickness, level
  camera) — https://amateurphotographer.com/technique/camera_skills/split-level-photography/ ;
  Ikelite split-shot technique (dynamic range, waterline control) —
  https://www.ikelite.com/blogs/advanced-techniques/tips-for-shooting-split-shots-with-your-underwater-housing-video ;
  Waterdog guide (meniscus at the dome, thirds composition) —
  https://www.waterdogphotographyblog.com/doing-the-splits-a-guide-to-over-under-photography/ ;
  meniscus at a wall (USGS) — https://www.usgs.gov/media/images/meniscus-seen-along-edges-glass-cylinder
- **Build note**: implement shade-verse's solver contract (`REUSE_AUDIT.md` §4.3): per-column
  `uWL` height array, 25 columns, one shared GLSL `wlY(ndcX)` used by both the water and the
  tint pass, **2 cm bias above the analytic surface**, and a `fwidth`-widened ramp so the
  boundary never becomes a 1-pixel step. Add a 1.5–2 px band of increased distortion at the
  line (the dome-port band) and darken the underwater half by a fixed 1.2 stops rather than
  by eye.

---

## D. Sky and light (all beats)

### 18. Puffy cumulus (cumulus humilis)

- **Role**: the clouds the orb rises past, and the shadow-casters that make the god-rays.
- **Spec**: detached, **flat base**, domed/cauliflower top, **~1 km across**, base at
  **~1000 m**, lifetime 5–40 min, tops all reaching nearly the same level; white to light
  grey with shadows on the underside; sharp outlines. Above them: "floating in a hazy layer
  from which the rounded tops emerge".
- **Look at in photos**: three things sell a cumulus — the **hard flat base line**, the
  **cauliflower lobes on top** (each lobe a sphere with its own shaded underside), and the
  **grey-lavender shadow core** on the side away from the sun. Edges are crisp against blue,
  never feathered.
- **Sources**: UIUC/ISU cloud catalog — https://meteor.geol.iastate.edu/~mt206/scout_pres/clouds/fair_cumulus.html ;
  UCAR SciEd — https://scied.ucar.edu/image/cumulus-clouds ; WMO International Cloud Atlas,
  Cumulus humilis — https://cloudatlas.wmo.int/en/cumulus-humilis.html
- **Build note**: **painted cards, not volumetrics** (love-letter's `.cardFrag` with `fadeBot`
  so no card edge shows): 2–3 depth layers, each card a single painted cloud with a hard base
  and soft painted lobes; tint far layers toward the sky (`uHaze`), and keep the sun out of
  frame. If a volume is needed, march 3 octaves of value noise and clip with a **plane at the
  base** — the flat bottom is more important than the top.

### 19. Crepuscular god-rays

- **Role**: the shafts through the pines and through the kelp canopy.
- **Physics**: sunlight is essentially parallel; rays become visible where **fog, mist, dust
  or spray** scatter light toward the eye, and **gaps** (branches, leaves, cloud edges) cut
  the beam into stripes. They appear to fan out from the sun only by perspective. Best when
  the sun is low, the air is hazy, and the viewer faces the light; rays are brightest against
  **dark** backgrounds and invisible against bright sky. Real photographs expose ~½–1 stop
  down so the beams keep texture instead of clipping white.
- **Look at in photos**: beams have **soft edges and slight internal streaking**; where a beam
  hits the ground it is a soft pool, not a spot; the gaps *between* beams are darker than the
  general ambient, which is what makes the beam read.
- **Sources**: EPOD "Sunlight Through Foggy Canopy" (local crepuscular rays in forest) —
  https://epod.usra.edu/blog/2011/12/sunlight-through-foggy-canopy.html ; MeteoSwiss on fog
  rays — https://www.meteoswiss.admin.ch/weather/weather-and-climate-from-a-to-z/fog/fog-rays-and-god-rays-optical-phenomena-at-fog-margins.html ;
  photographic technique (three ingredients, exposure) —
  https://photographyicon.com/god-rays-photography/
- **Build note**: cheap screen-space radial blur from the sun's screen position through a
  depth-masked mask (only bright background pixels), 6–10 taps, **dithered** with a
  4×4 Bayer offset so no banding; multiply by a soft "haze" term that is *higher* near the
  beam sources than in the open air. shade-verse's `uwRays` (marching in metres with
  forward scattering) is the correct model underwater; the forest version can be the cheaper
  post effect. Never add a sun disc — the light is implied.

---

## E. The orb

### 20. Glowing purple orb with electron-like GPGPU rings

- **Role**: the protagonist of every beat.
- **What it must read as**: a **light source with structure**, not a plastic ball — a dense
  core, a thin refractive rim, and 2–3 thin rings of particles whose motion is *orbital*
  (fast near the core, slow at the far side) with slight precession of the ring planes.
- **Real references for the behaviour**:
  - Quantum-orbital particle systems (dense glowing cloud, phase-coloured bands, trails,
    "breathing" between two orbital shapes) — https://3drise.ai/objects/particles/electron-orbitals
  - GPU particle systems with a liquid-noise core, a wireframe energy shell and
    **independently rotating orbit rings** — https://github.com/nindekararyan-pixel/particle-universe-threejs
  - GPU orbital-motion particles with per-particle orbital velocity and ribbon trails
    (`TRAIL` renderer, ping-pong history buffers) —
    https://www.npmjs.com/package/@cyberluke/three-particles
- **Build note (house style)**: the scaffold already has the right skeleton
  (`src/App.tsx`: icosahedron core + two tori). Upgrade in this order:
  1. **Core**: keep the geometry, move the shading to a custom material — `uSun`-style
     2-step toon + a Fresnel rim `pow(1-dot(n,v),3)` in `#B9A5FF`, so the orb keeps love-letter's
     flat-value language instead of `MeshStandardMaterial`'s gradient.
  2. **Rings**: replace the two solid tori with **instanced particles** (600–1200 per ring,
     one `InstancedBufferGeometry`, positions computed in the vertex shader from
     `aPhase`, `aRadius`, `aSpeed`, ring tilt) — no GPGPU needed at this count; the
     "electron" feel comes from **unequal angular speed per particle** (`v ∝ r^-1.5`) and a
     ~4° precession of the ring plane, not from physics.
  3. **Trails** only if the phone budget allows: a single 1/4-res ping-pong RGBA8 buffer with
     surface-tension's ScreenPaint rules (exact `(0.5,0.5,0,0)` clear, ×0.975/×0.95/×0.8
     fades) — and remember **it lives in viewport space**, never advected by scroll.
  4. **Bloom**: additive glow sprites drawn *under* the ink, like love-letter's
     `ptsFrag`/glow — a full-screen bloom pass is the first thing to cut on the phone tier.

---

## F. What is still missing (do not invent)

- No reference yet for the **specific meadow composition** (what grows next to what in
  ORB-Journey's own meadow). Use the heights above to layer: clover 0.05–0.2 m → buttercup
  0.2–0.6 m → fescue/foxtail 0.3–1.4 m → lavender 0.4–0.8 m → iris/cattail 0.9–3 m at the
  water → hazel 4–8 m → birch/pine/oak/willow 20–40 m. That single ladder is the whole
  landscape grammar.
- No **video** reference was captured for the wind fields (sway speed, gust frequency). If a
  value is needed, measure from a real clip before coding it. For scale, love-letter's card
  sway in `js/shaders.js` runs on `sin(t*0.8)` plus `0.3*sin(t*1.55)` — about 0.13 Hz with a
  0.25 Hz harmonic, i.e. one slow breath per 7–8 s, with the amplitude (`uSway`, world units)
  set per layer rather than the speed.
- No **licensed** stock imagery is included; all links above are reference pages (Wikimedia
  Commons categories for photos), not files to ship.
