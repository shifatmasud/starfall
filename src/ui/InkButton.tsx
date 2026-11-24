import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The house button: an ink flood from the pointer, a rolling label, a magnet pull and a spring
 * squash on press — `love-letter/js/ink-button.js` (REUSE_AUDIT §1.7), ported to a React component.
 *
 * The one bug that file exists to solve is kept: on Android a `pointercancel` while the page
 * scrolls reports `clientX/Y` as 0,0, so a naive flood drains toward the top-left corner. Here the
 * drain falls back to the last real touch point (`tp`), and a cancelled touch keeps following the
 * finger until it lifts or leaves the pill.
 *
 * Skipped on purpose: the SVG `feDisplacementMap` ripple (a 512² displacement map is not worth a
 * 44 px toggle; the squash and the flood already answer the tap).
 */

const INK = {
  FLOOD: 0.85,
  DRAIN: 0.65,
  TAP_HOLD: 0.32,
  MAG_MAX: { cta: 8, sound: 4 } as const,
  MAG_PAD: 0.2,
  MAG_PAD_MIN: 24,
  PARALLAX: 1.5,
  MAG_F: 2.6,
  MAG_Z: 0.55,
  SQ_X: 1.04,
  SQ_Y: 0.92,
  SQ_F: 7,
  SQ_Z: 0.8,
  REL_F: 2.4,
  REL_Z: 0.45,
  ROLL: 0.6,
}

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 6; i++) {
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= (sx(t) - x) / d
    }
    t = Math.min(1, Math.max(0, t))
    return sy(t)
  }
}

const EASE_IN = bezier(0.19, 1, 0.22, 1)
const EASE_INOUT = bezier(0.65, 0, 0.35, 1)
const now = () => performance.now() / 1000
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

type Spr = { x: number; v: number; t: number; f: number; z: number }
const spr = (x: number, f: number, z: number): Spr => ({ x, v: 0, t: x, f, z })

function stepSpr(s: Spr, dt: number) {
  const w = 2 * Math.PI * s.f
  const n = Math.max(1, Math.ceil(dt * 240))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    s.v += (-w * w * (s.x - s.t) - 2 * s.z * w * s.v) * h
    s.x += s.v * h
  }
  if (Math.abs(s.x - s.t) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = s.t
    s.v = 0
    return false
  }
  return true
}

type Ink = {
  el: HTMLButtonElement
  kind: 'cta' | 'sound'
  inkEl: HTMLElement
  rollA: HTMLElement[]
  rollB: HTMLElement[]
  w: number
  h: number
  rr: number
  fl: { x: number; y: number; r: number }
  anim: { a: { x: number; y: number; r: number }; b: { x: number; y: number; r: number }; t0: number; d: number; e: (k: number) => number } | null
  on: boolean
  mx: Spr
  my: Spr
  sx: Spr
  sy: Spr
  roll: number
  rollFrom: number
  rollTo: number
  rollT0: number
  downPt: { x: number; y: number } | null
  pressT0: number
  drainAt: number
  drainPt: { x: number; y: number } | null
  pid: number
  tp: { x: number; y: number } | null
  finger: boolean
  waitLift: boolean
}

const buttons = new Set<Ink>()
let raf = 0
let last = 0
let magnetOn = false

function measure(b: Ink) {
  b.w = b.el.offsetWidth
  b.h = b.el.offsetHeight
  b.rr = Math.min(parseFloat(getComputedStyle(b.el).borderTopLeftRadius) || 0, b.w / 2, b.h / 2)
}

const farR = (b: Ink, x: number, y: number) => Math.hypot(Math.max(x, b.w - x), Math.max(y, b.h - y)) + 1
const cover = (b: Ink, x: number, y: number) => {
  const r = b.rr || 0
  let m = 0
  for (const cx of [r, b.w - r]) for (const cy of [r, b.h - r]) m = Math.max(m, Math.hypot(x - cx, y - cy))
  return m + r + 1
}
function local(b: Ink, clientX: number, clientY: number) {
  const rect = b.el.getBoundingClientRect()
  return {
    x: Math.min(b.w, Math.max(0, clientX - rect.left)),
    y: Math.min(b.h, Math.max(0, clientY - rect.top)),
  }
}

