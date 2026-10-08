import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const TAU = Math.PI * 2

// Deterministic PRNG so every load looks identical.
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------- noise ---------- */

// One tileable fractal value-noise field (256², 6 octaves), baked once and sampled by every texture.
const NS = 256
let field = null
function noiseField() {
  if (field) return field
  const r = rng(1234)
  const f = new Float32Array(NS * NS)
  let amp = 1
  for (let cells = 4; cells <= 128; cells *= 2, amp *= 0.55) {
    const lat = new Float32Array(cells * cells)
    for (let i = 0; i < lat.length; i++) lat[i] = r()
    const k = cells / NS
    for (let y = 0; y < NS; y++) {
      const fy = y * k
      const y0 = Math.floor(fy)
      let ty = fy - y0
      ty = ty * ty * (3 - 2 * ty)
      const r0 = y0 * cells
      const r1 = ((y0 + 1) % cells) * cells
      for (let x = 0; x < NS; x++) {
        const fx = x * k
        const x0 = Math.floor(fx)
        let tx = fx - x0
        tx = tx * tx * (3 - 2 * tx)
        const x1 = (x0 + 1) % cells
        const a = lat[r0 + x0]
        const b = lat[r0 + x1]
        const c = lat[r1 + x0]
        const d = lat[r1 + x1]
        f[y * NS + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty)
      }
    }
  }
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < f.length; i++) {
    lo = Math.min(lo, f[i])
    hi = Math.max(hi, f[i])
  }
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / (hi - lo)
  return (field = f)
}

/** Fractal noise in 0..1; tiles every 256 units in x and y. */
export function noise(x, y) {
  const f = noiseField()
  const xf = Math.floor(x)
  const yf = Math.floor(y)
  const tx = x - xf
  const ty = y - yf
  const x0 = xf & 255
  const x1 = (x0 + 1) & 255
  const y0 = (yf & 255) * NS
  const y1 = ((yf + 1) & 255) * NS
  const a = f[y0 + x0]
  const b = f[y0 + x1]
  const c = f[y1 + x0]
  const d = f[y1 + x1]
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
}

/** Cheap 3D-ish noise in 0..1 for displacing geometry (world units * freq). */
export function noise3(x, y, z, freq = 1) {
  const k = freq * 32
  return (noise(x * k + 17, y * k) + noise(y * k + 101, z * k + 53) + noise(z * k + 211, x * k + 7)) / 3
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const hex = (s) => {
  const n = parseInt(s.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(c, a, b, t) {
  t = clamp01(t)
  c[0] = a[0] + (b[0] - a[0]) * t
  c[1] = a[1] + (b[1] - a[1]) * t
  c[2] = a[2] + (b[2] - a[2]) * t
  return c
}
function mul(c, k) {
  c[0] *= k
  c[1] *= k
  c[2] *= k
  return c
}
const tmp = [0, 0, 0]
const tmp2 = [0, 0, 0]
// layers colour b over c with opacity t
const over = (c, b, t) => mix(c, (tmp[0] = c[0], tmp[1] = c[1], tmp[2] = c[2], tmp), b, t)

/* ---------- canvas textures ---------- */

const cache = {}
function tex(key, w, h, draw, opts = {}) {
  if (cache[key]) return cache[key]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h, rng(opts.seed || 7))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.anisotropy = 8
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  return (cache[key] = t)
}

// Per-pixel fill: fn(u, v, rgba) writes into rgba (0..255).
const C = [0, 0, 0, 255]
function paint(g, w, h, fn) {
  const img = g.createImageData(w, h)
  const d = img.data
  for (let y = 0, i = 0; y < h; y++) {
    const v = y / h
    for (let x = 0; x < w; x++, i += 4) {
      C[3] = 255
      fn(x / w, v, C)
      d[i] = C[0]
      d[i + 1] = C[1]
      d[i + 2] = C[2]
      d[i + 3] = C[3]
    }
  }
  g.putImageData(img, 0, 0)
}

function blobs(g, r, n, w, h, cols, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.5 + r() * 0.5)
    g.fillStyle = cols[Math.floor(r() * cols.length)]
    g.beginPath()
    g.arc(r() * w, r() * h, rmin + r() * (rmax - rmin), 0, 7)
    g.fill()
  }
  g.globalAlpha = 1
}

// Soft round spot with a darker core (char, browning, blisters). Wraps horizontally.
function spot(g, x, y, rad, core, halo, a = 1, w = 0) {
  for (const dx of w ? [0, -w, w] : [0]) {
    if (w && (x + dx < -rad * 2 || x + dx > w + rad * 2)) continue
    const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad)
    gr.addColorStop(0, core)
    gr.addColorStop(0.45, core)
    gr.addColorStop(1, halo)
    g.globalAlpha = a
    g.fillStyle = gr
    g.beginPath()
    g.arc(x + dx, y, rad, 0, 7)
    g.fill()
  }
  g.globalAlpha = 1
}

