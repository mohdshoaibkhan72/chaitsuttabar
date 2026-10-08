import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)

/* ---------- helpers ---------- */

// Scales a model up from 0 whenever it mounts (used when switching menu dishes).
export function Pop({ children, speed = 5 }) {
  const ref = useRef()
  useFrame((_, dt) => {
    const s = ref.current.scale.x
    const n = THREE.MathUtils.damp(s, 1, speed, dt)
    ref.current.scale.setScalar(n)
  })
  return (
    <group ref={ref} scale={0.001}>
      {children}
    </group>
  )
}

// Rises & fades soft spheres to fake steam.
export function Steam({ position = [0, 0, 0], count = 9, height = 1.8, spread = 0.25, color = '#ffffff' }) {
  const refs = useRef([])
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ off: i / count, ph: Math.random() * 6.28 })), [count])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const m = refs.current[i]
      if (!m) return
      const p = (t * 0.22 + s.off) % 1
      m.position.set(Math.sin(t * 1.1 + s.ph) * spread * p * 1.6, p * height, Math.cos(t * 0.9 + s.ph) * spread * p)
      m.scale.setScalar(0.07 + p * 0.2)
      m.material.opacity = Math.sin(p * Math.PI) * 0.16
    })
  })
  return (
    <group position={position}>
      {seeds.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- dishes ---------- */

export function Kulhad(props) {
  const geo = useMemo(
    () => lathe([[0, 0], [0.34, 0], [0.42, 0.08], [0.62, 0.7], [0.74, 1.15], [0.78, 1.22], [0.72, 1.24], [0.68, 1.18], [0.58, 0.72], [0.36, 0.14], [0, 0.12]]),
    []
  )
  const rim = useMemo(() => new THREE.TorusGeometry(0.75, 0.035, 12, 48), [])
  return (
    <group {...props}>
      <group position={[0, -0.6, 0]}>
        <mesh geometry={geo} castShadow>
          <meshStandardMaterial color="#b4532a" roughness={0.85} metalness={0.02} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={rim} position={[0, 1.215, 0]} rotation-x={Math.PI / 2}>
          <meshStandardMaterial color="#a04622" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <cylinderGeometry args={[0.64, 0.64, 0.02, 40]} />
          <meshStandardMaterial color="#c9894a" roughness={0.25} metalness={0.1} />
        </mesh>
        <Steam position={[0, 1.1, 0]} />
      </group>
    </group>
  )
}

export function GlassChai(props) {
  return (
    <group {...props}>
      <mesh position={[0, -0.62, 0]}>
        <cylinderGeometry args={[0.95, 0.85, 0.06, 40]} />
        <meshStandardMaterial color="#efe6d6" roughness={0.3} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.5, 0.38, 1.1, 40, 1, true]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.22} roughness={0.05} metalness={0} side={THREE.DoubleSide} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.46, 0.36, 0.9, 40]} />
        <meshStandardMaterial color="#b9702f" roughness={0.2} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.02, 40]} />
        <meshStandardMaterial color="#e0b078" roughness={0.3} />
      </mesh>
      <Steam position={[0, 0.5, 0]} count={7} height={1.4} />
    </group>
  )
}

export function Samosa(props) {
  const plate = useMemo(() => lathe([[0, 0], [1.2, 0], [1.5, 0.12], [1.55, 0.14], [1.5, 0.1], [1.2, -0.0], [0, 0.0]], 56), [])
  const bowl = useMemo(() => lathe([[0, 0], [0.2, 0], [0.32, 0.18], [0.3, 0.2], [0.18, 0.04], [0, 0.04]], 32), [])
  const spots = [
    { p: [-0.45, 0.65, 0.1], r: [0.3, 0.6, 0.1] },
    { p: [0.5, 0.65, 0.2], r: [-0.2, -0.5, 0.2] },
    { p: [0.0, 0.62, -0.5], r: [0.1, 1.9, -0.1] },
  ]
  return (
    <group {...props} position={[0, -0.7, 0]}>
      <mesh geometry={plate}>
        <meshStandardMaterial color="#f3efe6" roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {spots.map((s, i) => (
        <mesh key={i} position={s.p} rotation={s.r} scale={[1, 0.95, 1]}>
          <tetrahedronGeometry args={[0.62, 1]} />
          <meshStandardMaterial color={i === 1 ? '#c98a2c' : '#d49a3a'} roughness={0.7} flatShading />
        </mesh>
      ))}
      <mesh geometry={bowl} position={[1.25, 0.1, 0.7]} scale={1.4}>
        <meshStandardMaterial color="#ffffff" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[1.25, 0.28, 0.7]}>
        <cylinderGeometry args={[0.36, 0.36, 0.02, 24]} />
        <meshStandardMaterial color="#3d8b3d" roughness={0.3} />
      </mesh>
      <Steam position={[0, 1.1, 0]} count={6} height={1.3} />
    </group>
  )
}

