#!/usr/bin/env node
/**
 * Chapter shots — one frame per chapter, on the SwiftShader rasterizer.
 *
 * Faster than the full QA pass and better aimed at art direction: eight stops, one per beat, plus a
 * filmstrip contact sheet so a whole run can be judged at a glance.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const PORT = Number(process.env.SHOT_PORT ?? 4180)
const BASE = `http://127.0.0.1:${PORT}/`
const OUT = path.resolve('artifacts')
const WIDTH = Number(process.env.SHOT_W ?? 1280)
const HEIGHT = Number(process.env.SHOT_H ?? 720)
const CHAPTERS = 8
const ONLY = process.env.SHOT_ONLY ? process.env.SHOT_ONLY.split(',').map(Number) : null

const ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await sleep(200)
  }
  throw new Error(`preview did not answer at ${url}`)
}

function startPreview() {
  const child = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' },
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[preview] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`))
  return child
}

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = window.__ORB_FRAME__ ?? 0
        let ticks = 0
        const tick = () => {
          ticks += 1
          if ((window.__ORB_FRAME__ ?? 0) >= start + 2 || ticks > 400) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 260)))
}

async function run() {
  await mkdir(OUT, { recursive: true })
  const errors = []
  const preview = startPreview()
  let browser
  try {
    await waitForServer(BASE)
    browser = await chromium.launch({ headless: true, args: ARGS })
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    })
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

    await page.goto(`${BASE}?qa=1`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__ORB_READY__ === true, undefined, { timeout: 90_000 })
    await page.evaluate(() => document.fonts?.ready)
    await settle(page)

    const shots = []
    for (let i = 0; i < CHAPTERS; i += 1) {
      if (ONLY && !ONLY.includes(i + 1)) continue
      const progress = i / (CHAPTERS - 1)
      await page.evaluate((p) => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        window.scrollTo(0, Math.round(max * p))
      }, progress)
      await settle(page)
      await settle(page)
      const file = `v2-${String(i + 1).padStart(2, '0')}.png`
      await page.screenshot({ path: path.join(OUT, file) })
      shots.push(file)
      console.log(`shot ${file} at progress ${progress.toFixed(3)}`)
    }

    const gl = await page.evaluate(() => window.__ORB_GL__ ?? null)
    await writeFile(
      path.join(OUT, 'shots-report.json'),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), gl, shots, errors }, null, 2)}\n`,
    )
    console.log(`renderer: ${gl?.renderer ?? 'unknown'}`)
    if (errors.length) {
      console.error(`${errors.length} page error(s):`)
      for (const error of errors.slice(0, 12)) console.error(`  ${error}`)
    }
    await context.close()
  } finally {
    if (browser) await browser.close()
    preview.kill('SIGTERM')
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