function flood(b: Ink, p: { x: number; y: number }) {
  measure(b)
  b.on = true
  b.drainAt = 0
  const to = { x: p.x, y: p.y, r: farR(b, p.x, p.y) }
  if (reduced) {
    b.fl = to
    b.anim = null
    kick()
    return
  }
  const from = b.fl.r > 0.5 ? { ...b.fl } : { x: p.x, y: p.y, r: 0 }
  b.anim = { a: from, b: to, t0: now(), d: INK.FLOOD, e: EASE_IN }
  kick()
}

function drain(b: Ink, p: { x: number; y: number }) {
  b.on = false
  b.drainAt = 0
  measure(b)
  if (reduced) {
    b.fl = { x: p.x, y: p.y, r: 0 }
    b.anim = null
    kick()
    return
  }
  let from = { ...b.fl }
  // if the ink covers the pill, re-centre it on the exit point at the same coverage first,
  // so the drain never jumps
  if (from.r > 0.25 && from.r >= cover(b, from.x, from.y) - 1) from = { x: p.x, y: p.y, r: cover(b, p.x, p.y) }
  b.anim = { a: from, b: { x: p.x, y: p.y, r: 0 }, t0: now(), d: INK.DRAIN, e: EASE_INOUT }
  kick()
}

function roll(b: Ink) {
  if (reduced) return
  if (b.roll < b.rollTo - 0.02) return
  b.rollFrom = b.roll
  b.rollTo = Math.floor(b.roll + 0.02) + 1
  b.rollT0 = now()
  kick()
}

function press(b: Ink) {
  if (reduced) return
  b.sx.f = b.sy.f = INK.SQ_F
  b.sx.z = b.sy.z = INK.SQ_Z
  b.sx.t = INK.SQ_X
  b.sy.t = INK.SQ_Y
  kick()
}

function release(b: Ink) {
  b.sx.f = b.sy.f = INK.REL_F
  b.sx.z = b.sy.z = INK.REL_Z
  b.sx.t = 1
  b.sy.t = 1
  kick()
}

function frame() {
  raf = 0
  const t = now()
  const dt = Math.min(1 / 20, Math.max(0, t - last))
  last = t
  let live = false

  for (const b of buttons) {
    if (b.drainAt && t >= b.drainAt && b.drainPt) {
      const p = b.drainPt
      b.drainPt = null
      drain(b, p)
    }
    if (b.drainAt) live = true

    if (b.anim) {
      const k = Math.min(1, (t - b.anim.t0) / b.anim.d)
      const e = b.anim.e(k)
      const { a, b: to } = b.anim
      b.fl = { x: a.x + (to.x - a.x) * e, y: a.y + (to.y - a.y) * e, r: a.r + (to.r - a.r) * e }
      if (k >= 1) b.anim = null
      else live = true
    }

    if (b.fl.r <= 0.25) {
      b.inkEl.style.visibility = 'hidden'
      b.inkEl.style.clipPath = 'circle(0px at 0px 0px)'
    } else {
      b.inkEl.style.visibility = 'visible'
      b.inkEl.style.clipPath = `circle(${b.fl.r.toFixed(2)}px at ${b.fl.x.toFixed(2)}px ${b.fl.y.toFixed(2)}px)`
    }

    for (const s of [b.mx, b.my, b.sx, b.sy]) if (stepSpr(s, dt)) live = true
    const tx = b.mx.x || b.my.x ? `${b.mx.x.toFixed(2)}px ${b.my.x.toFixed(2)}px` : ''
    const sc = b.sx.x !== 1 || b.sy.x !== 1 ? `scale(${b.sx.x.toFixed(4)}, ${b.sy.x.toFixed(4)})` : ''
    b.el.style.transform = [tx && `translate(${tx})`, sc].filter(Boolean).join(' ')

    if (b.roll !== b.rollTo) {
      const k = Math.min(1, (t - b.rollT0) / INK.ROLL)
      b.roll = k >= 1 ? b.rollTo : b.rollFrom + (b.rollTo - b.rollFrom) * EASE_IN(k)
      if (k < 1) live = true
    }
    const fr = b.roll - Math.floor(b.roll)
    for (const el of b.rollA) el.style.transform = fr ? `translate3d(0, ${(-fr * 100).toFixed(3)}%, 0)` : ''
    for (const el of b.rollB) el.style.transform = `translate3d(0, ${((1 - fr) * 100).toFixed(3)}%, 0)`
  }

  if (live) raf = requestAnimationFrame(frame)
}

