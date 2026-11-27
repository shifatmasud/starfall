import { DEM as DUNES } from './dunes'
import { DEM as MEADOW } from './meadow'
import { DEM as SEABED } from './seabed'

/**
 * The real-world elevation fields every ground is built on.
 *
 * Each module under this folder is a quantised 0..1 height field baked from open elevation or
 * bathymetry data (see scripts/bake-dem.py): AWS Terrain Tiles (NASA/USGS SRTM + GMTED) for the dunes
 * and the alpine meadow, GEBCO 2020 for the reef seabed. They are smoothed with three Gaussian passes
 * at bake time, so the meshes carry rounded landforms rather than DEM spikes, and they are stored
 * inside the bundle as base64, so a fresh clone builds and renders offline and identically.
 *
 * Sampling is mirrored-tiled: the field repeats without a seam, at whatever world extent the scene
 * asks for, and returns 0..1 (0 = the lowest point of the real crop, 1 = the highest).
 */
export type Dem = { name: string; size: number; spanMeters: number; source: string; origin: [number, number]; data: string }

const REGISTRY = { dunes: DUNES, meadow: MEADOW, seabed: SEABED } as const
export type DemName = keyof typeof REGISTRY

const decoded = new Map<string, Float32Array>()

function field(name: DemName): Float32Array {
  const cached = decoded.get(name)
  if (cached) return cached
  const dem = REGISTRY[name] as Dem
  const bin = typeof atob === 'function' ? atob(dem.data) : Buffer.from(dem.data, 'base64').toString('binary')
  const out = new Float32Array(dem.size * dem.size)
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i) / 255
  decoded.set(name, out)
  return out
}

/** bilinear sample of the field at u,v in 0..1 (clamped) */
export function sampleDem(name: DemName, u: number, v: number): number {
  const data = field(name)
  const n = (REGISTRY[name] as Dem).size
  const x = Math.min(Math.max(u, 0), 1) * (n - 1)
  const y = Math.min(Math.max(v, 0), 1) * (n - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, n - 1)
  const y1 = Math.min(y0 + 1, n - 1)
  const fx = x - x0
  const fy = y - y0
  const a = data[y0 * n + x0]
  const b = data[y0 * n + x1]
  const c = data[y1 * n + x0]
  const d = data[y1 * n + x1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/** the field in world space: one crop of `extent` world units, mirrored so the repeat has no seam */
export function sampleDemWorld(name: DemName, x: number, z: number, extent: number, offset: [number, number] = [0, 0]): number {
  const u = (x + offset[0]) / extent
  const v = (z + offset[1]) / extent
  const mu = Math.abs(((u % 2) + 2) % 2 - 1)
  const mv = Math.abs(((v % 2) + 2) % 2 - 1)
  return sampleDem(name, mu, mv)
}

export const DEM_INFO = {
  dunes: { span: DUNES.spanMeters, origin: DUNES.origin, source: DUNES.source },
  meadow: { span: MEADOW.spanMeters, origin: MEADOW.origin, source: MEADOW.source },
  seabed: { span: SEABED.spanMeters, origin: SEABED.origin, source: SEABED.source },
}
