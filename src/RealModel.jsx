import React, { Suspense, useLayoutEffect, useMemo, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { enableShadows } from './models.jsx'

const BASE = import.meta.env.BASE_URL
const found = {}

// Checks once whether a file really exists (dev servers answer 200 with index.html for missing files).
function useFileExists(url) {
  const [ok, setOk] = useState(found[url] ?? false)
  useEffect(() => {
    if (url in found) return setOk(found[url])
    let live = true
    fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && !(r.headers.get('content-type') || '').includes('text/html'))
      .catch(() => false)
      .then((v) => {
        found[url] = v
        live && setOk(v)
      })
    return () => {
      live = false
    }
  }, [url])
  return ok
}

function GLB({ url, maxWidth, maxHeight }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => scene.clone(true), [scene])
  const { scale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const k = Math.min(maxWidth / Math.max(size.x, size.z, 1e-3), maxHeight / Math.max(size.y, 1e-3))
    const c = box.getCenter(new THREE.Vector3())
    return { scale: k, offset: new THREE.Vector3(-c.x * k, -box.min.y * k, -c.z * k) }
  }, [model, maxWidth, maxHeight])
  useLayoutEffect(() => enableShadows(model), [model])
  return (
    <group position={offset} scale={scale}>
      <primitive object={model} />
    </group>
  )
}

/**
 * Wraps a procedural dish: if /public/models/<id>.glb exists (e.g. a photogrammetry
 * scan of the real dish) it is shown instead, scaled to fit the same footprint.
 */
export function withRealModel(id, Procedural) {
  return function Dish(props) {
    const url = `${BASE}models/${id}.glb`
    const ok = useFileExists(url)
    if (!ok) return <Procedural {...props} />
    return (
      <Suspense fallback={<Procedural {...props} />}>
        <group {...props}>
          <GLB url={url} maxWidth={3.2} maxHeight={2.3} />
        </group>
      </Suspense>
    )
  }
}
