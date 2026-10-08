import React, { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sparkles, Float } from '@react-three/drei'
import { STAGES, store } from './store.js'
import { Kulhad, GlassChai, Samosa, MaggiBowl, Burger, GulabJamun, Kettle, Spices, Lantern, Neon, Platform, Tray, Pop } from './models.jsx'

const N = STAGES.length
const smooth = (x) => x * x * (3 - 2 * x)

// Flies the camera along a spline as the page scrolls.
function Rig() {
  const { camera, pointer, size } = useThree()
  const s = useRef(0)
  const { pos, look } = useMemo(() => {
    const offs = [
      [0, 2.6, 11],
      [-1, 2.8, 10.5],
      [1, 2.6, 11],
      [-1, 3, 10.5],
      [0, 2.8, 11.5],
    ]
    return {
      pos: new THREE.CatmullRomCurve3(STAGES.map((st, i) => new THREE.Vector3(st.center[0] + offs[i][0], st.center[1] + offs[i][1], st.center[2] + offs[i][2]))),
      look: new THREE.CatmullRomCurve3(STAGES.map((st) => new THREE.Vector3(st.center[0], st.center[1] + 0.2, st.center[2]))),
    }
  }, [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const l = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    s.current = THREE.MathUtils.damp(s.current, store.stage, 2.6, dt)
    const t = THREE.MathUtils.clamp(s.current / (N - 1), 0, 1)
    pos.getPoint(t, p)
    look.getPoint(t, l)
    // shift framing so the 3D object sits opposite to the page text
    const i = Math.min(Math.floor(s.current), N - 2)
    const f = smooth(s.current - i)
    const side = THREE.MathUtils.lerp(STAGES[i].side, STAGES[i + 1].side, f)
    const aspect = size.width / size.height
    const k = THREE.MathUtils.clamp((aspect - 0.7) / 0.7, 0.15, 1)
    const shift = side * 2.6 * k
    p.x += shift + pointer.x * 0.5
    l.x += shift
    // portrait screens: lift the object into the top half, above the text
    const portrait = THREE.MathUtils.clamp((0.8 - aspect) / 0.4, 0, 1)
    l.y -= portrait * 2.4
    p.y += pointer.y * 0.3
    camera.position.lerp(p, 1)
    camera.lookAt(l)
    camera.fov = aspect < 0.8 ? 62 : 45
    camera.updateProjectionMatrix()
  })
  return null
}

// Spins on its own and speeds up while scrolling.
function Spin({ children, speed = 0.4, ...props }) {
  const ref = useRef()
  useFrame((_, dt) => {
    ref.current.rotation.y += dt * speed + store.vel * 0.0025
  })
  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  )
}

const DISHES = { chai: Kulhad, snacks: Samosa, maggi: MaggiBowl, burgers: Burger, sweets: GulabJamun }

function Stage({ i, children }) {
  return (
    <group position={STAGES[i].center}>
      <Platform />
      {children}
    </group>
  )
}

function World({ category }) {
  const Dish = DISHES[category] || Kulhad
  return (
    <>
      <color attach="background" args={['#0b0604']} />
      <fog attach="fog" args={['#0b0604', 14, 38]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} color="#ffd9a8" />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} color="#ffb66b" position={[-6, 4, 6]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={2} color="#ff6a3d" position={[6, 2, -6]} scale={[8, 4, 1]} />
        <Lightformer form="ring" intensity={4} color="#fff0d0" position={[0, 8, 0]} scale={6} rotation-x={Math.PI / 2} />
      </Environment>

      {/* 1 · hero */}
      <Stage i={0}>
        <Float speed={1.6} rotationIntensity={0.15} floatIntensity={0.6}>
          <Spin speed={0.5}>
            <Kulhad scale={1.15} position={[0, 0.1, 0]} />
          </Spin>
        </Float>
        <Lantern position={[-3.6, 3.4, -1]} length={5} phase={0} />
        <Lantern position={[3.8, 3.8, -2]} length={5} phase={2} color="#ffb347" />
      </Stage>

      {/* 2 · story */}
      <Stage i={1}>
        <Spin speed={0.18}>
          <Float speed={1.2} floatIntensity={0.5}>
            <Kettle scale={1.2} position={[0, -0.75, 0]} />
          </Float>
          <Spices radius={2.6} />
        </Spin>
      </Stage>

      {/* 3 · menu: dish changes with the selected category */}
      <Stage i={2}>
        <Float speed={1.5} floatIntensity={0.5} rotationIntensity={0.1}>
          <Spin speed={0.45}>
            <Pop key={category}>
              <Dish scale={1.25} position={[0, 0.25, 0]} />
            </Pop>
          </Spin>
        </Float>
      </Stage>

      {/* 4 · vibe */}
      <Stage i={3}>
        <Neon position={[0, 2.4, -1.5]} />
        <Float speed={1.3} floatIntensity={0.5}>
          <Spin speed={0.25}>
            <Tray />
          </Spin>
        </Float>
        <Lantern position={[-3.5, 3.2, 1]} length={6} phase={1} color="#ff5c8a" />
        <Lantern position={[3.5, 3.6, 0]} length={6} phase={3} color="#42e8ff" />
        <Lantern position={[0, 4.4, 2.5]} length={6} phase={5} color="#ffb347" />
      </Stage>

      {/* 5 · visit */}
      <Stage i={4}>
        <Spin speed={0.3}>
          {[0, 1, 2, 3, 4].map((n) => {
            const a = (n / 5) * Math.PI * 2
            return <Kulhad key={n} position={[Math.cos(a) * 2.4, 0.1 + Math.sin(n) * 0.1, Math.sin(a) * 2.4]} rotation={[0.15, -a, 0]} />
          })}
        </Spin>
        <Float speed={1.5} floatIntensity={0.7}>
          <Kulhad scale={1.1} position={[0, 0.9, 0]} />
        </Float>
        <Lantern position={[-3, 3.4, 0]} length={5} phase={4} />
        <Lantern position={[3, 3.8, 0]} length={5} phase={6} color="#ffb347" />
      </Stage>

      {/* floating dust / embers through the whole journey */}
      <Sparkles count={260} scale={[40, 14, 90]} position={[0, 2, -32]} size={3} speed={0.35} color="#ffb454" opacity={0.7} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.32, -32]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#100905" roughness={0.9} />
      </mesh>
    </>
  )
}

export default function Scene({ category }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 45, near: 0.1, far: 200, position: [0, 2.6, 11] }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <Suspense fallback={null}>
        <Rig />
        <World category={category} />
      </Suspense>
    </Canvas>
  )
}
