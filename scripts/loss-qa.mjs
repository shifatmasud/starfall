import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// node scripts/loss-qa.mjs <name>
// Mounts the scene, forces WEBGL_lose_context on the live canvas, then checks the picture comes back.
const name = process.argv[2] ?? 'loss'
const PORT = Number(process.env.QA_PORT ?? 4900 + Math.floor(Math.random() * 200))
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
  if (m.type() === 'error') errors.push('ERR ' + m.text())
})

await page.goto(`http://127.0.0.1:${PORT}/?scene=${process.env.QA_SCENE ?? 1}&qa=1`, { waitUntil: 'load' })
await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 90000 }).catch(() => {})
await sleep(1500)
const before = await page.evaluate(() => window.__ORB_FRAME__ ?? 0)

const lost = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return 'no canvas'
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const ext = gl && gl.getExtension('WEBGL_lose_context')
  if (!ext) return 'no WEBGL_lose_context'
  ext.loseContext()
  return 'lost'
})

await sleep(2500)
const midFrames = await page.evaluate(() => window.__ORB_FRAME__ ?? 0)
await page.screenshot({ path: `artifacts/${name}-during.png`, timeout: 120000 })

const restored = await page.evaluate(async () => {
  const c = document.querySelector('canvas')
  if (!c) return 'no canvas'
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const ext = gl && gl.getExtension('WEBGL_lose_context')
  if (ext) ext.restoreContext()
  return 'restore requested'
})

// the wrapper's watchdog or the restore event should rebuild the renderer
for (let i = 0; i < 40; i++) {
  await sleep(500)
  const n = await page.evaluate(() => window.__ORB_FRAME__ ?? 0)
  if (n > midFrames + 2) break
}
await sleep(1500)
const after = await page.evaluate(() => ({
  frames: window.__ORB_FRAME__ ?? 0,
  canvases: document.querySelectorAll('canvas').length,
}))
await page.screenshot({ path: `artifacts/${name}-after.png`, timeout: 120000 })

console.log(JSON.stringify({ lost, restored, before, midFrames, after, errors: errors.slice(0, 4) }))
console.log(`saved artifacts/${name}-during.png, artifacts/${name}-after.png`)
await browser.close()
server.kill('SIGTERM')
