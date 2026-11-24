import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMotionValueEvent, useScroll } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Soundscape } from './audio/Soundscape'
import { createWebGL2Context, describeRenderer, type RendererInfo } from './gl/webgl2'
import { PostFX, trailRef } from './gl/PostFX'
import { CameraRig } from './scene/atmosphere/CameraRig'
import { OrbSlot, WaterSlot, WorldSlot } from './scene/atmosphere/StageSlots'
import { SkyCloudsGodrays } from './scene/atmosphere/SkyCloudsGodrays'
import { WeatherSystem } from './scene/atmosphere/WeatherSystem'
import { atmosphere, journey, sampleAtmosphere } from './scene/atmosphere/atmosphereState'
import { capDpr, TIER } from './scene/atmosphere/quality'
import { BeatOverlay, type BeatCopy } from './ui/BeatOverlay'
import { Footer } from './ui/Footer'
import { Header } from './ui/Header'
import { Preloader } from './ui/Preloader'

declare global {
  interface Window {
    /** Set once the loader has slid away and the first frame is on screen. */
    __ORB_READY__?: boolean
    /** WebGL2 implementation details, read by visual QA. */
    __ORB_GL__?: RendererInfo
    /** Frames actually drawn — the screenshot harness waits on this, not on a timer. */
    __ORB_FRAME__?: number
  }
}

/**
 * `?qa=1` keeps the drawing buffer after compositing. Only the screenshot harness
 * asks for it: on a CPU rasterizer a frame can take longer than the compositor's
 * hold, and a capture then lands on an already-cleared buffer (a black frame that
 * looks like a scene failure). Real visitors keep the cheaper default.
 */
const QA_BUFFER = new URLSearchParams(window.location.search).has('qa')

/**
 * The eight chapters. Copy follows love-letter's register: an eyebrow `NN — The place`, a title of
 * four words or fewer, and one or two quiet sentences.
 */
const BEATS: BeatCopy[] = [
  {
    id: 'space',
    eyebrow: '01 — Above the sky',
    title: ['A small', 'star'],
    body: ['High above the weather, among the others.', 'It leans out of the dark.'],
  },
  {
    id: 'sky',
    eyebrow: '02 — The clouds',
    title: ['Down through', 'the gold'],
    body: ['The air turns warm as it enters.', 'Clouds open around it.'],
  },
  {
    id: 'forest',
    eyebrow: '03 — The forest',
    title: ['Into the', 'canopy'],
    body: ['Light comes down in columns.', 'The leaves pass it along.'],
  },
  {
    id: 'lake',
    eyebrow: '04 — The lake',
    title: ['A lake in', 'the meadow'],
    body: ['Flowers turn their faces up.', 'The water holds the whole sky.'],
  },
  {
    id: 'desert',
    eyebrow: '05 — The desert',
    title: ['A green', 'thought'],
    body: ['Sand leans away from the water.', 'Palms keep their own shade.'],
  },
  {
    id: 'ice',
    eyebrow: '06 — The ice',
    title: ['Cold', 'still water'],
    body: ['Moss on black stone.', 'The mountain keeps its winter.'],
  },
  {
    id: 'sea',
    eyebrow: '07 — The sea',
    title: ['Out to', 'the blue'],
    body: ['Palms lean over the sand.', 'Ice keeps its own weather.'],
  },
  {
    id: 'deep',
    eyebrow: '08 — The deep',
    title: ['At rest', 'at last'],
    body: ['Kelp, cold blue, a sunken quiet.', 'It stays, and the dark turns gold.'],
  },
]

/** Reports WebGL2 and the first drawn frame; `__ORB_READY__` waits for the loader to leave. */
function ReadyProbe({ onFirstFrame }: { onFirstFrame: () => void }) {
  const gl = useThree((state) => state.gl)
  const reported = useRef(false)
  useFrame(() => {
    if (reported.current) return
    reported.current = true
    const info = describeRenderer(gl)
    window.__ORB_GL__ = info
    document.documentElement.dataset.webgl = info.webgl2 ? '2' : '1'
    document.documentElement.dataset.orbTier = TIER
    onFirstFrame()
  })
  return null
}

/** Keeps the nav's colour honest: cream over the dark dives, ink over the light sky. */
function ToneProbe({ onChange }: { onChange: (onDark: boolean) => void }) {
  const last = useRef(true)
  useFrame(() => {
    sampleAtmosphere(journey.u)
    window.__ORB_FRAME__ = (window.__ORB_FRAME__ ?? 0) + 1
    const dark = atmosphere.tone > 0.5
    document.documentElement.dataset.orbU = journey.u.toFixed(2)
    document.documentElement.dataset.orbTone = dark ? 'dark' : 'light'
    if (dark !== last.current) {
      last.current = dark
      onChange(dark)
    }
  })
  return null
}

