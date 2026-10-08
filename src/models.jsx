import React, { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { store } from './store.js'
import {
  teaTex,
  bunTex,
  bunBaseTex,
  breadTex,
  crustTex,
  meatTex,
  pattyTopTex,
  terracottaTex,
  crispTex,
  crispBumpTex,
  woodTex,
  toastTex,
  pizzaTopTex,
  pizzaBumpTex,
  pepperoniTex,
  tomatoTex,
  limeTex,
  coffeeTex,
  mojitoTex,
  colaTex,
  noiseTex,
  noiseNormalTex,
  mottleTex,
  leafTex,
  puffTex,
  frostTex,
  sauceTex,
  barkTex,
  displace,
  sweepGeometry,
  tint,
  nestGeometry,
  noise3,
  sstep,
  rng,
} from './textures.js'

const TAU = Math.PI * 2
const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
const lerp = THREE.MathUtils.lerp
const once = (fn) => {
  let v
  return () => v || (v = fn())
}

// Lathe through a rounded spline profile, evenly spaced so textures don't stretch.
function smoothLathe(pts, seg = 64, n = 48) {
  const c = new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    'centripetal'
  )
  return new THREE.LatheGeometry(c.getSpacedPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y)), seg)
}

// Top-down uv so round foods (pepperoni) can use a flat photo-like texture.
function planarUV(geo, r) {
  const p = geo.attributes.position
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / (2 * r) + 0.5
    uv[i * 2 + 1] = p.getZ(i) / (2 * r) + 0.5
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

// Lumps a surface along its own normals (keeps tubes and tori round).
function displaceN(geo, amp, freq, seed = 0) {
  const p = geo.attributes.position
  const n = geo.attributes.normal
  for (let i = 0; i < p.count; i++) {
    const k = (noise3(p.getX(i) + seed, p.getY(i), p.getZ(i), freq) - 0.5) * 2 * amp
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k)
  }
  geo.computeVertexNormals()
  return geo
}

/* ---------- helpers ---------- */

export function enableShadows(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    const m = o.material
    const soft = m && (m.transparent || m.transmission > 0 || m.depthWrite === false)
    o.castShadow = !soft
    o.receiveShadow = true
  })
}

// Turns on shadow casting/receiving for everything inside.
export function Shadowed({ children, ...props }) {
  const ref = useRef()
  useLayoutEffect(() => enableShadows(ref.current))
  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  )
}

// Scales a model up from 0 whenever it mounts (used when switching menu dishes).
export function Pop({ children, speed = 5 }) {
  const ref = useRef()
  useLayoutEffect(() => enableShadows(ref.current), [])
  useFrame((_, dt) => {
    ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, 1, speed, dt))
  })
  return (
    <group ref={ref} scale={0.001}>
      {children}
    </group>
  )
}

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()
const ZERO = [0, 0, 0]

