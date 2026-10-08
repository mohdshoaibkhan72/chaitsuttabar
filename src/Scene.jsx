import React, { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { withRealModel } from './RealModel.jsx'
import { STAGES, store } from './store.js'
import { Kulhad, Samosa, MaggiBowl, Burger, GulabJamun, Pizza, Pasta, Sandwich, ColdCoffee, Drinks, Kettle, Spices, Lantern, Neon, Platform, Tray, Pop, Shadowed } from './models.jsx'

const N = STAGES.length
const smooth = (x) => x * x * (3 - 2 * x)

// Flies the camera along a spline as the page scrolls.
function Rig() {
  const { camera, pointer, size } = useThree()
  const s = useRef(0)
  const { pos, look } = useMemo(() => {
    const offs = [
      [0, 2.8, 9.5],
      [-1, 3, 9.2],
      [1, 2.8, 9.5],
      [-1, 3.2, 9.2],
      [0, 3, 10],
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
    store.focus.set(l.x - shift, 0, l.z)
    camera.position.copy(p)
    camera.lookAt(l)
    camera.fov = aspect < 0.8 ? 62 : 45
    camera.updateProjectionMatrix()
  })
  return null
}

const DARK = { bg: new THREE.Color('#0d0907'), floor: new THREE.Color('#120c08') }
const LIGHT = { bg: new THREE.Color('#f4ece0'), floor: new THREE.Color('#e6d8c4') }

// Smoothly cross-fades background, fog, exposure and lights between the two themes.
function ThemeRig({ theme, lights }) {
  const { scene, gl } = useThree()
  const tmp = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    store.themeT = THREE.MathUtils.damp(store.themeT, theme === 'light' ? 1 : 0, 4, dt)
    const t = store.themeT
    tmp.lerpColors(DARK.bg, LIGHT.bg, t)
    scene.background.copy(tmp)
    scene.fog.color.copy(tmp)
    scene.fog.near = THREE.MathUtils.lerp(16, 22, t)
    scene.fog.far = THREE.MathUtils.lerp(42, 52, t)
    gl.toneMappingExposure = THREE.MathUtils.lerp(1.05, 1.2, t)
    lights.current.ambient.intensity = THREE.MathUtils.lerp(0.35, 0.7, t)
    lights.current.hemi.intensity = THREE.MathUtils.lerp(0.5, 0.9, t)
    lights.current.floor.material.color.lerpColors(DARK.floor, LIGHT.floor, t)
    lights.current.sparkles.visible = t < 0.5
  })
  return null
}

// Single shadow-casting light that follows whichever stage the camera is on.
function Sun() {
  const ref = useRef()
  useFrame(() => {
    const f = store.focus
    ref.current.position.set(f.x + 3.5, 9, f.z + 5)
    ref.current.target.position.copy(f)
    ref.current.target.updateMatrixWorld()
  })
  return (
    <directionalLight ref={ref} intensity={2.4} color="#fff1dc" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} shadow-radius={5}>
      <orthographicCamera attach="shadow-camera" args={[-4.5, 4.5, 4.5, -4.5, 1, 24]} />
    </directionalLight>
  )
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

// scale fits each dish to the platform; every model has its base at y = 0
export const DISHES = {
  chai: [withRealModel('chai', Kulhad), 1.25],
  pizza: [withRealModel('pizza', Pizza), 1.1],
  burgers: [withRealModel('burgers', Burger), 1.15],
  pasta: [withRealModel('pasta', Pasta), 1.15],
  sandwich: [withRealModel('sandwich', Sandwich), 0.95],
  maggi: [withRealModel('maggi', MaggiBowl), 1.05],
  coffee: [withRealModel('coffee', ColdCoffee), 0.95],
  drinks: [withRealModel('drinks', Drinks), 0.88],
  snacks: [withRealModel('snacks', Samosa), 0.9],
  sweets: [withRealModel('sweets', GulabJamun), 1.2],
}
const FLOOR = -1.0

function Stage({ i, children }) {
  return (
    <group position={STAGES[i].center}>
      <Platform />
      <Shadowed>{children}</Shadowed>
    </group>
  )
}

