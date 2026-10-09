import React, { Suspense, memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { withRealModel } from './RealModel.jsx'
import { STAGES, store } from './store.js'
import {
  Kulhad, Samosa, MaggiBowl, Burger, GulabJamun, Pizza,
  Pasta, Sandwich, ColdCoffee, Drinks, Kettle, Spices,
  Lantern, Neon, Platform, Tray, Pop, Shadowed,
} from './models.jsx'

const N = STAGES.length
const smooth = (x) => x * x * (3 - 2 * x)

/* ─────────────────────────────────────────────────────────
   CAMERA RIG — cinematic sweep + mouse parallax + breathing
───────────────────────────────────────────────────────── */
function Rig() {
  const { camera, pointer, size } = useThree()
  const s   = useRef(0)
  const breathT = useRef(0)

  // Camera positions for each section — slightly above & behind each stage center
  const { pos, look } = useMemo(() => {
    const offsets = [
      [0,  2.2, 10.0],   // home  — tighter Z, less side-bleed
      [-1, 2.8, 9.8],    // story
      [1,  2.4, 10.0],   // menu
      [-1, 2.8, 9.6],    // vibe
      [0,  2.4, 10.2],   // visit
    ]
    return {
      pos:  new THREE.CatmullRomCurve3(STAGES.map((st, i) =>
        new THREE.Vector3(st.center[0] + offsets[i][0], st.center[1] + offsets[i][1], st.center[2] + offsets[i][2]))),
      look: new THREE.CatmullRomCurve3(STAGES.map((st) =>
        new THREE.Vector3(st.center[0], st.center[1] + 0.4, st.center[2]))),
    }
  }, [])

  const p = useMemo(() => new THREE.Vector3(), [])
  const l = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    s.current = THREE.MathUtils.damp(s.current, store.stage, 2.6, dt)
    breathT.current += dt

    const t = THREE.MathUtils.clamp(s.current / (N - 1), 0, 1)
    pos.getPoint(t, p)
    look.getPoint(t, l)

    const i    = Math.min(Math.floor(s.current), N - 2)
    const f    = smooth(THREE.MathUtils.clamp(s.current - i, 0, 1))
    const side = THREE.MathUtils.lerp(STAGES[i].side, STAGES[i + 1].side, f)

    const aspect  = size.width / size.height
    const k       = THREE.MathUtils.clamp((aspect - 0.7) / 0.7, 0.15, 1)
    const shift   = side * 2.5 * k

    // Gentle breathing — very subtle so it doesn't distract
    const bx = Math.sin(breathT.current * 0.32) * 0.06
    const by = Math.cos(breathT.current * 0.24) * 0.04

    p.x += shift + pointer.x * 0.45 + bx
    l.x += shift
    p.y += pointer.y * 0.28 + by

    // Portrait: lift camera so object appears in top half
    const portrait = THREE.MathUtils.clamp((0.8 - aspect) / 0.4, 0, 1)
    l.y -= portrait * 2.2

    store.focus.set(l.x - shift, 0, l.z)
    camera.position.copy(p)
    camera.lookAt(l)
    camera.fov = aspect < 0.8 ? 60 : 44
    camera.updateProjectionMatrix()
  })
  return null
}

/* ─────────────────────────────────────────────────────────
   THEME CROSS-FADE (background, fog, exposure, lights)
───────────────────────────────────────────────────────── */
const DARK  = { bg: new THREE.Color('#0D0905'), floor: new THREE.Color('#100906') }
const LIGHT = { bg: new THREE.Color('#FAF5EC'), floor: new THREE.Color('#EDE1CA') }

function ThemeRig({ theme, lights }) {
  const { scene, gl } = useThree()
  const tmp = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    store.themeT = THREE.MathUtils.damp(store.themeT, theme === 'light' ? 1 : 0, 3.5, dt)
    const t = store.themeT
    tmp.lerpColors(DARK.bg, LIGHT.bg, t)
    scene.background.copy(tmp)
    scene.fog.color.copy(tmp)
    scene.fog.near = THREE.MathUtils.lerp(8, 14, t)
    scene.fog.far  = THREE.MathUtils.lerp(22, 30, t)
    gl.toneMappingExposure = THREE.MathUtils.lerp(1.02, 1.20, t)
    if (lights.current.ambient)  lights.current.ambient.intensity  = THREE.MathUtils.lerp(0.12, 0.50, t)
    if (lights.current.hemi)     lights.current.hemi.intensity     = THREE.MathUtils.lerp(0.22, 0.75, t)
    if (lights.current.floor)    lights.current.floor.material.color.lerpColors(DARK.floor, LIGHT.floor, t)
    if (lights.current.sparkles) lights.current.sparkles.visible   = t < 0.5
  })
  return null
}

