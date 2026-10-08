import React, { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { breadTex, crustTex, meatTex, terracottaTex, crispTex, woodTex, toastTex, pizzaTopTex, limeTex, coffeeTex, jitter, nestGeometry, rng } from './textures.js'

const TAU = Math.PI * 2
const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)
const lerp = THREE.MathUtils.lerp

/* ---------- helpers ---------- */

function enableShadows(root) {
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

// Soft rising steam.
export function Steam({ position = [0, 0, 0], count = 7, height = 1.6, spread = 0.25, opacity = 0.13 }) {
  const refs = useRef([])
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ off: i / count, ph: i * 2.1 })), [count])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const m = refs.current[i]
      if (!m) return
      const p = (t * 0.2 + s.off) % 1
      m.position.set(Math.sin(t * 1.1 + s.ph) * spread * p * 1.6, p * height, Math.cos(t * 0.9 + s.ph) * spread * p)
      m.scale.setScalar(0.07 + p * 0.2)
      m.material.opacity = Math.sin(p * Math.PI) * opacity
    })
  })
  return (
    <group position={position}>
      {seeds.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)}>
          <sphereGeometry args={[1, 14, 14]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

const Ceramic = (props) => <meshPhysicalMaterial color="#f6f1e8" roughness={0.18} clearcoat={1} clearcoatRoughness={0.08} {...props} />
const Glass = (props) => <meshPhysicalMaterial color="#ffffff" transmission={1} thickness={0.35} roughness={0.02} ior={1.45} envMapIntensity={1.4} {...props} />

function Ice({ position, rotation, size = 0.3 }) {
  return (
    <RoundedBox args={[size, size, size]} radius={size * 0.16} smoothness={3} position={position} rotation={rotation}>
      <meshPhysicalMaterial color="#ffffff" transmission={1} thickness={0.6} roughness={0.12} ior={1.31} />
    </RoundedBox>
  )
}

function Leaf({ position, rotation = [0, 0, 0], scale = 1, color = '#3c8a2e' }) {
  return (
    <mesh position={position} rotation={rotation} scale={[0.17 * scale, 0.02 * scale, 0.1 * scale]}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshStandardMaterial color={color} roughness={0.45} />
    </mesh>
  )
}

// Tall drinking glass with liquid; children sit in glass-local space.
function Tumbler({ h = 2, rt = 0.62, rb = 0.5, level = 0.78, liquid = {}, children, ice = true }) {
  const glass = useMemo(() => lathe([[0, 0], [rb - 0.05, 0], [rb, 0.03], [rt, h], [rt - 0.045, h], [rb - 0.05, 0.14], [0, 0.14]]), [h, rt, rb])
  const ly = 0.15
  const lh = (h - 0.14) * level
  const rAt = (y) => lerp(rb - 0.05, rt - 0.045, y / h)
  const { color = '#7a4a2a', opacity = 1, useTex = false, emissive } = liquid
  const cubes = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 5 }, (_, i) => ({
      p: [(r() - 0.5) * rb * 0.9, ly + lh * (0.35 + 0.6 * r()), (r() - 0.5) * rb * 0.9],
      rot: [r() * 3, r() * 3, r() * 3],
    }))
  }, [rb, lh])
  return (
    <group>
      <mesh geometry={glass}>
        <Glass />
      </mesh>
      <mesh position={[0, ly + lh / 2, 0]}>
        <cylinderGeometry args={[rAt(ly + lh) * 0.985, rAt(ly) * 0.985, lh, 56]} />
        {useTex ? (
          <>
            <meshPhysicalMaterial attach="material-0" map={coffeeTex()} roughness={0.25} clearcoat={0.6} />
            <meshPhysicalMaterial attach="material-1" color="#e9d2b0" roughness={0.3} />
            <meshPhysicalMaterial attach="material-2" color="#2c160b" />
          </>
        ) : (
          <meshPhysicalMaterial color={color} roughness={0.08} clearcoat={1} emissive={emissive || '#000'} emissiveIntensity={0.35} />
        )}
      </mesh>
      {ice && cubes.map((c, i) => <Ice key={i} position={c.p} rotation={c.rot} />)}
      {children}
    </group>
  )
}

const Straw = ({ h = 2, color = '#e24a3b', tilt = 0.1 }) => (
  <mesh position={[0.05, h * 0.62, 0]} rotation={[0, 0, -tilt]}>
    <cylinderGeometry args={[0.045, 0.045, h * 1.25, 12]} />
    <meshPhysicalMaterial color={color} roughness={0.35} clearcoat={0.8} />
  </mesh>
)