const BREAD = [hex('#a65a1f'), hex('#d0893c'), hex('#e9b56c')]
export const breadTex = () =>
  tex('bread', 512, 512, (g, w, h, r) => {
    const [dk, md, lt] = BREAD
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 512) * 0.6 + noise(u * 1024 + 50, v * 1024 + 9) * 0.4
      mix(c, dk, md, sstep(0.25, 0.55, n))
      over(c, lt, sstep(0.55, 0.8, n) * 0.7)
    })
    blobs(g, r, 1600, w, h, ['#7a3e12', '#f6d49a'], 0.6, 1.8, 0.35)
  })

// Burger crown: deep golden top fading to a pale band where it rose in the tin.
export const bunTex = () =>
  tex('bun', 512, 512, (g, w, h, r) => {
    const top = hex('#9b511b')
    const mid = hex('#c47a30')
    const low = hex('#dfa55c')
    const pale = hex('#f0d39c')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 256 + 30)
      const fine = noise(u * 1024 + 70, v * 1024)
      const t = v + (n - 0.5) * 0.25
      if (t < 0.55) mix(c, top, mid, t / 0.55)
      else if (t < 0.82) mix(c, mid, low, (t - 0.55) / 0.27)
      else mix(c, low, pale, (t - 0.82) / 0.14)
      mul(c, 0.9 + n * 0.16 + (fine - 0.5) * 0.12)
    })
    blobs(g, r, 900, w, h * 0.85, ['#6e3510', '#f3cf8f'], 0.5, 1.6, 0.3)
  })

// Bottom bun (lathe): rows top→bottom = cut crumb face, crust side, underside.
export const bunBaseTex = () =>
  tex('bunbase', 256, 512, (g, w, h, r) => {
    const crumb = hex('#efd9ad')
    const crumbDk = hex('#c9a46c')
    const side = hex('#c27f36')
    const sideLt = hex('#dcaa62')
    const under = hex('#9a521c')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 256, v * 512)
      const fine = noise(u * 1024 + 30, v * 2048 + 11)
      if (v < 0.2) {
        mix(c, crumb, crumbDk, sstep(0.55, 0.85, fine) * 0.8)
        mul(c, 0.9 + n * 0.15)
      } else if (v < 0.8) {
        const t = (v - 0.2) / 0.6
        mix(c, sideLt, side, sstep(0, 0.35, t))
        over(c, under, sstep(0.6, 1, t) * 0.7)
        mul(c, 0.88 + n * 0.2)
      } else {
        mix(c, under, side, n * 0.6)
      }
    })
    blobs(g, r, 400, w, h * 0.2, ['#b08a55', '#fff1d0'], 0.6, 2, 0.35)
  })

// Neapolitan crust: torus uv, rows 0.25h = top of the rim. Golden dough with leopard char.
export const crustTex = () =>
  tex('crust', 1024, 256, (g, w, h, r) => {
    const pale = hex('#ecc58a')
    const gold = hex('#d49a52')
    const brown = hex('#a8622a')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 1024, v * 256)
      const fine = noise(u * 2048 + 40, v * 512 + 3)
      const top = Math.cos((v - 0.25) * TAU) * 0.5 + 0.5 // 1 on top of the rim
      mix(c, pale, gold, top * 0.8 + (n - 0.5) * 0.8)
      over(c, brown, sstep(0.55, 0.85, n * 0.7 + top * 0.35) * 0.75)
      mul(c, 0.92 + (fine - 0.5) * 0.25)
    })
    // leopard spotting: clusters of small charred blisters on the upper/outer rim
    for (let k = 0; k < 70; k++) {
      const cx = r() * w
      const cy = h * (0.08 + r() * 0.42)
      const n = 2 + Math.floor(r() * 7)
      for (let i = 0; i < n; i++) {
        const rad = 2 + r() ** 2 * 11
        spot(g, cx + (r() - 0.5) * 50, cy + (r() - 0.5) * 22, rad, 'rgba(34,16,7,1)', 'rgba(110,50,15,0)', 0.55 + r() * 0.4, w)
      }
    }
    for (let i = 0; i < 160; i++) spot(g, r() * w, h * (0.05 + r() * 0.55), 1 + r() * 2.5, 'rgba(25,12,5,1)', 'rgba(25,12,5,0)', 0.7, w)
    blobs(g, r, 1600, w, h, ['#fbf1de'], 0.5, 1.6, 0.35) // flour dust
  })

export const meatTex = () =>
  tex('meat', 512, 512, (g, w, h, r) => {
    const char = hex('#2a140a')
    const sear = hex('#5a2c16')
    const brown = hex('#84492a')
    const fat = hex('#b07e58')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 512)
      const chunk = noise(u * 2048 + 13, v * 2048 + 71)
      const k = n * 0.45 + chunk * 0.55
      mix(c, char, sear, sstep(0.25, 0.45, k))
      over(c, brown, sstep(0.5, 0.65, k))
      over(c, fat, sstep(0.68, 0.78, chunk) * 0.6)
    })
    blobs(g, r, 900, w, h, ['#12070a', '#b9805a'], 0.6, 2.2, 0.5)
  })

// Patty top: seared mince with diagonal grill bars (planar uv).
export const pattyTopTex = () =>
  tex('pattytop', 512, 512, (g, w, h, r) => {
    g.drawImage(meatTex().image, 0, 0, w, h)
    g.save()
    g.translate(w / 2, h / 2)
    g.rotate(-0.6)
    for (let x = -w; x < w; x += 70) {
      for (let y = -h; y < h; y += 6) {
        g.globalAlpha = 0.5 + r() * 0.4
        g.fillStyle = '#120806'
        g.fillRect(x + (r() - 0.5) * 4, y, 18 + r() * 6, 6)
      }
    }
    g.restore()
    g.globalAlpha = 1
  })

