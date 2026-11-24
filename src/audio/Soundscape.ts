/**
 * Procedural WebAudio soundscape for ORB-Journey.
 *
 * Architecture is copied 1:1 from `love-letter/js/audio.js` (REUSE_AUDIT §1.9) — the model that
 * already works on Shifat's phone — while every sound here is *synthesised* instead of streamed,
 * because ORB-Journey ships no audio files:
 *
 *   · nothing plays before a real gesture (`pointerdown` + `keydown`, both `capture: true`);
 *   · five ambient beds, cross-faded by one scroll value with `setTargetAtTime(…, 1.1)`;
 *   · beds sit on their own steep low-pass bus (no hiss), taps/ripples on a limiter bus at TAP;
 *   · one persisted mute switch (`localStorage['orb-muted']`), ramped 0.32 s out / 0.05 s in;
 *   · `visibilitychange` parks the graph (iOS/Android) instead of leaving it running;
 *   · every started loop gets a random offset so the beds never phase-lock.
 *
 * Beds, in journey order: meadow wind + leaf rustle, forest breeze + far chimes, soft rain,
 * lakeside lapping water, deep warm underwater drone.
 */

const MUTE_KEY = 'orb-muted'
const MASTER = 0.8
const TAP = 0.14

/** bed levels (love-letter's BEDS were .11/.04/.03/.11/.08; procedural noise reads hotter) */
const BEDS = { meadow: 0.075, forest: 0.07, rain: 0.055, lake: 0.07, deep: 0.095 } as const
type BedName = keyof typeof BEDS

const BED_NAMES = Object.keys(BEDS) as BedName[]

let ctx: AudioContext | null = null
let out: GainNode | null = null
let bedBus: BiquadFilterNode | null = null
let tapBus: GainNode | null = null
let noise: AudioBuffer | null = null
let muted = readMuted()
let started = false
let lastP = 0
let scheduler: ReturnType<typeof setInterval> | null = null
let lastRipple = -1

const gains: Partial<Record<BedName, GainNode>> = {}
const levels: Record<BedName, number> = { meadow: 1, forest: 0, rain: 0, lake: 0, deep: 0 }

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function writeMuted(m: boolean) {
  try {
    if (m) localStorage.setItem(MUTE_KEY, '1')
    else localStorage.removeItem(MUTE_KEY)
  } catch {
    /* private mode */
  }
}

/** Slightly softened white noise — the raw material for every bed. */
function noiseBuffer(): AudioBuffer | null {
  if (!ctx) return null
  if (noise) return noise
  const seconds = 3
  const frames = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let brown = 0
  for (let i = 0; i < frames; i++) {
    const white = Math.random() * 2 - 1
    brown = 0.985 * brown + 0.015 * white
    data[i] = white * 0.62 + brown * 0.9
  }
  noise = buffer
  return buffer
}

/** A slow sine laid onto an AudioParam: the wind's gusts, the lapping, the drone's breath. */
function modulate(param: AudioParam, hz: number, depth: number) {
  if (!ctx) return
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = hz
  const amount = ctx.createGain()
  amount.gain.value = depth
  lfo.connect(amount)
  amount.connect(param)
  lfo.start()
}

function noiseSource(offset = true): AudioBufferSourceNode | null {
  const buffer = noiseBuffer()
  if (!ctx || !buffer) return null
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.start(0, offset ? Math.random() * buffer.duration : 0)
  return src
}

function filters(chain: { type: BiquadFilterType; freq: number; q?: number }[]): BiquadFilterNode[] {
  if (!ctx) return []
  return chain.map((spec) => {
    const f = ctx!.createBiquadFilter()
    f.type = spec.type
    f.frequency.value = spec.freq
    if (spec.q !== undefined) f.Q.value = spec.q
    return f
  })
}

function link(nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
}

/** A bed: 1–2 noise source copies through their own filters into one scroll-controlled gain. */
function bedLayer(
  name: BedName,
  spec: {
    filters: { type: BiquadFilterType; freq: number; q?: number }[]
    level: number
    lfos?: { hz: number; depth: number }[]
    highpass?: { freq: number; level: number; lfos?: { hz: number; depth: number }[] }
  },
) {
  if (!ctx || !bedBus) return
  const gain = ctx.createGain()
  gain.gain.value = BEDS[name]
  gain.connect(bedBus)
  gains[name] = gain

  const src = noiseSource()
  if (!src) return
  const chain = filters(spec.filters)
  const amount = ctx.createGain()
  amount.gain.value = spec.level
  link([src, ...chain, amount, gain])
  for (const l of spec.lfos ?? []) modulate(amount.gain, l.hz, l.depth)

  if (spec.highpass) {
    const src2 = noiseSource()
    if (!src2) return
    const [hp] = filters([{ type: 'highpass', freq: spec.highpass.freq }])
    const amount2 = ctx.createGain()
    amount2.gain.value = spec.highpass.level
    link([src2, hp, amount2, gain])
    for (const l of spec.highpass.lfos ?? []) modulate(amount2.gain, l.hz, l.depth)
  }
}

