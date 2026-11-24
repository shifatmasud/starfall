# REUSE_AUDIT — what ORB-Journey takes from Shifat's four source repos

Audited 2026-11-24. Source of truth: the four GitHub repositories, read from
`shifatmasud` through the Upsy GitHub tools (`app_call` → app `github`, tools
`search_repositories` / `list_branches` / `get_file_contents`) and from full tarball
copies pulled from `codeload.github.com` (public repos, `main` as of this date).

| Repo | Branch / commit read | Local copy |
|---|---|---|
| `shifatmasud/love-letter` | `main` @ `16dcc895` | `orb-journey/src-repos/love-letter-main/` |
| `shifatmasud/surface-tension` | `main` @ `f01ce0f7` | `orb-journey/src-repos/surface-tension-main/` |
| `shifatmasud/shade-device-lab` | `main` @ `ed073764` | `orb-journey/src-repos/shade-device-lab-main/` |
| `shifatmasud/shade-verse` | `main` @ `fcc0c346` **and** `water-interaction` @ `7cd43990` | `orb-journey/src-repos/shade-verse-main/`, `…-water-interaction/` |

No source repo was modified. Nothing was pushed anywhere.

Repo-name check (the brief asked for exact slugs): all four exist exactly as named —
`love-letter`, `surface-tension`, `shade-device-lab`, `shade-verse`. Other branches that
matter: `love-letter` → `round-boughs-grade` (rolled-back bough round, do **not** revive),
`surface-tension` → `fix-text-backdrop`, `riptide-v*`, `archive/local-2026-11-02`,
`shade-verse` → `water-interaction`, `chore/ci-and-build-polish`, `archive/local-2026-11-02`.

---

## 0. The one-paragraph answer