/* ─────────────────────────────────────────────────────────
   SUN LIGHT — key directional, tracks current stage
───────────────────────────────────────────────────────── */
function Sun() {
  const ref = useRef()
  useFrame(() => {
    const f = store.focus
    ref.current.position.set(f.x + 5, 12, f.z + 7)
    ref.current.target.position.copy(f)
    ref.current.target.updateMatrixWorld()
  })
  return (
    <directionalLight
      ref={ref}
      intensity={3.2}
      color="#fff6e8"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
      shadow-radius={8}
    >
      <orthographicCamera attach="shadow-camera" args={[-6, 6, 6, -6, 0.5, 28]} />
    </directionalLight>
  )
}

/* ─────────────────────────────────────────────────────────
   SPIN — rotate around Y, speed up on scroll
───────────────────────────────────────────────────────── */
function Spin({ children, speed = 0.35, wobble = false, ...props }) {
  const ref = useRef()
  const t   = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    ref.current.rotation.y += dt * speed + store.vel * 0.0018
    if (wobble) {
      ref.current.rotation.x = Math.sin(t.current * 0.45) * 0.025
      ref.current.rotation.z = Math.cos(t.current * 0.32) * 0.018
    }
  })
  return <group ref={ref} {...props}>{children}</group>
}

/* ─────────────────────────────────────────────────────────
   BOB — gentle float up/down
───────────────────────────────────────────────────────── */
function Bob({ children, speed = 0.85, amp = 0.07, phase = 0, ...props }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    ref.current.position.y = Math.sin(clock.elapsedTime * speed + phase) * amp
  })
  return <group ref={ref} {...props}>{children}</group>
}

/* ─────────────────────────────────────────────────────────
   UPLIGHT — warm spot shining UP at the food from under
   This is the most important element for that restaurant look
───────────────────────────────────────────────────────── */
function Uplight({ color = '#ff9a30', intensity = 3.5, distance = 5 }) {
  return (
    <pointLight
      color={color}
      intensity={intensity}
      distance={distance}
      position={[0, -0.8, 0]}
      castShadow={false}
    />
  )
}