// Many copies of one small mesh in a single draw call. items: [{ p, r?: [x, y, z, order?], s?: number | [x, y, z], c? }]
function Scatter({ geometry, material, items, ...props }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const m = ref.current
    items.forEach((it, i) => {
      const r = it.r || ZERO
      dummy.position.fromArray(it.p)
      dummy.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ')
      if (Array.isArray(it.s)) dummy.scale.fromArray(it.s)
      else dummy.scale.setScalar(it.s ?? 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      if (it.c) m.setColorAt(i, tmpColor.set(it.c))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingBox()
    m.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} {...props} />
}

// True inside the photo studio, where animated effects like steam would freeze into blobs.
export const StillContext = createContext(false)

const PUFFS = 3

// Soft rising steam: camera-facing wisps that rise, widen, sway and fade.
export function Steam({ position = [0, 0, 0], count = 7, height = 1.6, spread = 0.25, opacity = 0.13 }) {
  const still = useContext(StillContext)
  const refs = useRef([])
  const seeds = useMemo(() => {
    const r = rng(count * 13 + 5)
    return Array.from({ length: count }, (_, i) => ({
      off: i / count + r() * 0.05,
      ph: r() * TAU,
      sway: 0.6 + r() * 0.8,
      spin: (r() - 0.5) * 1.4,
      w: 0.75 + r() * 0.5,
      side: r() - 0.5,
      map: i % PUFFS,
    }))
  }, [count])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]
      const m = refs.current[i]
      if (!m) continue
      const p = (t * 0.13 + s.off) % 1
      const k = spread * (0.3 + p * 1.4)
      m.position.set(Math.sin(t * 0.8 * s.sway + s.ph + p * 4) * k + s.side * spread * p * 1.5, p * height, Math.cos(t * 0.6 * s.sway + s.ph) * k * 0.7)
      const sc = (0.2 + p * 0.65) * s.w
      m.scale.set(sc, sc * 1.8, 1)
      m.material.rotation = Math.sin(t * 0.5 + s.ph) * 0.3 + s.spin * p
      m.material.opacity = Math.min(1, p * 6) * (1 - p) ** 1.5 * opacity * 3.2
    }
  })
  if (still) return null
  return (
    <group position={position}>
      {seeds.map((s, i) => (
        <sprite key={i} ref={(el) => (refs.current[i] = el)} scale={0.001} center={[0.5, 0.2]}>
          <spriteMaterial map={puffTex(s.map)} color="#fff8ee" transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

const Ceramic = (props) => <meshPhysicalMaterial color="#f6f1e8" roughness={0.18} clearcoat={1} clearcoatRoughness={0.08} {...props} />

/* ---------- shared bits ---------- */

const glassMat = once(
  () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: 0.35, roughness: 0.02, ior: 1.45, envMapIntensity: 1.4, depthWrite: false })
)
// droplets are tiny mirrors added on top: only their glints show, like real condensation
const dropMat = once(
  () =>
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 1,
      roughness: 0.06,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
)
const frostMat = once(
  () => new THREE.MeshStandardMaterial({ color: '#f4f8fb', alphaMap: frostTex(), transparent: true, opacity: 0.5, roughness: 0.45, depthWrite: false })
)
const iceMat = once(
  () =>
    new THREE.MeshPhysicalMaterial({
      color: '#eef7fb',
      transparent: true,
      opacity: 0.38,
      roughness: 0.05,
      clearcoat: 1,
      ior: 1.31,
      envMapIntensity: 1.8,
      depthWrite: false,
      bumpMap: noiseTex(),
      bumpScale: 1.5,
    })
)
const sphereGeo = once(() => new THREE.SphereGeometry(1, 12, 9))
const cubeGeo = once(() => new THREE.BoxGeometry(1, 1, 1))

const iceGeo = once(() => {
  let g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    v.multiplyScalar(lerp(1, 0.6 / v.length(), 0.32))
    p.setXYZ(i, v.x, v.y, v.z)
  }
  return displace(g, 0.025, 1.5, 4)
})

function Ice({ position, rotation, size = 0.3 }) {
  return <mesh geometry={iceGeo()} material={iceMat()} position={position} rotation={rotation} scale={size} />
}

// A real leaf: pointed ovate blade, cupped either side of the midrib and arching to the tip.
const leafGeo = once(() => {
  const S = 16
  const T = 8
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= S; i++) {
    const s = i / S
    const w = Math.sin(Math.PI * s ** 0.8) ** 0.85 * 0.3 * (1 - 0.15 * s)
    for (let j = 0; j <= T; j++) {
      const t = (j / T) * 2 - 1
      const y = -(t * t) * w * 0.35 + Math.abs(t) * w * 0.1 - (s - 0.35) ** 2 * 0.22 + Math.sin(s * 9 + t * 3) * 0.006
      pos.push(s - 0.45, y, t * w)
      uv.push(s, (t + 1) / 2)
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < T; j++) {
      const a = i * (T + 1) + j
      const b = a + T + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setIndex(idx)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
})
const leafMats = {}
const leafMat = (color) =>
  leafMats[color] ||
  (leafMats[color] = new THREE.MeshPhysicalMaterial({
    color,
    map: leafTex(),
    bumpMap: leafTex(),
    bumpScale: 0.8,
    roughness: 0.42,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
    sheen: 0.4,
    sheenColor: '#d8f0b8',
    side: THREE.DoubleSide,
  }))

function Leaf({ position, rotation = [0, 0, 0], scale = 1, color = '#3c8a2e' }) {
  return <mesh geometry={leafGeo()} material={leafMat(color)} position={position} rotation={rotation} scale={0.34 * scale} />
}

/* ---------- glasses ---------- */

const glassCache = new Map()
function glassGeos(h, rt, rb) {
  const k = `${h}|${rt}|${rb}`
  if (!glassCache.has(k)) {
    // outer and inner skins drawn separately so the far wall never paints over the near one
    glassCache.set(k, {
      outer: lathe([[0, 0], [rb - 0.05, 0], [rb - 0.012, 0.008], [rb, 0.03], [rt, h - 0.012], [rt - 0.008, h], [rt - 0.036, h], [rt - 0.045, h - 0.012]]),
      inner: lathe([[rt - 0.045, h - 0.012], [rb - 0.05, 0.14], [0, 0.14]]),
    })
  }
  return glassCache.get(k)
}

// Condensation beads on the outside of a cold glass, from the base up to the liquid line.
function dropletItems(h, rt, rb, top, seed) {
  const r = rng(seed)
  const rOut = (y) => rb + ((rt - rb) * (y - 0.03)) / (h - 0.03)
  const n = Math.round(190 * (top / 1.5) * ((rt + rb) / 1.1))
  const out = []
  for (let i = 0; i < n; i++) {
    const a = r() * TAU
    const y = 0.1 + r() * (top - 0.14)
    const s = 0.008 + r() ** 4 * 0.03
    const run = r() < 0.07
    const sy = run ? s * (3 + r() * 3) : s * (1 + r() * 0.35)
    const R = rOut(y) + s * 0.15
    out.push({ p: [Math.sin(a) * R, y - (run ? sy * 0.6 : 0), Math.cos(a) * R], r: [0, a, 0], s: [s, sy, s * 0.45] })
  }
  return out
}

// Tall drinking glass with liquid; children sit in glass-local space.
function Tumbler({ h = 2, rt = 0.62, rb = 0.5, level = 0.78, liquid = {}, children, ice = true, cold = false }) {
  const glass = glassGeos(h, rt, rb)
  const ly = 0.15
  const lh = (h - 0.14) * level
  const top = ly + lh
  const rAt = (y) => lerp(rb - 0.05, rt - 0.045, y / h)
  const rOut = (y) => rb + ((rt - rb) * (y - 0.03)) / (h - 0.03)
  const { color = '#7a4a2a', map, topColor, useTex = false, emissive } = liquid
  const side = useTex ? coffeeTex() : map
  const cubes = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 4 }, (_, i) => ({
      p: [(r() - 0.5) * rb * 0.8, top - 0.06 + (i % 2) * 0.07, (r() - 0.5) * rb * 0.8],
      rot: [r() * 3, r() * 3, r() * 3],
      size: 0.26 + r() * 0.08,
    }))
  }, [rb, top])
  const drops = useMemo(() => (cold ? dropletItems(h, rt, rb, top, Math.round(h * 100 + rt * 10)) : []), [cold, h, rt, rb, top])
  return (
    <group>
      <mesh geometry={glass.inner} material={glassMat()} />
      <mesh geometry={glass.outer} material={glassMat()} renderOrder={1} />
      <mesh position={[0, ly + lh / 2, 0]}>
        <cylinderGeometry args={[rAt(top) * 0.985, rAt(ly) * 0.985, lh, 56]} />
        {side ? (
          <>
            <meshPhysicalMaterial attach="material-0" map={side} roughness={0.25} clearcoat={0.6} />
            <meshPhysicalMaterial attach="material-1" color={useTex ? '#e9d2b0' : topColor || color} roughness={0.3} clearcoat={0.5} />
            <meshPhysicalMaterial attach="material-2" color="#2c160b" />
          </>
        ) : (
          <meshPhysicalMaterial color={color} roughness={0.08} clearcoat={1} emissive={emissive || '#000'} emissiveIntensity={0.35} />
        )}
      </mesh>
      {ice && cubes.map((c, i) => <Ice key={i} position={c.p} rotation={c.rot} size={c.size} />)}
      {cold && (
        <>
          <Scatter geometry={sphereGeo()} material={dropMat()} items={drops} />
          <mesh position={[0, (0.1 + top) / 2, 0]} material={frostMat()}>
            <cylinderGeometry args={[rOut(top) + 0.004, rOut(0.1) + 0.004, top - 0.1, 48, 1, true]} />
          </mesh>
        </>
      )}
      {children}
    </group>
  )
}

const Straw = ({ h = 2, color = '#e24a3b', tilt = 0.1 }) => (
  <mesh position={[0.05, h * 0.62, 0]} rotation={[0, 0, -tilt]}>
    <cylinderGeometry args={[0.045, 0.045, h * 1.25, 16]} />
    <meshPhysicalMaterial color={color} roughness={0.35} clearcoat={0.8} />
  </mesh>
)

/* ---------- chai ---------- */

// Hand-thrown clay cup: slight wobble, uneven rim, smoky fired base, tea stain inside.
const kulhadGeo = once(() => {
  const n = 64
  const seg = 72
  const g = smoothLathe(
    [[0, 0], [0.34, 0], [0.42, 0.06], [0.62, 0.7], [0.74, 1.15], [0.775, 1.215], [0.745, 1.245], [0.7, 1.2], [0.58, 0.72], [0.36, 0.14], [0, 0.12]],
    seg,
    n
  )
  const p = g.attributes.position
  let jr = 0
  for (let j = 0; j <= n; j++) if (p.getY(j) > p.getY(jr)) jr = j
  const col = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const j = i % (n + 1)
    const a = (Math.floor(i / (n + 1)) / seg) * TAU
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const wob = 1 + 0.012 * Math.sin(a * 3 + 1.3) + 0.007 * Math.sin(a * 5 + y * 3)
    const rim = sstep(1.1, 1.22, y) * (0.5 * Math.sin(a * 2 + 0.4) + 0.3 * Math.sin(a * 5 + 2) + 0.2 * Math.sin(a * 9 + 1)) * 0.024
    p.setXYZ(i, x * wob, y + rim, z * wob)
    const outer = j <= jr
    let k = outer ? lerp(0.45, 1, sstep(0, 0.55, y)) * (0.86 + 0.28 * noise3(x, y, z, 1.2)) : 0.95
    if (!outer && y > 1.02 && y < 1.1) k *= 0.72
    if (y > 1.18) k *= 1.08
    col[i * 3] = k
    col[i * 3 + 1] = k * 0.96
    col[i * 3 + 2] = k * 0.93
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
})

