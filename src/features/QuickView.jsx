import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { DISHES } from '../Scene.jsx'
import { Shadowed } from '../models.jsx'
import { woodTex } from '../textures.js'
import { useShot, requestShots, SHOTS_PER_CATEGORY } from '../Snapshots.jsx'

const BASE = import.meta.env.BASE_URL
const slug = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const CLOSE_MS = 260

/* ---------- page scroll lock ---------- */

let locks = 0
let saved = null

function lockScroll() {
  if (locks++ > 0) return
  const html = document.documentElement
  const body = document.body
  const gap = window.innerWidth - html.clientWidth
  saved = { overflow: body.style.overflow, gutter: html.style.scrollbarGutter, x: window.scrollX, y: window.scrollY }
  if (gap > 0) html.style.scrollbarGutter = 'stable' // keeps the layout (and the 3D canvas) from jumping
  body.style.overflow = 'hidden'
}

function unlockScroll() {
  if (locks === 0 || --locks > 0) return
  document.body.style.overflow = saved.overflow
  document.documentElement.style.scrollbarGutter = saved.gutter
  if (window.scrollX !== saved.x || window.scrollY !== saved.y) window.scrollTo(saved.x, saved.y)
  saved = null
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)

/* ---------- 3D studio ---------- */

const TURNS = [0, 1.1, 2.2, 3.3, 4.3, 5.3] // same turns as the menu-card renders, so the dish opens facing the same way
const HOME_PHI = 0.98 // camera angle from straight above: a classic three-quarter food shot
const MIN_PHI = 0.18
const MAX_PHI = Math.PI / 2 - 0.1 // never dips below the table
const BOARD_T = 0.16
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

const _box = new THREE.Box3()
const _m = new THREE.Matrix4()
const _inv = new THREE.Matrix4()

// Bounds of the dish in `space`'s local coordinates. Sprites (steam) are skipped, and so is
// anything still fully faded out on the first frame.
function measure(root, space) {
  const box = new THREE.Box3()
  space.updateWorldMatrix(true, true)
  _inv.copy(space.matrixWorld).invert()
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    if (mat && mat.transparent && mat.opacity === 0) return
    if (o.isInstancedMesh) {
      if (!o.boundingBox) o.computeBoundingBox()
      _box.copy(o.boundingBox)
    } else {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      _box.copy(o.geometry.boundingBox)
    }
    box.union(_box.applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld)))
  })
  return box
}

// Round oiled-wood serving board; its top sits just under y = 0 where every dish rests.
function Board({ radius }) {
  const wood = useMemo(() => {
    const t = woodTex().clone()
    t.needsUpdate = true
    t.repeat.set(1.3, 1.3)
    return t
  }, [])
  return (
    <mesh position-y={-BOARD_T / 2 - 0.003} scale={[radius, 1, radius]} receiveShadow>
      <cylinderGeometry args={[1, 0.97, BOARD_T, 96, 1]} />
      <meshStandardMaterial attach="material-0" map={wood} color="#56463a" roughness={0.75} />
      <meshPhysicalMaterial attach="material-1" map={wood} color="#8f8274" roughness={0.6} clearcoat={0.25} clearcoatRoughness={0.5} />
      <meshStandardMaterial attach="material-2" color="#3b2516" roughness={0.9} />
    </mesh>
  )
}