/* ---------- chai ---------- */

export function Kulhad(props) {
  const geo = useMemo(
    () => lathe([[0, 0], [0.34, 0], [0.42, 0.08], [0.62, 0.7], [0.74, 1.15], [0.78, 1.22], [0.72, 1.24], [0.68, 1.18], [0.58, 0.72], [0.36, 0.14], [0, 0.12]]),
    []
  )
  const t = terracottaTex()
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.95, 1, 0.06, 56]} />
        <meshStandardMaterial map={woodTex()} roughness={0.6} />
      </mesh>
      <group position={[0, 0.06, 0]}>
        <mesh geometry={geo}>
          <meshStandardMaterial map={t} bumpMap={t} bumpScale={1.5} roughness={0.88} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.04, 0]}>
          <cylinderGeometry args={[0.64, 0.64, 0.02, 48]} />
          <meshPhysicalMaterial color="#b9783a" roughness={0.12} clearcoat={1} />
        </mesh>
        <mesh position={[0, 1.055, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.4, 0.62, 40]} />
          <meshBasicMaterial color="#e8c9a0" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <Steam position={[0, 1.1, 0]} />
      </group>
      <mesh position={[1.25, 0.07, 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 10]} />
        <meshStandardMaterial color="#8a4a22" roughness={0.7} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[1.0 + i * 0.12, 0.1, 0.9 - i * 0.1]} scale={[1, 0.8, 1]}>
          <sphereGeometry args={[0.1, 14, 12]} />
          <meshStandardMaterial color="#86ad55" roughness={0.6} />
        </mesh>
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

export function Samosa(props) {
  const plate = useMemo(() => lathe([[0, 0], [1.1, 0], [1.5, 0.1], [1.62, 0.2], [1.58, 0.21], [1.45, 0.14], [1.0, 0.07], [0, 0.07]]), [])
  const bowl = useMemo(() => lathe([[0, 0], [0.18, 0], [0.34, 0.2], [0.33, 0.22], [0.17, 0.05], [0, 0.05]], 40), [])
  const geos = useMemo(() => [1, 2, 3].map((s) => jitter(new THREE.TetrahedronGeometry(0.68, 3), 0.035, 6, s)), [])
  const t = crispTex()
  const spots = [
    { p: [-0.5, 0.52, 0.12], r: [0.55, 0.6, 0.0] },
    { p: [0.45, 0.52, 0.28], r: [0.55, -0.5, 0.0] },
    { p: [0.0, 0.52, -0.55], r: [0.55, 2.1, 0.0] },
  ]
  return (
    <group {...props}>
      <mesh geometry={plate}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      {spots.map((s, i) => (
        <mesh key={i} geometry={geos[i]} position={s.p} rotation={s.r}>
          <meshPhysicalMaterial map={t} bumpMap={t} bumpScale={2} roughness={0.55} clearcoat={0.25} />
        </mesh>
      ))}
      <mesh geometry={bowl} position={[1.15, 0.2, 0.55]} scale={1.3}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[1.15, 0.45, 0.55]}>
        <cylinderGeometry args={[0.4, 0.4, 0.02, 28]} />
        <meshPhysicalMaterial color="#3f8f3a" roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh geometry={bowl} position={[-1.1, 0.2, 0.75]} scale={1.1}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-1.1, 0.4, 0.75]}>
        <cylinderGeometry args={[0.32, 0.32, 0.02, 28]} />
        <meshPhysicalMaterial color="#6b2a12" roughness={0.12} clearcoat={1} />
      </mesh>
      <Leaf position={[0.1, 1.05, 0.0]} rotation={[0, 0.5, 0.3]} scale={1.4} />
      <Steam position={[0, 0.9, 0]} count={5} height={1.1} />
    </group>
  )
}