const quillGeo = once(() => {
  const outer = new THREE.CylinderGeometry(0.055, 0.055, 0.9, 20, 1, true, 0.3, TAU * 0.88)
  const inner = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 16, 1, true, 2.2, TAU * 0.8)
  return mergeGeometries([outer, inner])
})
const quillMat = once(() => new THREE.MeshStandardMaterial({ map: barkTex(), bumpMap: barkTex(), bumpScale: 1.5, roughness: 0.85, side: THREE.DoubleSide }))

const podGeo = once(() => {
  const g = smoothLathe([[0, -0.11], [0.03, -0.09], [0.052, -0.04], [0.056, 0.02], [0.045, 0.07], [0.022, 0.1], [0.006, 0.12], [0, 0.125]], 24, 20)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.13 * Math.cos(3 * Math.atan2(p.getX(i), p.getZ(i)))
    p.setX(i, p.getX(i) * k)
    p.setZ(i, p.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
})
const podMat = once(() => new THREE.MeshStandardMaterial({ color: '#a3ad62', map: mottleTex(), bumpMap: noiseTex(), bumpScale: 1, roughness: 0.75 }))

export function Kulhad(props) {
  const t = terracottaTex()
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.95, 1, 0.06, 56]} />
        <meshStandardMaterial map={woodTex()} roughness={0.6} />
      </mesh>
      <group position={[0, 0.06, 0]}>
        <mesh geometry={kulhadGeo()}>
          <meshStandardMaterial map={t} bumpMap={t} bumpScale={1.2} roughness={0.92} vertexColors side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.04, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.672, 56]} />
          <meshPhysicalMaterial map={teaTex()} roughness={0.15} clearcoat={1} clearcoatRoughness={0.05} />
        </mesh>
        <Steam position={[0, 1.1, 0]} />
      </group>
      <mesh geometry={quillGeo()} material={quillMat()} position={[1.25, 0.06, 0.3]} rotation={[0.2, 0, Math.PI / 2]} />
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={podGeo()} material={podMat()} position={[1.0 + i * 0.13, 0.055, 0.9 - i * 0.12]} rotation={[0, i * 1.3 + 0.4, Math.PI / 2]} scale={0.95 + i * 0.05} />
      ))}
    </group>
  )
}

export function GlassChai(props) {
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.95, 0.85, 0.06, 48]} />
        <Ceramic />
      </mesh>
      <group position={[0, 0.06, 0]}>
        <Tumbler h={1.1} rt={0.5} rb={0.38} level={0.82} ice={false} liquid={{ color: '#b9702f' }} />
        <Steam position={[0, 1.0, 0]} count={5} height={1.2} />
      </group>
    </group>
  )
}

/* ---------- snacks & sweets ---------- */

// Puffy triangular pyramid with a crimped seam up one edge.
const samosaGeo = once(() => {
  const n = 40
  const seg = 96
  const body = smoothLathe([[0, 0], [0.4, 0], [0.53, 0.04], [0.58, 0.14], [0.53, 0.34], [0.4, 0.6], [0.23, 0.86], [0.08, 1.02], [0, 1.06]], seg, n)
  const p = body.attributes.position
  for (let i = 0; i < p.count; i++) {
    const a = (Math.floor(i / (n + 1)) / seg) * TAU
    const psi = (a % (TAU / 3)) - Math.PI / 3
    const k = (1 + 0.32 * (1 / Math.cos(psi) - 1)) / 1.13
    const y = p.getY(i)
    p.setXYZ(i, p.getX(i) * k + y * y * 0.07, y, p.getZ(i) * k)
  }
  body.computeVertexNormals()
  displace(body, 0.018, 1.4, 6)
  const uv = body.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2)
  const ridge = []
  for (let j = 2; j < n - 1; j++) ridge.push(new THREE.Vector3(p.getX(j), p.getY(j), p.getZ(j)))
  const seam = sweepGeometry(new THREE.CatmullRomCurve3(ridge), {
    steps: 120,
    radial: 8,
    radius: (t) => 0.026 * (1 + 0.55 * Math.max(0, Math.sin(t * TAU * 15))) * sstep(0, 0.04, t) * sstep(1, 0.93, t),
  })
  return mergeGeometries([body, seam])
})

const chiliGeo = once(() => {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.38, 0, 0.02), new THREE.Vector3(-0.1, 0, -0.05), new THREE.Vector3(0.18, 0, -0.02), new THREE.Vector3(0.38, 0.0, 0.08)])
  return sweepGeometry(curve, { steps: 60, radial: 12, radius: (t) => 0.062 * Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)) ** 0.45 * (1 - t * 0.35) })
})

export function Samosa(props) {
  const plate = useMemo(() => lathe([[0, 0], [1.1, 0], [1.5, 0.1], [1.62, 0.2], [1.58, 0.21], [1.45, 0.14], [1.0, 0.07], [0, 0.07]]), [])
  const bowl = useMemo(() => lathe([[0, 0], [0.18, 0], [0.34, 0.2], [0.33, 0.22], [0.17, 0.05], [0, 0.05]], 40), [])
  const spots = [
    { p: [-0.48, 0.07, 0.12], r: [0, 0.5, 0.0] },
    { p: [0.5, 0.07, 0.22], r: [0, 2.6, 0.0] },
    { p: [0.02, 0.07, -0.55], r: [-0.04, 4.2, 0.05] },
  ]
  return (
    <group {...props}>
      <mesh geometry={plate}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      {spots.map((s, i) => (
        <mesh key={i} geometry={samosaGeo()} position={s.p} rotation={s.r}>
          <meshPhysicalMaterial map={crispTex()} bumpMap={crispBumpTex()} bumpScale={2.5} roughness={0.5} clearcoat={0.3} clearcoatRoughness={0.45} />
        </mesh>
      ))}
      <mesh geometry={bowl} position={[1.15, 0.2, 0.55]} scale={1.3}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[1.15, 0.45, 0.55]}>
        <cylinderGeometry args={[0.4, 0.4, 0.02, 28]} />
        <meshPhysicalMaterial color="#5b8a30" map={mottleTex()} bumpMap={noiseTex()} bumpScale={1.5} roughness={0.3} clearcoat={0.7} />
      </mesh>
      <mesh geometry={bowl} position={[-1.1, 0.2, 0.75]} scale={1.1}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-1.1, 0.4, 0.75]}>
        <cylinderGeometry args={[0.32, 0.32, 0.02, 28]} />
        <meshPhysicalMaterial color="#7a2a10" map={mottleTex()} bumpMap={noiseTex()} bumpScale={1} roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh geometry={chiliGeo()} position={[0.1, 0.13, 0.92]} rotation-y={0.12}>
        <meshPhysicalMaterial color="#3f6e1f" map={mottleTex()} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.25} />
      </mesh>
      <mesh position={[-0.33, 0.125, 0.93]} rotation={[0, 0.1, Math.PI / 2 + 0.2]}>
        <cylinderGeometry args={[0.012, 0.016, 0.12, 8]} />
        <meshStandardMaterial color="#6a7a2a" roughness={0.7} />
      </mesh>
      <Leaf position={[-0.75, 0.1, 0.55]} rotation={[0, 0.9, 0.05]} scale={0.8} color="#3f8f34" />
      <Leaf position={[-0.62, 0.1, 0.68]} rotation={[0, -0.4, 0.05]} scale={0.65} color="#3f8f34" />
      <Steam position={[0, 0.9, 0]} count={5} height={1.1} />
    </group>
  )
}