function kick() {
  if (!raf) {
    last = now()
    raf = requestAnimationFrame(frame)
  }
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  for (const b of buttons) {
    const rect = b.el.getBoundingClientRect()
    const cx = (rect.left + rect.right) / 2
    const cy = (rect.top + rect.bottom) / 2
    const w = b.w || rect.width
    const h = b.h || rect.height
    const pad = Math.max(INK.MAG_PAD * w, INK.MAG_PAD_MIN)
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const ox = Math.max(0, Math.abs(dx) - w / 2)
    const oy = Math.max(0, Math.abs(dy) - h / 2)
    const out = Math.hypot(ox, oy) / pad
    let tx = 0
    let ty = 0
    if (out < 1) {
      const s = 1 - out * out * (3 - 2 * out)
      const max = INK.MAG_MAX[b.kind]
      tx = Math.max(-1, Math.min(1, dx / (w / 2 + pad))) * max * s
      ty = Math.max(-1, Math.min(1, dy / (h / 2 + pad))) * max * s
    }
    if (tx !== b.mx.t || ty !== b.my.t) {
      b.mx.t = tx
      b.my.t = ty
      kick()
    }
  }
}

function bindInk(el: HTMLButtonElement, kind: 'cta' | 'sound'): () => void {
  const inkEl = el.querySelector<HTMLElement>(':scope > .ink')
  if (!inkEl) return () => undefined
  const b: Ink = {
    el,
    kind,
    inkEl,
    rollA: Array.from(el.querySelectorAll<HTMLElement>('.ir-a')),
    rollB: Array.from(el.querySelectorAll<HTMLElement>('.ir-b')),
    w: 0,
    h: 0,
    rr: 0,
    fl: { x: 0, y: 0, r: 0 },
    anim: null,
    on: false,
    mx: spr(0, INK.MAG_F, INK.MAG_Z),
    my: spr(0, INK.MAG_F, INK.MAG_Z),
    sx: spr(1, INK.SQ_F, INK.SQ_Z),
    sy: spr(1, INK.SQ_F, INK.SQ_Z),
    roll: 0,
    rollFrom: 0,
    rollTo: 0,
    rollT0: 0,
    downPt: null,
    pressT0: 0,
    drainAt: 0,
    drainPt: null,
    pid: -1,
    tp: null,
    finger: false,
    waitLift: false,
  }
  buttons.add(b)
  measure(b)
  kick()

  const inside = (rect: DOMRect, x: number, y: number) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

  const exitDrain = (x: number, y: number) => {
    const rect = b.el.getBoundingClientRect()
    const q = b.tp
    let ex = x
    let ey = y
    if (q && inside(rect, q.x, q.y)) {
      let lo = 0
      let hi = 1
      for (let i = 0; i < 14; i++) {
        const t = (lo + hi) / 2
        if (inside(rect, q.x + (x - q.x) * t, q.y + (y - q.y) * t)) lo = t
        else hi = t
      }
      ex = q.x + (x - q.x) * hi
      ey = q.y + (y - q.y) * hi
    }
    b.drainAt = 0
    b.drainPt = null
    b.waitLift = false
    drain(b, local(b, ex, ey))
  }

  const track = (x: number, y: number) => {
    if (b.pid < 0) return
    if (b.on && !inside(b.el.getBoundingClientRect(), x, y)) exitDrain(x, y)
    b.tp = { x, y }
  }

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      flood(b, local(b, e.clientX, e.clientY))
      roll(b)
    }
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      drain(b, local(b, e.clientX, e.clientY))
      release(b)
    }
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const p = local(b, e.clientX, e.clientY)
    b.pressT0 = now()
    b.downPt = p
    if (e.pointerType !== 'mouse') {
      b.pid = e.pointerId
      b.tp = { x: e.clientX, y: e.clientY }
      b.finger = e.pointerType === 'touch'
      b.waitLift = false
      flood(b, p)
    }
    press(b)
  }
  const onUp = (e: PointerEvent) => {
    if (!b.downPt) return
    b.downPt = null
    release(b)
    if (e.pointerType !== 'mouse') {
      const cancel = e.type === 'pointercancel'
      // Android hands a scrolling touch to the compositor and reports 0,0: keep the last real point
      if (cancel && b.finger && 'ontouchstart' in window) {
        b.waitLift = true
        return
      }
      b.pid = -1
      if (!b.on) return
      const p = cancel ? (b.tp ? local(b, b.tp.x, b.tp.y) : { x: b.w / 2, y: b.h / 2 }) : local(b, e.clientX, e.clientY)
      const at = b.pressT0 + INK.TAP_HOLD
      if (cancel || now() >= at) drain(b, p)
      else {
        b.drainAt = at
        b.drainPt = p
        kick()
      }
    }
  }
  const onMoveBtn = (e: PointerEvent) => {
    if (e.pointerId === b.pid && e.pointerType !== 'mouse') track(e.clientX, e.clientY)
  }
  const onTouchMove = (e: TouchEvent) => {
    if (b.finger && e.touches.length) track(e.touches[0].clientX, e.touches[0].clientY)
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (!b.finger || e.touches.length) return
    b.finger = false
    if (b.waitLift) {
      b.waitLift = false
      b.pid = -1
      if (b.on && b.tp) drain(b, local(b, b.tp.x, b.tp.y))
    }
  }
  const onFocus = () => {
    if (el.matches(':focus-visible')) {
      measure(b)
      flood(b, { x: b.w / 2, y: b.h / 2 })
    }
  }
  const onBlur = () => {
    if (b.on) {
      measure(b)
      drain(b, { x: b.w / 2, y: b.h / 2 })
    }
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) {
      measure(b)
      b.downPt = { x: b.w / 2, y: b.h / 2 }
      press(b)
    }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && b.downPt) {
      b.downPt = null
      release(b)
      roll(b)
    }
  }

  el.addEventListener('pointerenter', onEnter)
  el.addEventListener('pointerleave', onLeave)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('focus', onFocus)
  el.addEventListener('blur', onBlur)
  el.addEventListener('keydown', onKeyDown)
  el.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  window.addEventListener('pointermove', onMoveBtn, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onTouchEnd, { passive: true })
  if (!magnetOn && !reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    magnetOn = true
    window.addEventListener('pointermove', onMove, { passive: true })
  }

  return () => {
    el.removeEventListener('pointerenter', onEnter)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('focus', onFocus)
    el.removeEventListener('blur', onBlur)
    el.removeEventListener('keydown', onKeyDown)
    el.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointermove', onMoveBtn)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchEnd)
    buttons.delete(b)
    if (magnetOn && buttons.size === 0) {
      magnetOn = false
      window.removeEventListener('pointermove', onMove)
    }
  }
}

export type InkButtonProps = {
  kind?: 'cta' | 'sound'
  label: string
  pressed?: boolean
  className?: string
  onClick?: () => void
  children: ReactNode
}

export function InkButton({ kind = 'cta', label, pressed, className = '', onClick, children }: InkButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (ref.current) return bindInk(ref.current, kind)
    return undefined
  }, [kind])
  return (
    <button
      ref={ref}
      type="button"
      className={`pill ${kind === 'sound' ? 'pill--sound' : ''} ${className}`.trim()}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={{ transitionDuration: 'var(--dur-ui)' }}
    >
      {children}
      <span className="ink" aria-hidden="true">
        {children}
      </span>
    </button>
  )
}