export function GulabJamun(props) {
  const bowl = useMemo(() => lathe([[0, 0], [0.4, 0], [0.8, 0.35], [1.0, 0.75], [1.04, 0.78], [0.98, 0.78], [0.76, 0.4], [0.38, 0.06], [0, 0.06]]), [])
  const pos = [[-0.3, 0.42, 0.15], [0.32, 0.44, 0.2], [0.0, 0.44, -0.38], [0.05, 0.86, 0.0]]
  return (
    <group {...props}>
      <mesh geometry={bowl}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.83, 0.83, 0.02, 48]} />
        <meshPhysicalMaterial color="#c47a22" roughness={0.05} clearcoat={1} transmission={0.2} />
      </mesh>
      {pos.map((p, i) => (
        <mesh key={i} position={p} scale={[1, 0.92, 1]}>
          <sphereGeometry args={[0.36, 40, 40]} />
          <meshPhysicalMaterial color="#5a220e" roughness={0.22} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 2.4) * 0.55, 0.56 + (i % 3) * 0.01, Math.cos(i * 2.4) * 0.55]} rotation={[0, i, 0]}>
          <boxGeometry args={[0.08, 0.02, 0.04]} />
          <meshStandardMaterial color="#8fbf5a" roughness={0.6} />
        </mesh>
      ))}
      <Steam position={[0, 1.2, 0]} count={4} height={1.0} />
    </group>
  )
}

/* ---------- pizza ---------- */