const jamunGeo = once(() => {
  const deep = new THREE.Color('#3a1209')
  const mid = new THREE.Color('#6a2610')
  const light = new THREE.Color('#94461b')
  const g = displace(new THREE.SphereGeometry(0.36, 48, 36), 0.016, 1.2, 3)
  return tint(g, (x, y, z, c) => {
    const n = noise3(x, y, z, 2.2)
    c.copy(deep).lerp(mid, sstep(0.3, 0.55, n)).lerp(light, sstep(0.58, 0.75, n) * 0.7)
  })
})
const jamunMat = once(() => {
  const nm = noiseNormalTex()
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    clearcoatNormalMap: nm,
    clearcoatNormalScale: new THREE.Vector2(0.8, 0.8),
    sheen: 0.3,
    sheenColor: '#c46a2a',
  })
})
const pistachioMat = once(() => new THREE.MeshStandardMaterial({ roughness: 0.6, map: mottleTex() }))
const saffronGeo = once(() => {
  const r = rng(41)
  const gs = Array.from({ length: 7 }, () => {
    const a = r() * TAU
    const d = 0.2 + r() * 0.55
    const x = Math.cos(a) * d
    const z = Math.sin(a) * d
    const b = r() * TAU
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x + Math.cos(b) * 0.06, 0.01, z + Math.sin(b) * 0.06 + 0.03),
      new THREE.Vector3(x + Math.cos(b) * 0.13, 0, z + Math.sin(b) * 0.1)
    )
    return new THREE.TubeGeometry(c, 10, 0.006, 5)
  })
  return mergeGeometries(gs)
})

export function GulabJamun(props) {
  const bowl = useMemo(() => lathe([[0, 0], [0.4, 0], [0.8, 0.35], [1.0, 0.75], [1.04, 0.78], [0.98, 0.78], [0.76, 0.4], [0.38, 0.06], [0, 0.06]]), [])
  const pos = [[-0.3, 0.42, 0.15], [0.32, 0.44, 0.2], [0.0, 0.44, -0.38], [0.05, 0.86, 0.0]]
  const nuts = useMemo(() => {
    const r = rng(17)
    return Array.from({ length: 16 }, (_, i) => {
      const a = r() * TAU
      const d = 0.25 + r() * 0.5
      const onTop = i < 5
      return {
        p: onTop ? [0.05 + Math.cos(a) * 0.14, 1.19 + r() * 0.02, Math.sin(a) * 0.14] : [Math.cos(a) * d, 0.535, Math.sin(a) * d],
        r: [(r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4],
        s: [0.085, 0.016, 0.032],
        c: ['#7fa651', '#98b866', '#6e9445', '#9a7a72'][i % 4],
      }
    })
  }, [])
  return (
    <group {...props}>
      <mesh geometry={bowl}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.83, 0.83, 0.02, 48]} />
        <meshPhysicalMaterial color="#f2c47e" transmission={0.9} thickness={0.5} attenuationColor="#c27a2e" attenuationDistance={1.1} roughness={0.03} ior={1.45} clearcoat={1} />
      </mesh>
      {pos.map((p, i) => (
        <mesh key={i} geometry={jamunGeo()} material={jamunMat()} position={p} rotation={[i + 0.6, i * 2.1, 0.4]} scale={[1, 0.93, 1]} />
      ))}
      <Scatter geometry={cubeGeo()} material={pistachioMat()} items={nuts} />
      <mesh geometry={saffronGeo()} position={[0, 0.535, 0]}>
        <meshStandardMaterial color="#d8461a" roughness={0.5} />
      </mesh>
      <Steam position={[0, 1.2, 0]} count={4} height={1.0} />
    </group>
  )
}

/* ---------- pizza ---------- */

const pizzaGeo = once(() => ({
  crust: displaceN(new THREE.TorusGeometry(1.22, 0.14, 24, 128), 0.028, 1.6, 3),
  pep: planarUV(lathe([[0, 0], [0.15, 0.004], [0.192, 0.026], [0.2, 0.046], [0.188, 0.056], [0.15, 0.036], [0.07, 0.029], [0, 0.03]], 40), 0.2),
  olive: new THREE.TorusGeometry(0.07, 0.03, 10, 24),
}))
const pepMat = once(
  () =>
    new THREE.MeshPhysicalMaterial({
      map: pepperoniTex(),
      normalMap: noiseNormalTex(),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.34,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      clearcoatNormalMap: noiseNormalTex(),
      clearcoatNormalScale: new THREE.Vector2(0.5, 0.5),
    })
)
const meltMat = once(() => new THREE.MeshPhysicalMaterial({ color: '#f0cf7c', map: mottleTex(), roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }))
const oliveMat = once(() => new THREE.MeshPhysicalMaterial({ color: '#2a1f22', roughness: 0.3, clearcoat: 0.6 }))

export function Pizza(props) {
  const g = pizzaGeo()
  const { pepperoni, olives, melt } = useMemo(() => {
    const r = rng(5)
    const pts = []
    let guard = 0
    while (pts.length < 9 && guard++ < 400) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * 0.88
      const p = [Math.cos(a) * d, Math.sin(a) * d]
      if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.4)) pts.push(p)
    }
    return {
      pepperoni: pts.map(([x, z], i) => ({ p: [x, 0.206, z], r: [(r() - 0.5) * 0.08, i * 1.7, (r() - 0.5) * 0.08], s: 0.92 + r() * 0.16 })),
      olives: [[0.5, 0.1], [-0.3, 0.55], [-0.2, -0.6], [0.2, -0.3], [-0.65, -0.05]].map(([x, z], i) => ({ p: [x, 0.232, z], r: [Math.PI / 2, 0, i], s: [1, 1, 0.75] })),
      melt: Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * TAU + r() * 0.5
        return { p: [Math.cos(a) * 1.11, 0.245, Math.sin(a) * 1.11], r: [0, -a, 0.75, 'YZX'], s: [0.1 + r() * 0.07, 0.022, 0.05 + r() * 0.05] }
      }),
    }
  }, [])
  return (
    <group {...props}>
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[1.75, 1.75, 0.09, 72]} />
        <meshStandardMaterial map={woodTex()} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.28, 1.28, 0.1, 72]} />
        <meshStandardMaterial map={crustTex()} roughness={0.8} />
      </mesh>
      <mesh geometry={g.crust} position={[0, 0.2, 0]} rotation-x={Math.PI / 2}>
        <meshStandardMaterial map={crustTex()} bumpMap={crustTex()} bumpScale={2} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.215, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.2, 72]} />
        <meshPhysicalMaterial map={pizzaTopTex()} bumpMap={pizzaBumpTex()} bumpScale={2.5} roughness={0.38} clearcoat={0.5} clearcoatRoughness={0.3} />
      </mesh>
      <Scatter geometry={sphereGeo()} material={meltMat()} items={melt} />
      <Scatter geometry={g.pep} material={pepMat()} items={pepperoni} />
      <Scatter geometry={g.olive} material={oliveMat()} items={olives} />
      {[[0.3, 0.7, 0.2], [-0.6, 0.35, 1.1], [0.75, -0.55, 2.0], [-0.1, -0.1, 0.5], [-0.55, -0.7, 2.6]].map(([x, z, r], i) => (
        <Leaf key={i} position={[x, 0.25, z]} rotation={[0.05, r, 0.05]} scale={1.3} color="#2c7a30" />
      ))}
      <Steam position={[0, 0.3, 0]} count={5} height={1.1} spread={0.5} />
    </group>
  )
}

/* ---------- burger ---------- */

