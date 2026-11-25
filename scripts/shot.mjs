import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

// node scripts/shot.mjs "<extra query>" <name> [width] [height]
const extra = process.argv[2] ?? ''
const name = process.argv[3] ?? 'shot'
const width = Number(process.argv[4] ?? 1440)
const height = Number(process.argv[5] ?? 900)
const PORT = 4183
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, CI: '1' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break } catch {} await sleep(250) }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('ERR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()) })
await page.goto(`http://127.0.0.1:${PORT}/?scene=1&qa=1&${extra}`, { waitUntil: 'load' })
await page.waitForFunction(() => (window.__ORB_FRAME__ ?? 0) > 3, null, { timeout: 120000 }).catch(() => console.log('no frames'))
await sleep(2000)
const path = `artifacts/${name}.png`
await page.screenshot({ path, timeout: 120000 })
console.log('saved', path)
await browser.close()
server.kill('SIGTERM')