export default function App() {
  const { scrollYProgress } = useScroll()
  const [muted, setMuted] = useState(() => Soundscape.isMuted())
  const [onDark, setOnDark] = useState(true)
  const [fonts, setFonts] = useState(false)
  const [framed, setFramed] = useState(false)
  const [grace, setGrace] = useState(false)
  const [forced, setForced] = useState(false)
  const footSpace = useRef<HTMLDivElement>(null)

  const done = (framed && (fonts || grace)) || forced

  // the soundscape follows the same scroll value as the camera, with the reference's slow constant
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    Soundscape.mix(Math.min(7, Math.max(0, value * 7)))
  })

  useEffect(() => {
    document.documentElement.classList.add('pre-lock')
    Soundscape.mix(0)
    const graceTimer = window.setTimeout(() => setGrace(true), 900)
    const hardStop = window.setTimeout(() => setForced(true), 7000)
    document.fonts?.ready.then(() => setFonts(true)).catch(() => setFonts(true))
    return () => {
      window.clearTimeout(graceTimer)
      window.clearTimeout(hardStop)
    }
  }, [])

  // the footer curtain opens by exactly the footer's own height
  useEffect(() => {
    const footer = document.querySelector('footer')
    const space = footSpace.current
    if (!footer || !space) return
    const update = () => {
      space.style.height = `${footer.offsetHeight}px`
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  // The cursor trail's brush. Pointer events cover mouse and pen; the finger is read from touch
  // events as well, because a pointer stream stops the moment the page starts a native scroll.
  useEffect(() => {
    const feed = (x: number, y: number) => trailRef.current?.pointer(x, y)
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      feed(event.clientX, event.clientY)
    }
    const onTouch = (event: TouchEvent) => {
      const touch = event.changedTouches[0] || event.touches[0]
      if (touch) feed(touch.clientX, touch.clientY)
    }
    const leave = () => trailRef.current?.release()
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('pointerleave', leave)
    }
  }, [])

  const onFirstFrame = useCallback(() => setFramed(true), [])

  const onLoaderReveal = useCallback(() => {
    document.documentElement.classList.remove('pre-lock')
  }, [])

  const onLoaderGone = useCallback(() => {
    document.documentElement.dataset.orbReady = 'true'
    window.__ORB_READY__ = true
  }, [])

  const toggleSound = useCallback(() => {
    Soundscape.boot()
    const next = !Soundscape.isMuted()
    Soundscape.setMuted(next)
    setMuted(next)
  }, [])

  const onStageMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // the water answers the pointer: a quiet crystalline ring, panned where the hand is
    if (journey.u < 3.4) return
    const pan = (event.clientX / window.innerWidth - 0.5) * 1.6
    Soundscape.ripple(pan, 0.55)
  }, [])

  const onStageWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (journey.u < 3.4) return
    Soundscape.ripple((Math.random() * 2 - 1) * 0.7, 0.35 + Math.min(0.6, Math.abs(event.deltaY) / 900))
  }, [])

  const dpr = capDpr()
  const bloom = useMemo(() => (TIER === 'low' ? 0.34 : 0.46), [])

  return (
    <div className="app" data-testid="app">
      <Header onDark={onDark} muted={muted} onSound={toggleSound} />

      <div className="sheet">
        <div className="stage" onPointerMove={onStageMove} onWheel={onStageWheel}>
          <div className="canvas-layer">
            <Canvas
              dpr={dpr}
              camera={{ position: [0, 205, 58], fov: 38, near: 0.15, far: 4000 }}
              gl={(canvas: HTMLCanvasElement | OffscreenCanvas) => {
                const element = canvas as HTMLCanvasElement
                return new THREE.WebGLRenderer({
                  canvas: element,
                  context: createWebGL2Context(element, { antialias: true, alpha: false }),
                  antialias: true,
                  alpha: false,
                  preserveDrawingBuffer: QA_BUFFER,
                  powerPreference: 'high-performance',
                  failIfMajorPerformanceCaveat: false,
                })
              }}
              fallback={<div className="canvas-fallback">This journey needs WebGL2.</div>}
            >
              <CameraRig progress={scrollYProgress} />
              <SkyCloudsGodrays />
              <WeatherSystem />
              <OrbSlot progress={scrollYProgress} />
              <WorldSlot progress={scrollYProgress} />
              <WaterSlot progress={scrollYProgress} />
              <ambientLight intensity={0.6} />
              <directionalLight position={[6, 14, 8]} intensity={1.1} color="#FFF1D8" />
              <ReadyProbe onFirstFrame={onFirstFrame} />
              <ToneProbe onChange={setOnDark} />
              <PostFX bloom={bloom} exposure={1.24} />
            </Canvas>
          </div>
          <div className="vig" aria-hidden="true" />
          <div className="grain" aria-hidden="true" />
          <div className="scrim" aria-hidden="true" />
        </div>

        <main className="beats">
          {BEATS.map((beat, index) => (
            <section key={beat.id} className="beat" data-beat={index} aria-hidden="true" />
          ))}
        </main>

        <BeatOverlay progress={scrollYProgress} beats={BEATS} />
      </div>

      <div className="foot-space" ref={footSpace} aria-hidden="true" />
      <Footer />
      <Preloader
        progress={framed ? 1 : fonts ? 0.82 : 0.45}
        done={done}
        onReveal={onLoaderReveal}
        onGone={onLoaderGone}
      />
    </div>
  )
}