// Clay for kulhads: matte terracotta, grit and wheel-thrown rings.
export const terracottaTex = () =>
  tex('terra', 512, 512, (g, w, h, r) => {
    const base = hex('#b85a2e')
    const dark = hex('#8e3d1c')
    const light = hex('#cf7a4a')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 256 + 60)
      const grit = noise(u * 2048 + 3, v * 2048 + 99)
      const ring = Math.sin((v * 48 + n * 1.5) * TAU) * 0.5 + 0.5
      mix(c, dark, base, sstep(0.2, 0.55, n))
      over(c, light, sstep(0.55, 0.8, n) * 0.6)
      mul(c, 0.94 + ring * 0.08 + (grit - 0.5) * 0.3)
    })
    blobs(g, r, 1800, w, h, ['#d6926a', '#5e2810', '#c98258'], 0.5, 1.4, 0.35)
  })

// Fried samosa pastry: golden, blistered, with darker fried spots and ajwain seeds.
function crispPaint(g, w, h, r, bump) {
  const gold = hex('#d9a24c')
  const deep = hex('#b8732a')
  const dark = hex('#7e4316')
  paint(g, w, h, (u, v, c) => {
    const n = noise(u * 512, v * 512)
    const fine = noise(u * 2048 + 21, v * 2048 + 5)
    if (bump) {
      c[0] = c[1] = c[2] = 110 + n * 60 + fine * 40
      return
    }
    mix(c, gold, deep, sstep(0.45, 0.7, n))
    over(c, dark, sstep(0.66, 0.8, n * 0.6 + fine * 0.4) * 0.7)
    mul(c, 0.92 + fine * 0.16)
  })
  // blisters: raised bubbles, pale tops ringed with darker fry
  for (let i = 0; i < 420; i++) {
    const x = r() * w
    const y = r() * h
    const rad = 2 + r() ** 2 * 9
    if (bump) spot(g, x, y, rad, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.75)
    else {
      spot(g, x, y, rad * 1.4, 'rgba(140,72,22,0.5)', 'rgba(140,72,22,0)', 0.35)
      spot(g, x - rad * 0.15, y - rad * 0.15, rad * 0.6, 'rgba(236,190,110,1)', 'rgba(236,190,110,0)', 0.3)
    }
  }
  if (!bump) {
    for (let i = 0; i < 90; i++) {
      g.save()
      g.translate(r() * w, r() * h)
      g.rotate(r() * 3)
      g.fillStyle = r() > 0.5 ? '#3a2412' : '#5a3a1c'
      g.globalAlpha = 0.85
      g.beginPath()
      g.ellipse(0, 0, 2.6, 1.1, 0, 0, 7)
      g.fill()
      g.restore()
    }
    g.globalAlpha = 1
  }
}
export const crispTex = () => tex('crisp', 512, 512, (g, w, h, r) => crispPaint(g, w, h, r, false))
export const crispBumpTex = () => tex('crispbump', 512, 512, (g, w, h, r) => crispPaint(g, w, h, r, true), { data: true })

export const woodTex = () =>
  tex('wood', 512, 512, (g, w, h) => {
    const dark = hex('#6a4324')
    const mid = hex('#99693b')
    const light = hex('#b88653')
    paint(g, w, h, (u, v, c) => {
      const warp = noise(u * 256, v * 256 + 11)
      const ring = Math.sin((v * 22 + warp * 0.9) * TAU) * 0.5 + 0.5
      const fibre = noise(u * 256 + 91, v * 2048)
      const broad = noise(u * 256 + 37, v * 512 + 140)
      const t = 0.5 + (fibre - 0.43) * 0.85 + (broad - 0.43) * 0.3 - sstep(0.8, 0.98, ring) * 0.14
      if (t < 0.5) mix(c, dark, mid, t * 2)
      else mix(c, mid, light, (t - 0.5) * 2)
    })
  })

export const toastTex = () =>
  tex('toast', 512, 512, (g, w, h, r) => {
    const a = hex('#c98a3a')
    const b = hex('#e8bd78')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 512)
      mix(c, a, b, n * 1.4 - 0.2)
      mul(c, 0.92 + noise(u * 2048, v * 2048) * 0.16)
    })
    g.save()
    g.filter = 'blur(2.5px)'
    g.translate(w / 2, h / 2)
    g.rotate(Math.PI / 4)
    for (let x = -w; x < w; x += 84) {
      for (let y = -h; y < h; y += 5) {
        g.globalAlpha = r() < 0.12 ? 0.15 : 0.3 + r() * 0.4
        g.fillStyle = r() > 0.3 ? '#6a3612' : '#3a1a08'
        g.fillRect(x + (r() - 0.5) * 5, y, 16 + r() * 10, 5)
      }
    }
    g.restore()
    g.globalAlpha = 1
    blobs(g, r, 900, w, h, ['#8a5420', '#f2d49a'], 0.6, 1.8, 0.4)
  })