function buildBeds() {
  if (!ctx || !bedBus) return
  // 1 · the meadow: soft wind through tall grass, and a fine leaf rustle under it
  bedLayer('meadow', {
    filters: [{ type: 'bandpass', freq: 520, q: 0.55 }],
    level: 0.55,
    lfos: [{ hz: 0.06, depth: 0.22 }],
    highpass: { freq: 2600, level: 0.16, lfos: [{ hz: 0.23, depth: 0.06 }] },
  })
  // 2 · the forest: the breeze drops in pitch inside the trees, and leaves shimmer overhead
  bedLayer('forest', {
    filters: [{ type: 'lowpass', freq: 420, q: 0.7 }],
    level: 0.5,
    lfos: [{ hz: 0.09, depth: 0.18 }],
    highpass: { freq: 3400, level: 0.045, lfos: [{ hz: 0.17, depth: 0.03 }] },
  })
  // 3 · rain: a high, even patter with a slow swell of intensity
  bedLayer('rain', {
    filters: [
      { type: 'highpass', freq: 1200 },
      { type: 'lowpass', freq: 7200, q: 0.4 },
    ],
    level: 0.42,
    lfos: [
      { hz: 1.9, depth: 0.05 },
      { hz: 0.11, depth: 0.1 },
    ],
  })
  // 4 · the lake: two swells of low water at different speeds, so it never pulses in time
  bedLayer('lake', {
    filters: [{ type: 'lowpass', freq: 720, q: 0.9 }],
    level: 0.45,
    lfos: [{ hz: 0.16, depth: 0.26 }],
    highpass: { freq: 240, level: 0.3, lfos: [{ hz: 0.07, depth: 0.16 }] },
  })
  // 5 · the dive: a warm drone under the surface — two pure tones a fifth apart, and low rumble
  const deep = ctx.createGain()
  deep.gain.value = BEDS.deep
  deep.connect(bedBus)
  gains.deep = deep
  for (const [hz, level] of [
    [55, 0.5],
    [82.4, 0.28],
    [110.3, 0.12],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    const g = ctx.createGain()
    g.gain.value = level
    osc.connect(g)
    g.connect(deep)
    osc.start()
  }
  const rumbleSrc = noiseSource()
  if (rumbleSrc) {
    const [lp] = filters([{ type: 'lowpass', freq: 220, q: 0.6 }])
    const g = ctx.createGain()
    g.gain.value = 0.22
    link([rumbleSrc, lp, g, deep])
  }
  modulate(deep.gain, 0.05, 0.012)
}

/** One virtual voice: attack, then an exponential tail. Everything routed to the tap limiter. */
function ping(t: number, opts: { hz: number; gain: number; decay: number; pan: number; type?: OscillatorType }) {
  if (!ctx || !tapBus) return
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.value = opts.hz
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(opts.gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay)
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.max(-0.9, Math.min(0.9, opts.pan))
  link([osc, g, panner, tapBus])
  osc.start(t)
  osc.stop(t + opts.decay + 0.05)
}

/** A distant chime in the trees — never twice the same pitch. */
function chime(t: number) {
  const base = 880 * (0.82 + Math.random() * 0.55)
  const pan = Math.random() * 1.4 - 0.7
  const gain = 0.05
  ping(t, { hz: base, gain, decay: 2.4, pan })
  ping(t + 0.004, { hz: base * 2.76, gain: gain * 0.34, decay: 1.6, pan })
  ping(t + 0.008, { hz: base * 4.07, gain: gain * 0.16, decay: 1.1, pan })
}

/** A single fat raindrop on a leaf. */
function droplet(t: number) {
  ping(t, { hz: 1300 + Math.random() * 1600, gain: 0.018, decay: 0.09 + Math.random() * 0.05, pan: Math.random() * 1.8 - 0.9 })
}

function startScheduler() {
  if (scheduler) return
  scheduler = setInterval(() => {
    if (!ctx || muted || document.hidden || ctx.state !== 'running') return
    const t = ctx.currentTime + 0.12
    if (levels.forest > 0.03 && Math.random() < 0.16) chime(t)
    if (levels.rain > 0.03 && Math.random() < 0.55) droplet(t)
  }, 420)
}

function applyLevels(timeConstant: number) {
  if (!ctx) return
  const t = ctx.currentTime
  for (const name of BED_NAMES) {
    const gain = gains[name]
    if (!gain) continue
    gain.gain.setTargetAtTime(levels[name] * BEDS[name], t, timeConstant)
  }
}

function boot() {
  if (started) return
  started = true
  const Ctor = window.AudioContext
  if (!Ctor) return
  ctx = new Ctor({ latencyHint: 'playback' })

  out = ctx.createGain()
  out.gain.value = muted ? 0 : MASTER
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -20
  compressor.knee.value = 18
  compressor.ratio.value = 2.5
  compressor.attack.value = 0.02
  compressor.release.value = 0.3
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 9000
  link([out, lp, compressor, ctx.destination])

  // ambience: one more steep low-pass so no bed ever hisses or rings
  const bus = ctx.createBiquadFilter()
  bus.type = 'lowpass'
  bus.frequency.value = 2500
  bus.Q.value = 0.5
  const bus2 = ctx.createBiquadFilter()
  bus2.type = 'lowpass'
  bus2.frequency.value = 2500
  bus2.Q.value = 0.5
  link([bus, bus2, out])
  bedBus = bus

  // taps: past the master glue, behind a brick-wall limiter so overlaps never clip
  tapBus = ctx.createGain()
  tapBus.gain.value = muted ? 0 : TAP
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1.5
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.1
  link([tapBus, limiter, ctx.destination])

  buildBeds()
  applyLevels(0.05)
  startScheduler()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
}

/** One scroll value: 0 → 4 across the five beats. Slow constant, so beds never jump. */
function mix(p: number, timeConstant = 1.1) {
  lastP = p
  const tri = (x: number) => Math.max(0, 1 - Math.abs(x))
  levels.meadow = p <= 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) * 0.95)
  levels.forest = Math.pow(tri(p - 1.6), 0.9)
  levels.rain = Math.pow(tri(p - 2.4), 0.9)
  levels.lake = Math.pow(tri(p - 3.15), 0.9)
  levels.deep = Math.min(1, Math.max(0, (p - 3.4) / 0.6))
  if (ctx) applyLevels(timeConstant)
}

