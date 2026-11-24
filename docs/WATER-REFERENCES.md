# Water and staging references (owner's own starred list)

Source: https://github.com/stars/shifatmasud/lists/3d-water — thirty repos the owner keeps for 3D water.
Rule from the owner: **never invent**. Take technique and assets from these, not from scratch.

## What each one actually is

| repo | stack | what it gives us |
| --- | --- | --- |
| `marklundin/water` | PlayCanvas, WebGPU preferred with a WebGL2 fallback | An FFT ocean, an independent sky renderer, and nine studies of light above and below the surface (stillwater, coastal rocks, caustics, cinematic effects). Studio controls for wind, swell, clarity, sun, haze, caustics. This is the closest match to starfall's needs because it covers both sides of the surface. |
| `Noniv/web-ocean` | WebGPU, written from scratch, no engine | Sunset sea with simulated waves, whitecaps, sun glitter and a physically based sky with clouds. `ocean.html` is self-contained. Best reference for the *look* of open water against a sun. |
| `dgreenheck/tidewater` | WebGPU + WGSL, own small engine | Island fishing game with a real-time tropical ocean: reef, deep water, dynamic resolution scaling, several hundred shaders compiled at load. Reference for scale and for how it degrades on slower machines. |
| `Leonxlnx/procedural-alpine-lake` | Python + GLSL, no engine, no assets | A 60 second cinematic flight through an alpine lake valley, generated entirely from code and matched to ten reference photos. 2752x1152 at 24 fps, 14 hours on a laptop iGPU. The staging reference: camera flight, pacing, colour grade. |
| `SamG-Coder/clearwater`, `Aureliengmz/clearwater` | — | Clear-water look studies. |
| `ScottieFox/caustic-volume` | — | Volumetric caustics, for the shallow lake and the oasis pool. |
| `aiimpl/cenote` | — | Cenote: the underwater light shaft case, close to starfall's deep chapter. |
| `cryptomanavan/ShoreBreak`, `iamtechartist/coastal-simulation`, `iamtechartist/tideglass-cove` | — | Shoreline foam and coastal simulation. |
| `dgreenheck/threejs-particle-fluids`, `imokya/threejs-fish` | three.js | Particle fluids and fish, for the lake and sea life. |
| `NoxelLab/nagi-ocean-sim`, `SamG-Coder/WaterCuda`, `SamG-Coder/WaterCuda` | — | Simulation-heavy approaches, not web-realtime priorities. |
| `Leonxlnx/athenaion`, `Leonxlnx/napali`, `Leonxlnx/open-water` | — | More environment studies by the same author. |
| `mkturkcan/valdrada`, `vibegameengine/web-starter-kit-webgpu-pipline`, `scottstts/Threejs-Awesome-Graphics-Agent-Skills`, `willwaltz/globes`, `Token-Gremlin/natural-disasters`, `StarKnightt/ocean-drive`, `achrefelouafi/WaterThreeJS`, `SamG-Coder/MountainRIver`, `SamG-Coder/RealIsland`, `SamG-Coder/dynamic-gaussian`, `souranyp-stack/koi-pond-garden`, `Noniv/web-ocean` | — | Supporting studies. |

## What to adopt in starfall (three.js / WebGL2, must run on a Samsung M02s)

1. **Waves**: a sum of Gerstner waves with analytic normals (tangent/binormal from the same derivatives), not a normal-map scroll. Cheap enough for the phone, and it gives the horizon silhouette the reference has.
2. **Surface light**: fresnel-weighted sky reflection plus one specular sun term for glitter, as in `Noniv/web-ocean`'s sunset sea. With the HDRI already loaded, mix the environment sample in rather than a flat sky colour.
3. **Reflection**: a planar reflection pass for the lake and the oasis pool, at half resolution with a blur, since those two chapters are the ones where a reflection reads.
4. **Underwater**: depth-based absorption toward the chapter's deep colour, a Snell's window at the surface, and volumetric shafts, following the under-surface studies in `marklundin/water` and `aiimpl/cenote`.
5. **Staging**: `Leonxlnx/procedural-alpine-lake` is the pacing reference, a single unbroken flight rather than cuts, with the grade held consistent across the whole run.

## Assets

All Megascans from https://www.fab.com/sellers/Quixel%20Megascans — no login needed, `Download` → agree to the Fab EULA → take the **glTF low** (or the 2K texture set for materials). Current pulls live in `public/models/ms/` and `public/art/`.

Never hand-author geometry or texture where a scan exists.