function lettuceGeo(seed, r0, r1, waves) {
  const g = new THREE.RingGeometry(r0, r1, 256, 7)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const rad = Math.hypot(x, z)
    const a = Math.atan2(z, x)
    const e = (rad - r0) / (r1 - r0)
    const edge = 1 + 0.06 * Math.sin(a * 5 + seed) + 0.04 * Math.sin(a * 11 + seed * 2)
    const rr = r0 + (rad - r0) * edge
    const y = e * e * (0.05 * Math.sin(a * waves + seed) + 0.025 * Math.sin(a * waves * 1.7 + seed * 3)) - e * 0.05
    p.setXYZ(i, (x / rad) * rr, y, (z / rad) * rr)
  }
  const pale = new THREE.Color('#dfe8a8')
  const green = new THREE.Color('#3d7a20')
  tint(g, (x, y, z, c) => {
    const e = sstep(r0, r1, Math.hypot(x, z))
    c.copy(pale).lerp(green, e ** 1.1 * (0.7 + 0.5 * noise3(x, y, z, 2.5))).multiplyScalar(0.85 + 0.25 * noise3(z, x, y, 6))
  })
  g.computeVertexNormals()
  return g
}

const burgerGeo = once(() => {
  const bottom = displace(lathe([[0, 0], [0.5, 0], [0.86, 0], [0.95, 0.025], [1.0, 0.07], [1.025, 0.13], [1.03, 0.2], [1.015, 0.26], [0.99, 0.3], [0.5, 0.3], [0, 0.3]], 72), 0.008, 2, 2)
  const top = displace(new THREE.SphereGeometry(1, 72, 32, 0, TAU, 0, Math.PI / 2), 0.012, 1.5, 4)
  const patty = displace(smoothLathe([[0, 0], [1.0, 0], [1.07, 0.06], [1.085, 0.2], [1.04, 0.31], [0.97, 0.335]], 96, 28), 0.026, 3, 5)
  const pattyTop = new THREE.RingGeometry(0.001, 1.0, 64, 10)
  pattyTop.rotateX(-Math.PI / 2)
  const tp = pattyTop.attributes.position
  for (let i = 0; i < tp.count; i++) tp.setY(i, (noise3(tp.getX(i), 0, tp.getZ(i), 3) - 0.5) * 0.03)
  pattyTop.computeVertexNormals()
  const cheese = new THREE.PlaneGeometry(1.85, 1.85, 44, 44)
  cheese.rotateX(-Math.PI / 2)
  const cp = cheese.attributes.position
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i)
    const z = cp.getZ(i)
    const d = Math.hypot(x, z) || 1e-6
    const e = Math.max(0, d - 1.0)
    const nr = 1.0 + 0.11 * (1 - Math.exp(-e / 0.06))
    const drop = Math.max(0, e - (nr - 1.0)) * 1.05 + e * 0.12
    const k = Math.min(d, nr) / d
    cp.setXYZ(i, x * k, -drop + 0.008 * Math.sin(x * 7) * Math.sin(z * 6), z * k)
  }
  cheese.computeVertexNormals()
  const drip = sweepGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.98, 0.345, 0), new THREE.Vector3(1.07, 0.33, 0), new THREE.Vector3(1.105, 0.25, 0), new THREE.Vector3(1.11, 0.16, 0)]), {
    steps: 40,
    radial: 12,
    radius: (t) => {
      const b = 0.02 + 0.02 * sstep(0.45, 0.85, t)
      return t < 0.85 ? b : b * Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2))
    },
  })
  const seeds = []
  const r = rng(9)
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const nrm = new THREE.Vector3()
  const Y = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 90; i++) {
    const a = r() * TAU
    const phi = Math.acos(1 - r() * 0.62)
    const x = Math.sin(phi) * Math.cos(a) * 1.04
    const y = Math.cos(phi) * 0.76
    const z = Math.sin(phi) * Math.sin(a) * 1.04
    nrm.set(x / 1.08, y / 0.58, z / 1.08).normalize()
    q.setFromUnitVectors(Y, nrm)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, r() * TAU))
    e.setFromQuaternion(q)
    seeds.push({ p: [x * 1.004, y * 1.004 + 0.88, z * 1.004], r: [e.x, e.y, e.z], s: [0.032, 0.009, 0.018], c: r() > 0.85 ? '#e9cf9c' : '#f8ecd2' })
  }
  return { bottom, top, patty, pattyTop, cheese, drip, seeds, lettuce: [lettuceGeo(1, 0.42, 1.14, 15), lettuceGeo(4, 0.36, 1.1, 18)] }
})
const seedMat = once(() => new THREE.MeshStandardMaterial({ roughness: 0.45 }))
const sauceMat = once(() => new THREE.MeshPhysicalMaterial({ color: '#e0812c', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }))
const DRIPS = [0.3, 1.9, 3.5, 4.9].map((a, i) => ({ p: [0, 0.3, 0], r: [0, a, 0], s: [1, 1 - (i % 2) * 0.35, 1] }))

export function Burger(props) {
  const g = burgerGeo()
  return (
    <group {...props}>
      <mesh geometry={g.bottom}>
        <meshPhysicalMaterial map={bunBaseTex()} normalMap={noiseNormalTex()} normalScale={[0.35, 0.35]} roughness={0.7} />
      </mesh>
      <group position={[0, 0.3, 0]}>
        <mesh geometry={g.patty}>
          <meshPhysicalMaterial map={meatTex()} bumpMap={meatTex()} bumpScale={4} roughness={0.62} clearcoat={0.25} clearcoatRoughness={0.5} />
        </mesh>
        <mesh geometry={g.pattyTop} position={[0, 0.33, 0]}>
          <meshStandardMaterial map={pattyTopTex()} bumpMap={meatTex()} bumpScale={2} roughness={0.7} />
        </mesh>
      </group>
      <Scatter geometry={g.drip} material={sauceMat()} items={DRIPS} />
      <mesh geometry={g.cheese} position={[0, 0.655, 0]} rotation-y={0.78}>
        <meshPhysicalMaterial color="#f3a82c" roughness={0.3} clearcoat={0.55} clearcoatRoughness={0.25} side={THREE.DoubleSide} />
      </mesh>
      {[[0.36, 0.13], [-0.33, -0.22]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.69, z]} rotation-y={i * 1.3}>
          <cylinderGeometry args={[0.62, 0.62, 0.05, 48]} />
          <meshPhysicalMaterial attach="material-0" color="#b8261a" roughness={0.25} clearcoat={0.8} />
          <meshPhysicalMaterial attach="material-1" map={tomatoTex()} roughness={0.2} clearcoat={0.9} />
          <meshPhysicalMaterial attach="material-2" map={tomatoTex()} roughness={0.2} />
        </mesh>
      ))}
      {[[0.2, 0.735, -0.15, 0.42], [-0.25, 0.74, 0.25, 0.34]].map(([x, y, z, R], i) => (
        <group key={i} position={[x, y, z]} rotation-x={Math.PI / 2} scale={[1, 1, 0.5]}>
          <mesh>
            <torusGeometry args={[R, 0.02, 8, 48]} />
            <meshPhysicalMaterial color="#9a4a86" roughness={0.3} clearcoat={0.6} />
          </mesh>
          <mesh>
            <torusGeometry args={[R - 0.038, 0.022, 8, 48]} />
            <meshPhysicalMaterial color="#f1e4ef" roughness={0.3} clearcoat={0.6} />
          </mesh>
        </group>
      ))}
      <mesh geometry={g.lettuce[0]} position={[0, 0.79, 0]}>
        <meshPhysicalMaterial vertexColors roughness={0.42} clearcoat={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.lettuce[1]} position={[0, 0.835, 0]} rotation-y={1.1}>
        <meshPhysicalMaterial vertexColors roughness={0.42} clearcoat={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.top} position={[0, 0.88, 0]} scale={[1.04, 0.76, 1.04]}>
        <meshPhysicalMaterial map={bunTex()} bumpMap={noiseTex()} bumpScale={0.6} roughness={0.5} clearcoat={0.45} clearcoatRoughness={0.35} />
      </mesh>
      <Scatter geometry={sphereGeo()} material={seedMat()} items={g.seeds} />
    </group>
  )
}

