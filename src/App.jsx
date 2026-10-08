import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Scene from './Scene.jsx'
import { store } from './store.js'
import { CATEGORIES } from './menuData.js'

const NAV = [
  ['home',  'Home'],
  ['story', 'Our Story'],
  ['menu',  'Menu'],
  ['vibe',  'Vibe'],
  ['visit', 'Visit'],
]

const BASE = import.meta.env.BASE_URL
const slug = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

/* ─── scroll to section ─────────────────────────────────── */
const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/* ─── global scroll stage (for 3D camera) ──────────────── */
function computeStage() {
  const vh   = window.innerHeight
  const cy   = window.scrollY + vh / 2
  const secs = NAV.map(([id]) => document.getElementById(id)).filter(Boolean)
  if (!secs.length) return 0
  const anchors = secs.map((el) => {
    const m = Math.min(el.offsetHeight / 2, vh / 2)
    return [el.offsetTop + m, el.offsetTop + el.offsetHeight - m]
  })
  if (cy <= anchors[0][0]) return 0
  for (let i = 0; i < anchors.length; i++) {
    if (cy <= anchors[i][1]) return i
    if (i < anchors.length - 1 && cy < anchors[i + 1][0])
      return i + (cy - anchors[i][1]) / (anchors[i + 1][0] - anchors[i][1])
  }
  return anchors.length - 1
}

function useScrollStage() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    let last = window.scrollY, raf
    const update = () => { const st = computeStage(); store.stage = st; setActive(Math.round(st)) }
    const onScroll = () => { store.vel = window.scrollY - last; last = window.scrollY; update() }
    const decay = () => { store.vel *= 0.9; raf = requestAnimationFrame(decay) }
    decay(); update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    const t = setTimeout(update, 500)
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', update) }
  }, [])
  return active
}

/* ─── scroll progress bar ───────────────────────────────── */
function ScrollProgress() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const update = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      setPct(total > 0 ? (window.scrollY / total) * 100 : 0)
    }
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return <div className="scroll-progress" style={{ width: `${pct}%` }} aria-hidden />
}

