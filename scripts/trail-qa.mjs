import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// node scripts/trail-qa.mjs [width] [height]
const width = Number(process.argv[2] ?? 1440)
const height = Number(process.argv[3] ?? 900)
const PORT = 4185
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, CI: '1' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break } catch {} await sleep(250) }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('ERR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()) })
await page.goto(`http://127.0.0.1:${PORT}/?scene=${process.env.SCENE ?? 1}&qa=1`, { waitUntil: 'load' })
await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 120000 }).catch(() => console.log('no frames'))

// a slow S-stroke across the lower half: the trail's brush, push, curl and fringe all engage
const cx = width * 0.5
const cy = height * 0.62
await page.mouse.move(cx - 320, cy)
for (let i = 0; i <= 40; i++) {
  const t = i / 40
  const x = cx - 320 + t * 640
  const y = cy + Math.sin(t * Math.PI * 2) * 110
  await page.mouse.move(x, y)
  await sleep(30)
}
await sleep(450)
await page.screenshot({ path: `artifacts/trail-${width}x${height}.png`, timeout: 120000 })
console.log(`saved artifacts/trail-${width}x${height}.png`)
await sleep(1200)
await page.screenshot({ path: `artifacts/trail-late-${width}x${height}.png`, timeout: 120000 })
console.log(`saved artifacts/trail-late-${width}x${height}.png`)
await browser.close()
server.kill('SIGTERM')