// Cut face of soft white bread: pale crumb with irregular air pockets (multiplied by vertex colour).
export const crumbTex = () =>
  tex('crumb', 256, 256, (g, w, h, r) => {
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 1024 + 5, v * 1024 + 60) * 0.6 + noise(u * 2048, v * 2048 + 31) * 0.4
      c[0] = c[1] = c[2] = 222 + n * 33
    })
    for (let i = 0; i < 1100; i++) {
      g.save()
      g.translate(r() * w, r() * h)
      g.rotate(r() * TAU)
      const rx = 0.5 + r() ** 3 * 3.2
      g.globalAlpha = 0.18 + r() * 0.22
      g.fillStyle = '#8c7458'
      g.beginPath()
      g.ellipse(0, 0, rx, rx * (0.4 + r() * 0.5), 0, 0, 7)
      g.fill()
      g.restore()
    }
    g.globalAlpha = 1
  })

// Masala chai seen through a cutting-chai glass: a pale froth line over milky tea that deepens downwards.
export const chaiTex = () =>
  tex('chai', 128, 512, (g, w, h, r) => {
    const froth = hex('#e4c9a2')
    const light = hex('#b07a46')
    const deep = hex('#7e4c27')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 128 + 40, v * 512)
      const t = v + (n - 0.5) * 0.03
      if (t < 0.05) mix(c, froth, light, sstep(0.025, 0.05, t))
      else mix(c, light, deep, sstep(0.05, 1, t))
      mul(c, 0.95 + (noise(u * 512, v * 256 + 9) - 0.5) * 0.1)
    })
    blobs(g, r, 120, w, h * 0.04, ['#f4e2c6'], 0.6, 1.6, 0.6)
  })

// Margherita-style top, mapped onto a disc. The same fields drive colour and bump.
function pizzaField(u, v, out) {
  const x = u * 2 - 1
  const y = v * 2 - 1
  const d = Math.sqrt(x * x + y * y)
  const n = noise(u * 512, v * 512)
  const big = noise(u * 256 + 40, v * 256 + 90)
  const cheese = sstep(0.4, 0.47, big * 0.7 + n * 0.3 + 0.1 * (1 - d) - 0.18 * sstep(0.84, 0.97, d))
  const bubble = noise(u * 1024 + 7, v * 1024 + 31)
  out[0] = cheese
  out[1] = sstep(0.6, 0.72, bubble) * cheese // browned peaks
  out[2] = n
  out[3] = d
}
const PZ = [0, 0, 0, 0]
export const pizzaTopTex = () =>
  tex('pizzatop', 1024, 1024, (g, w, h, r) => {
    const sauce = hex('#a8301a')
    const sauceDk = hex('#7c1e10')
    const cheese = hex('#f4dc98')
    const cheese2 = hex('#efc86a')
    const golden = hex('#d39a3e')
    const brown = hex('#8e5220')
    const oil = hex('#e89a3a')
    paint(g, w, h, (u, v, c) => {
      pizzaField(u, v, PZ)
      const [ch, br, n] = PZ
      mix(c, sauceDk, sauce, n * 1.6 - 0.2)
      const k = noise(u * 2048 + 3, v * 2048 + 3)
      over(c, mix(tmp2, cheese, cheese2, k * 1.2 - 0.1), ch)
      over(c, golden, br * 0.9 + sstep(0.55, 0.7, n) * ch * 0.35)
      over(c, brown, sstep(0.74, 0.84, noise(u * 1024 + 7, v * 1024 + 31)) * ch * 0.8)
      over(c, oil, sstep(0.62, 0.75, noise(u * 512 + 200, v * 512 + 60)) * 0.3)
    })
    const R = w / 2
    // browned cheese bubbles: pale domes with toasted rims
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * R * 0.85
      const x = R + Math.cos(a) * d
      const y = R + Math.sin(a) * d
      const rad = 6 + r() * 16
      spot(g, x, y, rad * 1.5, 'rgba(150,84,30,0.9)', 'rgba(150,84,30,0)', 0.6)
      spot(g, x - rad * 0.25, y - rad * 0.25, rad * 0.6, 'rgba(255,240,200,1)', 'rgba(255,240,200,0)', 0.6)
    }
    // dried oregano and chilli flakes
    for (let i = 0; i < 260; i++) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * R * 0.9
      g.globalAlpha = 0.8
      g.fillStyle = r() > 0.3 ? '#3e4a1c' : '#9a2410'
      g.fillRect(R + Math.cos(a) * d, R + Math.sin(a) * d, 1.5 + r() * 2.5, 1.5 + r() * 2)
    }
    // slice cuts
    g.lineWidth = 2.5
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2
      g.globalAlpha = 0.35
      g.strokeStyle = '#6a2a12'
      g.beginPath()
      g.moveTo(R, R)
      g.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R)
      g.stroke()
    }
    g.globalAlpha = 1
  })

export const pizzaBumpTex = () =>
  tex(
    'pizzabump',
    512,
    512,
    (g, w, h) => {
      paint(g, w, h, (u, v, c) => {
        pizzaField(u, v, PZ)
        c[0] = c[1] = c[2] = 70 + PZ[0] * 110 + PZ[1] * 50 + PZ[2] * 25
      })
    },
    { data: true }
  )

