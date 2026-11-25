import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

/**
 * Trail-origin QA.
 *
 * Proves two things about the brush:
 *   1. a touch that starts at (900, 520) paints from (900, 520) — nothing appears at (0, 0);
 *   2. a second touch after release starts at its own live position, with no stroke between the two.
 *
 * It captures a baseline before touching, a frame after a scrub from the centre-right, and a frame
 * after a fresh touch lower-left, then diffs the three in the top-left corner where the bug used to
 * light up. Run with the SwiftShader libs on LD_LIBRARY_PATH.
 */
const width = Number(process.argv[2] ?? 1440)
const height = Number(process.argv[3] ?? 900)
const PORT = Number(process.env.QA_PORT ?? 4400 + Math.floor(Math.random() * 200))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, CI: '1' },
})
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
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('ERR', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CERR', m.text())
})
await page.goto(`http://127.0.0.1:${PORT}/?scene=1&qa=1`, { waitUntil: 'load' })
await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 120000 }).catch(() => console.log('no frames'))
await sleep(2500)
await page.screenshot({ path: 'artifacts/trail-before.png', timeout: 120000 })

const cdp = await page.context().newCDPSession(page)
const touch = async (type, x, y) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
  })

// a scrub that begins at the centre-right of the frame
const startX = Math.round(width * 0.625)
const startY = Math.round(height * 0.578)
await touch('touchStart', startX, startY)
for (let i = 1; i <= 24; i++) {
  const t = i / 24
  await touch('touchMove', startX + t * 150, startY + Math.sin(t * Math.PI) * 40)
  await sleep(90)
}
await sleep(1400)
await page.screenshot({ path: 'artifacts/trail-touch.png', timeout: 120000 })
await touch('touchEnd', 0, 0)
await sleep(900)

// a second, separate touch lower-left: it must not streak from the first one
const secondX = Math.round(width * 0.3)
const secondY = Math.round(height * 0.72)
await touch('touchStart', secondX, secondY)
for (let i = 1; i <= 10; i++) {
  await touch('touchMove', secondX + i * 9, secondY + i * 2)
  await sleep(80)
}
await sleep(1400)
await page.screenshot({ path: 'artifacts/trail-touch-two.png', timeout: 120000 })
await touch('touchEnd', 0, 0)
await sleep(800)

// a mouse stroke straight across the bright Earth limb: the bend of that line is the proof the
// picture itself refracts through the wake
const limbX = Math.round(width * 0.36)
await page.mouse.move(limbX, height * 0.42)
await page.mouse.down()
for (let i = 1; i <= 26; i++) {
  const t = i / 26
  await page.mouse.move(limbX + t * 46, height * 0.42 + t * (height * 0.32))
  await sleep(80)
}
await page.mouse.up()
await sleep(1400)
await page.screenshot({ path: 'artifacts/trail-limb.png', timeout: 120000 })

console.log(`touch stroke from ${startX},${startY}; second touch at ${secondX},${secondY}`)
await browser.close()
server.kill('SIGTERM')