/* ---------- pasta ---------- */

const pastaGeo = once(() => {
  const noodle = new THREE.Color('#f0cd7c')
  const coat = new THREE.Color('#c9542c')
  const deep = new THREE.Color('#a8321c')
  const coated = (wetness) => (x, y, z, c) => {
    const n = noise3(x, y, z, 2)
    const wet = sstep(0.25, 0.7, wetness(y) + (n - 0.5) * 0.9 - Math.hypot(x, z) * 0.3)
    c.copy(noodle).multiplyScalar(0.88 + n * 0.2).lerp(coat, wet * 0.9).lerp(deep, sstep(0.6, 0.8, noise3(z, y, x, 4)) * wet * 0.5)
  }
  const noodles = tint(nestGeometry({ count: 80, radius: 0.95, height: 0.6, tube: 0.021, seed: 4, radial: 5 }), coated((y) => y / 0.6))
  const sauce = tint(nestGeometry({ count: 20, radius: 0.6, height: 0.28, tube: 0.021, seed: 8, radial: 5 }), coated(() => 0.9))
  const mound = new THREE.SphereGeometry(0.46, 64, 32)
  const mp = mound.attributes.position
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i)
    const z = mp.getZ(i)
    const k = 0.8 + 0.4 * noise3(x * 0.6, 0, z * 0.6, 1.2)
    mp.setXYZ(i, x * k, mp.getY(i) * 0.3 * (0.7 + 0.5 * noise3(z, 1, x, 1.5)), z * k)
  }
  displace(mound, 0.06, 4, 7)
  const flake = displace(new THREE.DodecahedronGeometry(1, 0), 0.25, 3, 2)
  const r = rng(12)
  const flakes = Array.from({ length: 46 }, () => {
    const a = r() * TAU
    const d = Math.sqrt(r()) * 0.65
    return { p: [Math.cos(a) * d, 0.12 + 0.6 * Math.sqrt(Math.max(0, 1 - (d / 0.95) ** 2)) + 0.05, Math.sin(a) * d], r: [r() * 0.6, r() * TAU, r() * 0.6], s: [0.045 + r() * 0.03, 0.009, 0.028 + r() * 0.02] }
  })
  const chunks = Array.from({ length: 14 }, () => {
    const a = r() * TAU
    const d = Math.sqrt(r()) * 0.3
    return { p: [Math.cos(a) * d, 0.83 + (1 - d / 0.38) * 0.04, Math.sin(a) * d], r: [r() * 3, r() * 3, r() * 3], s: 0.025 + r() * 0.02, c: r() > 0.5 ? '#8e1a0e' : '#b0301a' }
  })
  return { noodles, sauce, mound, flake, flakes, chunks }
})
const pastaMat = once(() => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.55, clearcoatRoughness: 0.3 }))
const flakeMat = once(() => new THREE.MeshStandardMaterial({ color: '#f5e8c8', roughness: 0.7 }))

export function Pasta(props) {
  const plate = useMemo(() => lathe([[0, 0], [0.95, 0], [1.4, 0.08], [1.72, 0.24], [1.75, 0.27], [1.68, 0.27], [1.4, 0.15], [0.9, 0.11], [0, 0.11]]), [])
  const g = pastaGeo()
  return (
    <group {...props}>
      <mesh geometry={plate}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.noodles} material={pastaMat()} position={[0, 0.12, 0]} />
      <mesh geometry={g.sauce} material={pastaMat()} position={[0, 0.6, 0]} />
      <mesh geometry={g.mound} position={[0, 0.72, 0]}>
        <meshPhysicalMaterial map={sauceTex()} normalMap={noiseNormalTex()} roughness={0.42} clearcoat={0.55} clearcoatRoughness={0.25} clearcoatNormalMap={noiseNormalTex()} />
      </mesh>
      <Scatter geometry={g.flake} material={veggieMat()} items={g.chunks} />
      <Scatter geometry={g.flake} material={flakeMat()} items={g.flakes} />
      {[[0.12, 0.83, 0.02, 0.3], [-0.22, 0.79, 0.12, 2.2], [0.02, 0.81, -0.2, 4.1]].map(([x, y, z, r], i) => (
        <Leaf key={i} position={[x, y + 0.04, z]} rotation={[0.25, r, 0.2]} scale={1.4} color="#2c7a30" />
      ))}
      {[[0.78, 0.25, 0.45], [-0.72, 0.25, -0.52]].map((p, i) => (
        <group key={i} position={p}>
          <mesh scale={[1, 0.9, 1]}>
            <sphereGeometry args={[0.13, 28, 20]} />
            <meshPhysicalMaterial color="#cf2a18" roughness={0.15} clearcoat={1} clearcoatRoughness={0.05} />
          </mesh>
          <Leaf position={[0, 0.12, 0]} rotation={[0, i * 2, 0]} scale={0.25} color="#4a7a2a" />
        </group>
      ))}
      <Steam position={[0, 0.9, 0]} count={6} height={1.2} spread={0.4} />
    </group>
  )
}

/* ---------- sandwich ---------- */

const triShape = (s) => {
  const sh = new THREE.Shape()
  const a = 1.7 * s
  sh.moveTo(-a / 2, -a / 2)
  sh.lineTo(a / 2, -a / 2)
  sh.lineTo(-a / 2, a / 2)
  sh.closePath()
  return sh
}
const slab = (s, depth, bevel = 0.03, segs = 3) =>
  new THREE.ExtrudeGeometry(triShape(s), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, steps: 1 })

const sandwichGeo = once(() => ({
  bread: displace(slab(1, 0.1, 0.05, 5), 0.012, 2, 1),
  cheese: slab(0.97, 0.03, 0.012),
  tomato: displace(slab(0.94, 0.05, 0.02), 0.02, 3, 5),
  lettuce: displace(slab(1.05, 0.04, 0.02), 0.04, 4, 3),
  cuc: slab(0.92, 0.04, 0.015),
}))
const toastTop = once(() => {
  const t = toastTex().clone()
  t.needsUpdate = true
  t.repeat.set(0.5, 0.5)
  t.offset.set(0.5, 0.5)
  return t
})

function SandwichStack() {
  const g = sandwichGeo()
  let y = 0
  const layers = [
    ['bread', '#d8a255', 0.12, null],
    ['cheese', '#efbd45', 0.03, null],
    ['tomato', '#c23a24', 0.05, null],
    ['lettuce', '#5e9a38', 0.04, null],
    ['cuc', '#a9c47c', 0.04, null],
    ['bread', '#d8a255', 0.12, toastTop()],
  ]
  return (
    <group rotation-x={-Math.PI / 2}>
      {layers.map(([k, c, d, map], i) => {
        const z = y
        y += d + 0.03
        return (
          <mesh key={i} geometry={g[k]} position={[0, 0, z]}>
            {map ? (
              <meshPhysicalMaterial map={map} roughness={0.6} />
            ) : k === 'bread' ? (
              <meshPhysicalMaterial map={breadTex()} color="#f6e3c0" roughness={0.65} />
            ) : (
              <meshPhysicalMaterial color={c} map={mottleTex()} roughness={0.35} clearcoat={0.4} />
            )}
          </mesh>
        )
      })}
    </group>
  )
}