The UI language ORB-Journey must match lives almost entirely in **one file**:
`love-letter/index.html` — its `<style>` block *is* the design system (tokens, header,
pill, ink-sound button, pinned text slot, rounded sheet over a fixed dark footer, grain,
scrim). Everything else is behaviour: **love-letter** shows how to run a scroll-driven
Three.js painting under that UI (one RAF, one craning camera, text that only ever moves
inside a mask); **surface-tension** supplies the token scale the love-letter CSS already
imports, the virtual-scroller physics, the ping-pong GPU paint trail and the adaptive
quality governor; **shade-device-lab** supplies the measurement discipline (which numbers
to hold a phone to, and a device profile for Shifat's own Adreno 506 phone);
**shade-verse** supplies the water work — Beer-Lambert + Snell's window, the per-column
air/water split-line solver, the baked-caustic tile, and the "same objects, cheaper
drawing" quality knobs.

---

## 1. `love-letter` — the design language (primary source)

### 1.1 Tokens (verbatim, `index.html` → `<style> :root`)

```css
:root{
  --ink:#332b29;            /* warm near-black ink: all text and the CTA fill */
  --cream:#fff8ea;          /* text on the painted scene */
  --r:36px;                 /* the sheet's bottom corner radius (28px ≤620px) */
  --font:"Allo Round",system-ui,-apple-system,"Segoe UI",sans-serif;
  /* Surface Tension tokens (shifatmasud/surface-tension src/styles/tokens.css) */
  --wrap-w:1200px;          /* one shared column for header, beats and footer */
  --pad-x:clamp(22px,4vw,48px);
  --s2:16px; --s3:24px; --s4:40px; --s5:64px;
  --fs-small:12.5px;
}
html{background:#121315}
body{margin:0;background:#121315;color:var(--ink);font-family:var(--font);
     font-size:16px;line-height:1.2;-webkit-font-smoothing:antialiased;
     overflow-x:hidden;font-feature-settings:"ss01"}
.wrap{max-width:var(--wrap-w);margin:0 auto;padding:0 var(--pad-x)}
```

Page chrome colours: dark is `#121315` (page + footer + theme-color at the footer),
footer text `#f5f3ef`, footer dim `rgba(245,243,239,.62)`, sheet fill `#1d2430`,
stage fill `#d9b98f` (the warm colour the canvas fades in from), `theme-color`
`#e9c79a` while the sky is over it.

Type: **Allo Round** (`fonts/AlloRound.woff2`, 93 KB, SIL OFL 1.1 by Josh Puckett —
`fonts/OFL.txt` must ship with it), `font-weight:400 700`, `font-display:swap`,
preloaded with `crossorigin`. Body 16 px / 1.2; the `"ss01"` stylistic set is on.

### 1.2 Layout skeleton (`index.html` body order)

```
.hdr-fix  (position:fixed, z-index:50, pointer-events:none; children auto)
   .wrap > header.on-dark  →  a.mark (48×48 logo)     button.pill--sound
.sheet    (z-index:1; bg #1d2430; radius 0 0 36px 36px; clip-path inset(0 round 0 0 36px 36px))
   .stage (position:sticky; top:0; height:100lvh; margin-bottom:-100lvh; z-index:0)
       canvas#gl + .vig + .grain + .veil (.ready → opacity 0) + .scrim
   main > section.beat  ×N  (each 100lvh, the last 180lvh)
.foot-space (height = footer height, kept in sync by ResizeObserver)
footer     (position:fixed; bottom:0; z-index:0; bg #121315) ← the Cost-of-Design "curtain"
```

The trick that makes it feel like one object: the painted scene scrolls **over** a fixed
dark footer, and because `.sheet` is clipped with `clip-path: inset(0 round 0 0 36px 36px)`
(not just `overflow`), the WebGL canvas itself gets the rounded bottom corners. Header is
**outside** the sheet so the clip never cuts it, and it stays for the whole page, footer
included.

### 1.3 Header / nav (Cost of Design grammar)

- `header{padding:28px 0}` desktop, `20px 0` ≤620px; `display:flex; justify-content:space-between`.
- `.mark`: `48×48`, `display:grid; place-items:center`, `margin-left:-11px` (optical),
  inner `i` is `26×26`, `::after` is an invisible `88×88` hit area at `-20,-20`.
  Focus ring `2px solid var(--ink); outline-offset:2px`.
- Logo: two mirrored rounded-quad strokes, inline SVG, `viewBox="-2 -2 204 204"`,
  fill `#ffffff` in the header and `#f5f3ef` in the footer:

```svg
<path d="M115.66 1.82L166.95 1.82A14 14 0 0 1 176.85 25.72L111.29 91.28A36 36 0 0 1 85.84 101.82L34.55 101.82A14 14 0 0 1 24.65 77.92L90.21 12.36A36 36 0 0 1 115.66 1.82ZM114.16 98.18L165.45 98.18A14 14 0 0 1 175.35 122.08L109.79 187.64A36 36 0 0 1 84.34 198.18L33.05 198.18A14 14 0 0 1 23.15 174.28L88.71 108.72A36 36 0 0 1 114.16 98.18Z"/>
```

  (`js/logo3d.js` swaps in an extruded 3D copy drawn head-on — `.mark.is-3d svg{display:none}`.
  ORB-Journey only needs the flat SVG.)
- Tone: nav is white over dark painting, ink over light day sky, driven by a class
  (`header.on-dark`), `transition: color .45s ease` — **colour only, no shadow, glow or scrim**.
- `.pill` (generic CTA): `600 16px/1`, white on `var(--ink)`, `border-radius:999px`,
  `padding:15px 24px`, no border.
- `.pill--sound`: `44×44` min, `padding:0 11px`, transparent, `color:#121315`,
  `margin-right:-10px`; holds a `22×14` `<canvas class="snd-wave">` twice (`ir-a` / `ir-b`
  for the label roll) plus a `.ink` layer for the ink flood.

### 1.4 The pinned text slot (Surface Tension's `.slot`, ported)

```css
.beat{height:100lvh;display:flex;flex-direction:column;justify-content:flex-end;
      padding:0 var(--pad-x) var(--s5);color:var(--cream);pointer-events:none}
.beat .slot__beat{position:fixed; bottom:var(--s5); z-index:3;   /* text is pinned, sections only give scroll length */
  left:calc(max(0px,(100% - var(--wrap-w))/2) + var(--pad-x));
  right:calc(max(0px,(100% - var(--wrap-w))/2) + var(--pad-x));
  display:flex;flex-direction:row;justify-content:space-between;align-items:flex-end;gap:40px;
  text-shadow:0 1px 18px rgba(20,14,18,.45), 0 0 2px rgba(20,14,18,.25)}
.slot__eyebrow{position:absolute;left:0;bottom:100%;margin:0 0 var(--s3);
  font-size:var(--fs-small);letter-spacing:.08em;text-transform:uppercase;line-height:1.45;opacity:.86}
.slot__title{font-size:56px;line-height:1.04;letter-spacing:-0.02em;font-weight:400;
  text-align:left;text-wrap:balance}
.slot__body{flex:0 1 36ch;max-width:36ch;font-size:20px;line-height:1.15;
  letter-spacing:-0.01em;text-wrap:pretty}
.slot__line{display:block;overflow:hidden;padding-bottom:.14em;margin-bottom:-.14em} /* the mask */
.slot__in{display:inline-block;transform:translate3d(0,110%,0);will-change:transform}
@media (max-width:640px){
  .beat .slot__beat{bottom:var(--s4)}
  .slot__beat{flex-direction:column;align-items:flex-start;gap:16px}
  .slot__title{font-size:clamp(34px,10.4vw,56px)}
  .slot__body{flex:0 0 auto;font-size:17px;max-width:34ch}
}
```

Text scrim (inside `.stage`, so it clips with the sheet's rounded bottom — a *fixed* scrim
would paint over the corners):

```css
.scrim{position:absolute;left:0;right:0;bottom:0;height:46vh;z-index:1;pointer-events:none;
  background:linear-gradient(to top,rgba(10,16,14,.62),rgba(10,16,14,.28) 45%,rgba(10,16,14,0))}
```

Copy pattern per beat: eyebrow `NN — The <place>`, title ≤4 words, body one or two
sentences in the same quiet register. Actual strings (reuse as tone reference):

| Beat | eyebrow | title | body |
|---|---|---|---|
| 0 | `01 — The house` | Where it began | A small log house under old pines. Smoke from the chimney, and one light left on for whoever comes back. |
| 1 | `02 — The rise` | Above the trees | One red balloon, slow and quiet. The forest gets small. The air gets thin and kind. |
| 2 | `03 — The letter` | Above the clouds | Night comes in soft and the stars wake up. One last thing was left up here for you to read. |

Footer copy: `Love Letter. Painted and built by Shifat Masud` + `November 2026` (dim).

### 1.5 Grain, vignette, veil (cheap "film", no post pass)

```css
.stage .vig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 42%,rgba(0,0,0,0) 55%,rgba(24,16,22,.34) 100%)}
.stage .grain{position:absolute;inset:-60px;pointer-events:none;
  background:url(/tex/grain.png) 0 0/160px 160px;opacity:.22;mix-blend-mode:overlay;
  animation:grain 1s steps(6) infinite}
@keyframes grain{0%{transform:translate(0,0)}17%{transform:translate(-23px,11px)}
 33%{transform:translate(17px,-29px)}50%{transform:translate(-9px,31px)}
 67%{transform:translate(29px,7px)}83%{transform:translate(-31px,-17px)}100%{transform:translate(0,0)}}
.low .stage .grain{animation:none}
@media (prefers-reduced-motion:reduce){.stage .grain{animation:none}}
```

### 1.6 Footer curtain + micro-typography

```css
footer{position:fixed;left:0;right:0;bottom:0;z-index:0;background:#121315;color:#f5f3ef;
  font-size:15px;padding:40px 0 calc(48px + env(safe-area-inset-bottom,0px));contain:layout paint}
footer .wrap{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.foot-mark{width:30px;height:30px;margin-bottom:16px}          /* + ::after 59×80 hit area */
.foot-name{position:relative;padding:12px 0;margin:-12px 0;transition:opacity .25s ease}
.foot-name::before,.foot-name::after{content:"";position:absolute;left:0;right:0;
  bottom:var(--ul-b,10px);height:1px;background:rgba(245,243,239,.35)}
.foot-name::after{background:#f5f3ef;transform:scaleX(0);transform-origin:left center;
  transition:transform .45s cubic-bezier(.4,0,.6,1)}
.foot-name:hover::after,.foot-name:focus-visible::after,.foot-name.is-tap::after{
  transform:scaleX(1);transition-duration:.65s;transition-timing-function:cubic-bezier(.45,0,.2,1)}
```

`.foot-space` is a spacer whose height is re-measured from the real footer
(`ResizeObserver → s.style.height = f.offsetHeight + 'px'`), so the curtain opens by
exactly the footer's height. On touch, `.is-tap` replays the underline for 1 s.

### 1.7 Buttons: the "ink" component (`js/ink-button.js`, 585 lines, compiled verbatim from `shade-verse/src/title/portfolio/inkButton.ts`)

This is the house button. Behaviour: ink flood from the pointer, label + arrow roll,
magnet pull, spring squash on press, ripple (SVG `feDisplacementMap` over a procedural
ring map). If ORB-Journey ships **one** interactive control, make it this.

Constants worth copying as-is:

```js
const INK = { FLOOD:0.85, DRAIN:0.65, TAP_HOLD:0.32,
  MAG_MAX:{cta:8,sound:4}, MAG_PAD:0.2, MAG_PAD_MIN:24, PARALLAX:1.5,
  MAG_F:2.6, MAG_Z:0.55, SQ_X:1.04, SQ_Y:0.92, SQ_F:7, SQ_Z:0.8,
  REL_F:2.4, REL_Z:0.45, ROLL:0.6, RIP_DUR:0.76, RIP_PEAK:{cta:20,sound:10} };
// HOUSE motion (same as surface-tension core/house.ts and tokens.css)
IN  = cubic-bezier(0.19,1,0.22,1)   DUR_IN 1.0
INOUT = cubic-bezier(0.65,0,0.35,1) DUR_OUT 0.6  DUR_UI 0.6  DUR_FADE 0.24
```

Mechanics that matter (all in that file):
- flood = `clip-path: circle(r at x y)` grown to "smallest circle covering the pill"
  (`cover()` uses the two rounded-end centres + radius), eased with the house `IN` curve;
- drain leaves through the pointer, re-centring first so there is no visible jump;
- magnet only when `matchMedia('(hover: hover) and (pointer: fine)')`, max 8 px (CTA) / 4 px
  (sound pill), with `PARALLAX 1.5` on `.ink-par` children;
- a `pointercancel` while scrolling reports `clientX/Y = 0,0`, so the drain falls back to
  the last real touch point (`b.tp`) — this is the bug that makes most web pill buttons
  jump on mobile; the file already solves it;
- `prefers-reduced-motion`: flood/drain still happen, instantly, no roll/magnet/squash.

### 1.8 Scroll → scene (`js/main.js`)

One `requestAnimationFrame` does everything:

```js
function frame(now){
  requestAnimationFrame(frame);
  lenis.raf(now);                       // Lenis with autoRaf:false
  const y = lenis.animatedScroll ?? scrollY;
  const H = stageH || innerHeight;
  const f0 = sheetH() - innerHeight, yS = Math.min(y, 2*H) + Math.max(0, y - Math.max(2*H, f0));
  P = clamp(yS / H, 0, 2.25);           // beat progress, 1.0 per screen
  root.position.y = -camY(p) - (Psm - p) * 4;   // the scene moves, the camera stays
  ...
  Sound.mix(p);                          // ← audio follows the same smoothed p
  renderer.render(scene, camera);
}
```

Camera (a real craning camera, not per-layer speeds):

```js
const CAM_Y = [0, 46, 80], CAM_TH = [0, 0.2, 0.2];   // height, tilt per beat
const ease = (f) => 0.35*f + 0.65*f*f*(3-2*f);       // calm at each beat, never a full stop
camera.position.set(ptrS.x*0.32, ptrS.y*0.16, 10);
camera.lookAt(camera.position.x, camera.position.y + Math.tan(camTh(p))*14, -4);
camera = PerspectiveCamera(40, aspect, 0.8, 130);    // near 0.8, far 130: depth precision where it matters
```

Pointer spring: critically damped, `w = 3.0 rad/s`, sub-stepped at 120 Hz so it behaves the
same at 8 fps on a phone as at 60 on a laptop; `PTR_X 0.32`, `PTR_Y 0.16` max travel
("small so framing plants can never reach the subject").

Text reveal (ported line-for-line from Surface Tension `TextLayer.tsx`):

```js
const OUT_DUR = 0.6, IN_DUR = 1.3, STAGGER = 0.09;
easeOut = bezier(0.25,0.8,0.25,1);  easeIn = bezier(0.65,0,0.35,1);
// v: 0 under the mask, 1 in place, 2 gone through the top
function paintLine(d, v, o){
  const tl = clamp(1 - v, -1, 1);
  d.style.transform = `translate3d(0,${((1-v)*102).toFixed(2)}%,0)
    skewX(${(2.52*tl).toFixed(3)}deg) scaleY(${(1/(1+0.035*Math.abs(tl))).toFixed(4)})`;
  d.style.opacity = o;
}
```

Rules the code enforces and ORB-Journey should keep: the incoming beat **waits** until
every leaving line has cleared its mask (`clearAt = ot0 + OUT_DUR + STAGGER*(n-1)`); only
the beat within `0.38` of `P` (0.50 for the active one) owns the slot; the last beat's
exit is **scroll-driven** (`letterOut` from 0.55 screen before the footer) so the text is
always gone before the curtain opens, and rolls back on the way up.

Layer visibility: `beatGroups[0].visible = p < 1.2; [1] = p > 0.2 && p < 2.2; [2] = p > 1.05`
— only beats near the view do work. The render loop pauses when the footer covers the
stage (`IntersectionObserver → running = e.isIntersecting`).

Quality tier + adaptive DPR:

```js
const GPU = gpuName();                      // WEBGL_debug_renderer_info, then loseContext()
const weakGPU = /Adreno \(TM\) ?[2-5]\d\d|Mali-[4T]|Mali-G[357]\d|PowerVR|Intel.*(HD|UHD) Graphics( [5-6]\d\d)?\b|SwiftShader|llvmpipe/i.test(GPU);
const mem = navigator.deviceMemory || 4;
let LOW = q==='low' || (q!=='high' && (weakGPU || mem<=2 || (coarse && mem<=4)));
const DPR = LOW ? 1 : Math.min(devicePixelRatio||1, 1.5);
// afterwards, every 150 frames: if >90 were slower than 24 fps, dpr *= 0.8 (floor 0.75)
```

`?q=low` / `?q=high` force a tier, `?debug` overlays fps / dpr / draw calls / triangles / P
and the GPU string — copy this overlay, it is the fastest way to QA the orb on the phone.

Asset versioning (`js/assets.js`, generated by `tools/stamp.py`): every url is
`/path?v=<8 hex of file hash>`; `asset(p)` is used by every fetch, so the service-worker
cache can be immutable.

### 1.9 WebAudio soundscape — the architecture to mirror (**the brief's audio requirement**)

This is the part to copy faithfully. Design constraints it satisfies, in order:
**nothing plays before a real gesture** (iOS/Android autoplay), **beds are real recordings
cross-faded by scroll**, **taps are separate and quiet**, **mute is one persisted switch**,
**preloading never blocks**, **tab-hidden parks the graph**.

**a. Files** (`snd/*.webm|*.mp3`, CC0 from Freesound — `SOUNDS.md` lists every track,
author and edits; keep the credit table in ORB-Journey too):

| bed | source | use |
|---|---|---|
| `pines` | freesound 181801 keweldog | wind in the pines (beat 1) |
| `leaves` | 635053 sillygrizzlies | soft leaves |
| `fire` | 563766 florianreichelt | quiet crackle |
| `air` | 181251 mario1298 | soft high wind (beat 2) |
| `night` | 637083 Nox_Sound | far crickets (beat 3) |

One-shots: `creak`, `crackle` (house), `cloth` (balloon), `airpush` (plants/clouds — cut
0.2–1.7 s, HP 110 Hz / LP 3.2 kHz, 90 ms in, 0.4 s out, peak −1.3 dBFS). Every bed is
low-passed at 2.4 kHz (6-pole) and levelled to −23 LUFS offline.

**b. Boot on first gesture** (`js/audio.js`):

```js
const first = () => { boot(); removeEventListener('pointerdown', first, true);
                              removeEventListener('keydown', first, true); };
addEventListener('pointerdown', first, true);
addEventListener('keydown', first, true);
// boot(): new AudioContext(); if (ctx.state === 'suspended') ctx.resume();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume();
});
```

`capture: true` on both listeners is what makes it survive `stopPropagation` in the scene
canvas; `keydown` too, for keyboard-only users. Decoding happens **after** the gesture
(`decodeAudioData` on the already-fetched `ArrayBuffer`s), which is the only way to keep
the first tap latency low on a phone.

**c. Graph** (exact, worth copying):

```
beds:   BufferSource(loop) → Gain per bed → bedBus(LP 2500, Q .5) → LP 2500 → out
taps:   BufferSource → Gain → [StereoPanner] → tapBus(Gain = TAP) → limiter(-1.5 dBFS, ratio 20) → destination
out:    Gain(MASTER 0.8) → LP 9000 → Compressor(-20, knee 18, ratio 2.5, .02/.3) → destination
```

Levels: `BEDS = {pines:.11, leaves:.04, fire:.03, air:.11, night:.08}`, `TAP = 0.14`,
`MASTER = 0.8`. Comment in the source: *"beds play half as loud as before (−6 dB): about
−42 to −47 LUFS out, under the taps."* Measured peaks: beds −25/−30/−31 dBFS, taps −21…−23.

**d. Scroll-reactive crossfade** — one call per frame with the beat progress `p`:

```js
function mix(p, tc = 1.1){                     // slow time constant: no jumps
  lastP = p; const t = ctx.currentTime;
  const lv = {
    pines:  Math.max(0, 1 - p*0.95),
    leaves: Math.max(0, 1 - p*1.4),
    fire:   Math.max(0, 1 - p*2.2),            // only close to the house
    air:    Math.pow(Math.max(0, 1 - Math.abs(p - 1)), 0.8),   // tri(p-1)**0.8
    night:  Math.min(1, Math.max(0, (p - 1.2) / 0.8)),
  };
  for (const n in bed) bed[n].gain.setTargetAtTime(lv[n]*BEDS[n], t, tc);
}
```

`startBed()` starts each loop at `Math.random() * duration` so the beds never phase-lock;
`boot()` starts the beds nearest the entry point first, then the rest, so the first sound
after the tap is the right one.

**e. One-shots** (`play()`): `playbackRate = rate * (0.94 + rand*0.12)` (never the same
twice), `minGap` per sound (0.12 s default, `air()` 0.45 s so a fast sweep doesn't stack),
pan clamped to ±0.8, taps route to `tapBus`, everything else to `out`.

**f. The letter's paper is procedural** — the only synthesised sound (`paper()`):
band-passed noise rustle whose band sweeps up when you move up/right and down when you move
down/left, plus Poisson-timed micro-crackles (`−ln(1−r)` spacing), count and brightness
scaled by pointer speed, low-pass 5.5 kHz, ≥1.5 ms attacks, panned by direction. If
ORB-Journey has anything readable/paper-like, this is the model for it.

**g. Mute + the sound pill.** Mute is `localStorage['pines-muted']`; the button ramps
`out.gain` and `tapBus.gain` to 0 over 0.32 s on mute, back over 0.05 s on unmute, updates
`aria-pressed` / `aria-label`, and re-kicks the wave canvas. The wave itself:

```js
const W = 22, H = 14, dpr = Math.min(devicePixelRatio||1, 2);
// per frame: amp eases 0..1 over MORPH_MS = 280 with easeInOut; phase += dt*3.2
for (let x = 1; x <= W-1; x += 0.5){
  const env = Math.sin(Math.PI*(x-1)/(W-2));
  const y = H/2 + Math.sin(x*0.62 - phase) * 3 * amp * env;
}
// stroke 1.4, round caps; colour #fafafa over dark, #121315 over light (inverted again inside .ink)
```

The animation stops itself when muted-and-settled or `document.hidden`, and re-kicks on
`visibilitychange` / `navtone`. Button order (Cost of Design): **off plays the off tone,
then mutes; on unmutes, then plays the on tone.**

**h. UI sounds** (`js/ui-sound.js`) are a *second, separate* context on purpose —
`new AudioContext({latencyHint:'interactive', sampleRate:24000})`, `MASTER 0.5`,
`MAX_VOICES 8`, its own limiter (comp −18/12/6) and warm LP 6500 — because UI ticks must
not be delayed by the bed decode. Unlock:

```js
function unlock(){ gesture = true; gestureT = performance.now();
  setTimeout(()=>{gesture=false},0); if(document.hidden) return; build();
  if (ctx && ctx.state !== 'running') ctx.resume()?.catch(()=>{}); }
['pointerdown','pointerup','touchend','click','keydown']
  .forEach(t => document.addEventListener(t, unlock, {capture:true, passive:true}));
const ready = () => !muted && ctx && !document.hidden &&
  (ctx.state === 'running' || gesture || performance.now()-gestureT < 60);
```

Wall-clock gate (`< 60 ms` since the gesture) because `ctx.state` lags one task behind on
iOS. Voices: `tone()` (sine, exponential attack/decay) and `air()` (noise through a
band-pass with a swept centre). Cues and their gates: `tick(45ms)`, `whoosh(250)`,
`grain(40)`, `swell(2000)`, `zip(200)`, `on()` = 660→990 Hz, `off()` = 740→494 Hz. The
footer curtain's `swell()` is fired by an `IntersectionObserver` at `threshold 0.35`.

**i. Preloader integration** — the loading bar counts real work, audio included:

```js
pre.add(PRE_TEX + Sound.count + 1 + 3);       // PRE_TEX 26 textures, Sound.count = 5 beds + 4 shots
const sndP = Sound.preload(pre);              // fetch → arrayBuffer, tick per file
await Promise.all([fontsP, sndP]); pre.done(() => { lenis.start(); });
```

### 1.10 Preloader (worth copying for ORB-Journey's first paint)

Full-screen `#pre` on black, a tiny **raymarched glass capsule with water filling left to
right**, in its own inline WebGL context so it appears before anything else; then
`translate3d(0,-100%,0)` over 1.3 s `cubic-bezier(.65,0,.35,1)`. Two documented bug fixes
in the source that ORB-Journey must not re-learn:

1. **Adreno 506 NaN:** in `mediump`, `normalize(f(p+e)-f(p-e))` with `e≈0.002` has a squared
   length ~2e-5, below the smallest normal half-float (6.1e-5) → flush to 0 → divide by 0 →
   black water / pale glass. Fix: `highp` when available, gradients divided by `2e` before
   `normalize`, **and a 1-pixel self-test** (`readPixels`, water must be blue) that falls
   back to a canvas-2D drawing.
2. The fill uses a damped spring slosh driven by fill *speed*, clamped to ±0.6.

---

## 2. `surface-tension` — tokens, scroll physics, the paint trail, the governor

### 2.1 `src/styles/tokens.css` (the parent of the love-letter tokens)

```css
--c-black:#0a0a0b; --c-ink:#121315; --c-white:#fafafa; --c-paper:#f7f7f8;
--c-silver-1:#d4d6da; --c-silver-2:#a9adb3; --c-silver-3:#5f646b;  /* AA on paper */
--c-graphite:#2a2c30; --c-fg:var(--c-ink); --c-bg:var(--c-paper);
--font:'Inter Variable','Inter',system-ui,…;
--grid-cols:12; --grid-gap:clamp(12px,1.4vw,24px); --pad-x:max(5vw,24px); --pad-y:clamp(18px,2.4vw,34px);
--grid-space:calc((100vw - 2*pad-x - 11*gap)/12);
--u:8px; --s1:8 --s2:16 --s3:24 --s4:40 --s5:64 --s6:104 --s7:168;
--radius:999px;
--ease:cubic-bezier(.19,1,.22,1); --ease-in-out:cubic-bezier(.65,0,.35,1);
--ease-sine:cubic-bezier(.37,0,.63,1);
--dur-in:1s; --dur-out:.6s; --dur-ui:.6s; --dur-fade:.24s;
--vu:1vh;  /* @supports dvh → 1dvh; html.vp-phone → 1svh */
--fs-display:clamp(96px,14vw,240px); --fs-body:clamp(17px,1.25vw,20px); --fs-small:12.5px;
/* breakpoints: 1000px → 8 cols, 812px → 6 cols + pad 20 + display clamp(56,16vw,120) + body 17, 380px → pad 16 */
```

The **8 px baseline + 8/16/24/40/64/104/168 scale** and **three sizes only** (display /
body / 12.5 px label) are the whole type system; love-letter already applies exactly that

### 2.2 Virtual scroll (`src/services/scroll.ts`, 510 lines)

Lusion-derived constants, all worth reusing if ORB-Journey ever needs its own scroller:
`WHEEL_EASE 8` (exponential ease `1-e^{-8 dt}`), `WHEEL_CLAMP 120 px/event`,
`WHEEL_GAIN 0.6`, `DRAG_HISTORY 0.1 s` time-weighted release velocity,
`FRICTION 2.1 → 1.9` (faster flings decelerate less), `KEY_STEP 100`, `MIN_PX 0.1`.
Notable decisions:

- **phones scroll natively** (`(hover:none) and (pointer:coarse)` → `nativeTouch`), passive
  touch listeners only, because a long main-thread task must never freeze the compositor;
  desktop gets the virtual engine; `?vscroll` forces it back on a phone for A/B.
- carrier is the *document's* scroll offset (one write/frame, only when it moved), so
  `position:sticky`, find-in-page and screen readers keep working — Lusion moves a container
  instead, which breaks sticky.
- browser-initiated scroll (scrollbar drag, find-in-page) is adopted exactly; keyboard/AT
  focus jumps are undone and re-eased.
- `DomRange` class gives any element `ratio / screenRatio / progress / isActive` per frame
  with rects measured on resize only (no layout thrash). This is the cleanest scroll-to-DOM
  bridge in any of the repos.
- loop-wrap: instant jump to 0 under a frozen-frame dissolve, with input muted until the
  gesture ends (`muteUntil`, extended 450 ms per inertia event, capped 6 s).

### 2.3 ScreenPaint — the ping-pong cursor trail (`src/gl/systems/ScreenPaint.ts`, 369 lines)

Field: `R,G` = velocity xy biased at 0.5 (rest), `B` = long-tail weight, `A` = short bright
head, in **RGBA8 at ¼ render size**, ping-pong; plus `low`/`lowBlur` at **⅛** for the push
field. Fades per frame: velocity ×0.975, weight1 ×0.95, weight2 ×0.8.

Per frame: `swap → paint (reads prev + last frame's blurred low) → copy curr→low → blur low in place`.

- Paint fragment: capsule distance from `u_drawFrom` to `u_drawTo` (a swept stroke, not
  dots), radius/weight tapered along the stroke, `brush = 1 - smoothstep(-0.01, rw.x, d)`;
  the push is **semi-Lagrangian, one step**, sampling the blurred ⅛ field; a curl term comes
  from gradient noise **with analytic derivative** (`noised()` returns `vec3(value, d/dx, d/dy)`
  using the sine-free hash `fract(vec3(p, p.x)*vec3(.1031,.1030,.0973))`).
- Blur: separable 9-tap, weights `.1633 .1531 .12245 .0918 .051`, tap step `radius*0.25`
  texels, H→scratch then V→source (blur in place).
- **Two documented traps**: (a) `renderer.setClearColor` premultiplies by alpha, so a
  `(0.5,0.5,0,0)` clear lands as `(0,0,0,0)` and the 8-bit field stalls at 128→108, leaving a
  permanent −0.076 velocity and a trail that slides down-left: the file instead runs a tiny
  **fill pass** writing exactly `vec4(0.5,0.5,0,0)`; (b) the trail must live in **viewport
  space** — advecting it by page scroll makes strokes slide with the page (there is a
  `?trailscroll` flag to reproduce the old bug).
- Size is set from CSS viewport × `min(1.5, dpr)` capped at **2560×1440** (phones: 1.0×),
  independent of the render DPR so a DPR change never resets the paint.
- Hi-res display pass: while awake, a **4-tap cubic B-spline** (`w0..w3` weights) reconstructs
  the field into a **2× half-float** target, so the distortion has no 8-bit steps; asleep =
  nothing runs.

If ORB-Journey wants a glow/smoke trail behind the orb's rings, this is the cheapest
credible implementation (2 RGBA8 targets + 1 tiny blur pass), but it is **not needed** for
a calm botanical journey — prefer it only for the GPGPU ring beat.

### 2.4 RippleSim — GPU heightfield (`src/gl/systems/RippleSim.ts`, 178 lines)

`R = height, G = velocity`, ping-pong half-float: `v += (neighbourAvg - h) * k; v *= damping;
h += v; h *= hdecay` with `damping 0.988`, `hdecay 0.998`, and the coupling `k` scaled with
the cell size so world wave speed is identical at any resolution (`k_256 = k_512 / 4`,
`k_128 = k_512 / 16`). Fixed **60 Hz ticks** with at most 3 catch-up ticks per frame;
**idle after 8 s** → clear once, stop ticking, wake clean. Pointer strokes are a swept
capsule with radius/depth from speed (`r = clamp(.006 + speed*.012, .006, .022)`).

This is the reference if ORB-Journey's water beat wants interactive ripples on a plane.

### 2.5 Adaptive quality (`src/gl/quality.ts` 571 lines, `systems/perfGovernor.ts`, `renderScale.ts`)

- **Same objects on every tier; only the cost of drawing moves** (DPR, render-target scale,
  sample counts, and last-resort SMAA→FXAA).
- Ladder (DPR per level, level 0 = full): `high/mid [1.5,1.3,1.15,1.0,0.85,0.72,0.6]`,
  `low [1.3,1.15,1.0,0.85,0.72,0.6]`; BOOST above level 0 `[1.75,2.0]` (`low: [1.5]` only).
- Render-target scale `RT [1,.9,.8,.7,.6,.55,.5]`, loop-count scale `TAPS [1,.85,.75,.62,.5,.45,.4]`.
- Decision: 50-frame window, median + p90 vs a 60 Hz budget; step down on a miss, probe up
  only after 2.5–4 s of calm, back-off doubles to 60 s. Fast path: 3 slow frames of the last
  4 → one rung down; 3 that missed two vsyncs → **two rungs at once** (emergency).
- Optional real GPU timing through `EXT_disjoint_timer_query_webgl2` (`perfGovernor.ts`):
  begin in the earliest frame callback (priority −1000), end after the post chain; only climb
  when predicted GPU ms < 70 % of budget. No timer (iOS Safari) → blind probe.
- `MAX_RENDER_PIXELS = 3.7e6` and `capDpr()` = `clamp(0.6, min(deviceDpr, tierCap, √(MAX/(w·h))))`
  with `tierCap = low ? 1.25 : 1.2`. Tier pick: software GL → no GL page at all;
  reduced-motion → the static page; phone (mobile UA or ≤MOBILE_WIDTH **with coarse pointer**)
  → `low`; weak Intel/AMD APU, ≤4 threads or ≤4 GB → `low`; ≥8 threads → `high`.
- A **7-day `localStorage` "this GPU lost its context" flag** (`st-gpu-weak`) drops a desktop
  to the phone path on the next visit.

### 2.6 CameraRig — parallax without jitter (`src/gl/systems/CameraRig.tsx`)

Critically damped follow `w = 6.2 rad/s` (~0.75 s settle, no overshoot) for position/target;
a separate `Spring3(1.1)` for pointer parallax and `BrownianMotion(0.12, 3)` for idle drift;
phone tilt instead of pointer. Two rules that matter for ORB: **a stage change >30 m away, or
a pose jump >12 m, is a cut, not a spring flight** (reset the springs that frame); and parallax
is faded to zero on the same frame the camera is re-cut, so nothing swings through a transition.

---

## 3. `shade-device-lab` — the measurement ladder for ORB-Journey

Not code to import; a **budget and a profile**. README + `SKILL.md` (192 lines) + `profiles/`.

- It runs the page in a cloud Chromium shaped like a device (viewport, touch, CPU throttle,
  network, GPU limits via a WebGL shim), plays it with scripted input, and scores five areas:
  **Smooth / CPU / GPU work / Memory / Load**. The cloud has no GPU (SwiftShader), so counted
  work is exact and FPS must be *estimated* (`scripts/estimate.mjs`) or *measured* on the device.
- **Phone profile = Shifat's actual phone**: Samsung Galaxy M02s (SM-M025F), Android 10,
  Chrome 155, **Adreno 506**, screen 412×915 @ **dpr 1.75** (emulated viewport 412×800),
  ~**1 GB free RAM**, `maxTextureSize 4096`, `maxMsaaSamples 4`, and these GPU workarounds:
  *program disk cache disabled* (shaders recompile every visit), *timestamp queries disabled*,
  *MSAA not slow*, WebGPU only in OpenGLES compatibility mode.
- **Desktop profile = his laptop**: Intel **UHD Graphics 600**, 2 logical cores, 3 GB RAM,
  `msaaIsSlow: true`, timer queries available.
- Phone targets (per frame, phone budget 25 fps / 40 ms): p95 frame ≤50 ms, p99 ≤67 ms,
  ≤10 % over budget, jitter ≤8 ms, ≤2 hitches/min; CPU busy ≤70 %, longest task ≤100 ms;
  **GPU: draw calls p95 ≤150, triangles p95 ≤250 000, canvas ≤329 600 px, ≤60 programs**;
  memory: JS heap peak ≤200 MB, GPU est ≤200 MB, combined ≤400 MB; load: ≤20 MB transfer,
  ≤150 requests, first draw ≤20 s, smooth ≤30 s.
- Cost model (spec-based prior for the Adreno 506, "×3 either way until calibrated"):
  `5.8 ms per reference megapixel` (~200 FP32 ops + 1 texture), `6 ms per million triangles`,
  `0.06 ms per draw call`, `2 ms per uploaded MB`. `scripts/anchor.mjs` stores one real
  reading to correct the model.

Use it as ORB-Journey's acceptance test: `node scripts/profile.mjs --url <orb> --device phone
--actions …` then `node scripts/estimate.mjs --run results/…`, and hold the orb to
≤150 draw calls / ≤250 k triangles / ≤330 k canvas px on the phone.

---

## 4. `shade-verse` — the water work

### 4.1 Quality knobs (`src/quality.ts`, 48 lines — the plainest tier table in any repo)

```ts
envDpr: HQ ? 0.8 : 0.7,          // non-hero world renders at 0.7–0.8, heroes native
dprCap: HQ ? 2 : coarse ? 1 : LOWQ ? 1 : 2,
maxScale, anisotropy: HQ ? 8 : 4,
grass: HQ ? 9500 : LOWQ ? 3500 : 6500,
foliage: HQ ? 1.9 : LOWQ ? 1 : (coarse||weakGpu) ? 1.2 : 1.65,
lakeCopyScale: HQ ? 0.5 : 0.25, lakeSteps: HQ ? 16 : 7,
AA_MSAA = !coarse && !weakGpu && !LOWQ;   // FXAA elsewhere
```
**"Same scene, cheaper drawing"** again: counts and resolution move, geometry stays.

### 4.2 Ocean shader (`src/water/oceanShader.ts`, 380 lines)

- **Move trig off the pixels.** Documented measurement: *"the sea's per-pixel shading is ~95 %
  of its cost on the phone — the wave gradient / Jacobian / height (13 wave trains of trig)
  now run per vertex (~30 k) and are interpolated, not per pixel (~200 k+)"*. One pass returns
  height + sideways Gerstner push from the same trains.
- **Beer-Lambert with per-channel absorption**: `td = refract(-v, n, 1/1.333);
  path = 9 / max(|td.y|, .12)`; red dies first. The bed is only traced where it is <~15 m down.
- **Snell's window with dispersion**: `refract(-v, n, 1.3310 / 1.3330 / 1.3375)` per channel;
  beyond the critical angle (~48.6°) total internal reflection shows the water, not the sky.
  Two fixes worth keeping: the window rim must use a **partly smoothed normal plus a
  screen-derivative-wide ramp** (`fwidth`), or one pixel of ripple slope makes a stepped,
  arched "dome" (his phone, Nov 18); and outside the window the underside must be **opaque**
  (`aOut 0.6 → 0.93`), or the unrefracted city ghosted through as hard flat shapes.
- Surface detail: sun glitter is Blinn-Phong on the detailed normal with a low-sun "golden
  road" term; foam is suppressed near the camera and driven by real depth, not rings; boat
  wakes use the 19.5° Kelvin angle with a zero-mean normal bend so Fresnel doesn't flip at
  the foam edge.
- **Cauterised list from his notes**: "Hate foams" removed open-sea whitecaps (also 3 texture
  reads fewer per pixel); distant bed >40 m shows nothing, so the trace is skipped.

### 4.3 The air/water split line (`src/water/waterline.ts`, 98 lines) — the brief's beat-3 reference

The line is *the top edge of the water as the lens sees it*, solved per screen column:
`WL_N = 25` columns × a depth ladder `WL_D = 1.2 m` out to `WL_FAR = 250 m`, spacing ×1.38
inside 6 m, ×1.2 beyond; each column keeps the **highest** NDC `y` where the view ray hits
the drawn surface (Gerstner inverse by 3 fixed-point iterations, then the mesh height at that
grid spacing). `WL_EPS = 0.02` sits the line 2 cm above the analytic surface because drawn
triangles cut the curve up to ~2 cm in troughs. A `wlRipple` (3 sines, metres) puts a sub-metre
meniscus on the line; `reach` shrinks to the lens plane as the camera rises 0.35→0.9 m, so the
line slides off the bottom instead of popping. Optimisation kept: half the columns per frame,
the other half re-solve last frame's winning depth — **but any camera move forces a full
re-solve**, because last frame's NDC heights belong to last frame's camera (a pan makes the
spline swim with a two-column period: 0.021 NDC mean error). One GLSL function is shared by the
sea and the post pass so the cut is bit-identical to the tint.

For ORB-Journey's "Air above, water below, one seam" beat, reuse exactly this contract:
one `uWL` uniform (per-column heights + `straddle` flag), one shared GLSL `wlY(ndcX)`, the
sea clipped to `ndc.y <= wlY`, the underwater tint to `ndc.y <= wlY`, 2 cm bias, and the
`fwidth`-widened ramp at the boundary.

### 4.4 Caustics (`src/caustics.ts`, 22 lines)

A **baked tile** `public/caustics.png` (a million refracted rays through a tileable rippled
surface splatted on the floor → the clean cellular network of thin bright lines) animated the
standard cheap way: two copies drifting apart, `min()` keeps lines thin, a tiny per-channel
offset `(0.0035, 0.0021)` gives the rainbow fringe:

```glsl
vec3 causRGB(vec2 xz, float t){
  vec2 a = xz*0.14 + vec2(0.023,0.011)*t;
  vec2 b = mat2(0.81,-0.59,0.59,0.81)*xz*0.17 + vec2(-0.017,0.021)*t;
  float l2 = texture2D(uCaus, b).r; vec2 o = vec2(0.0035, 0.0021);
  return vec3(min(texture2D(uCaus,a+o).r,l2), min(texture2D(uCaus,a).r,l2),
              min(texture2D(uCaus,a-o).r,l2));
}
```
The same tile, read ~4× coarser and blurred, drives the underwater god-ray "focus"
(`uwFocus`). Normals come from `public/waterfft.png` (RG = slopes at t0, BA = 1.9 s later).

### 4.5 Post (`src/shaders/post.ts`, 154 lines)

Order: scene → FXAA (or MSAA) → **ink outline** → underwater tint/rays → bloom. Two reusable
pieces: `FXAA_SHARP_FS` sharpens only where depth is near (<6–28 m) and local contrast is low,
clamped to the local 3×3 min/max so it can't ring; and the underwater pass integrates
**metres**, not screen rows — absorption (`exp(-UW_ABS·d)`), Jerlov blue-green haze, and
god-rays by marching the view ray and asking how much sun reaches each sample through the
moving surface (`uwFocus(s.xz)`, forward-scattering phase, smooth end windows so a hard first
or last sample doesn't print a band).

### 4.6 `water-interaction` branch delta (what NOT to merge into ORB-Journey)

`diff main → water-interaction` touches `WaterFX.tsx`, `gpuSplash.ts`, `islandWater.ts`,
`oceanShader.ts`. Main is **newer** (Nov 19 vs Nov 15) and contains three fixes the branch
lacks: the fwidth-widened Snell rim (kills the stepped "dome"), the opaque outside-window
rule (kills ghosted city through the surface), and the domain-warped FBM waterfall
(`fallsMat` with `veil`), which replaced the old 44-column `floor()` lane field
("a painted ribbon"). Read `main`; the branch is history.

---

## 5. Mapping onto ORB-Journey (what to write, where)

Current scaffold: `src/App.tsx` (182 lines: 5 beats 00–04, icosahedron orb + two torus rings,
framer-motion `useScroll` for beat opacity/lift, a HUD progress bar, `src/gl/webgl2.ts`
enforcing a WebGL2 context, `src/styles.css` 198 lines).

| # | Do this | Source to copy | Lands in |
|---|---|---|---|
| 1 | Design tokens: `--ink:#332b29`, `--cream:#fff8ea`, `--page:#121315`, `--r:36px`, `--wrap-w:1200px`, `--pad-x:clamp(22px,4vw,48px)`, `--s2..--s5`, `--fs-small:12.5px`, house easings + 4 durations | love-letter `index.html` §1.1 + surface-tension `tokens.css` §2.1 | `src/styles/tokens.css` |
| 2 | Header: 48 px mark (−11 px optical), 26 px SVG, 88 px hit area, `on-dark` colour switch .45 s; footer 30 px mark + underline zip | §1.3, §1.6 | `src/dom/Header.tsx`, `Footer.tsx` (DOM, outside the Canvas) |
| 3 | Pinned text slot: fixed `.slot__beat` at `bottom:64px` inside the 1200 px column; mask + `skewX 2.52°` + `scaleY 1/(1+.035|tl|)` reveal, `OUT 0.6 / IN 1.3 / STAGGER 0.09`, scroll-driven exit of the last beat | §1.4, §1.8 | `src/dom/BeatSlot.tsx`, `src/dom/textReveal.ts` |
| 4 | Sheet/curtain: sticky stage, `clip-path: inset(0 round 0 0 36px 36px)`, fixed dark footer, `.foot-space` measured by ResizeObserver, `.scrim` 46vh inside the stage, `.vig` + stepped `.grain` | §1.2, §1.5, §1.6 | `src/styles/shell.css` |
| 5 | **Soundscape** (brief, "must"): copy `audio.js` structure 1:1 — beds cross-faded by `p` (0→4 over five beats), taps on their own bus at 0.14, `MASTER 0.8`, LP 9000 → comp → out, `capture` pointerdown+keydown boot, `decodeAudioData` after the gesture, preload via arrayBuffer during the loader, `visibilitychange` suspend/resume, `localStorage['orb-muted']`, mute ramps .32 s out / .05 s in | §1.9 a–i | `src/audio/soundscape.ts`, `src/audio/engine.ts`, `public/snd/*` |
| 6 | Sound pill: 44×44, 22×14 canvas wave, `amp` morph 280 ms, phase 3.2, `#fafafa`/`#121315` inversion, ink flood + magnet 4 px | §1.9 g, §1.7 | `src/dom/SoundToggle.tsx`, `src/dom/inkButton.ts` |
| 7 | Preloader: capsule + water fill, count real work (`textures + sounds + 4`), slide up 1.3 s, self-test pixel for weak GPUs | §1.10 | `src/dom/Preloader.tsx` |
| 8 | Scene clock: **one** RAF (do not let R3F and framer-motion each drive work); read `p` from one source, `root.position.y = -camY(p)`, `CAM_Y [0,46,80]`, `CAM_TH [0,.2,.2]`, camera `fov 40, near .8, far 130`, pointer spring `w=3` sub-stepped 120 Hz, parallax max `0.32 / 0.16` | §1.8, §2.6 | `src/gl/Stage.tsx`, `src/core/camera.ts`, `src/core/spring.ts` |
| 9 | Tier + DPR: love-letter's `weakGPU` regex + `deviceMemory`, OR surface-tension's `pickTier`/`capDpr` (`MAX_RENDER_PIXELS 3.7e6`, cap 1.2/1.25, floor 0.6); `?q=low|high`, `?debug` overlay | §1.8, §2.5 | `src/core/quality.ts` |
| 10 | Materials: painted cards + **toon 3-step** (`smoothstep(.40,.45,l)*.55 + smoothstep(.66,.71,l)*.45`, warm/cool mix, rim `pow(1-max(dot(n,v),0),3)`), **inverted-hull ink** (`wp += n * uWidth`), grade function (lifted lavender blacks, creamy highlights, soft shoulder) | love-letter `js/shaders.js` (401 lines) | `src/gl/materials/toon.ts`, `ink.ts`, `grade.ts` |
| 11 | Water beat: plane with wave field evaluated **per vertex**, Beer-Lambert bed tint, `uWL` split line per §4.3, baked caustic tile §4.4 | §4.2–4.4 | `src/gl/water/*` |
| 12 | Rings: if the "electron-like GPGPU rings" beat needs a trail/paint, ScreenPaint's 2-target ping-pong (§2.3) — **with the exact-clear fill pass** — otherwise plain instanced orbs (cheap, matches the calm register) | §2.3 | `src/gl/orbRings.ts` |
| 13 | QA: `?debug` overlay + `scripts/visual-qa.mjs` + shade-device-lab budgets (§3) | §1.8, §3 | `scripts/` |

**Non-negotiable house rules** distilled from the comments across all four repos:

1. Colour only on UI over the scene — no shadow, glow or scrim on text or buttons; the text
   scrim belongs to the stage and clamps inside the sheet's corners.
2. Ink is thin, warm-tinted, never pure black, and fades with depth; **no ink on plants or
   grass** (silhouette + 2–3 flat value steps only).
3. One pinch of motion: nothing switches on/off to change scene — things leave by moving.
4. Nothing plays before a gesture; every loop starts at a random offset; every one-shot
   gets a pitch jitter and a `minGap`.
5. Same objects on every tier; move DPR, render-target scale and sample counts, not geometry.
6. `prefers-reduced-motion` is a first-class tier: static page or instant states, grain off,
   no magnet/roll.
7. Every scroll-driven value is read once per frame from a single clock; if two systems
   ease the same value ("Lenis already eases it"), the scene and the page drift apart.
8. Asset urls carry the content hash (`?v=…`) so the cache can be immutable.

---

## 6. Textures already in the repos (ready to reuse, licences checked)

Before painting anything new, these ship inside the repos:

| File | What | Licence / origin |
|---|---|---|
| `love-letter/tex/tallpine.webp`, `longgrass.webp`, `curlgrass*.webp`, `monstera-*.webp`, `clouds1.webp`, `cl-*.webp`, `cloudsea.webp`, `ground.webp`, `logwood.webp`, `roof.webp`, `window.webp`, `stone.webp`, `sky.webp` | the painted scene cards (greens sampled from `tallpine`); `grass-map.json` + `grass-map.png` are the grass placement map | Shifat's own paintings |
| `love-letter/tex/grain.png`, `vig`/`scrim` CSS | the film look | own |
| `shade-verse/public/leaves.png`, `bark.jpg` | leaf atlas + trunk, 512² / small jpg | Poly Haven CC0 (`island_tree_01` leaves, `jacaranda_tree` trunk) |
| `shade-verse/public/pine.png`, `pinebark.jpg` | pine twig + bark | Poly Haven CC0 `pine_tree_01` |
| `shade-verse/public/shrub112.png`, `shrub134.png` | shrub leaf atlas + four leaf-only alpha silhouettes | Poly Haven CC0 `shrub_01` (Rico Cilliers), re-composed |
| `shade-verse/public/spray145.png` | narrow multi-leaf spray, own card arrangement | derived from the CC0 leaf atlas, twigs drawn locally |
| `shade-verse/public/caustics.png` (109 KB), `caustics_v1.png`, `waterfft.png` (144 KB), `waternormal.png`, `moon.png`, `spray145.png` | caustic tile + FFT ocean normal tile + moon | own / baked |

Credits live in `shade-verse/public/CREDITS-trees.txt` and `CREDITS-polyfork.txt`; keep those
files alongside any texture ORB-Journey copies.

## 7. Gaps (what these repos do **not** give us)

- No plant/foliage geometry for the 14 species in ORB-Journey's plan — love-letter paints its
  pines and grass as cards from hand-painted textures; the CC0 atlases above (pine, leaves,
  bark, shrub, spray) are the cheapest base for the rest. See `REFERENCES.md` for the
  botanical specs to model or paint against.
- No kelp, no cumulus volume, no crepuscular shafts as a reusable module (shade-verse has
  `uwRays` underwater and `CLOUD_GLSL` for cloud shadows, not volumetric clouds).
- No GPGPU ring system; shade-verse's `gpuSplash.ts` and surface-tension's `slideFluid.ts` are
  the nearest GPU-driven particles.
- `shade-verse` has its own audio (`src/audio/{engine,director,synth,banter}.ts`) but it is
  game-score shaped (adaptive combat music); love-letter's is the right model for a calm page.
