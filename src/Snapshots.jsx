import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, DepthOfField, ToneMapping, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { DISHES } from './Scene.jsx'
import { StillContext, Shadowed } from './models.jsx'
import { woodTex } from './textures.js'

/*
 * Food-photography studio: renders each menu dish on a wooden table from a few
 * camera angles and hands the images to the menu cards. Real photos in
 * /public/images/items always win; these renders fill the gaps.
 */

const W = 560
const H = 420
export const SHOTS_PER_CATEGORY = 6

const shots = new Map()
const subs = new Set()
let queue = []
let current = null // key being shot right now
let wake = () => {}

// Urgent requests (the open tab) jump the queue; background ones only append what's missing.
export function requestShots(cat, urgent = false) {
  const keys = Array.from({ length: SHOTS_PER_CATEGORY }, (_, i) => `${cat}:${i}`).filter((k) => !shots.has(k) && k !== current)
  if (urgent) queue = [...keys, ...queue.filter((k) => !keys.includes(k))]
  else queue = [...queue, ...keys.filter((k) => !queue.includes(k))]
  wake()
}

export function useShot(key) {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => shots.get(key)
  )
}

// angle / zoom per shot so the six cards of a category don't look identical
const ANGLES = [
  { elev: 0.78, turn: 0.0, zoom: 0.72 },
  { elev: 0.62, turn: 1.1, zoom: 0.6 },
  { elev: 0.92, turn: 2.2, zoom: 0.7 },
  { elev: 0.68, turn: 3.3, zoom: 0.64 },
  { elev: 0.85, turn: 4.3, zoom: 0.58 },
  { elev: 0.6, turn: 5.3, zoom: 0.68 },
]

function Table() {
  const map = useMemo(() => {
    const t = woodTex().clone()
    t.needsUpdate = true
    t.repeat.set(5, 5)
    return t
  }, [])
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial map={map} color="#7a5a42" roughness={0.75} />
    </mesh>
  )
}

function Studio() {
  const { gl, camera, invalidate } = useThree()
  const [job, setJob] = useState(null)
  const jobRef = useRef(null) // job being shot right now (read inside the render loop)
  const mounted = useRef(null) // job whose dish is actually in the scene
  const dish = useRef()
  const frames = useRef(0)
  const dof = useRef()

  const next = () => {
    let k = queue.shift() || null
    while (k && shots.has(k)) k = queue.shift() || null
    current = k
    jobRef.current = k
    frames.current = 0
    setJob(k)
  }

  useLayoutEffect(() => {
    mounted.current = job
    if (job) invalidate()
  }, [job])

  useEffect(() => {
    wake = () => {
      if (!jobRef.current) next()
    }
    wake()
    return () => {
      wake = () => {}
    }
  }, [])

  // priority 2: runs after the effect composer (priority 1), so the canvas holds the finished frame
  useFrame(() => {
    const key = jobRef.current
    if (!key) return
    if (mounted.current !== key || !dish.current) return invalidate()
    frames.current++
    if (frames.current === 1) {
      const sphere = new THREE.Box3().setFromObject(dish.current).getBoundingSphere(new THREE.Sphere())
      const a = ANGLES[Number(key.split(':')[1]) % ANGLES.length]
      const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * a.zoom
      camera.position.set(sphere.center.x, sphere.center.y + Math.sin(a.elev) * dist, sphere.center.z + Math.cos(a.elev) * dist)
      camera.lookAt(sphere.center)
      camera.updateProjectionMatrix()
      if (dof.current?.target) dof.current.target.copy(sphere.center)
    }
    if (frames.current < 4) return invalidate()
    gl.domElement.toBlob(
      (b) => {
        if (!b) return
        shots.set(key, URL.createObjectURL(b))
        subs.forEach((f) => f())
      },
      'image/webp',
      0.86
    )
    next()
    invalidate()
  }, 2)

  const [cat, idx] = job ? job.split(':') : []
  const [Dish, scale] = (cat && DISHES[cat]) || []
  const turn = idx != null ? ANGLES[Number(idx) % ANGLES.length].turn : 0
  return (
    <>
      <color attach="background" args={['#1a110b']} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[-4, 7, -2.5]} intensity={2.6} color="#ffe6c4" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.03}>
        <orthographicCamera attach="shadow-camera" args={[-4, 4, 4, -4, 0.5, 20]} />
      </directionalLight>
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[3, 5, 5]} scale={[8, 5, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffd2a0" position={[-6, 3, -2]} scale={[6, 4, 1]} />
      </Environment>
      <Table />
      {Dish && (
        <Shadowed key={job}>
          <group ref={dish} rotation-y={turn}>
            <Dish scale={scale} />
          </group>
        </Shadowed>
      )}
      <EffectComposer multisampling={0} disableNormalPass>
        <DepthOfField ref={dof} target={[0, 0.5, 0]} worldFocusRange={2.2} bokehScale={3.2} height={420} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    </>
  )
}

export function SnapshotStudio() {
  return (
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: W, height: H, pointerEvents: 'none' }}>
      <Canvas
        frameloop="demand"
        shadows
        dpr={1}
        camera={{ fov: 30, near: 0.1, far: 40 }}
        gl={{ preserveDrawingBuffer: true, antialias: false, toneMapping: THREE.NoToneMapping }}
        style={{ width: W, height: H }}
      >
        <StillContext.Provider value={true}>
          <Studio />
        </StillContext.Provider>
      </Canvas>
    </div>
  )
}