function World({ category, theme }) {
  const [Dish, scale] = DISHES[category] || DISHES.chai
  const lights = useRef({})
  const ring = [DISHES.chai, DISHES.pizza, DISHES.coffee, DISHES.pasta, DISHES.burgers]
  return (
    <>
      <color attach="background" args={[theme === 'light' ? '#f4ece0' : '#0d0907']} />
      <fog attach="fog" args={[theme === 'light' ? '#f4ece0' : '#0d0907', 16, 42]} />
      <ThemeRig theme={theme} lights={lights} />
      <ambientLight ref={(el) => (lights.current.ambient = el)} intensity={0.35} />
      <hemisphereLight ref={(el) => (lights.current.hemi = el)} args={['#ffe8cc', '#2a1a10', 0.5]} />
      <Sun />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[-6, 5, 6]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffd9b0" position={[7, 3, -4]} scale={[8, 4, 1]} />
        <Lightformer form="ring" intensity={2.5} color="#fff4e0" position={[0, 8, 0]} scale={7} rotation-x={Math.PI / 2} />
      </Environment>

      {/* 1 · hero: a ring of everything we serve */}
      <Stage i={0}>
        <Spin speed={0.22}>
          {ring.map(([M, sc], n) => {
            const a = (n / ring.length) * Math.PI * 2
            return (
              <group key={n} position={[Math.cos(a) * 1.75, FLOOR, Math.sin(a) * 1.75]} rotation-y={-a + Math.PI / 2}>
                <M scale={sc * 0.55} />
              </group>
            )
          })}
        </Spin>
        <Lantern position={[-3.6, 3.4, -1]} length={5} phase={0} />
        <Lantern position={[3.8, 3.8, -2]} length={5} phase={2} color="#ffb347" />
      </Stage>

      {/* 2 · story */}
      <Stage i={1}>
        <Spin speed={0.18}>
          <Kettle scale={1.2} position={[0, FLOOR, 0]} />
          <Spices radius={2.4} />
        </Spin>
      </Stage>

      {/* 3 · menu: dish changes with the selected category */}
      <Stage i={2}>
        <Spin speed={0.4}>
          <Pop key={category}>
            <Dish scale={scale} position={[0, FLOOR, 0]} />
          </Pop>
        </Spin>
      </Stage>

      {/* 4 · vibe */}
      <Stage i={3}>
        <Neon position={[0, 2.4, -1.5]} />
        <Spin speed={0.25}>
          <Tray scale={0.9} position={[0, FLOOR, -0.4]} />
        </Spin>
        <Lantern position={[-3.5, 3.2, 1]} length={6} phase={1} color="#ff5c8a" />
        <Lantern position={[3.5, 3.6, 0]} length={6} phase={3} color="#42e8ff" />
        <Lantern position={[0, 4.4, 2.5]} length={6} phase={5} color="#ffb347" />
      </Stage>

      {/* 5 · visit */}
      <Stage i={4}>
        <Spin speed={0.3}>
          <Pizza scale={0.7} position={[0, FLOOR, 0]} />
          {[0, 1, 2, 3, 4].map((n) => {
            const a = (n / 5) * Math.PI * 2
            return <Kulhad key={n} scale={0.5} position={[Math.cos(a) * 2.05, FLOOR, Math.sin(a) * 2.05]} rotation={[0, -a, 0]} />
          })}
        </Spin>
        <Lantern position={[-3, 3.4, 0]} length={5} phase={4} />
        <Lantern position={[3, 3.8, 0]} length={5} phase={6} color="#ffb347" />
      </Stage>

      <group ref={(el) => (lights.current.sparkles = el)}>
        <Sparkles count={180} scale={[40, 14, 90]} position={[0, 2, -32]} size={2.5} speed={0.3} color="#ffd9a0" opacity={0.5} />
      </group>
      <mesh ref={(el) => (lights.current.floor = el)} rotation-x={-Math.PI / 2} position={[0, -1.32, -32]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#120c08" roughness={0.9} />
      </mesh>
    </>
  )
}

// Film-style finishing: glow on lanterns/neon, background blur around the dish, tone mapping.
function Effects({ theme }) {
  const dof = useRef()
  useFrame(() => {
    if (dof.current?.target) dof.current.target.set(store.focus.x, -0.3, store.focus.z)
  })
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      <Bloom mipmapBlur intensity={theme === 'light' ? 0.25 : 0.7} luminanceThreshold={1} luminanceSmoothing={0.15} />
      <DepthOfField ref={dof} target={[0, 0, 0]} focusRange={0.03} focalLength={0.05} bokehScale={2.4} height={480} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.25} darkness={theme === 'light' ? 0.25 : 0.6} />
      <SMAA />
    </EffectComposer>
  )
}

const lowPower = typeof window !== 'undefined' && (window.matchMedia('(max-width: 800px)').matches || window.matchMedia('(pointer: coarse)').matches)

export default function Scene({ category, theme }) {
  return (
    <Canvas
      shadows
      dpr={[1, lowPower ? 1.5 : 1.75]}
      camera={{ fov: 45, near: 0.1, far: 200, position: [0, 2.8, 9.5] }}
      gl={{ antialias: lowPower, powerPreference: 'high-performance', toneMapping: lowPower ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping, toneMappingExposure: 1.05 }}
    >
      <Suspense fallback={null}>
        <Rig />
        <World category={category} theme={theme} />
        {!lowPower && <Effects theme={theme} />}
      </Suspense>
    </Canvas>
  )
}