// Cured pepperoni: deep red with fat specks and a crisped, darker rim (planar uv).
export const pepperoniTex = () =>
  tex('pepperoni', 256, 256, (g, w, h, r) => {
    const red = hex('#b3301c')
    const deep = hex('#7c1a0e')
    const crisp = hex('#5c1a0c')
    paint(g, w, h, (u, v, c) => {
      const x = u * 2 - 1
      const y = v * 2 - 1
      const d = Math.sqrt(x * x + y * y)
      const n = noise(u * 512 + 80, v * 512)
      mix(c, deep, red, n * 1.5 - 0.15)
      over(c, crisp, sstep(0.86, 0.99, d + (n - 0.5) * 0.12) * 0.8)
    })
    for (let i = 0; i < 46; i++) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * w * 0.36
      g.globalAlpha = 0.55 + r() * 0.3
      g.fillStyle = r() > 0.5 ? '#e8a48c' : '#f2c0a8'
      g.beginPath()
      g.ellipse(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 2 + r() * 3.5, 1.5 + r() * 2.5, r() * 3, 0, 7)
      g.fill()
    }
    g.globalAlpha = 1
  })

// Tomato slice cross-section (cylinder cap uv).
export const tomatoTex = () =>
  tex('tomato', 256, 256, (g, w, h, r) => {
    const c = w / 2
    g.fillStyle = '#b82618'
    g.beginPath()
    g.arc(c, c, c, 0, 7)
    g.fill()
    g.fillStyle = '#d93a28'
    g.beginPath()
    g.arc(c, c, c * 0.93, 0, 7)
    g.fill()
    const n = 5
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3
      g.save()
      g.translate(c + Math.cos(a) * c * 0.48, c + Math.sin(a) * c * 0.48)
      g.rotate(a)
      g.fillStyle = '#ee6a4a'
      g.globalAlpha = 0.95
      g.beginPath()
      g.ellipse(0, 0, c * 0.3, c * 0.2, 0, 0, 7)
      g.fill()
      g.fillStyle = '#f3cf86'
      for (let s = 0; s < 9; s++) {
        g.globalAlpha = 0.85
        g.beginPath()
        g.ellipse((r() - 0.5) * c * 0.38, (r() - 0.5) * c * 0.22, 3.2, 2, r() * 3, 0, 7)
        g.fill()
      }
      g.restore()
    }
    g.globalAlpha = 0.9
    g.fillStyle = '#e04a32'
    g.beginPath()
    g.arc(c, c, c * 0.17, 0, 7)
    g.fill()
    g.globalAlpha = 1
    const img = g.getImageData(0, 0, w, h)
    const d = img.data
    for (let y = 0, i = 0; y < h; y++)
      for (let x = 0; x < w; x++, i += 4) {
        const k = 0.88 + noise(x * 2, y * 2) * 0.24
        d[i] *= k
        d[i + 1] *= k
        d[i + 2] *= k
      }
    g.putImageData(img, 0, 0)
  })

export const limeTex = (rind, flesh, pith) =>
  tex('lime' + rind, 256, 256, (g, w, h, r) => {
    const c = w / 2
    g.fillStyle = rind
    g.beginPath()
    g.arc(c, c, c, 0, 7)
    g.fill()
    g.fillStyle = pith
    g.beginPath()
    g.arc(c, c, c * 0.91, 0, 7)
    g.fill()
    const segs = 9
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU
      g.fillStyle = flesh
      g.globalAlpha = 1
      g.beginPath()
      g.moveTo(c + Math.cos(a + 0.2) * 6, c + Math.sin(a + 0.2) * 6)
      g.arc(c, c, c * 0.84, a + 0.05, a + TAU / segs - 0.05)
      g.closePath()
      g.fill()
      // juice vesicles
      for (let k = 0; k < 26; k++) {
        const t = a + 0.12 + r() * (TAU / segs - 0.24)
        const d = c * (0.15 + r() * 0.65)
        g.globalAlpha = 0.35
        g.fillStyle = r() > 0.5 ? pith : '#ffffff'
        g.beginPath()
        g.ellipse(c + Math.cos(t) * d, c + Math.sin(t) * d, 5, 1.6, t, 0, 7)
        g.fill()
      }
    }
    g.globalAlpha = 1
    g.fillStyle = pith
    g.beginPath()
    g.arc(c, c, c * 0.08, 0, 7)
    g.fill()
  })

export const teaTex = () =>
  tex('tea', 256, 256, (g, w, h, r) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    gr.addColorStop(0, '#c4905a')
    gr.addColorStop(0.7, '#ad7642')
    gr.addColorStop(0.9, '#d2ab7e')
    gr.addColorStop(1, '#7e4e28')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
    // a thin malai skin and froth collecting near the rim
    const img = g.getImageData(0, 0, w, h)
    const d = img.data
    for (let y = 0, i = 0; y < h; y++)
      for (let x = 0; x < w; x++, i += 4) {
        const n = noise(x * 1.5 + 9, y * 1.5)
        const k = 0.94 + sstep(0.55, 0.75, n) * 0.12
        d[i] *= k
        d[i + 1] *= k
        d[i + 2] *= k
      }
    g.putImageData(img, 0, 0)
    for (let i = 0; i < 240; i++) {
      const a = r() * TAU
      const d = (0.7 + r() * 0.24) * (w / 2)
      g.globalAlpha = 0.18 + r() * 0.3
      g.fillStyle = r() > 0.3 ? '#efd9bb' : '#fff4e2'
      g.beginPath()
      g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 0.8 + r() * 2.6, 0, 7)
      g.fill()
    }
    g.globalAlpha = 1
  })

