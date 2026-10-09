import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Scene from './Scene.jsx'
import { store } from './store.js'
import { CATEGORIES, COMBOS } from './menuData.js'
import { AddButton, CartButton, CartDrawer } from './features/Cart.jsx'
import { syncCart, useCartOpen } from './features/cart.js'
import { useMenuFilter, pairingsFor } from './features/menuFilter.js'
import { MenuTools } from './features/MenuTools.jsx'
import QuickView from './features/QuickView.jsx'
import { Preloader } from './features/Preloader.jsx'
import { SplitText, Marquee, CountUp, useTilt, Magnetic, ScrollProgress, OpenNowBadge } from './features/motion.jsx'
import { SITE } from './config.js'
import { SnapshotStudio, requestShots, useShot, SHOTS_PER_CATEGORY } from './Snapshots.jsx'

const NAV = [
  ['home', 'Home'],
  ['story', 'Our Story'],
  ['menu', 'Menu'],
  ['vibe', 'Vibe'],
  ['visit', 'Visit'],
]

// Maps scroll position to a fractional stage index. Tall sections "hold" the camera
// until the viewer has scrolled through them.
function computeStage() {
  const vh = window.innerHeight
  const c = window.scrollY + vh / 2
  const secs = NAV.map(([id]) => document.getElementById(id)).filter(Boolean)
  if (!secs.length) return 0
  const anchors = secs.map((el) => {
    const top = el.offsetTop
    const h = el.offsetHeight
    const m = Math.min(h / 2, vh / 2)
    return [top + m, top + h - m]
  })
  if (c <= anchors[0][0]) return 0
  for (let i = 0; i < anchors.length; i++) {
    if (c <= anchors[i][1]) return i
    if (i < anchors.length - 1 && c < anchors[i + 1][0]) return i + (c - anchors[i][1]) / (anchors[i + 1][0] - anchors[i][1])
  }
  return anchors.length - 1
}

function useScrollStage() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    let last = window.scrollY
    let raf
    const update = () => {
      const st = computeStage()
      store.stage = st
      setActive(Math.round(st))
    }
    const onScroll = () => {
      const y = window.scrollY
      store.vel = y - last
      last = y
      update()
    }
    const decay = () => {
      store.vel *= 0.9
      raf = requestAnimationFrame(decay)
    }
    decay()
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    const t = setTimeout(update, 400) // after fonts/layout settle
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', update)
    }
  }, [])
  return active
}