/* ─── intersection reveal ───────────────────────────────── */
function Reveal({ children, className = '', delay = 0, type = '', as: Tag = 'div' }) {
  const ref   = useRef()
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && (setSeen(true), io.disconnect()),
      { threshold: 0.1 }
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  const cls = type === 'left' ? 'reveal-left' : type === 'scale' ? 'reveal-scale' : 'reveal'
  return (
    <Tag ref={ref} className={`${cls} ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}

/* ─── animated hero title ───────────────────────────────── */
function HeroTitle() {
  return (
    <h1 aria-label="Chai Sutta Bar">
      <span className="word-reveal"><span className="anim-word" style={{ animationDelay: '0.35s' }}>Chai</span></span>
      {' '}
      <span className="word-reveal"><span className="anim-word gold-word" style={{ animationDelay: '0.55s' }}>Sutta</span></span>
      {' '}
      <span className="word-reveal"><span className="anim-word" style={{ animationDelay: '0.72s' }}>Bar</span></span>
    </h1>
  )
}

/* ─── animated stat counter ─────────────────────────────── */
function StatCounter({ prefix = '', suffix = '', target, label, delay = 0 }) {
  const [val, setVal] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && !started && (setStarted(true), io.disconnect()),
      { threshold: 0.5 }
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [started])
  useEffect(() => {
    if (!started) return
    const dur = 1800, t0 = performance.now()
    const id = setTimeout(() => {
      const tick = (now) => {
        const p    = Math.min((now - t0) / dur, 1)
        const ease = 1 - Math.pow(1 - p, 4)
        setVal(Math.round(ease * target))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(id)
  }, [started, target, delay])
  return (
    <div ref={ref}><b>{prefix}{val}{suffix}</b><span>{label}</span></div>
  )
}

/* ─── photo with fallback ────────────────────────────────── */
function Photo({ src, alt, className, frame }) {
  const [ok, setOk] = useState(true)
  useEffect(() => setOk(true), [src])
  if (!ok) return null
  const img = <img className={className} src={src} alt={alt} decoding="async" onError={() => setOk(false)} />
  return frame ? <figure className={frame}>{img}</figure> : img
}

/* ─── theme toggle ───────────────────────────────────────── */
function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark'
        ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M5.2 18.8l1.6-1.6M17.2 6.8l1.6-1.6"/></svg>
        : <svg viewBox="0 0 24 24"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg>}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   SCROLL-DRIVEN MENU SECTION
   - Outer wrapper is CATEGORIES.length × 100vh tall
   - Inner is sticky, always 100vh visible
   - Scroll within the wrapper advances the category
═══════════════════════════════════════════════════════════ */
function MenuSection({ cat, setCat }) {
  const wrapRef    = useRef()
  const sectionTop = useRef(0)

  /* Cache section top position (recalc on resize) */
  const recalcTop = useCallback(() => {
    if (wrapRef.current) sectionTop.current = wrapRef.current.offsetTop
  }, [])

  useLayoutEffect(() => {
    recalcTop()
    window.addEventListener('resize', recalcTop)
    return () => window.removeEventListener('resize', recalcTop)
  }, [recalcTop])

  /* Scroll tracker — updates active category based on scroll depth */
  useEffect(() => {
    const update = () => {
      const scrolled = window.scrollY - sectionTop.current
      const vh       = window.innerHeight
      if (scrolled < 0) return
      const idx = Math.min(Math.max(Math.floor(scrolled / vh), 0), CATEGORIES.length - 1)
      const nextId = CATEGORIES[idx].id
      setCat((prev) => (prev !== nextId ? nextId : prev))
    }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [setCat])

  /* Click a tab → smooth-scroll to that category's scroll position */
  const jumpTo = useCallback((idx) => {
    window.scrollTo({
      top: sectionTop.current + idx * window.innerHeight,
      behavior: 'smooth',
    })
  }, [])

  const catIndex = CATEGORIES.findIndex((c) => c.id === cat)
  const current  = CATEGORIES[catIndex] || CATEGORIES[0]

  return (
    /* The tall scrollable wrapper */
    <div id="menu" ref={wrapRef} style={{ height: `${CATEGORIES.length * 100}svh` }}>

      {/* Sticky inner — stays in viewport while outer scrolls */}
      <div className="menu-sticky">

        {/* Big decorative category number in background */}
        <div className="menu-num" aria-hidden>
          {String(catIndex + 1).padStart(2, '0')}
        </div>

        <div className="col left wide">

          {/* Kicker */}
          <p className="kicker" style={{ animationDelay: '0s' }}>
            <span className="kicker-line" style={{ width: 28 }} />
            The Menu
          </p>

          {/* Scrollable tab bar — all categories */}
          <div className="cat-tabs" role="tablist" aria-label="Menu categories">
            {CATEGORIES.map((c, i) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={cat === c.id}
                className={cat === c.id ? 'on' : ''}
                onClick={() => jumpTo(i)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Animated content block — re-mounts on category change */}
          <div className="cat-display" key={catIndex}>

            {/* Category headline */}
            <h2 className="cat-title">{current.label}</h2>

            {/* Blurb */}
            {current.blurb && <p className="blurb">{current.blurb}</p>}

            {/* Menu item list */}
            <ul className="items">
              {(current.items || []).map((it, i) => (
                <li key={it.name} style={{ animationDelay: `${i * 60}ms` }}>
                  <Photo
                    className="thumb"
                    src={`${BASE}images/items/${slug(it.name)}.jpg`}
                    alt={it.name}
                  />
                  <span className={`veg${it.nonveg ? ' non' : ''}`} title={it.nonveg ? 'Non-veg' : 'Veg'} />
                  <div className="info">
                    <h3>
                      {it.name}
                      {it.best && <em>Bestseller</em>}
                    </h3>
                    {it.desc && <p>{it.desc}</p>}
                  </div>
                  <span className="price">₹{it.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right side — category progress dots */}
        <div className="cat-dots" aria-hidden>
          {CATEGORIES.map((c, i) => (
            <button
              key={c.id}
              className={i === catIndex ? 'on' : ''}
              onClick={() => jumpTo(i)}
              title={c.label}
            />
          ))}
        </div>

        {/* Category counter — bottom left */}
        <div className="cat-counter" aria-label={`Category ${catIndex + 1} of ${CATEGORIES.length}`}>
          <span className="cat-counter-cur">{String(catIndex + 1).padStart(2, '0')}</span>
          <span className="cat-counter-sep">/</span>
          <span className="cat-counter-tot">{String(CATEGORIES.length).padStart(2, '0')}</span>
        </div>

        {/* Scroll hint inside menu */}
        <div className="menu-scroll-hint" aria-hidden>
          <i /> Scroll for next
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════════ */
export default function App() {
  const active = useScrollStage()
  const [cat,   setCat]   = useState(CATEGORIES[0].id)
  const [open,  setOpen]  = useState(false)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'dark' } catch { return 'dark' }
  })

  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch {}
  }, [theme])

  return (
    <>
      {/* ── 3D Canvas (fixed background) ──────────────────── */}
      <div className="canvas-wrap">
        <Scene category={cat} theme={theme} />
      </div>

      <div className="vignette" />
      <ScrollProgress />

      {/* ── Navigation ────────────────────────────────────── */}
      <header className="nav">
        <button className="logo" onClick={() => go('home')} aria-label="Chai Sutta Bar home">
          <span className="logo-mark">☕</span> Chai Sutta <b>Bar</b>
        </button>
        <nav className={open ? 'open' : ''}>
          {NAV.map(([id, label], i) => (
            <button key={id} className={active === i ? 'on' : ''}
              onClick={() => { setOpen(false); go(id) }}>
              {label}
            </button>
          ))}
        </nav>
        <div className="nav-right">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button className="burger" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            <span /><span />
          </button>
        </div>
      </header>

      {/* ── Scroll dots ───────────────────────────────────── */}
      <div className="dots" aria-hidden>
        {NAV.map(([id], i) => (
          <button key={id} className={active === i ? 'on' : ''} onClick={() => go(id)} tabIndex={-1} />
        ))}
      </div>

      {/* ── Main content ──────────────────────────────────── */}
      <main>

        {/* HOME */}
        <section id="home" className="sec hero">
          <div className="col left">
            <div className="badge">
              <span className="badge-dot" />
              Now Open · Mumbai's Finest
            </div>
            <p className="kicker">
              <span className="kicker-line" />
              Chai · Pizza · Burgers · Pasta · Coffee
            </p>
            <HeroTitle />
            <p className="lead">
              From our first kulhad of chai to wood-fired pizza, juicy burgers,
              creamy pasta, cold coffee and midnight Maggi.
              Everything fresh, everything hot — served with soul.
            </p>
            <div className="cta">
              <button className="btn primary" onClick={() => go('menu')}>Explore the Menu ↓</button>
              <button className="btn" onClick={() => go('visit')}>Find Us</button>
            </div>
          </div>
          <div className="scroll-hint">
            <span>Scroll to explore</span><i />
          </div>
        </section>

        {/* OUR STORY */}
        <section id="story" className="sec">
          <div className="col right">
            <Reveal>
              <p className="kicker"><span className="kicker-line" />Our Story</p>
              <h2>One kettle.<br />A whole kitchen.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="lead">
                We started with a single brass kettle and a simple idea: good food
                tastes better when shared. Today the same kitchen brews our chai,
                bakes pizza, grills burgers and whips up cold coffee — fresh to
                order, day and deep into the night.
              </p>
            </Reveal>
            <Reveal delay={240} className="stats">
              <StatCounter suffix="+"  target={60}  label="Dishes & drinks" delay={0}   />
              <StatCounter suffix="%"  target={100} label="Fresh to order"  delay={200} />
              <StatCounter suffix=" AM" target={3}  label="Open late"       delay={400} />
            </Reveal>
          </div>
        </section>

        {/* MENU — scroll-driven section */}
        <MenuSection cat={cat} setCat={setCat} />

        {/* VIBE */}
        <section id="vibe" className="sec">
          <div className="col right">
            <Reveal>
              <p className="kicker"><span className="kicker-line" />The Vibe</p>
              <h2>Lanterns, warmth<br />&amp; good company.</h2>
            </Reveal>
            <span className="gold-divider" />
            <div className="cards">
              {[
                ['🎶', 'Live Music Nights',      'Acoustic sets and open mics every weekend.'],
                ['🍕', 'Made Fresh, Served Hot',  'Everything straight from the kitchen — no shortcuts.'],
                ['🌙', 'Open Past Midnight',      'The adda stays warm long after the city sleeps.'],
              ].map(([icon, title, desc], i) => (
                <Reveal key={title} delay={i * 120} className="card" type="scale">
                  <span>{icon}</span><h3>{title}</h3><p>{desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* VISIT */}
        <section id="visit" className="sec visit">
          <div className="col center">
            <Reveal>
              <p className="kicker" style={{ justifyContent: 'center' }}>
                <span className="kicker-line" />Visit Us<span className="kicker-line" />
              </p>
              <h2>Your cup<br />is waiting.</h2>
            </Reveal>
            <Reveal delay={130} className="visit-grid">
              <div><h4>Address</h4><p>Your street address</p><p>City, State – PIN</p></div>
              <div><h4>Hours</h4><p>Mon–Fri · 10 AM – 1 AM</p><p>Sat–Sun · 9 AM – 3 AM</p></div>
              <div><h4>Say Hello</h4><p>+91 00000 00000</p><p>hello@chaitsuttabar.com</p></div>
            </Reveal>
            <Reveal delay={260}>
              <button className="btn primary" onClick={() => go('home')}>Back to the Top ↑</button>
            </Reveal>
            <footer>© {new Date().getFullYear()} Chai Sutta Bar · Brewed with love ☕</footer>
          </div>
        </section>

      </main>
    </>
  )
}
