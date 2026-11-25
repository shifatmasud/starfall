import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// node scripts/gl-probe.mjs <case> <name>
// case: none | nohf | nofloat | nogl2 | halfonly | lost
const which = process.argv[2] ?? 'none'
const name = process.argv[3] ?? which
const PORT = Number(process.env.QA_PORT ?? 4700 + Math.floor(Math.random() * 200))
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, CI: '1' },
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`)
    if (r.ok) break
  } catch {}
  await sleep(250)
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type().toUpperCase() + ' ' + m.text())
})

const patch = `
(() => {
  const which = ${JSON.stringify(which)};
  if (which === 'nogl2') {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith('webgl2')) return null;
      return orig.call(this, type, ...rest);
    };
    return;
  }
  const proto = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (!proto) return;
  const orig = proto.getExtension;
  proto.getExtension = function (ext) {
    const e = String(ext);
    if (which === 'nohf' && (e === 'EXT_color_buffer_half_float' || e === 'EXT_color_buffer_float')) return null;
    if (which === 'halfonly' && e === 'EXT_color_buffer_float') return null;
    if (which === 'lost' && e === 'WEBGL_lose_context') return orig.call(this, e);
    return orig.call(this, e);
  };
  const gp = proto.getParameter;
  proto.getParameter = function (p) {
    const v = gp.call(this, p);
    if (p === 0x0d33 && typeof v === 'number') return Math.min(v, 4096); // MAX_TEXTURE_SIZE
    return v;
  };
  if (which === 'lost') {
    const origDraw = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const ctx = origDraw.call(this, type, ...rest);
      if (ctx && String(type).startsWith('webgl') && !window.__LOSER__) {
        window.__LOSER__ = true;
        setTimeout(() => {
          const ext = ctx.getExtension('WEBGL_lose_context');
          if (ext) { window.__LOST_AT__ = performance.now(); ext.loseContext(); }
        }, 6000);
      }
      return ctx;
    };
  }
})()
`
await page.addInitScript(patch)
await page.goto(`http://127.0.0.1:${PORT}/?scene=${process.env.QA_SCENE ?? 1}&qa=1`, { waitUntil: 'load' })
await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 60000 }).catch(() => {})
await sleep(4000)

const state = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  let stats = null
  let px = null
  if (c) {
    const g = c.getContext('webgl2', { preserveDrawingBuffer: true })
    try {
      const d = new Uint8Array(4 * 16)
      const gl = g || c.getContext('webgl')
      if (gl) {
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, d)
        // sample the middle of the frame too
        const mid = new Uint8Array(4)
        gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, mid)
        px = { bl: Array.from(d.slice(0, 4)), mid: Array.from(mid) }
        stats = { lost: gl.isContextLost(), err: gl.getError(), w: gl.drawingBufferWidth, h: gl.drawingBufferHeight }
      }
    } catch (e) {
      stats = { readError: String(e) }
    }
  }
  return { frames: window.__ORB_FRAME__ ?? 0, hasCanvas: !!c, cw: c?.width, ch: c?.height, stats, px, lostAt: window.__LOST_AT__ ?? null }
})

const path = `artifacts/probe-${name}.png`
await page.screenshot({ path, timeout: 120000 })
console.log(which, JSON.stringify(state))
console.log('errors:', errors.slice(0, 6).join('\n  '))
console.log('saved', path)
await browser.close()
server.kill('SIGTERM')