function Studio({ Dish, scale, turn, api, reduced, onReady, onTouch }) {
  const camera = useThree((st) => st.camera)
  const controls = useRef()
  const pop = useRef()
  const dish = useRef()
  const [board, setBoard] = useState(0)
  const [s] = useState(() => ({ home: null, goal: null, busy: false, idle: -1e9, sph: new THREE.Spherical(), v: new THREE.Vector3() }))
  const cb = useRef({ onReady, onTouch })
  cb.current = { onReady, onTouch }

  const current = () => {
    s.v.copy(camera.position).sub(controls.current.target)
    const sph = new THREE.Spherical().setFromVector3(s.v)
    return { radius: sph.radius, theta: sph.theta, phi: sph.phi }
  }

  useEffect(() => {
    const ready = () => controls.current && s.home
    api.current = {
      rotate(dTheta, dPhi) {
        if (!ready()) return
        const g = s.goal || current()
        s.goal = { radius: g.radius, theta: g.theta + dTheta, phi: THREE.MathUtils.clamp(g.phi + dPhi, MIN_PHI, MAX_PHI), speed: 8 }
        s.idle = performance.now()
      },
      zoom(k) {
        if (!ready()) return
        const g = s.goal || current()
        const c = controls.current
        s.goal = { ...g, radius: THREE.MathUtils.clamp(g.radius * k, c.minDistance, c.maxDistance), speed: 8 }
        s.idle = performance.now()
      },
      reset() {
        if (!ready()) return
        s.goal = { ...s.home, speed: 4 }
        s.idle = performance.now()
      },
    }
    return () => {
      api.current = null
    }
  }, [])

  // Fit the camera to the dish once it is in the scene, then fly in.
  const frame = (ctl) => {
    const box = measure(dish.current, pop.current)
    if (box.isEmpty()) box.set(new THREE.Vector3(-1.4, 0, -1.4), new THREE.Vector3(1.4, 1.5, 1.4))
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const foot = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)
    const boardR = THREE.MathUtils.clamp(foot * 1.08 + 0.2, 1.3, 3.2)
    const vfov = THREE.MathUtils.degToRad(camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
    ctl.target.set(sphere.center.x, sphere.center.y * 0.85, sphere.center.z)
    // the board's rim sits below the target, so measure it from there
    const reach = Math.max(sphere.radius * 0.9, Math.hypot(boardR, ctl.target.y) * 1.04)
    const radius = reach / Math.sin(Math.min(vfov, hfov) / 2)
    ctl.minDistance = radius * 0.5
    ctl.maxDistance = radius * 1.75
    s.home = { radius, theta: 0, phi: HOME_PHI }
    if (reduced) s.sph.set(radius, HOME_PHI, 0)
    else {
      s.sph.set(radius * 1.5, Math.max(MIN_PHI, HOME_PHI - 0.4), -0.9)
      s.goal = { ...s.home, speed: 2.4 }
    }
    s.v.setFromSpherical(s.sph)
    camera.position.copy(ctl.target).add(s.v)
    setBoard(boardR)
    cb.current.onReady?.()
  }

  // runs before OrbitControls.update (priority -1), which then clamps and aims the camera
  useFrame((_, delta) => {
    const ctl = controls.current
    if (!ctl || !dish.current || !pop.current) return
    if (!s.home) return frame(ctl)
    const dt = Math.min(delta, 0.1)
    const p = pop.current.scale.x
    if (p < 1) pop.current.scale.setScalar(p > 0.998 ? 1 : THREE.MathUtils.damp(p, 1, 5, dt))
    if (s.busy) return
    s.v.copy(camera.position).sub(ctl.target)
    s.sph.setFromVector3(s.v)
    const g = s.goal
    if (g) {
      const k = reduced ? 1 : 1 - Math.exp(-g.speed * dt)
      const dTheta = wrap(g.theta - s.sph.theta)
      const dPhi = g.phi - s.sph.phi
      const dR = g.radius - s.sph.radius
      s.sph.theta += dTheta * k
      s.sph.phi += dPhi * k
      s.sph.radius += dR * k
      if (Math.abs(dTheta) < 1e-3 && Math.abs(dPhi) < 1e-3 && Math.abs(dR) < 1e-3) s.goal = null
    } else if (!reduced && performance.now() - s.idle > 2600) {
      s.sph.theta += dt * 0.2 // slow turntable once nobody is touching it
    } else return
    s.sph.makeSafe()
    s.v.setFromSpherical(s.sph)
    camera.position.copy(ctl.target).add(s.v)
  }, -2)

  const onStart = useCallback(() => {
    s.busy = true
    s.goal = null
    cb.current.onTouch?.()
  }, [])
  const onEnd = useCallback(() => {
    s.busy = false
    s.idle = performance.now()
  }, [])

  return (
    <>
      <ambientLight intensity={0.22} />
      <directionalLight position={[3.2, 6.5, 3.8]} intensity={2.4} color="#fff0dc" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.03}>
        <orthographicCamera attach="shadow-camera" args={[-3.6, 3.6, 3.6, -3.6, 0.5, 20]} />
      </directionalLight>
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} color="#fff6ea" position={[0, 5, 5]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffcf9a" position={[-6, 2.5, -3]} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#dfe8ff" position={[6, 2, 1]} scale={[4, 3, 1]} />
        <Lightformer form="ring" intensity={2} color="#fff4e0" position={[0, 7, 0]} scale={5} rotation-x={Math.PI / 2} />
      </Environment>

      <Board radius={board || 2.2} />
      {board > 0 && <ContactShadows position={[0, -BOARD_T - 0.01, 0]} scale={board * 2 + 4} blur={3.5} far={2} opacity={0.4} resolution={256} frames={1} color="#2a160a" />}

      <group ref={pop} scale={reduced ? 1 : 0.001}>
        <group ref={dish} rotation-y={turn}>
          <Shadowed>
            <Dish scale={scale} />
          </Shadowed>
        </group>
      </group>

      <OrbitControls
        ref={controls}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.6}
        minPolarAngle={MIN_PHI}
        maxPolarAngle={MAX_PHI}
        onStart={onStart}
        onEnd={onEnd}
      />
    </>
  )
}

