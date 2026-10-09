import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SITE } from '../config.js'

const matches = (q) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches
const reducedMotion = () => matches('(prefers-reduced-motion: reduce)')
const finePointer = () => matches('(hover: hover)') && !matches('(pointer: coarse)')
const cx = (...c) => c.filter(Boolean).join(' ')

// The preloader marks <html data-preloading> and fires 'preloader:done' as it lifts,
// so entrance animations hidden behind it wait their turn.
function afterPreloader(cb) {
  if (!document.documentElement.hasAttribute('data-preloading')) {
    cb()
    return () => {}
  }
  window.addEventListener('preloader:done', cb, { once: true })
  return () => window.removeEventListener('preloader:done', cb)
}

function onceInView(el, cb) {
  if (!el) return () => {}
  if (typeof IntersectionObserver === 'undefined') return afterPreloader(cb)
  let release = () => {}
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      release = afterPreloader(cb)
    },
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }
  )
  io.observe(el)
  return () => {
    io.disconnect()
    release()
  }
}

/* SplitText */

const graphemes = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
// scripts that shape across characters (Indic, Arabic, Thai…) animate per word so glyphs stay joined
const SHAPED = /[\u0590-\u08ff\u0900-\u0dff\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff]/
const letters = (w) => (SHAPED.test(w) ? [w] : graphemes ? Array.from(graphemes.segment(w), (s) => s.segment) : Array.from(w))

export function SplitText({ text, as: Tag = 'span', className, delay = 0, stagger = 35 }) {
  const ref = useRef()
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (reducedMotion()) return setShown(true)
    return onceInView(ref.current, () => setShown(true))
  }, [])

  const str = String(text ?? '')
  let i = 0
  const words = str.split(/(\s+)/).map((w, k) => {
    if (!w) return null
    if (!w.trim()) return ' '
    return (
      <span key={k} className="st-word" aria-hidden="true">
        {letters(w).map((ch, j) => (
          <span key={j} className="st-char" style={{ '--i': i++ }}>
            {ch}
          </span>
        ))}
      </span>
    )
  })

  return (
    <Tag ref={ref} className={cx('st-text', shown && 'st-in', className)} style={{ '--st-delay': `${delay}ms`, '--st-stagger': `${stagger}ms` }}>
      <span className="st-sr">{str}</span>
      {words}
    </Tag>
  )
}

/* Marquee */

// speed is in pixels per second, so the ribbon drifts at the same pace on every screen
export function Marquee({ items = [], speed = 40, reverse = false }) {
  const root = useRef()
  const group = useRef()
  const [reps, setReps] = useState(1)
  const [dur, setDur] = useState(0)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    const el = root.current
    const g = group.current
    if (!el || !g) return
    const measure = () => {
      const copies = g.children.length / Math.max(1, items.length)
      const one = g.scrollWidth / Math.max(1, copies)
      if (!one) return
      const need = Math.max(1, Math.ceil(el.clientWidth / one))
      setReps(need)
      setDur((one * need) / Math.max(1, speed))
    }
    measure()
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      ro.observe(g)
    }
    let io
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => setIdle(!e.isIntersecting))
      io.observe(el)
    }
    return () => {
      ro?.disconnect()
      io?.disconnect()
    }
  }, [speed, items.length])

  const set = (copy, hideAll) =>
    items.map((it, k) => (
      <li key={`${copy}-${k}`} className={cx('mq-item', k % 2 && 'mq-gold')} aria-hidden={hideAll || copy > 0 || undefined}>
        <span className="mq-text">{it}</span>
        <span className="mq-sep" aria-hidden="true">
          ✦
        </span>
      </li>
    ))
  const fill = (hideAll) => Array.from({ length: reps }, (_, copy) => set(copy, hideAll))

  return (
    <div ref={root} className={cx('mq-root', reverse && 'mq-rev', idle && 'mq-idle')} style={dur ? { '--mq-dur': `${dur.toFixed(2)}s` } : undefined}>
      <div className="mq-track">
        <ul ref={group} className="mq-group">
          {fill(false)}
        </ul>
        <ul className="mq-group" aria-hidden="true">
          {fill(true)}
        </ul>
      </div>
    </div>
  )
}

/* CountUp */

function parseValue(value) {
  const m = String(value).match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/)
  if (!m) return null
  const [, pre, raw, post] = m
  const dec = (raw.split('.')[1] || '').length
  const n = parseFloat(raw.replace(/,/g, ''))
  const grouped = raw.includes(',')
  const format = (x) => (grouped ? x.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : x.toFixed(dec))
  return { pre, post, n, format }
}