export function MaggiBowl(props) {
  const bowl = useMemo(() => lathe([[0, 0], [0.5, 0], [0.9, 0.5], [1.15, 1.0], [1.18, 1.05], [1.12, 1.05], [0.85, 0.55], [0.46, 0.08], [0, 0.08]], 56), [])
  const noodles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        pos: [(Math.random() - 0.5) * 0.7, 0.78 + Math.random() * 0.22, (Math.random() - 0.5) * 0.7],
        rot: [Math.random() * 3, Math.random() * 3, Math.random() * 3],
        r: 0.22 + Math.random() * 0.4,
        c: i % 5 === 0 ? '#e8a82c' : '#f0c040',
      })),
    []
  )
  const bits = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ p: [(Math.random() - 0.5) * 1.3, 1.0 + Math.random() * 0.15, (Math.random() - 0.5) * 1.3], c: i % 3 === 0 ? '#d63a2a' : i % 3 === 1 ? '#3f9b3f' : '#f2a33a' })),
    []
  )
  return (
    <group {...props} position={[0, -0.75, 0]}>
      <mesh geometry={bowl}>
        <meshStandardMaterial color="#e9e2d2" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <torusGeometry args={[0.9, 0.0, 4, 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {noodles.map((n, i) => (
        <mesh key={i} position={n.pos} rotation={n.rot}>
          <torusGeometry args={[n.r, 0.05, 8, 28]} />
          <meshStandardMaterial color={n.c} roughness={0.5} />
        </mesh>
      ))}
      {bits.map((b, i) => (
        <mesh key={i} position={b.p} rotation={[i, i * 2, i]}>
          <boxGeometry args={[0.13, 0.05, 0.13]} />
          <meshStandardMaterial color={b.c} roughness={0.6} />
        </mesh>
      ))}
      {[-0.06, 0.1].map((x, i) => (
        <mesh key={i} position={[0.8 + x * 3, 1.5, 0.2]} rotation={[0, 0, -0.75 - i * 0.08]}>
          <cylinderGeometry args={[0.025, 0.018, 1.6, 8]} />
          <meshStandardMaterial color="#6b3a1a" roughness={0.7} />
        </mesh>
      ))}
      <Steam position={[0, 1.1, 0]} count={9} height={1.6} spread={0.4} />
    </group>
  )
}

export function Burger(props) {
  const seeds = useMemo(() => Array.from({ length: 22 }, () => [Math.random() * 6.28, Math.random() * 0.7]), [])
  return (
    <group {...props} position={[0, -0.9, 0]}>
      <mesh scale={[1, 0.55, 1]} position={[0, 0.0, 0]}>
        <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#d99a4a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[1, 1, 0.34, 40]} />
        <meshStandardMaterial color="#5b2d14" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.46, 0]} rotation-y={0.78}>
        <boxGeometry args={[2.0, 0.05, 2.0]} />
        <meshStandardMaterial color="#f5b82a" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <torusGeometry args={[0.95, 0.09, 10, 40]} />
        <meshStandardMaterial color="#4aa34a" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.1, 40]} />
        <meshStandardMaterial color="#d33a2a" roughness={0.4} />
      </mesh>
      <group position={[0, 0.78, 0]}>
        <mesh scale={[1.02, 0.85, 1.02]}>
          <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e0a255" roughness={0.55} />
        </mesh>
        {seeds.map(([a, h], i) => {
          const phi = 0.15 + h * 1.1
          const x = Math.sin(phi) * Math.cos(a) * 1.03
          const y = Math.cos(phi) * 0.88
          const z = Math.sin(phi) * Math.sin(a) * 1.03
          return (
            <mesh key={i} position={[x, y, z]} scale={[1, 0.5, 0.6]} rotation={[0, -a, 0]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshStandardMaterial color="#fff2cf" roughness={0.6} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function GulabJamun(props) {
  const bowl = useMemo(() => lathe([[0, 0], [0.4, 0], [0.8, 0.35], [1.0, 0.75], [1.04, 0.78], [0.98, 0.78], [0.76, 0.4], [0.38, 0.06], [0, 0.06]], 56), [])
  const pos = [[-0.3, 0.4, 0.15], [0.32, 0.42, 0.2], [0.0, 0.42, -0.38], [0.05, 0.85, 0.0]]
  return (
    <group {...props} position={[0, -0.6, 0]}>
      <mesh geometry={bowl}>
        <meshStandardMaterial color="#f4ece0" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 0.02, 36]} />
        <meshStandardMaterial color="#c97a24" roughness={0.1} metalness={0.2} />
      </mesh>
      {pos.map((p, i) => (
        <mesh key={i} position={p} scale={[1, 0.92, 1]}>
          <sphereGeometry args={[0.36, 28, 28]} />
          <meshStandardMaterial color="#5c2410" roughness={0.18} metalness={0.15} />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 2.4) * 0.5, 0.52 + (i % 3) * 0.01, Math.cos(i * 2.4) * 0.5]}>
          <boxGeometry args={[0.07, 0.02, 0.05]} />
          <meshStandardMaterial color="#8fbf5a" />
        </mesh>
      ))}
      <Steam position={[0, 1.2, 0]} count={5} height={1.0} />
    </group>
  )
}

