import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SITE } from '../config.js'

const MIN_MS = 1200
const MAX_MS = 6000
const EMPTY = 140 // chai surface (svg y) in an empty cup
const FULL = 64

const BODY = 'M20 52 C18 88 30 120 44 133 Q60 140 76 133 C90 120 102 88 100 52'
const STEAM = ['M47 42 C41 34 53 28 47 20 S51 8 47 2', 'M60 38 C54 29 66 23 60 14 S64 3 60 -3', 'M73 42 C67 34 79 28 73 20 S77 8 73 2']

// a strip of sine wave (one bump per `len` units) filled downwards, wide enough to slide
const wave = (amp, len, from) => {
  let d = `M${from} 0`
  for (let x = from; x < 240; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`
  return `${d} V96 H${from} Z`
}
const FRONT = wave(2.6, 40, -120)
const BACK = wave(3.2, 40, -140)

const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// lets entrance animations (SplitText, CountUp) wait until the curtain lifts
function release() {
  const html = document.documentElement
  if (!html.hasAttribute('data-preloading')) return
  html.removeAttribute('data-preloading')
  window.dispatchEvent(new Event('preloader:done'))
}

export function Preloader({ ready }) {
  const [phase, setPhase] = useState('load') // load -> out -> gone
  const [reduce] = useState(calm)
  const readyRef = useRef(ready)
  readyRef.current = ready
  const root = useRef()
  const pct = useRef()
  const bar = useRef()
  const level = useRef()

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-preloading', '')
    return release
  }, [])

  useEffect(() => {
    const start = performance.now()
    let last = start
    let p = 0
    let finishing = false
    let raf = 0
    let timer = 0
    const paint = () => {
      if (pct.current) pct.current.textContent = String(Math.round(p * 100))
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`
      level.current?.setAttribute('transform', `translate(0 ${(EMPTY - (EMPTY - FULL) * p).toFixed(2)})`)
    }
    const tick = (now) => {
      const t = now - start
      const dt = Math.min(80, now - last)
      last = now
      if (!finishing) {
        p = Math.max(p, 0.9 * (1 - Math.exp(-t / 1500)))
        finishing = (readyRef.current && t >= MIN_MS) || t >= MAX_MS
      } else {
        p = Math.min(1, p + (1 - p) * (1 - Math.exp(-dt / 120)) + dt / 1800)
      }
      paint()
      if (p < 1) raf = requestAnimationFrame(tick)
      else timer = setTimeout(() => setPhase('out'), reduce ? 80 : 260)
    }
    paint()
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [reduce])

  useEffect(() => {
    if (phase !== 'out') return
    release()
    const el = root.current
    const done = () => setPhase('gone')
    const onEnd = (e) => e.target === el && (e.propertyName === 'transform' || e.propertyName === 'opacity') && done()
    el.addEventListener('transitionend', onEnd)
    const t = setTimeout(done, reduce ? 600 : 1600)
    return () => {
      el.removeEventListener('transitionend', onEnd)
      clearTimeout(t)
    }
  }, [phase, reduce])

  if (phase === 'gone') return null

  const words = SITE.name.split(' ')
  const last = words.pop()

  return (
    <div ref={root} className={`pl-root${phase === 'out' ? ' pl-out' : ''}${reduce ? ' pl-calm' : ''}`} role="status" aria-label={`Loading ${SITE.name}`}>
      <span className="pl-sr">{phase === 'load' ? `Loading ${SITE.name}…` : 'Ready'}</span>
      <div className="pl-inner" aria-hidden="true">
        <div className="pl-art">
          <svg className="pl-cup" viewBox="0 -6 120 152" focusable="false">
            <defs>
              <clipPath id="pl-clip">
                <path d={`${BODY} Z`} />
              </clipPath>
              <linearGradient id="pl-chai" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="pl-stop-top" />
                <stop offset="1" className="pl-stop-deep" />
              </linearGradient>
            </defs>
            <g className="pl-steam">
              {STEAM.map((d) => (
                <path key={d} d={d} pathLength="1" />
              ))}
            </g>
            <path className="pl-clay" d={`${BODY} Z`} />
            <g clipPath="url(#pl-clip)">
              <g ref={level} transform={`translate(0 ${EMPTY})`}>
                <g className="pl-wave pl-wave-back">
                  <path d={BACK} />
                </g>
                <g className="pl-wave pl-wave-front">
                  <path d={FRONT} fill="url(#pl-chai)" />
                </g>
              </g>
            </g>
            <g clipPath="url(#pl-clip)">
              <path className="pl-line pl-ridge" d="M10 69 Q60 82 110 69" />
              <path className="pl-line pl-ridge" d="M10 78 Q60 91 110 78" />
            </g>
            <path className="pl-line" d={BODY} />
            <ellipse className="pl-line pl-rim" cx="60" cy="52" rx="40" ry="8" />
            <ellipse className="pl-line pl-lip" cx="60" cy="52.6" rx="35.5" ry="5.6" />
            <path className="pl-line" d="M47 136.5 Q60 141 73 136.5" />
          </svg>
        </div>
        <p className="pl-kicker">Brewing your cup</p>
        <p className="pl-brand">
          {words.length > 0 && `${words.join(' ')} `}
          <em>{last}</em>
        </p>
        <div className="pl-meta">
          <span className="pl-track">
            <span ref={bar} className="pl-bar" />
          </span>
          <span className="pl-pct">
            <span ref={pct} className="pl-num" />%
          </span>
        </div>
      </div>
    </div>
  )
}