// Blended iced coffee seen through the glass: froth band, milky marbling, chocolate syrup streaks.
export const coffeeTex = () =>
  tex('coffee', 512, 512, (g, w, h, r) => {
    const froth = hex('#ead6b8')
    const light = hex('#c7976a')
    const mid = hex('#a8754a')
    const deep = hex('#7d4f2e')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 256 + 9, v * 512 + noise(u * 512, v * 256) * 40)
      const t = v + (n - 0.5) * 0.08
      if (t < 0.07) mix(c, froth, light, t / 0.07)
      else if (t < 0.5) mix(c, light, mid, (t - 0.07) / 0.43)
      else mix(c, mid, deep, (t - 0.5) / 0.5)
      over(c, froth, sstep(0.66, 0.8, n) * 0.12)
    })
    // syrup drizzled down the inside of the glass
    for (let i = 0; i < 14; i++) {
      const x0 = r() * w
      const len = h * (0.25 + r() * 0.6)
      const wid = 2.5 + r() * 6
      const ph = r() * TAU
      for (const dx of [0, -w, w]) {
        g.fillStyle = 'rgba(52,22,9,0.88)'
        g.beginPath()
        for (let y = 0; y <= len; y += 6) {
          const x = x0 + dx + Math.sin(y * 0.012 + ph) * 5 + y * 0.05
          const ww = wid * (1 - (y / len) ** 2 * 0.7)
          g.rect(x - ww / 2, y, ww, 7)
        }
        g.fill()
        g.globalAlpha = 0.9
        g.beginPath()
        g.arc(x0 + dx + Math.sin(len * 0.012 + ph) * 5 + len * 0.05, len + 4, wid * 0.6, 0, 7)
        g.fill()
        g.globalAlpha = 1
      }
    }
  })

// Mojito seen through the glass: pale lime soda packed with crushed ice, mint and lime.
export const mojitoTex = () =>
  tex('mojito', 512, 512, (g, w, h, r) => {
    const soda = hex('#c9dd94')
    const deep = hex('#93b45a')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 512)
      mix(c, soda, deep, v * 0.6 + (n - 0.5) * 0.8)
    })
    const shape = (x, y, rad, fill, a) => {
      g.globalAlpha = a
      g.fillStyle = fill
      g.beginPath()
      const k = 5 + Math.floor(r() * 3)
      for (let i = 0; i < k; i++) {
        const t = (i / k) * TAU
        const rr = rad * (0.6 + r() * 0.5)
        g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr)
      }
      g.fill()
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * w
      const y = r() * h
      g.save()
      g.translate(x, y)
      g.rotate(r() * TAU)
      g.globalAlpha = 0.95
      g.fillStyle = r() > 0.4 ? '#2f6e2a' : '#3f8a34'
      g.beginPath()
      g.ellipse(0, 0, 18 + r() * 12, 8 + r() * 5, 0, 0, 7)
      g.fill()
      g.restore()
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * w
      const y = h * (0.3 + r() * 0.6)
      g.globalAlpha = 0.95
      g.fillStyle = '#5f9a2c'
      g.beginPath()
      g.arc(x, y, 30, Math.PI, TAU)
      g.fill()
      g.fillStyle = '#d6e98a'
      g.beginPath()
      g.arc(x, y, 25, Math.PI, TAU)
      g.fill()
    }
    for (let i = 0; i < 150; i++) shape(r() * w, r() * h, 8 + r() * 18, r() > 0.5 ? '#f4fbef' : '#e2efd2', 0.35 + r() * 0.45)
    for (let i = 0; i < 120; i++) {
      g.globalAlpha = 0.6
      g.strokeStyle = '#ffffff'
      g.lineWidth = 1
      g.beginPath()
      g.arc(r() * w, r() * h, 1 + r() * 3, 0, 7)
      g.stroke()
    }
    g.globalAlpha = 1
  })

// Cola: near-black with red-brown where it's thin, and fizz clinging to the glass.
export const colaTex = () =>
  tex('cola', 256, 512, (g, w, h, r) => {
    const top = hex('#4a1c0c')
    const deep = hex('#1d0905')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 256, v * 512 + 20)
      mix(c, top, deep, sstep(0, 0.25, v) * 0.85 + (n - 0.5) * 0.3)
    })
    for (let i = 0; i < 260; i++) {
      const x = r() * w
      const y = r() * h
      const rad = 0.8 + r() ** 3 * 4
      g.globalAlpha = 0.5 + r() * 0.4
      g.strokeStyle = '#d7b49a'
      g.lineWidth = 0.9
      g.beginPath()
      g.arc(x, y, rad, 0, 7)
      g.stroke()
    }
    g.globalAlpha = 1
  })