/* ─────────────────────────────────────────────────────────
   FIREFLIES — very tiny pinpoint bokeh dots
───────────────────────────────────────────────────────── */
function Fireflies({ count = 10, radius = 3.2, color = '#ffb060' }) {
  const seeds = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      a:     (i / count) * Math.PI * 2,
      r:     radius * (0.5 + Math.random() * 0.5),
      y:     (Math.random() - 0.5) * 2.5,
      speed: 0.10 + Math.random() * 0.16,
      phase: Math.random() * Math.PI * 2,
      sz:    0.004 + Math.random() * 0.006,   // <-- tiny!
    })),
    [count, radius]
  )
  const refs = useRef([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const m = refs.current[i]
      if (!m) return
      const a = s.a + t * s.speed * 0.2
      m.position.set(
        Math.cos(a) * s.r,
        s.y + Math.sin(t * 0.45 + s.phase) * 0.3,
        Math.sin(a) * s.r,
      )
      const flick = 0.4 + Math.sin(t * 2.6 + s.phase) * 0.4
      m.material.opacity = flick * 0.5
      m.scale.setScalar(s.sz)
    })
  })

  return (
    <group>
      {seeds.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)}>
          <sphereGeometry args={[1, 5, 5]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ─────────────────────────────────────────────────────────
   DISH MAP
───────────────────────────────────────────────────────── */
export const DISHES = {
  chai:     [withRealModel('chai',     Kulhad),     1.25],
  pizza:    [withRealModel('pizza',    Pizza),      1.10],
  burgers:  [withRealModel('burgers',  Burger),     1.15],
  pasta:    [withRealModel('pasta',    Pasta),      1.15],
  sandwich: [withRealModel('sandwich', Sandwich),   0.95],
  maggi:    [withRealModel('maggi',    MaggiBowl),  1.05],
  coffee:   [withRealModel('coffee',   ColdCoffee), 0.95],
  drinks:   [withRealModel('drinks',   Drinks),     0.88],
  snacks:   [withRealModel('snacks',   Samosa),     0.90],
  sweets:   [withRealModel('sweets',   GulabJamun), 1.20],
}
const FLOOR = -1.0

/* Stage wrapper — platform + shadow group */
function Stage({ i, children, uplightColor = '#ff9a30' }) {
  return (
    <group position={STAGES[i].center}>
      <Platform />
      {/* Warm uplight from below the platform, key to that dramatic restaurant look */}
      <Uplight color={uplightColor} intensity={4.0} distance={6} />
      <Shadowed>{children}</Shadowed>
    </group>
  )
}

/* ─────────────────────────────────────────────────────────
   WORLD — all scene content
───────────────────────────────────────────────────────── */
// memoized so a category or theme change doesn't re-capture the environment map
const SceneEnv = memo(function SceneEnv() {
  return (
    <Environment resolution={128}>
      <Lightformer form="rect"  intensity={4.5} color="#ffe8cc" position={[-8, 7, 8]}  scale={[14, 8, 1]} />
      <Lightformer form="rect"  intensity={2.2} color="#ffcf90" position={[9,  4, -6]} scale={[10, 5, 1]} />
      <Lightformer form="ring"  intensity={1.8} color="#ffe4b0" position={[0,  10, 0]} scale={7}  rotation-x={Math.PI / 2} />
    </Environment>
  )
})

function World({ category, theme }) {
  const [Dish, scale] = DISHES[category] || DISHES.chai
  const lights = useRef({})
  // Hero ring: chai, pizza, burger, cold coffee, pasta
  const ring = [DISHES.chai, DISHES.pizza, DISHES.burgers, DISHES.coffee, DISHES.pasta]

  return (
    <>
      <color attach="background" args={[theme === 'light' ? '#FAF5EC' : '#0D0905']} />
      <fog   attach="fog"        args={[theme === 'light' ? '#FAF5EC' : '#0D0905', 8, 22]} />

      <ThemeRig theme={theme} lights={lights} />

      {/* Warm ambient — low so key + uplights do the drama */}
      <ambientLight  ref={(el) => (lights.current.ambient = el)} intensity={0.12} />
      <hemisphereLight ref={(el) => (lights.current.hemi = el)} args={['#FFE8C0', '#2A1408', 0.22]} />
      <Sun />

      {/* Studio lighting — warm terracotta key */}
      <SceneEnv />

      <Stage i={0} uplightColor="#C65D2E">
        <Spin speed={0.18} wobble>
          {ring.map(([M, sc], n) => {
            const a = (n / ring.length) * Math.PI * 2
            return (
              <group key={n}
                position={[Math.cos(a) * 1.9, FLOOR, Math.sin(a) * 1.9]}
                rotation-y={-a + Math.PI / 2}
              >
                <Bob speed={0.65 + n * 0.1} amp={0.055} phase={n * 1.25}>
                  <M scale={sc * 0.52} />
                </Bob>
              </group>
            )
          })}
        </Spin>
        <Fireflies count={10} radius={3.6} color="#D4A017" />
        {/* Warm lanterns — terracotta + mustard palette only */}
        <Lantern position={[-3.8, 3.8, -1]} length={5} phase={0} color="#C65D2E" />
        <Lantern position={[ 4.0, 4.2, -2]} length={5} phase={2} color="#D4A017" />
        <Lantern position={[ 0,   5.4,  2]} length={6} phase={4} color="#A0522D" />
      </Stage>

      {/* ── Stage 1 · Story ─── kettle + orbiting spices ──── */}
      <Stage i={1} uplightColor="#A0522D">
        <Bob speed={0.5} amp={0.09}>
          <Spin speed={0.14} wobble>
            <Kettle scale={1.25} position={[0, FLOOR, 0]} />
            <Spices radius={2.45} />
          </Spin>
        </Bob>
        <Fireflies count={8} radius={2.6} color="#D4A017" />
      </Stage>

      {/* ── Stage 2 · Menu ─── selected dish, swaps on tab ── */}
      <Stage i={2} uplightColor="#C65D2E">
        <Spin speed={0.35} wobble>
          <Pop key={category}>
            <Bob speed={0.9} amp={0.08}>
              <Dish scale={scale} position={[0, FLOOR, 0]} />
            </Bob>
          </Pop>
        </Spin>
        <Fireflies count={8} radius={2.2} color="#D4A017" />
      </Stage>

      {/* ── Stage 3 · Vibe ─── warm kettle + lanterns ──────── */}
      <Stage i={3} uplightColor="#C65D2E">
        {/* Warm terracotta-toned neon sign */}
        <Neon position={[0, 2.7, -1.5]} color="#D4A017" />
        <Spin speed={0.2} wobble>
          <Bob speed={0.6} amp={0.06}>
            <Tray scale={0.9} position={[0, FLOOR, -0.4]} />
          </Bob>
        </Spin>
        <Fireflies count={12} radius={4.0} color="#C65D2E" />
        {/* All warm-tone lanterns only */}
        <Lantern position={[-3.6, 3.6,  1]} length={6} phase={1} color="#C65D2E" />
        <Lantern position={[ 3.6, 3.9,  0]} length={6} phase={3} color="#D4A017" />
        <Lantern position={[ 0,   4.8,  3]} length={7} phase={5} color="#A0522D" />
        <Lantern position={[-1.5, 3.3, -2]} length={5} phase={7} color="#8B4513" />
      </Stage>

      {/* ── Stage 4 · Visit ─── kulhad ring ────────────────── */}
      <Stage i={4} uplightColor="#A0522D">
        <Spin speed={0.25} wobble>
          <Bob speed={0.5} amp={0.07}>
            <Pizza scale={0.72} position={[0, FLOOR, 0]} />
          </Bob>
          {[0,1,2,3,4].map((n) => {
            const a = (n / 5) * Math.PI * 2
            return (
              <Bob key={n} speed={0.6 + n * 0.07} amp={0.04} phase={n * 1.4}>
                <Kulhad
                  scale={0.5}
                  position={[Math.cos(a) * 2.1, FLOOR, Math.sin(a) * 2.1]}
                  rotation={[0, -a, 0]}
                />
              </Bob>
            )
          })}
        </Spin>
        <Fireflies count={10} radius={3.3} color="#D4A017" />
        <Lantern position={[-3.2, 3.6, 0]} length={5} phase={4} color="#C65D2E" />
        <Lantern position={[ 3.2, 4.0, 0]} length={5} phase={6} color="#D4A017" />
      </Stage>

      {/* ── Global: sparkle dust + floor plane ─────────────── */}
      <group ref={(el) => (lights.current.sparkles = el)}>
        <Sparkles
          count={180}
          scale={[44, 14, 90]}
          position={[0, 2, -34]}
          size={1.8}
          speed={0.28}
          color="#D4A017"
          opacity={0.45}
        />
      </group>

      <mesh
        ref={(el) => (lights.current.floor = el)}
        rotation-x={-Math.PI / 2}
        position={[0, -1.38, -34]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#100a07" roughness={0.95} metalness={0} />
      </mesh>
    </>
  )
}

/* ─────────────────────────────────────────────────────────
   POST FX — Bloom + DOF + Tone + Vignette
───────────────────────────────────────────────────────── */
const Effects = memo(function Effects({ theme }) {
  const dof = useRef()
  useFrame(() => {
    if (dof.current?.target) dof.current.target.set(store.focus.x, -0.1, store.focus.z)
  })
  return (
    <EffectComposer multisampling={0} disableNormalPass>
      {/* Bloom: only blow out emissive neon/lanterns, not food */}
      <Bloom
        mipmapBlur
        intensity={theme === 'light' ? 0.2 : 0.65}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.04}
        radius={0.45}
      />
      {/* DOF: subtle focus on the platform, mild blur behind */}
      <DepthOfField
        ref={dof}
        target={[0, 0, 0]}
        focusRange={0.06}
        focalLength={0.06}
        bokehScale={0.8}
        height={480}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.28} darkness={theme === 'light' ? 0.22 : 0.60} />
      <SMAA />
    </EffectComposer>
  )
})