export function Sandwich(props) {
  return (
    <group {...props}>
      <RoundedBox args={[3.6, 0.12, 2.5]} radius={0.05} smoothness={3} position={[0, 0.06, 0]}>
        <meshStandardMaterial map={woodTex()} roughness={0.6} />
      </RoundedBox>
      <group position={[-0.75, 0.12, 0.3]} rotation-y={0.25}>
        <SandwichStack />
      </group>
      <group position={[0.95, 0.12, -0.35]} rotation-y={Math.PI + 0.35}>
        <SandwichStack />
      </group>
      <mesh position={[-0.55, 0.95, 0.1]} rotation={[0, 0, 0.1]}>
        <cylinderGeometry args={[0.012, 0.012, 0.75, 6]} />
        <meshStandardMaterial color="#d9b77e" />
      </mesh>
      <mesh position={[-0.57, 1.33, 0.1]}>
        <sphereGeometry args={[0.085, 16, 16]} />
        <meshPhysicalMaterial color="#6b8e23" roughness={0.2} clearcoat={0.8} />
      </mesh>
    </group>
  )
}

/* ---------- maggi ---------- */

const maggiGeo = once(() => {
  const base = new THREE.Color('#e7ad45')
  const masala = new THREE.Color('#c8732a')
  const light = new THREE.Color('#f3cd72')
  const noodles = tint(nestGeometry({ count: 40, radius: 0.74, height: 0.75, tube: 0.033, seed: 21, wave: 0.028, waveLen: 0.19, segments: 230, radial: 5 }), (x, y, z, c) => {
    const n = noise3(x, y, z, 2.5)
    const m = noise3(x + 9, y, z, 6)
    c.copy(base).lerp(light, sstep(0.55, 0.75, n)).lerp(masala, sstep(0.5, 0.68, m) * 0.75)
  })
  const r = rng(22)
  const spot = () => {
    const a = r() * TAU
    const d = Math.sqrt(r()) * 0.6
    return [Math.cos(a) * d, 0.66 + (1 - (d / 0.74) ** 2) * 0.62 + r() * 0.05, Math.sin(a) * d]
  }
  const peas = Array.from({ length: 16 }, () => ({ p: spot(), s: 0.042 + r() * 0.01, c: r() > 0.5 ? '#6aa33a' : '#5b9230' }))
  const carrots = Array.from({ length: 16 }, () => ({ p: spot(), r: [r() * 3, r() * 3, r() * 3], s: [0.07, 0.05, 0.07], c: r() > 0.5 ? '#e7731c' : '#f08a2a' }))
  const onions = Array.from({ length: 10 }, () => ({ p: spot(), r: [r() * 3, r() * 3, r() * 3], s: [0.07, 0.02, 0.06], c: '#efe2dc' }))
  return { noodles, peas, carrots, onions }
})
const veggieMat = once(() => new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.3 }))
const noodleMat = once(() => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 }))

export function MaggiBowl(props) {
  const bowl = useMemo(() => lathe([[0, 0], [0.5, 0], [0.9, 0.5], [1.18, 1.0], [1.21, 1.06], [1.15, 1.06], [0.87, 0.56], [0.46, 0.08], [0, 0.08]]), [])
  const g = maggiGeo()
  return (
    <group {...props}>
      <mesh geometry={bowl}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.noodles} material={noodleMat()} position={[0, 0.62, 0]} />
      <Scatter geometry={sphereGeo()} material={veggieMat()} items={g.peas} />
      <Scatter geometry={cubeGeo()} material={veggieMat()} items={g.carrots} />
      <Scatter geometry={cubeGeo()} material={veggieMat()} items={g.onions} />
      {Array.from({ length: 9 }, (_, i) => {
        const d = 0.12 + (i % 3) * 0.17
        return <Leaf key={i} position={[Math.cos(i * 2.4) * d, 1.33 - d * 0.25, Math.sin(i * 2.4) * d]} rotation={[0.25, i * 1.3, 0.2]} scale={0.48} color="#3c8f3a" />
      })}
      {[-0.08, 0.1].map((x, i) => (
        <mesh key={i} position={[0.95 + x * 3, 1.55, 0.35 + i * 0.1]} rotation={[0, 0, -0.85 - i * 0.07]}>
          <cylinderGeometry args={[0.025, 0.018, 1.7, 8]} />
          <meshStandardMaterial map={woodTex()} roughness={0.6} />
        </mesh>
      ))}
      <Steam position={[0, 1.2, 0]} count={8} height={1.5} spread={0.4} />
    </group>
  )
}

/* ---------- cold coffee & drinks ---------- */

// Piped whipped cream: a star-tip swirl that tapers to a peak, with chocolate drizzle along its coils.
const creamGeo = once(() => {
  const tubeR = (t) => 0.14 * (1 - t * 0.5) * (1 - sstep(0.86, 1, t))
  const pts = []
  for (let i = 0; i <= 120; i++) {
    const t = i / 120
    const a = t * TAU * 3.1
    const r = 0.36 * (1 - t) ** 0.85
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.06 + t * 0.56, Math.sin(a) * r))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const swirl = sweepGeometry(curve, { steps: 280, radial: 48, radius: tubeR, ring: (a, t) => 1 + 0.16 * Math.cos(8 * a + t * 4) })
  const base = new THREE.SphereGeometry(0.5, 40, 16, 0, TAU, 0, Math.PI / 2)
  base.scale(1, 0.32, 1)
  const P = new THREE.Vector3()
  const line = []
  for (let i = 0; i <= 160; i++) {
    const u = (i / 160) * 0.9
    curve.getPointAt(u, P)
    const k = tubeR(u) * (0.78 + 0.12 * Math.sin(i * 0.9))
    const h = Math.hypot(P.x, P.z) || 1
    line.push(new THREE.Vector3(P.x + (P.x / h) * k, P.y + k, P.z + (P.z / h) * k))
  }
  const drizzle = sweepGeometry(new THREE.CatmullRomCurve3(line), { steps: 220, radial: 6, radius: (t) => 0.016 * (1 - sstep(0.8, 1, t)) + 0.003 })
  return { cream: mergeGeometries([swirl, base]), drizzle }
})
const creamMat = once(() => new THREE.MeshPhysicalMaterial({ color: '#fbf3e6', roughness: 0.62, sheen: 0.6, sheenColor: '#ffffff', bumpMap: noiseTex(), bumpScale: 0.4 }))

export function ColdCoffee(props) {
  const H = 2.1
  const top = 0.15 + (H - 0.14) * 0.8
  const g = creamGeo()
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.06, 56]} />
        <meshStandardMaterial map={woodTex()} roughness={0.55} />
      </mesh>
      <group position={[0, 0.06, 0]}>
        <Tumbler h={H} rt={0.62} rb={0.5} level={0.8} liquid={{ useTex: true }} ice={false} cold>
          <group position={[0, top - 0.02, 0]}>
            <mesh geometry={g.cream} material={creamMat()} />
            <mesh geometry={g.drizzle}>
              <meshPhysicalMaterial color="#35170a" roughness={0.1} clearcoat={1} />
            </mesh>
          </group>
          <Straw h={H} color="#e8e2d4" tilt={0.12} />
        </Tumbler>
      </group>
    </group>
  )
}