// Fades children in when they enter the viewport.
function Reveal({ children, className = '', delay = 0, type = '', as: Tag = 'div' }) {
  const ref = useRef()
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.15 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} className={`${type === 'left' ? 'reveal-left' : type === 'scale' ? 'reveal-scale' : 'reveal'} ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}

const BASE = import.meta.env.BASE_URL
const slug = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Shows a real photo if the file exists in /public/images, otherwise renders nothing.
function Photo({ src, alt, className, frame }) {
  const [ok, setOk] = useState(true)
  useEffect(() => setOk(true), [src])
  if (!ok) return null
  const img = <img className={className} src={src} alt={alt} decoding="async" onError={() => setOk(false)} />
  return frame ? <figure className={frame}>{img}</figure> : img
}

// Card image: the real photo if one exists, otherwise a studio render of the 3D dish.
// photos that 404'd once: later mounts go straight to the studio render
const missingPhotos = new Set()

function DishImage({ cat, index, name }) {
  const photo = `${BASE}images/items/${slug(name)}.jpg`
  const [state, setState] = useState(() => (missingPhotos.has(photo) ? 'render' : 'photo')) // photo -> render when the file is missing
  const [loaded, setLoaded] = useState(false)
  const shot = useShot(`${cat}:${index % SHOTS_PER_CATEGORY}`)
  useEffect(() => {
    setState(missingPhotos.has(photo) ? 'render' : 'photo')
    setLoaded(false)
  }, [photo])
  const src = state === 'photo' ? photo : shot
  return (
    <>
      {!loaded && <div className="shimmer" />}
      {src && (
        <img
          key={src}
          src={src}
          alt={name}
          decoding="async"
          className={loaded ? 'in' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (state !== 'photo') return
            missingPhotos.add(photo)
            setState('render')
          }}
        />
      )}
    </>
  )
}

// Opens the quick view from anywhere on the card; the title button keeps it keyboard reachable.
function MenuCard({ it, cat, index, delay = 0, onOpen }) {
  const media = useRef()
  const tilt = useTilt(6)
  return (
    <article ref={tilt} className="mcard tilt" style={{ animationDelay: `${delay}ms` }} onClick={onOpen}>
      <span className="tilt-glare" aria-hidden="true" />
      <div className="mcard-media" ref={media}>
        <DishImage cat={cat} index={index} name={it.name} />
        {it.best && <span className="ribbon">★ Bestseller</span>}
        <span className={`veg ${it.nonveg ? 'non' : ''}`} title={it.nonveg ? 'Non-veg' : 'Veg'} />
      </div>
      <div className="mcard-body">
        <h3>
          <button type="button" className="mcard-open" onClick={(e) => (e.stopPropagation(), onOpen?.())}>
            {it.name}
          </button>
        </h3>
        <span className="sr-only">{it.nonveg ? 'Non-veg' : 'Veg'}</span>
        <p>{it.desc}</p>
        <div className="mcard-foot">
          <span className="price">₹{it.price}</span>
          <AddButton item={it} cat={cat} index={index} sourceRef={media} />
        </div>
      </div>
    </article>
  )
}

function ComboCard({ combo, delay, onOpen }) {
  const media = useRef()
  const tilt = useTilt(6)
  const [cat, index] = combo.shot
  return (
    <article ref={tilt} className="mcard combo tilt" style={{ animationDelay: `${delay}ms` }} onClick={onOpen}>
      <span className="tilt-glare" aria-hidden="true" />
      <div className="mcard-media" ref={media}>
        <DishImage cat={cat} index={index} name={combo.name} />
        <span className="ribbon">{combo.tag}</span>
        <span className="save">Save ₹{combo.was - combo.price}</span>
      </div>
      <div className="mcard-body">
        <h3>
          <button type="button" className="mcard-open" onClick={(e) => (e.stopPropagation(), onOpen?.())}>
            {combo.name}
          </button>
        </h3>
        <p>{combo.desc}</p>
        <div className="mcard-foot">
          <span className="price">
            ₹{combo.price}{' '}
            <s>
              <span className="sr-only">instead of </span>₹{combo.was}
            </s>
          </span>
          <AddButton item={combo} cat={cat} index={index} sourceRef={media} />
        </div>
      </div>
    </article>
  )
}

function HeroTitle() {
  return (
    <h1 aria-label="Chai Sutta Bar">
      <span className="word-reveal" aria-hidden="true"><span className="anim-word" style={{ animationDelay: '0.35s' }}>Chai</span></span>{' '}
      <span className="word-reveal" aria-hidden="true"><span className="anim-word gold-word" style={{ animationDelay: '0.55s' }}>Sutta</span></span>{' '}
      <span className="word-reveal" aria-hidden="true"><span className="anim-word" style={{ animationDelay: '0.72s' }}>Bar</span></span>
    </h1>
  )
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M5.2 18.8l1.6-1.6M17.2 6.8l1.6-1.6" /></svg>
      ) : (
        <svg viewBox="0 0 24 24"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" /></svg>
      )}
    </button>
  )
}

const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function App() {
  const active = useScrollStage()
  const [cat, setCat] = useState(CATEGORIES[0].id)
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0d0907' : '#f4ece0')
    try {
      localStorage.setItem('theme', next)
    } catch {}
  }
  const current = CATEGORIES.find((c) => c.id === cat)
  const filter = useMenuFilter(CATEGORIES, cat)
  const [picked, setPicked] = useState(null)
  // the quick view keeps showing the last dish during its close animation, so keep its extras too
  const lastPicked = useRef(null)
  if (picked) lastPicked.current = picked
  const qvItem = picked ?? lastPicked.current
  const pairings = useMemo(() => pairingsFor(qvItem, CATEGORIES), [qvItem])
  useEffect(() => {
    ;[...new Set(pairings.map((p) => p.cat))].forEach((c) => requestShots(c, true))
  }, [pairings])
  const [sceneReady, setSceneReady] = useState(false)
  const onSceneReady = useCallback(() => setSceneReady(true), [])
  const cartOpen = useCartOpen()
  // keep keyboard focus off the page while the preloader covers it
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const done = () => setRevealed(true)
    window.addEventListener('preloader:done', done)
    const t = setTimeout(done, 8000)
    return () => {
      window.removeEventListener('preloader:done', done)
      clearTimeout(t)
    }
  }, [])
  const hideWhileLoading = revealed ? {} : { inert: '' }
  const [bandPaused, setBandPaused] = useState(false)

  useEffect(() => requestShots(cat, true), [cat])
  useEffect(() => {
    const catalog = new Map()
    CATEGORIES.forEach((c) => c.items.forEach((it) => catalog.set(`${c.id}:${it.name}`, { name: it.name, price: it.price, nonveg: !!it.nonveg })))
    COMBOS.forEach((c) => catalog.set(`${c.shot[0]}:${c.name}`, { name: c.name, price: c.price, nonveg: false }))
    syncCart(catalog)
  }, [])
  // search results can span many categories: render the ones on screen first
  useEffect(() => {
    if (filter.searching) [...new Set(filter.items.map((it) => it.cat))].reverse().forEach((c) => requestShots(c, true))
  }, [filter.searching, filter.items])
  // pre-render the other categories' card images gently: one category at a time, never while scrolling
  useEffect(() => {
    if (!sceneReady) return
    // combo cards sit right under the menu, so their dishes go first
    const order = [...new Set([...COMBOS.map((c) => c.shot[0]), ...CATEGORIES.map((c) => c.id)])]
    let i = 0
    const id = setInterval(() => {
      if (Math.abs(store.vel) > 1) return
      if (i >= order.length) return clearInterval(id)
      requestShots(order[i++])
    }, 1500)
    return () => clearInterval(id)
  }, [sceneReady])

  return (
    <>
      <Preloader ready={sceneReady} />
      <ScrollProgress />
      <div className="canvas-wrap">
        <Scene category={cat} theme={theme} onReady={onSceneReady} paused={cartOpen || !!picked} />
      </div>
      {sceneReady && <SnapshotStudio />}
      <div className="vignette" />

      <header className="nav" {...hideWhileLoading}>
        <button className="logo" onClick={() => go('home')} aria-label="Chai Sutta Bar home">
          <span className="logo-mark">☕</span> Chai Sutta <b>Bar</b>
        </button>
        <nav className={open ? 'open' : ''}>
          {NAV.map(([id, label], i) => (
            <button
              key={id}
              className={active === i ? 'on' : ''}
              onClick={() => {
                setOpen(false)
                go(id)
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="nav-right">
          <CartButton />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button className="burger" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className="dots" aria-hidden>
        {NAV.map(([id], i) => (
          <button key={id} className={active === i ? 'on' : ''} onClick={() => go(id)} tabIndex={-1} />
        ))}
      </div>

      <main {...hideWhileLoading}>
        <section id="home" className="sec hero">
          <div className="col left">
            <div className="badge">
              <span className="badge-dot" />
              Mumbai's Finest
            </div>
            <p className="kicker">
              <span className="kicker-line" />
              Chai · Pizza · Burgers · Pasta · Coffee
            </p>
            <HeroTitle />
            <p className="lead">
              From our first kulhad of chai to wood-fired pizza, juicy burgers, creamy pasta, cold coffee and midnight Maggi. Everything fresh, everything hot — served with
              soul.
            </p>
            <div className="cta">
              <Magnetic>
                <button className="btn primary" onClick={() => go('menu')}>
                  Explore the Menu ↓
                </button>
              </Magnetic>
              <Magnetic>
                <button className="btn" onClick={() => go('visit')}>
                  Find Us
                </button>
              </Magnetic>
            </div>
            <div className="hero-badge">
              <OpenNowBadge />
            </div>
          </div>
          <div className="scroll-hint">
            <span>Scroll to explore</span>
            <i />
          </div>
        </section>

        <section id="story" className="sec">
          <div className="col right">
            <Reveal>
              <p className="kicker">
                <span className="kicker-line" />
                Our Story
              </p>
              <h2>
                <SplitText text="One kettle." />
                <br />
                <SplitText text="A whole kitchen." delay={280} />
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="lead">
                We started with a single brass kettle and a simple idea: good food tastes better when shared. Today the same kitchen brews our chai, bakes pizza, grills burgers
                and whips up cold coffee — fresh to order, day and deep into the night.
              </p>
            </Reveal>
            <Reveal delay={240} className="stats">
              <div>
                <b>
                  <CountUp value="60+" />
                </b>
                <span>Dishes & drinks</span>
              </div>
              <div>
                <b>
                  <CountUp value="100%" />
                </b>
                <span>Fresh to order</span>
              </div>
              <div>
                <b>
                  <CountUp value="3 AM" />
                </b>
                <span>Open late</span>
              </div>
            </Reveal>
          </div>
        </section>

        <div className={`band ${bandPaused ? 'paused' : ''}`}>
          <Marquee items={['Kulhad chai', 'Midnight Maggi', 'Wood-fired pizza', 'Cold coffee', 'Hot samosa', 'Smash burgers', 'Creamy pasta', 'Virgin mojito']} />
          <button type="button" className="band-toggle" onClick={() => setBandPaused(!bandPaused)} aria-pressed={bandPaused} aria-label={bandPaused ? 'Play the scrolling ribbon' : 'Pause the scrolling ribbon'}>
            {bandPaused ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13l10-6.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13M16 5.5v13" />
              </svg>
            )}
          </button>
        </div>

        <section id="menu" className="sec menu">
          <div className="col left wide">
            <Reveal>
              <p className="kicker">
                <span className="kicker-line" />
                The Menu
              </p>
              <h2>
                <SplitText text="Pick a dish. Watch it spin." />
              </h2>
            </Reveal>
            <MenuTools filter={filter} resultCount={filter.items.length} />
            <div className={`cat-tabs ${filter.searching ? 'dim' : ''}`} role="tablist" aria-label="Menu categories">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={!filter.searching && cat === c.id}
                  className={!filter.searching && cat === c.id ? 'on' : ''}
                  onClick={() => {
                    filter.setQuery('')
                    setCat(c.id)
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {!filter.searching && (
              <>
                <Photo frame="cat-photo" src={`${BASE}images/${cat}.jpg`} alt={current.label} />
                <p className="blurb">{current.blurb}</p>
              </>
            )}
            <div className="menu-grid" key={filter.searching ? 'search' : cat}>
              {filter.items.map((it, i) => (
                <MenuCard key={`${it.cat}:${it.name}`} it={it} cat={it.cat} index={it.index} delay={Math.min(i, 8) * 60} onOpen={() => setPicked(it)} />
              ))}
            </div>
            <div className="combos">
              <Reveal>
                <p className="kicker">
                  <span className="kicker-line" />
                  Combos & Deals
                </p>
                <h3 className="combos-title">Better together.</h3>
              </Reveal>
              <div className="menu-grid">
                {COMBOS.map((c, i) => (
                  <ComboCard key={c.id} combo={c} delay={i * 70} onOpen={() => setPicked(c)} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="vibe" className="sec">
          <div className="col right">
            <Reveal>
              <p className="kicker">
                <span className="kicker-line" />
                The Vibe
              </p>
              <h2>
                <SplitText text="Lanterns, warmth" />
                <br />
                <SplitText text="& good company." delay={280} />
              </h2>
            </Reveal>
            <span className="gold-divider" />
            <div className="cards">
              {[
                ['🎶', 'Live Music Nights', 'Acoustic sets and open mics every weekend.'],
                ['🍕', 'Made Fresh, Served Hot', 'Everything straight from the kitchen — no shortcuts.'],
                ['🌙', 'Open Past Midnight', 'The adda stays warm long after the city sleeps.'],
              ].map(([icon, t, d], i) => (
                <Reveal key={t} delay={i * 120} className="card" type="scale">
                  <span>{icon}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="visit" className="sec visit">
          <div className="col center">
            <Reveal>
              <p className="kicker" style={{ justifyContent: 'center' }}>
                <span className="kicker-line" />
                Visit Us
                <span className="kicker-line" />
              </p>
              <h2>
                <SplitText text="Your cup" />
                <br />
                <SplitText text="is waiting." delay={220} />
              </h2>
              <div className="visit-badge">
                <OpenNowBadge />
              </div>
            </Reveal>
            <Reveal delay={120} className="visit-grid">
              <div>
                <h4>Address</h4>
                {SITE.address.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
              <div>
                <h4>Hours</h4>
                {SITE.hours.map((h) => (
                  <p key={h.label}>{h.label}</p>
                ))}
              </div>
              <div>
                <h4>Say hello</h4>
                <p>
                  <a href={`tel:${SITE.phone.replace(/[^+\d]/g, '')}`}>{SITE.phone}</a>
                </p>
                <p>
                  <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
                </p>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <button className="btn primary" onClick={() => go('home')}>
                Back to the Top ↑
              </button>
            </Reveal>
            <footer>
              © {new Date().getFullYear()} {SITE.name} · Brewed with love ☕
            </footer>
          </div>
        </section>
      </main>
      <CartDrawer onBrowse={() => go('menu')} />
      <QuickView
        item={picked}
        onClose={() => setPicked(null)}
        suggestions={pairings}
        onSelect={setPicked}
        actions={qvItem && <AddButton item={qvItem} cat={qvItem.cat ?? qvItem.shot[0]} index={qvItem.index ?? qvItem.shot[1]} />}
      />
    </>
  )
}