export function CountUp({ value, duration = 1600 }) {
  const parts = useMemo(() => parseValue(value), [value])
  const ref = useRef()
  const num = useRef()

  useLayoutEffect(() => {
    const el = num.current
    if (!parts || !el) return
    const write = (x) => {
      if (el.firstChild) el.firstChild.nodeValue = parts.format(x)
    }
    // reserve the final width so the prefix/suffix stay put while the digits roll
    const reserve = () => {
      write(parts.n)
      el.style.minWidth = ''
      el.style.minWidth = `${el.offsetWidth}px`
    }
    reserve()
    if (reducedMotion() || duration <= 0) return
    write(0)
    let raf
    const stop = onceInView(ref.current, () => {
      reserve()
      const start = performance.now()
      const tick = (now) => {
        const k = Math.min(1, (now - start) / duration)
        write(k < 1 ? parts.n * (1 - Math.pow(1 - k, 4)) : parts.n)
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      tick(start)
    })
    return () => {
      stop()
      cancelAnimationFrame(raf)
      write(parts.n)
    }
  }, [parts, duration])

  if (!parts) return <span>{value}</span>
  return (
    <span ref={ref} className="st-count">
      <span className="st-sr">{value}</span>
      <span className="st-face" aria-hidden="true">
        {parts.pre}
        <span ref={num} className="st-num">
          {parts.format(parts.n)}
        </span>
        {parts.post}
      </span>
    </span>
  )
}

/* useTilt */

// Returns a ref callback. Pair it with className="tilt" and an optional <span className="tilt-glare" /> child.
export function useTilt(max = 8) {
  const off = useRef(null)
  return useCallback(
    (el) => {
      off.current?.()
      off.current = null
      if (!el || !finePointer() || reducedMotion()) return

      const cur = { rx: 0, ry: 0, gx: 50, gy: 50, p: 0 }
      const target = { ...cur }
      let rect = null
      let raf = 0
      let last = 0
      let hovering = false

      const write = () => {
        el.style.setProperty('--rx', `${cur.rx.toFixed(2)}deg`)
        el.style.setProperty('--ry', `${cur.ry.toFixed(2)}deg`)
        el.style.setProperty('--gx', `${cur.gx.toFixed(1)}%`)
        el.style.setProperty('--gy', `${cur.gy.toFixed(1)}%`)
        el.style.setProperty('--tilt-p', cur.p.toFixed(3))
      }
      const step = (now) => {
        const dt = Math.min(64, now - (last || now - 16))
        last = now
        const k = 1 - Math.exp(-dt / (hovering ? 70 : 140))
        let moving = false
        for (const key in cur) {
          cur[key] += (target[key] - cur[key]) * k
          if (Math.abs(target[key] - cur[key]) > (key === 'p' ? 0.002 : 0.02)) moving = true
          else cur[key] = target[key]
        }
        write()
        if (moving) raf = requestAnimationFrame(step)
        else {
          raf = 0
          last = 0
          if (!hovering) el.classList.remove('tilt-on')
        }
      }
      const kick = () => {
        if (!raf) raf = requestAnimationFrame(step)
      }
      const move = (e) => {
        if (e.pointerType === 'touch') return
        if (!hovering) {
          hovering = true
          el.classList.add('tilt-on')
        }
        rect ||= el.getBoundingClientRect()
        const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        target.rx = (0.5 - py) * 2 * max
        target.ry = (px - 0.5) * 2 * max
        target.gx = px * 100
        target.gy = py * 100
        target.p = 1
        kick()
      }
      const leave = () => {
        hovering = false
        rect = null
        Object.assign(target, { rx: 0, ry: 0, gx: 50, gy: 50, p: 0 })
        kick()
      }
      const stale = () => (rect = null)

      el.addEventListener('pointerenter', move)
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerleave', leave)
      window.addEventListener('scroll', stale, { passive: true })
      window.addEventListener('resize', stale)
      off.current = () => {
        cancelAnimationFrame(raf)
        el.removeEventListener('pointerenter', move)
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerleave', leave)
        window.removeEventListener('scroll', stale)
        window.removeEventListener('resize', stale)
        el.classList.remove('tilt-on')
        for (const p of ['--rx', '--ry', '--gx', '--gy', '--tilt-p']) el.style.removeProperty(p)
      }
    },
    [max]
  )
}

/* Magnetic */

export function Magnetic({ children, strength = 0.3 }) {
  const wrap = useRef()
  const inner = useRef()
  const pull = useRef(strength)
  pull.current = strength

  useEffect(() => {
    const el = wrap.current
    const child = inner.current
    if (!el || !child || !finePointer() || reducedMotion()) return
    let x = 0
    let y = 0
    let vx = 0
    let vy = 0
    let tx = 0
    let ty = 0
    let raf = 0

    const step = () => {
      vx = (vx + (tx - x) * 0.16) * 0.74
      vy = (vy + (ty - y) * 0.16) * 0.74
      x += vx
      y += vy
      const settled = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) < 0.04
      if (settled) {
        x = tx
        y = ty
      }
      child.style.transform = x || y ? `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)` : ''
      raf = settled ? 0 : requestAnimationFrame(step)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step)
    }
    const move = (e) => {
      if (e.pointerType === 'touch') return
      const r = el.getBoundingClientRect()
      tx = (e.clientX - (r.left + r.width / 2)) * pull.current
      ty = (e.clientY - (r.top + r.height / 2)) * pull.current
      el.classList.add('mag-on')
      kick()
    }
    const leave = () => {
      tx = 0
      ty = 0
      el.classList.remove('mag-on')
      kick()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      child.style.transform = ''
    }
  }, [])

  return (
    <span ref={wrap} className="mag-wrap">
      <span ref={inner} className="mag-in">
        {children}
      </span>
    </span>
  )
}