function Wheel({ position, rotation, tex, rind }) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[0.36, 0.36, 0.045, 40]} />
      <meshPhysicalMaterial attach="material-0" color={rind} roughness={0.45} clearcoat={0.4} />
      <meshPhysicalMaterial attach="material-1" map={tex} roughness={0.25} clearcoat={0.8} />
      <meshPhysicalMaterial attach="material-2" map={tex} roughness={0.25} clearcoat={0.8} />
    </mesh>
  )
}

export function Drinks(props) {
  const lime = limeTex('#4f9a2a', '#b9e36a', '#eef5c8')
  const lemon = limeTex('#e6c21e', '#f7e36b', '#fff6c4')
  const H = 1.9
  const top = 0.15 + (H - 0.14) * 0.82
  const mint = [[0.05, 0.08, 0.1, 0.3, 0.5], [-0.15, 0.04, 0.12, 1.5, 0.3], [0.18, 0.05, -0.12, 2.4, 0.6], [-0.05, 0.12, -0.16, 3.4, 0.45], [0.0, 0.16, 0.02, 5.0, 0.8]]
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[1.7, 1.7, 0.06, 56]} />
        <meshStandardMaterial map={woodTex()} roughness={0.55} />
      </mesh>
      {/* mojito */}
      <group position={[0.8, 0.06, 0.1]}>
        <Tumbler h={H} rt={0.58} rb={0.46} level={0.82} liquid={{ map: mojitoTex(), topColor: '#e4f0cc' }} cold>
          {mint.map(([x, y, z, r, tilt], i) => (
            <Leaf key={i} position={[x, top + y, z]} rotation={[tilt, r, 0.35]} scale={1.5} color="#2f8a36" />
          ))}
          <Wheel position={[0, H - 0.06, 0.56]} rotation={[0, 0, Math.PI / 2]} tex={lime} rind="#4f9a2a" />
          <Straw h={H} color="#e8e2d4" tilt={0.1} />
        </Tumbler>
      </group>
      {/* cola */}
      <group position={[-0.8, 0.06, -0.1]}>
        <Tumbler h={H} rt={0.58} rb={0.46} level={0.82} liquid={{ map: colaTex(), topColor: '#2a1008' }} cold>
          <mesh position={[0, top + 0.005, 0]} rotation-x={Math.PI / 2} scale={[1, 1, 0.45]}>
            <torusGeometry args={[0.5, 0.022, 8, 56]} />
            <meshStandardMaterial color="#b98d66" roughness={0.85} />
          </mesh>
          <Wheel position={[0.1, H - 0.06, 0.56]} rotation={[0, 0.2, Math.PI / 2]} tex={lemon} rind="#e6c21e" />
          <Straw h={H} color="#d93b3b" tilt={-0.1} />
        </Tumbler>
      </group>
    </group>
  )
}

/* ---------- scenery ---------- */

export function Kettle(props) {
  const body = useMemo(() => lathe([[0, 0], [0.9, 0], [1.1, 0.25], [1.0, 0.9], [0.55, 1.3], [0.4, 1.4], [0, 1.4]]), [])
  return (
    <group {...props}>
      <mesh geometry={body}>
        <meshPhysicalMaterial color="#c9923c" metalness={1} roughness={0.22} clearcoat={0.4} />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.07, 32]} />
        <meshStandardMaterial color="#b07a2c" metalness={1} roughness={0.25} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial color="#3a2415" roughness={0.5} />
      </mesh>
      <mesh position={[1.25, 0.95, 0]} rotation-z={-0.85}>
        <cylinderGeometry args={[0.1, 0.22, 1.1, 24]} />
        <meshStandardMaterial color="#c9923c" metalness={1} roughness={0.22} />
      </mesh>
      <mesh position={[-0.2, 1.05, 0]} rotation-z={0.4}>
        <torusGeometry args={[0.95, 0.07, 14, 48, Math.PI * 1.05]} />
        <meshStandardMaterial color="#3a2415" roughness={0.5} />
      </mesh>
      <Steam position={[1.7, 1.45, 0]} count={7} height={1.5} spread={0.2} />
    </group>
  )
}

const starGeo = once(() => {
  const sh = new THREE.Shape()
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU
    const r = i % 2 ? 0.07 : 0.22
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 })
  g.center()
  return g
})
const SPICE_COL = ['#8a4a22', '#9aa85a', '#6b3a1e']

export function Spices({ radius = 3.2 }) {
  const ref = useRef()
  const items = useMemo(() => {
    const r = rng(31)
    return Array.from({ length: 18 }, (_, i) => ({ a: (i / 18) * TAU, y: Math.sin(i * 1.7) * 0.9, kind: i % 3, rot: [r() * 3, r() * 3, r() * 3] }))
  }, [])
  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.25
  })
  return (
    <group ref={ref}>
      {items.map((it, i) => {
        const at = { position: [Math.cos(it.a) * radius, it.y, Math.sin(it.a) * radius], rotation: it.rot }
        if (it.kind === 0) return <mesh key={i} geometry={quillGeo()} material={quillMat()} {...at} />
        return (
          <mesh key={i} geometry={it.kind === 1 ? podGeo() : starGeo()} scale={it.kind === 1 ? 1.8 : 1} {...at}>
            <meshStandardMaterial color={SPICE_COL[it.kind]} map={mottleTex()} roughness={0.7} />
          </mesh>
        )
      })}
    </group>
  )
}

export function Lantern({ position, color = '#ff9a3c', length = 4, phase = 0 }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + phase) * 0.06
    ref.current.rotation.x = Math.cos(clock.elapsedTime * 0.7 + phase) * 0.04
  })
  return (
    <group position={position}>
      <group ref={ref}>
        <mesh position={[0, length / 2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, length, 6]} />
          <meshBasicMaterial color="#6b5a45" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.34, 24, 24]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
          <cylinderGeometry args={[0.1, 0.15, 0.12, 14]} />
          <meshStandardMaterial color="#2a1a10" metalness={0.8} roughness={0.4} />
        </mesh>
        <pointLight color={color} intensity={3} distance={7} />
      </group>
    </group>
  )
}

export function Neon({ color = '#ff3d81', ...props }) {
  return (
    <group {...props}>
      <mesh>
        <torusGeometry args={[2.1, 0.06, 16, 96]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.7, 0.04, 16, 96]} />
        <meshBasicMaterial color="#42e8ff" toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[2.1, 0.22, 12, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  )
}

const PLAT_DARK = new THREE.Color('#d8cfc2')
const PLAT_LIGHT = new THREE.Color('#3a2c22')

export function Platform({ radius = 2.7, color = '#f5a623' }) {
  const mat = useRef()
  useFrame(() => mat.current.color.lerpColors(PLAT_DARK, PLAT_LIGHT, store.themeT))
  return (
    <group position={[0, -1.15, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.15, 0.3, 80]} />
        <meshPhysicalMaterial ref={mat} color="#d8cfc2" roughness={0.45} metalness={0.05} clearcoat={0.3} />
      </mesh>
      <mesh position={[0, 0.151, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius - 0.12, radius - 0.07, 96]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Tray() {
  const pos = [[-1.1, 0.5], [0, -0.1], [1.1, 0.5], [0, 1.2]]
  return (
    <group>
      <mesh position={[0, 0.0, 0.45]}>
        <cylinderGeometry args={[2, 2, 0.08, 56]} />
        <meshStandardMaterial color="#c9923c" metalness={1} roughness={0.28} />
      </mesh>
      {pos.map(([x, z], i) => (
        <GlassChai key={i} position={[x, 0.04, z]} scale={0.6} />
      ))}
    </group>
  )
}