/* ─────────────────────────────────────────────────────────
   CANVAS
───────────────────────────────────────────────────────── */
const lowPower = typeof window !== 'undefined' &&
  (window.matchMedia('(max-width: 800px)').matches ||
   window.matchMedia('(pointer: coarse)').matches)

// Tells the page the scene has actually drawn a few frames (used to lift the preloader).
function ReadySignal({ onReady }) {
  const frames = useRef(0)
  const cb = useRef(onReady)
  cb.current = onReady
  useFrame(() => {
    if (frames.current > 3) return
    if (++frames.current === 3) cb.current?.()
  })
  return null
}

// `paused` stops the render loop while an overlay (cart, quick view) covers the scene
export default memo(function Scene({ category, theme, onReady, paused }) {
  return (
    <Canvas
      shadows
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, lowPower ? 1.5 : 2]}
      camera={{ fov: 44, near: 0.1, far: 180, position: [0, 2.2, 10.0] }}
      gl={{
        antialias: lowPower,
        powerPreference: 'high-performance',
        toneMapping: lowPower ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping,
        toneMappingExposure: 1.05,
        alpha: false,
      }}
    >
      <Suspense fallback={null}>
        <Rig />
        <World category={category} theme={theme} />
        {!lowPower && <Effects theme={theme} />}
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  )
})