/* ScrollProgress */

export function ScrollProgress() {
  const bar = useRef()
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`
    }
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(queue) : null
    ro?.observe(document.body)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', queue)
      window.removeEventListener('resize', queue)
      ro?.disconnect()
    }
  }, [])
  return (
    <div className="sp-root" aria-hidden="true">
      <div ref={bar} className="sp-bar" />
    </div>
  )
}

/* Opening hours */

const toMin = (s) => {
  const [h, m] = String(s).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Is the cafe open at `date` (local time)? Slots may close past midnight: a Monday
// 10:00–01:00 slot still covers Tuesday 00:30.
export function isOpenAt(date, hours = SITE.hours) {
  const now = date.getHours() * 60 + date.getMinutes()
  const day = date.getDay()
  const spans = []
  for (let off = -1; off <= 7; off++) {
    const d = (((day + off) % 7) + 7) % 7
    for (const h of hours || []) {
      if (!h.days?.includes(d)) continue
      const open = toMin(h.open)
      let close = toMin(h.close)
      if (close <= open) close += 1440
      spans.push([off * 1440 + open, off * 1440 + close])
    }
  }
  spans.sort((a, b) => a[0] - b[0])
  const at = (min) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, min)

  const current = spans.find(([s, e]) => s <= now && now < e)
  if (current) {
    let end = current[1]
    // back-to-back slots (e.g. one ends at midnight, the next starts at midnight) read as one
    for (let grew = true; grew; ) {
      grew = false
      for (const [s, e] of spans) {
        if (s <= end && e > end) {
          end = e
          grew = true
        }
      }
    }
    return { open: true, until: at(end) }
  }
  const next = spans.find(([s]) => s > now)
  return { open: false, opensAt: next ? at(next[0]) : null }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (d) => {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}
const daysApart = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5)

export function OpenNowBadge() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t
    const schedule = () => {
      t = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60000 - (Date.now() % 60000) + 50)
    }
    schedule()
    const wake = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  const s = isOpenAt(now, SITE.hours)
  const soon = s.open && s.until - now <= 30 * 60000
  let detail = null
  if (s.open) detail = `closes ${clock(s.until)}`
  else if (s.opensAt) {
    const gap = daysApart(now, s.opensAt)
    detail = `opens ${gap === 0 ? '' : gap === 1 ? 'tomorrow ' : `${DAYS[s.opensAt.getDay()]} `}${clock(s.opensAt)}`
  }

  return (
    <span className={cx('on-badge', s.open ? 'on-open' : 'on-closed', soon && 'on-soon')} title={SITE.hours.map((h) => h.label).join('\n')}>
      <span className="on-dot" aria-hidden="true" />
      <span className="on-state">{s.open ? 'Open now' : 'Closed'}</span>
      {detail && (
        <>
          <span className="on-sep" aria-hidden="true">
            ·
          </span>
          <span className="on-sr">, </span>
          <span className="on-when">{detail}</span>
        </>
      )}
    </span>
  )
}