/* ---------- scenery ---------- */

export function Kettle(props) {
  const body = useMemo(() => lathe([[0, 0], [0.9, 0], [1.1, 0.25], [1.0, 0.9], [0.55, 1.3], [0.4, 1.4], [0, 1.4]]), [])
  return (
    <group {...props}>
      <mesh geometry={body}>
        <meshStandardMaterial color="#c8903a" metalness={1} roughness={0.28} />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.07, 32]} />
        <meshStandardMaterial color="#b07a2c" metalness={1} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color="#3a2415" roughness={0.6} />
      </mesh>
      <mesh position={[1.25, 0.95, 0]} rotation-z={-0.85}>
        <cylinderGeometry args={[0.1, 0.22, 1.1, 18]} />
        <meshStandardMaterial color="#c8903a" metalness={1} roughness={0.28} />
      </mesh>
      <mesh position={[-0.2, 1.05, 0]} rotation-z={0.4}>
        <torusGeometry args={[0.95, 0.07, 12, 40, Math.PI * 1.05]} />
        <meshStandardMaterial color="#3a2415" roughness={0.6} />
      </mesh>
      <Steam position={[1.7, 1.45, 0]} count={8} height={1.5} spread={0.2} />
    </group>
  )
}

export function Spices({ radius = 3.2 }) {
  const ref = useRef()
  const items = useMemo(() => {
    const arr = []
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      arr.push({ a, y: Math.sin(i * 1.7) * 0.9, kind: i % 3, rot: [Math.random() * 3, Math.random() * 3, Math.random() * 3] })
    }
    return arr
  }, [])
  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.25
  })
  return (
    <group ref={ref}>
      {items.map((it, i) => (
        <mesh key={i} position={[Math.cos(it.a) * radius, it.y, Math.sin(it.a) * radius]} rotation={it.rot}>
          {it.kind === 0 && <cylinderGeometry args={[0.07, 0.07, 0.8, 10]} />}
          {it.kind === 1 && <sphereGeometry args={[0.16, 14, 14]} />}
          {it.kind === 2 && <dodecahedronGeometry args={[0.22]} />}
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
          <sphereGeometry args={[0.38, 20, 20]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.1, 0.16, 0.12, 14]} />
          <meshStandardMaterial color="#2a1a10" metalness={0.8} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <cylinderGeometry args={[0.08, 0.04, 0.1, 14]} />
          <meshStandardMaterial color="#2a1a10" metalness={0.8} roughness={0.4} />
        </mesh>
        <pointLight color={color} intensity={4} distance={7} />
      </group>
    </group>
  )
}

export function Neon({ color = '#ff3d81', ...props }) {
  return (
    <group {...props}>
      <mesh>
        <torusGeometry args={[2.1, 0.06, 16, 80]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.7, 0.04, 16, 80]} />
        <meshBasicMaterial color="#42e8ff" toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[2.1, 0.22, 12, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Platform({ radius = 2.7, color = '#f5a623' }) {
  return (
    <group position={[0, -1.15, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.15, 0.3, 64]} />
        <meshStandardMaterial color="#1c120d" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius - 0.18, radius - 0.1, 80]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Tray() {
  // little tray of cutting-chai glasses for the ambience scene
  const pos = [[-1.1, 0, 0.5], [0, 0, -0.1], [1.1, 0, 0.5], [0, 0, 1.2], [-0.55, 0, 0.45], [0.55, 0, 0.45]]
  return (
    <group>
      <mesh position={[0, -0.4, 0.45]}>
        <cylinderGeometry args={[2, 2, 0.08, 48]} />
        <meshStandardMaterial color="#c8903a" metalness={1} roughness={0.3} />
      </mesh>
      {pos.slice(0, 4).map((p, i) => (
        <GlassChai key={i} position={p} scale={0.6} />
      ))}
    </group>
  )
}