class Guard extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError?.()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

const KEYS = {
  ArrowLeft: (a, big) => a.rotate(big ? 0.8 : 0.35, 0),
  ArrowRight: (a, big) => a.rotate(big ? -0.8 : -0.35, 0),
  ArrowUp: (a) => a.rotate(0, -0.15),
  ArrowDown: (a) => a.rotate(0, 0.15),
  '+': (a) => a.zoom(0.85),
  '=': (a) => a.zoom(0.85),
  '-': (a) => a.zoom(1.18),
  _: (a) => a.zoom(1.18),
  Home: (a) => a.reset(),
  '0': (a) => a.reset(),
}

function Viewer({ item }) {
  const [Dish, scale] = DISHES[item.cat] || DISHES.chai
  const [ready, setReady] = useState(false)
  const [touched, setTouched] = useState(false)
  const [failed, setFailed] = useState(false)
  const api = useRef(null)
  const helpId = useId()
  const reduced = useMemo(reducedMotion, [])
  const coarse = useMemo(() => !!window.matchMedia?.('(pointer: coarse)').matches, [])
  const markReady = useCallback(() => setReady(true), [])
  const markTouched = useCallback(() => setTouched(true), [])

  const onKeyDown = (e) => {
    const fn = KEYS[e.key]
    if (!fn || !api.current || e.ctrlKey || e.metaKey || e.altKey) return
    e.preventDefault()
    fn(api.current, e.shiftKey)
    setTouched(true)
  }

  return (
    <div
      className={`qv-stage${ready ? ' is-ready' : ''}`}
      tabIndex={failed ? -1 : 0}
      role="group"
      aria-roledescription="3D viewer"
      aria-label={`${item.name}, interactive 3D view`}
      aria-describedby={failed ? undefined : helpId}
      onKeyDown={onKeyDown}
    >
      {failed ? (
        <div className="qv-fallback">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />
          </svg>
          <p>The 3D preview isn’t available on this device.</p>
        </div>
      ) : (
        <>
          <span className="qv-badge" aria-hidden="true">
            360° view
          </span>
          <div className="qv-canvas">
            <Guard onError={() => setFailed(true)}>
              <Canvas
                shadows="percentage"
                dpr={[1, 1.75]}
                camera={{ fov: 30, near: 0.05, far: 100, position: [0, 3, 8] }}
                gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
              >
                <Studio Dish={Dish} scale={scale} turn={TURNS[(item.index || 0) % TURNS.length]} api={api} reduced={reduced} onReady={markReady} onTouch={markTouched} />
              </Canvas>
            </Guard>
          </div>
          {!ready && <span className="qv-spinner" aria-hidden="true" />}
          <p className={`qv-hint${ready && !touched ? '' : ' is-hidden'}`} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 12a8 8 0 0 1 14.5-4.6M20 12a8 8 0 0 1-14.5 4.6M18.5 3v4.4h-4.4M5.5 21v-4.4h4.4" />
            </svg>
            {coarse ? 'Drag to rotate · Pinch to zoom' : 'Drag to rotate · Scroll to zoom'}
          </p>
          <span id={helpId} className="qv-sr">
            Drag or use the arrow keys to rotate. Scroll, pinch or press plus and minus to zoom. Press 0 to reset the view.
          </span>
          <button type="button" className="qv-reset" onClick={() => api.current?.reset()} aria-label="Reset view" title="Reset view">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

/* ---------- details ---------- */

// Real photo when /public/images/items has one, otherwise the studio render.
function Thumb({ cat, index, name }) {
  const photo = `${BASE}images/items/${slug(name)}.jpg`
  const [noPhoto, setNoPhoto] = useState(false)
  const [loaded, setLoaded] = useState(null)
  const shot = useShot(`${cat}:${index % SHOTS_PER_CATEGORY}`)
  const src = noPhoto ? shot : photo
  return (
    <span className="qv-thumb" aria-hidden="true">
      {src && <img key={src} src={src} alt="" decoding="async" className={loaded === src ? 'in' : ''} onLoad={() => setLoaded(src)} onError={() => setNoPhoto(true)} />}
    </span>
  )
}

const Diet = ({ nonveg }) => <i className={`qv-mark${nonveg ? ' is-non' : ''}`} aria-hidden="true" />

function Sheet({ item, open, onClose, actions, suggestions, onSelect }) {
  const panel = useRef()
  const closeBtn = useRef()
  const title = useRef()
  const titleId = useId()
  const descId = useId()
  const pairsId = useId()
  const [settled, setSettled] = useState(() => reducedMotion())
  const close = useRef(onClose)
  close.current = onClose
  const itemKey = `${item.cat}:${item.name}`
  const pairs = suggestions || []
  const pairCats = [...new Set(pairs.map((p) => p.cat))].join(',')

  // The 3D canvas mounts once the opening animation is done: it measures its box with
  // getBoundingClientRect (which would catch the mid-animation scale) and compiling
  // shaders mid-animation would make it stutter.
  useEffect(() => {
    if (settled) return
    const t = setTimeout(() => setSettled(true), 340)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (panel.current) panel.current.inert = !open
  }, [open])

  useEffect(() => {
    if (!open) return
    lockScroll()
    return unlockScroll
  }, [open])

  // focus moves in on open and returns to whatever opened it on close
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    ;(closeBtn.current || panel.current)?.focus({ preventScroll: true })
    return () => {
      if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true })
    }
  }, [open])

  // switching dishes from "Pairs well with" re-renders the details, so park focus on the new title
  const shownKey = useRef(itemKey)
  useEffect(() => {
    if (shownKey.current === itemKey) return
    shownKey.current = itemKey
    if (open) title.current?.focus({ preventScroll: true })
  }, [itemKey, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      const root = panel.current
      if (!root) return
      const active = document.activeElement
      // leave keys alone while another modal stacked on top of us has focus
      if (active && active !== document.body && !root.contains(active) && active.closest('[aria-modal="true"]')) return
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        e.preventDefault()
        close.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables(root)
      if (!els.length) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = els[0]
      const last = els[els.length - 1]
      if (!root.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (pairCats) pairCats.split(',').forEach((c) => requestShots(c))
  }, [pairCats])

  return (
    <div className="qv-root" data-state={open ? 'open' : 'closing'}>
      <div className="qv-backdrop" onClick={() => close.current?.()} aria-hidden="true" />
      <div ref={panel} className="qv-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} tabIndex={-1}>
        <button ref={closeBtn} type="button" className="qv-close" onClick={() => close.current?.()} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
          </svg>
        </button>

        <div className="qv-media">{settled ? <Viewer key={itemKey} item={item} /> : <span className="qv-spinner" aria-hidden="true" />}</div>

        <div className="qv-info" key={itemKey}>
          <div className="qv-head">
            <p className="qv-kicker">{item.catLabel}</p>
            <h2 ref={title} id={titleId} className="qv-title" tabIndex={-1}>
              {item.name}
            </h2>
            <div className="qv-tags">
              <span className="qv-diet">
                <Diet nonveg={item.nonveg} />
                {item.nonveg ? 'Non-veg' : 'Veg'}
              </span>
              {item.best && <span className="qv-best">★ Bestseller</span>}
            </div>
          </div>

          <p id={descId} className="qv-desc">
            {item.desc}
          </p>

          <div className="qv-buy">
            <p className="qv-price">
              <span className="qv-sr">Price </span>₹{item.price}
            </p>
            {actions != null && actions !== false && <div className="qv-actions">{actions}</div>}
          </div>

          {pairs.length > 0 && (
            <section className="qv-pairs" aria-labelledby={pairsId}>
              <h3 id={pairsId}>Pairs well with</h3>
              <ul>
                {pairs.map((s) => (
                  <li key={`${s.cat}:${s.name}`}>
                    <button type="button" className="qv-pair" onClick={() => onSelect?.(s)}>
                      <Thumb cat={s.cat} index={s.index || 0} name={s.name} />
                      <span className="qv-pair-text">
                        <span className="qv-pair-name">{s.name}</span>
                        <span className="qv-pair-meta">
                          <Diet nonveg={s.nonveg} />
                          {s.catLabel}
                          {s.best && <span className="qv-pair-best"> · Bestseller</span>}
                        </span>
                      </span>
                      <span className="qv-pair-price">₹{s.price}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export function QuickView({ item, onClose, actions, suggestions, onSelect }) {
  // keep the last dish on screen while the closing animation plays
  const [last, setLast] = useState(item)
  if (item && item !== last) setLast(item)
  const shown = item || (reducedMotion() ? null : last)

  useEffect(() => {
    if (item || !last) return
    const t = setTimeout(() => setLast(null), reducedMotion() ? 0 : CLOSE_MS)
    return () => clearTimeout(t)
  }, [item, last])

  if (!shown) return null
  return createPortal(<Sheet item={shown} open={!!item} onClose={onClose} actions={actions} suggestions={suggestions} onSelect={onSelect} />, document.body)
}

export default QuickView
