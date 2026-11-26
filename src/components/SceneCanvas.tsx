import { Canvas, type CanvasProps } from '@react-three/fiber'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { caps, diagnostics, qualityOverride } from '../gl/capabilities'

/**
 * The frame around every scene: the one place that decides whether this device can draw, and what it
 * shows when it cannot.
 *
 * A black page is never a legitimate answer. On Android a WebGL2 context is refused or lost for
 * reasons that have nothing to do with the picture — a restarted GPU process, a driver blocklist, a
 * watchdog kill under memory pressure — and three throws on the first of those, which takes the whole
 * React tree down and leaves the body's near-black background. So this wrapper:
 *
 *   1. reads the measured capabilities (`capabilities.ts`) and picks the buffer size and the effects
 *   2. catches a thrown context creation and retries once with conservative attributes
 *   3. listens for `webglcontextlost` / `webglcontextrestored` and remounts the renderer when the GPU
 *      comes back, since three never rebuilds itself
 *   4. watches the frame counter: a canvas that stops drawing while visible is remounted, then
 *      replaced by the still
 *   5. falls back to a rendered still of the same scene, so a device that cannot run WebGL still sees
 *      the picture instead of a void — with a single quiet line saying why, when it is a hard failure
 */

type PosterSet = { portrait: string; landscape: string }

type Props = {
  poster: PosterSet
  /** the clear colour behind the scene */
  clear: string
  /** the camera props for the scene */
  camera: CanvasProps['camera']
  children: ReactNode
}

class Boundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { dead: boolean }> {
  state = { dead: false }

  static getDerivedStateFromError() {
    return { dead: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error))
  }

  render() {
    return this.state.dead ? null : this.props.children
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function SceneCanvas({ poster, clear, camera, children }: Props) {
  const device = useMemo(() => caps(), [])
  // ?qa=1 is a headless CPU rasterizer: seconds per frame is normal there, and the frame watchdog
  // must not read that as a lost context and rebuild the canvas out from under the screenshot
  const qa = useMemo(() => new URLSearchParams(location.search).has('qa'), [])
  const override = useMemo(() => qualityOverride(), [])
  // `?q=low` forces the phone-class path on a big screen, `?q=high` the reverse
  const forced = override === 'low' ? true : override === 'high' ? false : null

  /** bumped to rebuild the whole renderer, context and all */
  const [gen, setGen] = useState(0)
  /** hard failure: the scene can never draw on this device */
  const [failed, setFailed] = useState<string | null>(device.webgl2 ? null : 'WebGL 2 unavailable')
  /** a lost context that has not come back yet */
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const mountedAt = useRef(performance.now())
  const lastCount = useRef(0)
  const lastChange = useRef(performance.now())
  const rebuilds = useRef(0)

  const rebuild = (why: string) => {
    if (rebuilds.current >= 2) {
      setFailed(why)
      return
    }
    rebuilds.current += 1
    setLost(false)
    setAttempt((n) => n + 1)
    setGen((n) => n + 1)
    mountedAt.current = performance.now()
    lastChange.current = performance.now()
  }

  // the watchdog: a live canvas that stops producing frames is treated as a lost context, because on
  // Android that is what it almost always is
  useEffect(() => {
    if (failed || qa) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        lastChange.current = performance.now()
        return
      }
      const count = window.__ORB_FRAME__ ?? 0
      const now = performance.now()
      if (count !== lastCount.current) {
        lastCount.current = count
        lastChange.current = now
        return
      }
      // give the first frame time to compile its shaders: a phone can take seconds
      const grace = count === 0 ? 12000 : 5000
      if (now - lastChange.current > grace && now - mountedAt.current > grace) {
        rebuild('the renderer stopped drawing')
      }
    }, 900)
    return () => window.clearInterval(timer)
  }, [failed, gen, qa])

  const attach = (gl: { domElement: HTMLCanvasElement }) => {
    const canvas = gl.domElement
    canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        // three's own listener prevents the default too; without that the GPU never restores us
        event.preventDefault()
        setLost(true)
        window.setTimeout(() => {
          if (canvas.isConnected) rebuild('the graphics context was lost')
        }, 1200)
      },
      false,
    )
    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        rebuild('the graphics context was restored')
      },
      false,
    )
  }

  // a phone is not a small desktop: at 2× the whole post chain is eight megabytes a buffer, and on a
  // device that has already lost one context the first thing to give is resolution
  const ceiling = attempt > 0 ? 1 : device.lowTier ? 1.6 : 2
  const dpr = forced === true ? Math.min(1.4, ceiling) : Math.min(device.dpr, ceiling)

  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 62% 22%, #101a30 0%, #070b16 48%, #04060c 100%)` }}>
      {failed ? (
        <Still poster={poster} note={failed} />
      ) : (
        <>
          <Boundary onError={(message) => setFailed(message)}>
            <Canvas
              key={gen}
              flat
              dpr={dpr}
              camera={camera}
              gl={{
                antialias: false,
                alpha: false,
                stencil: false,
                depth: true,
                powerPreference: 'default',
                failIfMajorPerformanceCaveat: false,
                preserveDrawingBuffer: new URLSearchParams(location.search).has('qa'),
              }}
              onCreated={({ gl }) => {
                gl.setClearColor(clear, 1)
                window.__ORB_FRAME__ = 0
                attach(gl)
                mountedAt.current = performance.now()
                lastChange.current = performance.now()
              }}
            >
              {children}
            </Canvas>
          </Boundary>
          {lost ? <Still poster={poster} note="recovering the graphics context" soft /> : null}
        </>
      )}
    </div>
  )
}

/** The scene as a photograph: shown when this device cannot run the live one. */
function Still({ poster, note, soft = false }: { poster: PosterSet; note: string; soft?: boolean }) {
  const [wide, setWide] = useState(() => window.innerWidth > window.innerHeight)
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const diag = new URLSearchParams(location.search).has('diag')

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(120% 90% at 62% 22%, #101a30 0%, #070b16 48%, #04060c 100%)',
        opacity: soft ? 0 : 1,
        transition: 'opacity 600ms ease',
      }}
    >
      <img
        src={wide ? poster.landscape : poster.portrait}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
      {(diag || !soft) && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '56px 24px max(20px, env(safe-area-inset-bottom))',
            textAlign: 'center',
            background: 'linear-gradient(to top, rgba(4,6,12,0.82), rgba(4,6,12,0))',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              font: '400 11px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif',
              letterSpacing: '0.07em',
              color: 'rgba(230,237,250,0.72)',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}
          >
            {soft ? 'recovering' : `${note} — showing a still`}
            {diag ? ` · ${diagnostics()}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

/** The same wait every scene uses before it knows a frame has landed. */
export async function settle(ms = 900) {
  await sleep(ms)
}

declare global {
  interface Window {
    __ORB_FRAME__?: number
  }
}