/** The crystalline answer of water when the pointer moves across the seam. */
function ripple(pan = 0, strength = 1) {
  if (!ctx || muted || ctx.state !== 'running') return
  const now = ctx.currentTime
  if (now - lastRipple < 0.09) return
  lastRipple = now
  const base = 1500 * (0.9 + Math.random() * 0.4)
  const gain = 0.05 * Math.min(1, Math.max(0.2, strength))
  ping(now, { hz: base, gain, decay: 1.5, pan })
  ping(now + 0.006, { hz: base * 2.41, gain: gain * 0.42, decay: 0.95, pan: -pan * 0.6 })
  ping(now + 0.012, { hz: base * 3.86, gain: gain * 0.18, decay: 0.7, pan })
}

function setMuted(m: boolean) {
  muted = m
  writeMuted(m)
  if (!ctx || !out || !tapBus) return
  const t = ctx.currentTime
  const ramp = (param: AudioParam, target: number) => {
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.linearRampToValueAtTime(target, t + (m ? 0.32 : 0.05))
  }
  ramp(out.gain, m ? 0 : MASTER)
  ramp(tapBus.gain, m ? 0 : TAP)
  if (!m && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
}

// first gesture anywhere starts the sound — `capture` survives stopPropagation in the canvas,
// and `keydown` covers keyboard-only visitors (love-letter §1.9b)
const firstGesture = () => {
  boot()
  removeEventListener('pointerdown', firstGesture, true)
  removeEventListener('keydown', firstGesture, true)
}
addEventListener('pointerdown', firstGesture, true)
addEventListener('keydown', firstGesture, true)

document.addEventListener('visibilitychange', () => {
  if (!ctx) return
  if (document.hidden) void ctx.suspend().catch(() => undefined)
  else if (!muted) void ctx.resume().catch(() => undefined)
})

export const Soundscape = {
  mix,
  ripple,
  setMuted,
  isMuted: () => muted,
  boot,
  /** Nothing is streamed, but the preloader still counts the beds. */
  preload: () => Promise.resolve(),
  count: BED_NAMES.length,
  get level() {
    return { ...levels }
  },
  get current() {
    return lastP
  },
}