// Grey noise for bump/roughness (linear data).
export const noiseTex = () =>
  tex(
    'noise',
    256,
    256,
    (g, w, h) =>
      paint(g, w, h, (u, v, c) => {
        c[0] = c[1] = c[2] = (noise(u * 512, v * 512) * 0.6 + noise(u * 1024 + 9, v * 1024) * 0.4) * 255
      }),
    { data: true }
  )

// Tangent-space normals from the noise field: breaks up reflections on glossy food.
export const noiseNormalTex = () =>
  tex(
    'nnormal',
    256,
    256,
    (g, w, h) => {
      const H = new Float32Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = noise((x / w) * 512, (y / h) * 512) * 0.5 + noise((x / w) * 1024 + 9, (y / h) * 1024) * 0.5
      paint(g, w, h, (u, v, c) => {
        const x = Math.round(u * w)
        const y = Math.round(v * h)
        const dx = (H[y * w + ((x + 1) % w)] - H[y * w + ((x - 1 + w) % w)]) * 6
        const dy = (H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x]) * 6
        const len = Math.sqrt(dx * dx + dy * dy + 1)
        c[0] = (-dx / len) * 127.5 + 127.5
        c[1] = (dy / len) * 127.5 + 127.5
        c[2] = (1 / len) * 127.5 + 127.5
      })
    },
    { data: true }
  )

// Mottled near-white for multiplying with a material colour (sauces, chutneys, cream).
export const mottleTex = () =>
  tex('mottle', 256, 256, (g, w, h, r) => {
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512 + 33, v * 512 + 7)
      c[0] = c[1] = c[2] = 200 + n * 55
    })
    blobs(g, r, 260, w, h, ['#6a6a50', '#ffffff'], 0.5, 1.4, 0.5)
  })

// Leaf: length runs along u, midrib at v = 0.5. Near-white so material colour sets the hue.
export const leafTex = () =>
  tex('leaf', 256, 128, (g, w, h, r) => {
    paint(g, w, h, (u, v, c) => {
      const e = Math.abs(v - 0.5) * 2
      const n = noise(u * 512, v * 256 + 70)
      const k = 0.78 + n * 0.25 - e * e * 0.12
      c[0] = 205 * k
      c[1] = 228 * k
      c[2] = 190 * k
    })
    g.lineCap = 'round'
    g.strokeStyle = '#f4ffe0'
    g.globalAlpha = 0.85
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(0, h / 2)
    g.lineTo(w, h / 2)
    g.stroke()
    g.lineWidth = 1.4
    for (let i = 0; i < 7; i++) {
      const s = 0.08 + i * 0.12 + r() * 0.02
      for (const side of [-1, 1]) {
        g.globalAlpha = 0.55
        g.beginPath()
        g.moveTo(s * w, h / 2)
        g.quadraticCurveTo((s + 0.07) * w, h / 2 + side * h * 0.22, (s + 0.17) * w, h / 2 + side * h * 0.44)
        g.stroke()
      }
    }
    g.globalAlpha = 1
  })

// Soft wisp for steam sprites: radial falloff times vertically-stretched fractal noise.
export const puffTex = (i = 0) =>
  tex(
    'puff' + i,
    128,
    128,
    (g, w, h) => {
      const ox = i * 71
      const oy = i * 37
      paint(g, w, h, (u, v, c) => {
        const x = u * 2 - 1
        const y = v * 2 - 1
        const wx = x + (noise(u * 128 + ox, v * 64 + oy) - 0.5) * 0.9
        const d = Math.sqrt(wx * wx * 1.3 + y * y)
        const fall = sstep(1, 0.1, d)
        const n = noise(u * 512 + ox + 50, v * 128 + oy) * 0.65 + noise(u * 1024 + oy, v * 512 + ox) * 0.35
        const win = sstep(0, 0.12, u) * sstep(1, 0.88, u) * sstep(0, 0.12, v) * sstep(1, 0.88, v)
        c[0] = c[1] = c[2] = 255
        c[3] = fall * sstep(0.28, 0.72, n + fall * 0.2) * win * 255
      })
    },
    { clamp: true }
  )

// Faint mist + speckle for condensation frost (alpha map, linear).
export const frostTex = () =>
  tex(
    'frost',
    512,
    256,
    (g, w, h, r) => {
      paint(g, w, h, (u, v, c) => {
        const n = noise(u * 2048, v * 1024 + 40)
        c[0] = c[1] = c[2] = 16 + n * 30
      })
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.15 + r() * 0.3
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.arc(r() * w, r() * h, 0.4 + r() * 1.2, 0, 7)
        g.fill()
      }
      g.globalAlpha = 1
    },
    { data: true }
  )

// Gulab jamun: dark caramelised khoya with lighter patches and fine pores.
export const gulabTex = () =>
  tex('gulab', 256, 256, (g, w, h, r) => {
    const deep = hex('#3e130a')
    const mid = hex('#6a2610')
    const light = hex('#8e4219')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 512)
      const fine = noise(u * 1024 + 50, v * 1024)
      mix(c, deep, mid, sstep(0.3, 0.6, n))
      over(c, light, sstep(0.62, 0.8, n) * 0.6)
      mul(c, 0.9 + fine * 0.2)
    })
    blobs(g, r, 700, w, h, ['#1e0703', '#a65a2a'], 0.4, 1.3, 0.55)
  })