export function Pizza(props) {
  const pepperoni = useMemo(() => {
    const r = rng(5)
    const out = []
    let guard = 0
    while (out.length < 9 && guard++ < 400) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * 0.88
      const p = [Math.cos(a) * d, Math.sin(a) * d]
      if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.4)) out.push(p)
    }
    return out
  }, [])
  const olives = [[0.5, 0.1], [-0.3, 0.55], [-0.2, -0.6], [0.2, -0.3], [-0.65, -0.05]]
  const crust = useMemo(() => jitter(new THREE.TorusGeometry(1.22, 0.14, 24, 96), 0.018, 5, 3), [])
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
      <mesh geometry={crust} position={[0, 0.2, 0]} rotation-x={Math.PI / 2}>
        <meshStandardMaterial map={crustTex()} bumpMap={crustTex()} bumpScale={2} roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.215, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.2, 72]} />
        <meshPhysicalMaterial map={pizzaTopTex()} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} />
      </mesh>
      {pepperoni.map(([x, z], i) => (
        <group key={i} position={[x, 0.235, z]} rotation-y={i}>
          <mesh scale={[1, 0.22, 1]}>
            <sphereGeometry args={[0.2, 24, 12]} />
            <meshPhysicalMaterial color="#a8261a" roughness={0.35} clearcoat={0.7} />
          </mesh>
          {[[0.07, 0.05], [-0.08, 0.02], [0.0, -0.09]].map(([a, b], k) => (
            <mesh key={k} position={[a, 0.045, b]} scale={[1, 0.4, 1]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial color="#e8b890" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {olives.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.245, z]} rotation-x={Math.PI / 2} scale={[1, 1, 0.8]}>
          <torusGeometry args={[0.07, 0.03, 10, 20]} />
          <meshPhysicalMaterial color="#1b1814" roughness={0.3} clearcoat={0.6} />
        </mesh>
      ))}
      {[[0.3, 0.7, 0.2], [-0.6, 0.35, 1.1], [0.75, -0.55, 2.0], [-0.1, -0.1, 0.5], [-0.55, -0.7, 2.6]].map(([x, z, r], i) => (
        <Leaf key={i} position={[x, 0.26, z]} rotation={[0.1, r, 0.1]} scale={1.4} color="#2f8a34" />
      ))}
      <Steam position={[0, 0.3, 0]} count={5} height={1.1} spread={0.5} />
    </group>
  )
}

/* ---------- burger ---------- */

export function Burger(props) {
  const bottom = useMemo(() => jitter(lathe([[0, 0], [0.86, 0], [1.0, 0.07], [1.03, 0.2], [0.99, 0.3], [0, 0.3]]), 0.008, 6, 2), [])
  const top = useMemo(() => jitter(new THREE.SphereGeometry(1, 56, 28, 0, TAU, 0, Math.PI / 2), 0.012, 5, 4), [])
  const patty = useMemo(() => jitter(lathe([[0, 0], [1.0, 0], [1.07, 0.06], [1.08, 0.24], [1.03, 0.32], [0, 0.32]]), 0.02, 7, 5), [])
  const lettuce = useMemo(() => [jitter(new THREE.TorusGeometry(0.98, 0.09, 14, 60), 0.07, 7, 1), jitter(new THREE.TorusGeometry(0.88, 0.08, 14, 60), 0.07, 8, 9)], [])
  const seeds = useMemo(() => {
    const r = rng(9)
    return Array.from({ length: 46 }, () => ({ a: r() * TAU, phi: 0.08 + r() * 1.08, rot: r() * 3 }))
  }, [])
  const bt = breadTex()
  return (
    <group {...props}>
      <mesh geometry={bottom}>
        <meshPhysicalMaterial map={bt} roughness={0.6} />
      </mesh>
      <mesh geometry={patty} position={[0, 0.3, 0]}>
        <meshStandardMaterial map={meatTex()} bumpMap={meatTex()} bumpScale={3} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.66, 0]} rotation-y={0.78}>
        <boxGeometry args={[1.85, 0.03, 1.85]} />
        <meshPhysicalMaterial color="#f7b62b" roughness={0.3} clearcoat={0.5} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.571 + 0.78) * 1.0, 0.58, Math.sin(i * 1.571 + 0.78) * 1.0]} rotation={[Math.sin(i * 1.571 + 0.78) * 0.7, 0, -Math.cos(i * 1.571 + 0.78) * 0.7]}>
          <boxGeometry args={[0.55, 0.03, 0.55]} />
          <meshPhysicalMaterial color="#f7b62b" roughness={0.3} clearcoat={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.76, 0]}>
        <cylinderGeometry args={[0.84, 0.84, 0.08, 48]} />
        <meshPhysicalMaterial color="#c8321f" roughness={0.25} clearcoat={0.9} />
      </mesh>
      {[0.28, 0.0, -0.3].map((x, i) => (
        <mesh key={i} position={[x * 1.2, 0.83, i - 1]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.42 - i * 0.07, 0.025, 8, 36]} />
          <meshStandardMaterial color="#e6c8e0" roughness={0.4} />
        </mesh>
      ))}
      <mesh geometry={lettuce[0]} position={[0, 0.9, 0]} rotation-x={Math.PI / 2} scale={[1, 1, 1.4]}>
        <meshStandardMaterial color="#62ad3a" roughness={0.45} />
      </mesh>
      <mesh geometry={lettuce[1]} position={[0, 0.96, 0]} rotation-x={Math.PI / 2} scale={[1, 1, 1.3]}>
        <meshStandardMaterial color="#79c24a" roughness={0.45} />
      </mesh>
      <group position={[0, 1.0, 0]}>
        <mesh geometry={top} scale={[1.04, 0.76, 1.04]}>
          <meshPhysicalMaterial map={bt} roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} />
        </mesh>
        {seeds.map((s, i) => (
          <mesh
            key={i}
            position={[Math.sin(s.phi) * Math.cos(s.a) * 1.045, Math.cos(s.phi) * 0.78, Math.sin(s.phi) * Math.sin(s.a) * 1.045]}
            rotation={[s.rot, -s.a, s.rot]}
            scale={[1.5, 0.6, 0.8]}
          >
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color="#f6e6c4" roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ---------- pasta ---------- */

export function Pasta(props) {
  const plate = useMemo(() => lathe([[0, 0], [0.95, 0], [1.4, 0.08], [1.72, 0.24], [1.75, 0.27], [1.68, 0.27], [1.4, 0.15], [0.9, 0.11], [0, 0.11]]), [])
  const noodles = useMemo(() => nestGeometry({ count: 44, radius: 0.95, height: 0.7, tube: 0.034, seed: 4 }), [])
  const sauce = useMemo(() => nestGeometry({ count: 14, radius: 0.55, height: 0.35, tube: 0.05, seed: 8 }), [])
  const cheese = useMemo(() => {
    const r = rng(12)
    return Array.from({ length: 26 }, () => ({ a: r() * TAU, d: Math.sqrt(r()) * 0.5, y: 0.5 + r() * 0.15, rot: r() * 3 }))
  }, [])
  return (
    <group {...props}>
      <mesh geometry={plate}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={noodles} position={[0, 0.12, 0]}>
        <meshPhysicalMaterial color="#f6dc8c" roughness={0.38} clearcoat={0.5} emissive="#6b4a10" emissiveIntensity={0.35} />
      </mesh>
      <mesh geometry={sauce} position={[0, 0.5, 0]}>
        <meshPhysicalMaterial color="#b5271a" roughness={0.25} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0.62, 0]} scale={[1, 0.38, 1]}>
        <sphereGeometry args={[0.46, 32, 20]} />
        <meshPhysicalMaterial color="#b02418" roughness={0.18} clearcoat={1} />
      </mesh>
      {cheese.map((c, i) => (
        <mesh key={i} position={[Math.cos(c.a) * c.d, c.y + 0.22, Math.sin(c.a) * c.d]} rotation={[c.rot, c.rot * 2, 0]}>
          <boxGeometry args={[0.07, 0.015, 0.04]} />
          <meshStandardMaterial color="#fbf0d4" roughness={0.6} />
        </mesh>
      ))}
      {[[0.1, 0.78, 0.0], [-0.25, 0.72, 0.1]].map(([x, y, z], i) => (
        <Leaf key={i} position={[x, y, z]} rotation={[0.3, i * 2, 0.3]} scale={1.8} color="#2f8a34" />
      ))}
      {[[0.75, 0.34, 0.45], [-0.7, 0.34, -0.5]].map((p, i) => (
        <mesh key={i} position={[p[0], p[1] - 0.06, p[2]]}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshPhysicalMaterial color="#d3301f" roughness={0.12} clearcoat={1} />
        </mesh>
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
const slab = (s, depth, bevel = 0.03) =>
  new THREE.ExtrudeGeometry(triShape(s), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, steps: 1 })

function SandwichStack() {
  const g = useMemo(
    () => ({
      bread: slab(1, 0.12),
      cheese: slab(0.95, 0.04, 0.012),
      tomato: slab(0.92, 0.05, 0.015),
      lettuce: jitter(slab(1.02, 0.05, 0.02), 0.02, 9, 3),
      cuc: slab(0.9, 0.04, 0.012),
    }),
    []
  )
  const top = useMemo(() => {
    const t = toastTex().clone()
    t.needsUpdate = true
    t.repeat.set(0.5, 0.5)
    t.offset.set(0.5, 0.5)
    return t
  }, [])
  const b = 0.12 + 0.06
  let y = 0
  const layers = [
    ['bread', '#d8a255', 0.12, null],
    ['cheese', '#f7b52c', 0.04, null],
    ['tomato', '#cf3321', 0.05, null],
    ['lettuce', '#62ad3a', 0.05, null],
    ['cuc', '#9bcf6b', 0.04, null],
    ['bread', '#d8a255', 0.12, top],
  ]
  return (
    <group rotation-x={-Math.PI / 2}>
      {layers.map(([k, c, d, map], i) => {
        const z = y
        y += d + 0.03
        return (
          <mesh key={i} geometry={g[k]} position={[0, 0, z]}>
            {map ? <meshPhysicalMaterial map={map} roughness={0.6} /> : k === 'bread' ? <meshPhysicalMaterial map={breadTex()} color="#f1d9b0" roughness={0.65} /> : <meshPhysicalMaterial color={c} roughness={0.35} clearcoat={0.4} />}
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

export function MaggiBowl(props) {
  const bowl = useMemo(() => lathe([[0, 0], [0.5, 0], [0.9, 0.5], [1.18, 1.0], [1.21, 1.06], [1.15, 1.06], [0.87, 0.56], [0.46, 0.08], [0, 0.08]]), [])
  const noodles = useMemo(() => nestGeometry({ count: 52, radius: 0.74, height: 0.75, tube: 0.036, seed: 21 }), [])
  const bits = useMemo(() => {
    const r = rng(22)
    return Array.from({ length: 26 }, (_, i) => {
      const a = r() * TAU
      const d = Math.sqrt(r()) * 0.6
      return { p: [Math.cos(a) * d, 0.7 + (1 - (d / 0.74) ** 2) * 0.55 + r() * 0.05, Math.sin(a) * d], c: ['#e8761f', '#d63a2a', '#3f9b3f', '#f2c33a'][i % 4], rot: [r() * 3, r() * 3, r() * 3] }
    })
  }, [])
  return (
    <group {...props}>
      <mesh geometry={bowl}>
        <Ceramic side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={noodles} position={[0, 0.62, 0]}>
        <meshPhysicalMaterial color="#e9b337" roughness={0.35} clearcoat={0.6} clearcoatRoughness={0.25} />
      </mesh>
      {bits.map((b, i) => (
        <mesh key={i} position={b.p} rotation={b.rot}>
          <boxGeometry args={[0.1, 0.05, 0.1]} />
          <meshPhysicalMaterial color={b.c} roughness={0.35} clearcoat={0.5} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Leaf key={i} position={[Math.cos(i * 1.7) * 0.35, 1.3, Math.sin(i * 1.7) * 0.35]} rotation={[0.2, i * 1.3, 0.2]} scale={1.2} color="#3a9a3e" />
      ))}
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

export function ColdCoffee(props) {
  const H = 2.1
  const drizzle = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const r = 0.42 * (1 - t * 0.85)
      pts.push(new THREE.Vector3(Math.cos(t * TAU * 3) * r, 0.1 + t * 0.52, Math.sin(t * TAU * 3) * r))
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.018, 6)
  }, [])
  const top = 0.15 + (H - 0.14) * 0.8
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.06, 56]} />
        <meshStandardMaterial map={woodTex()} roughness={0.55} />
      </mesh>
      <group position={[0, 0.06, 0]}>
        <Tumbler h={H} rt={0.62} rb={0.5} level={0.8} liquid={{ useTex: true }}>
          <group position={[0, top - 0.02, 0]}>
            {[[0.48, 0.0, 0.2], [0.4, 0.14, 0.18], [0.3, 0.27, 0.16], [0.18, 0.38, 0.13]].map(([r, y, s], i) => (
              <mesh key={i} position={[0, y, 0]} scale={[1, s / r, 1]}>
                <sphereGeometry args={[r, 32, 20]} />
                <meshPhysicalMaterial color="#fff6e6" roughness={0.5} sheen={1} sheenColor="#ffffff" />
              </mesh>
            ))}
            <mesh position={[0, 0.5, 0]}>
              <coneGeometry args={[0.1, 0.2, 20]} />
              <meshPhysicalMaterial color="#fff6e6" roughness={0.5} />
            </mesh>
            <mesh geometry={drizzle}>
              <meshPhysicalMaterial color="#35170a" roughness={0.1} clearcoat={1} />
            </mesh>
          </group>
          <Straw h={H} color="#e8e2d4" tilt={0.12} />
        </Tumbler>
      </group>
    </group>
  )
}

export function Drinks(props) {
  const lime = limeTex('#4f9a2a', '#b9e36a', '#eef5c8')
  const lemon = limeTex('#e6c21e', '#f7e36b', '#fff6c4')
  const H = 1.9
  const mint = [[0.05, 0.1, 0.1, 0.3], [-0.2, 0.05, 0.1, 1.5], [0.2, 0.04, -0.15, 2.4], [-0.05, 0.12, -0.2, 3.4]]
  return (
    <group {...props}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[1.7, 1.7, 0.06, 56]} />
        <meshStandardMaterial map={woodTex()} roughness={0.55} />
      </mesh>
      {/* mojito */}
      <group position={[0.8, 0.06, 0.1]}>
        <Tumbler h={H} rt={0.58} rb={0.46} level={0.82} liquid={{ color: '#7fd45a', emissive: '#4fb040' }}>
          {mint.map(([x, y, z, r], i) => (
            <Leaf key={i} position={[x, H * 0.84 + y, z]} rotation={[0.3, r, 0.35]} scale={2.1} color="#2f9a3a" />
          ))}
          <mesh position={[0.04, H - 0.03, 0.55]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
            <circleGeometry args={[0.42, 40]} />
            <meshStandardMaterial map={lime} side={THREE.DoubleSide} roughness={0.3} />
          </mesh>
          <Straw h={H} color="#e8e2d4" tilt={0.1} />
        </Tumbler>
      </group>
      {/* cola */}
      <group position={[-0.8, 0.06, -0.1]}>
        <Tumbler h={H} rt={0.58} rb={0.46} level={0.82} liquid={{ color: '#2a0f08' }}>
          <mesh position={[-0.05, H - 0.03, 0.55]} rotation={[Math.PI / 2 - 0.15, 0, 0]}>
            <circleGeometry args={[0.4, 40]} />
            <meshStandardMaterial map={lemon} side={THREE.DoubleSide} roughness={0.3} />
          </mesh>
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
      {items.map((it, i) => (
        <mesh key={i} position={[Math.cos(it.a) * radius, it.y, Math.sin(it.a) * radius]} rotation={it.rot}>
          {it.kind === 0 && <cylinderGeometry args={[0.07, 0.07, 0.8, 12]} />}
          {it.kind === 1 && <sphereGeometry args={[0.16, 20, 20]} />}
          {it.kind === 2 && <dodecahedronGeometry args={[0.22, 1]} />}
          <meshStandardMaterial color={it.kind === 0 ? '#8a4a22' : it.kind === 1 ? '#7fae4a' : '#c9a15a'} roughness={0.7} />
        </mesh>
      ))}
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

export function Platform({ radius = 2.7, color = '#f5a623' }) {
  return (
    <group position={[0, -1.15, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.15, 0.3, 80]} />
        <meshPhysicalMaterial color="#d8cfc2" roughness={0.45} metalness={0.05} clearcoat={0.3} />
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
