import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

const cache = {}
function tex(key, w, h, draw, opts = {}) {
  if (cache[key]) return cache[key]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h, rng(opts.seed || 7))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return (cache[key] = t)
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

export const breadTex = () =>
  tex('bread', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#d99a48'
    g.fillRect(0, 0, w, h)
    blobs(g, r, 260, w, h, ['#c4802f', '#e8b369', '#b86f27'], 10, 46, 0.22)
    blobs(g, r, 1400, w, h, ['#a3601f', '#f0c887'], 1, 3.5, 0.5)
  })

export const crustTex = () =>
  tex('crust', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#dca25d'
    g.fillRect(0, 0, w, h)
    blobs(g, r, 120, w, h, ['#8f4f1f', '#b46f31'], 8, 30, 0.35)
    blobs(g, r, 900, w, h, ['#f3d9a4', '#7a3f16'], 1, 3, 0.4)
  })

export const meatTex = () =>
  tex('meat', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#5a2f18'
    g.fillRect(0, 0, w, h)
    blobs(g, r, 500, w, h, ['#3d1e0d', '#7a4425', '#2c1408'], 4, 16, 0.5)
    blobs(g, r, 1200, w, h, ['#a76a3e', '#20100a'], 1, 3, 0.6)
  })

export const terracottaTex = () =>
  tex('terra', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#b4552b'
    g.fillRect(0, 0, w, h)
    blobs(g, r, 400, w, h, ['#9c4521', '#c8683a', '#8a3a1a'], 4, 26, 0.25)
    blobs(g, r, 1800, w, h, ['#d98a5a', '#6b2c12'], 0.8, 2.4, 0.5)
  })

export const crispTex = () =>
  tex('crisp', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#d6a040'
    g.fillRect(0, 0, w, h)
    blobs(g, r, 220, w, h, ['#eebc58', '#b5701c', '#f6d58a'], 6, 30, 0.35)
    blobs(g, r, 1200, w, h, ['#8a4c10', '#ffe3a0'], 1, 3, 0.5)
  })

export const woodTex = () =>
  tex('wood', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#9a6a3c'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 110; i++) {
      g.globalAlpha = 0.12 + r() * 0.25
      g.strokeStyle = r() > 0.5 ? '#6e4624' : '#bd8c58'
      g.lineWidth = 1 + r() * 4
      const y = r() * h
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 18, w * 0.7, y + (r() - 0.5) * 18, w, y + (r() - 0.5) * 10)
      g.stroke()
    }
    g.globalAlpha = 1
  })

export const toastTex = () =>
  tex('toast', 512, 512, (g, w, h, r) => {
    g.fillStyle = '#dca758'
    g.fillRect(0, 0, w, h)
    blobs(g, r, 200, w, h, ['#c98a3a', '#ecc17a'], 8, 40, 0.25)
    g.save()
    g.translate(w / 2, h / 2)
    g.rotate(Math.PI / 4)
    g.fillStyle = '#6b3512'
    for (let x = -w; x < w; x += 84) {
      g.globalAlpha = 0.78
      g.fillRect(x, -h, 24, h * 2)
    }
    g.restore()
    g.globalAlpha = 1
    blobs(g, r, 900, w, h, ['#8a5420', '#f2d49a'], 1, 2.6, 0.4)
  })

export const pizzaTopTex = () =>
  tex('pizzatop', 1024, 1024, (g, w, h, r) => {
    const R = w / 2
    g.fillStyle = '#b3281a'
    g.fillRect(0, 0, w, h)
    // cheese blobs, leaving a thin sauce ring near the crust
    for (let i = 0; i < 520; i++) {
      const a = r() * 6.283
      const d = Math.sqrt(r()) * R * 0.9
      g.globalAlpha = 0.9
      g.fillStyle = ['#f5d97e', '#f9e6a8', '#eec55a', '#f7dd8c'][Math.floor(r() * 4)]
      g.beginPath()
      g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, 26 + r() * 52, 0, 7)
      g.fill()
    }
    for (let i = 0; i < 160; i++) {
      const a = r() * 6.283
      const d = Math.sqrt(r()) * R * 0.88
      g.globalAlpha = 0.45
      g.fillStyle = ['#c98a2e', '#e0a548', '#b9741f'][Math.floor(r() * 3)]
      g.beginPath()
      g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, 5 + r() * 18, 0, 7)
      g.fill()
    }
    g.globalAlpha = 0.5
    g.strokeStyle = '#b48a34'
    g.lineWidth = 3
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283
      g.beginPath()
      g.moveTo(R, R)
      g.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R)
      g.stroke()
    }
    g.globalAlpha = 1
    // oil sheen
    blobs(g, r, 90, w, h, ['#fff6cf'], 3, 9, 0.5)
  })

export const limeTex = (rind, flesh, pith) =>
  tex('lime' + rind, 512, 512, (g, w) => {
    const c = w / 2
    g.fillStyle = rind
    g.beginPath(); g.arc(c, c, c, 0, 7); g.fill()
    g.fillStyle = pith
    g.beginPath(); g.arc(c, c, c * 0.9, 0, 7); g.fill()
    g.fillStyle = flesh
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283
      g.beginPath()
      g.moveTo(c, c)
      g.arc(c, c, c * 0.85, a + 0.07, a + 6.283 / 9 - 0.07)
      g.closePath()
      g.fill()
    }
  })

export const coffeeTex = () =>
  tex('coffee', 8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#f1dcc0')
    gr.addColorStop(0.3, '#c9996a')
    gr.addColorStop(0.7, '#7a4a2a')
    gr.addColorStop(1, '#2c160b')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
  })

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

/** A heap of curved strands (noodles / spaghetti) merged into one geometry. */
export function nestGeometry({ count = 36, radius = 0.8, height = 0.5, tube = 0.035, seed = 3 }) {
  const r = rng(seed)
  const geos = []
  for (let s = 0; s < count; s++) {
    const pts = []
    let a = r() * 6.283
    const turns = 10 + Math.floor(r() * 6)
    for (let k = 0; k < turns; k++) {
      const rr = radius * (0.15 + 0.85 * Math.sqrt(r()))
      a += 0.6 + r() * 0.9
      const dome = Math.sqrt(Math.max(0, 1 - (rr / radius) ** 2))
      pts.push(new THREE.Vector3(Math.cos(a) * rr, height * dome * (0.25 + 0.75 * r()), Math.sin(a) * rr))
    }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 70, tube * (0.85 + r() * 0.3), 6))
  }
  return mergeGeometries(geos)
}