// Chunky tomato sauce with herbs and cracked pepper.
export const sauceTex = () =>
  tex('sauce', 256, 256, (g, w, h, r) => {
    const deep = hex('#7a160c')
    const red = hex('#b52a17')
    const orange = hex('#d44d26')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 512, v * 512 + 20)
      const chunk = noise(u * 1024 + 8, v * 1024 + 70)
      mix(c, deep, red, sstep(0.3, 0.6, n))
      over(c, orange, sstep(0.6, 0.72, chunk) * 0.8)
    })
    for (let i = 0; i < 120; i++) {
      g.globalAlpha = 0.85
      g.fillStyle = r() > 0.5 ? '#2e3a12' : '#1a1008'
      g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2)
    }
    g.globalAlpha = 1
  })

// Cinnamon bark: fibres run along the stick.
export const barkTex = () =>
  tex('bark', 128, 256, (g, w, h) => {
    const dk = hex('#5a2c12')
    const lt = hex('#a3612f')
    paint(g, w, h, (u, v, c) => {
      const n = noise(u * 2048, v * 256 + 15)
      mix(c, dk, lt, n * 1.6 - 0.3)
    })
  })

/* ---------- geometry helpers ---------- */

/** Adds organic bumpiness to a geometry so it stops looking CG-perfect. */
export function jitter(geo, amp = 0.03, f = 3, seed = 1) {
  const p = geo.attributes.position
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    n.copy(v).normalize()
    const k = Math.sin(v.x * f * 1.7 + seed) * Math.sin(v.y * f * 2.3 + seed * 2) * Math.sin(v.z * f * 1.9 + seed * 3)
    v.addScaledVector(n, k * amp)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

/** Pushes vertices in/out from the origin with fractal noise (lumpy, hand-made surfaces). */
export function displace(geo, amp = 0.03, freq = 1, seed = 0) {
  const p = geo.attributes.position
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    n.copy(v).normalize()
    v.addScaledVector(n, (noise3(v.x + seed, v.y, v.z, freq) - 0.5) * 2 * amp)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

/** Sweeps a varying cross-section along a curve. radius(t), ring(angle, t) -> scale. */
export function sweepGeometry(curve, { steps = 64, radial = 12, radius = () => 0.05, ring = () => 1 } = {}) {
  const frames = curve.computeFrenetFrames(steps, false)
  const pos = new Float32Array((steps + 1) * (radial + 1) * 3)
  const uv = new Float32Array((steps + 1) * (radial + 1) * 2)
  const P = new THREE.Vector3()
  let k = 0
  let q = 0
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    curve.getPointAt(t, P)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    const r = radius(t)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU
      const rr = r * ring(a, t)
      const s = Math.sin(a) * rr
      const c = Math.cos(a) * rr
      pos[k++] = P.x + s * N.x + c * B.x
      pos[k++] = P.y + s * N.y + c * B.y
      pos[k++] = P.z + s * N.z + c * B.z
      uv[q++] = t
      uv[q++] = j / radial
    }
  }
  const idx = []
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setIndex(idx)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.computeVertexNormals()
  return geo
}

/** Adds a per-vertex colour attribute from fn(x, y, z, color, i). */
export function tint(geo, fn) {
  const p = geo.attributes.position
  const col = new Float32Array(p.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c, i)
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}

/** A heap of curved strands (noodles / spaghetti) merged into one geometry. wave > 0 adds instant-noodle crinkle. */
export function nestGeometry({ count = 36, radius = 0.8, height = 0.5, tube = 0.035, seed = 3, wave = 0, waveLen = 0.2, segments = 70, radial = 6 }) {
  const r = rng(seed)
  const geos = []
  const T = new THREE.Vector3()
  const S = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (let s = 0; s < count; s++) {
    const pts = []
    let a = r() * TAU
    const turns = 10 + Math.floor(r() * 6)
    for (let k = 0; k < turns; k++) {
      const rr = radius * (0.15 + 0.85 * Math.sqrt(r()))
      a += 0.6 + r() * 0.9
      const dome = Math.sqrt(Math.max(0, 1 - (rr / radius) ** 2))
      pts.push(new THREE.Vector3(Math.cos(a) * rr, height * dome * (0.25 + 0.75 * r()), Math.sin(a) * rr))
    }
    let curve = new THREE.CatmullRomCurve3(pts)
    if (wave) {
      const n = segments
      const len = curve.getLength()
      const ph = r() * TAU
      const sp = curve.getSpacedPoints(n)
      const out = sp.map((p, k) => {
        curve.getTangentAt(k / n, T)
        S.crossVectors(T, up).normalize()
        const w = ((k / n) * len * TAU) / waveLen + ph
        return p.clone().addScaledVector(S, Math.sin(w) * wave).addScaledVector(up, Math.cos(w * 0.5) * wave * 0.6)
      })
      curve = new THREE.CatmullRomCurve3(out)
    }
    geos.push(new THREE.TubeGeometry(curve, segments, tube * (0.85 + r() * 0.3), radial))
  }
  const geo = mergeGeometries(geos)
  geos.forEach((g) => g.dispose())
  return geo
}
