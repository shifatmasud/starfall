import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const PORT = 4181
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, CI: '1' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break } catch {} await sleep(250) }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('ERR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()) })
await page.goto(`http://127.0.0.1:${PORT}/?scene=1&qa=1`, { waitUntil: 'load' })
for (let i = 0; i < 6; i++) { await sleep(5000); console.log('t', (i + 1) * 5, 'frames', await page.evaluate(() => window.__ORB_FRAME__)) }
await browser.close(); server.kill('SIGTERM')
