import React, { useEffect, useRef, useState } from 'react'
import Scene from './Scene.jsx'
import { store } from './store.js'
import { CATEGORIES } from './menuData.js'
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
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef()
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { threshold: 0.15 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
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
function DishImage({ cat, index, name }) {
  const photo = `${BASE}images/items/${slug(name)}.jpg`
  const [state, setState] = useState('photo') // photo -> render when the file is missing
  const [loaded, setLoaded] = useState(false)
  const shot = useShot(`${cat}:${index % SHOTS_PER_CATEGORY}`)
  useEffect(() => {
    setState('photo')
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
          onError={() => state === 'photo' && setState('render')}
        />
      )}
    </>
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

  useEffect(() => requestShots(cat, true), [cat])
  useEffect(() => {
    const t = setTimeout(() => CATEGORIES.forEach((c) => requestShots(c.id)), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <div className="canvas-wrap">
        <Scene category={cat} theme={theme} />
      </div>
      <SnapshotStudio />
      <div className="vignette" />

      <header className="nav">
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

      <main>
        <section id="home" className="sec hero">
          <div className="col left">
            <p className="kicker">Chai · Pizza · Burgers · Pasta · Coffee</p>
            <h1>
              Chai <em>Sutta</em> Bar
            </h1>
            <p className="lead">From our first kulhad of chai to wood-fired pizza, juicy burgers, creamy pasta, cold coffee and midnight Maggi. Everything fresh, everything hot.</p>
            <div className="cta">
              <button className="btn primary" onClick={() => go('menu')}>
                Explore the menu
              </button>
              <button className="btn" onClick={() => go('visit')}>
                Find us
              </button>
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
              <p className="kicker">Our story</p>
              <h2>One kettle. A whole kitchen.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="lead">
                We started with a single brass kettle and a simple idea: good food tastes better shared. Today the same kitchen that brews our chai also bakes pizza, grills burgers
                and whips up cold coffee, all made fresh to order.
              </p>
            </Reveal>
            <Reveal delay={240} className="stats">
              <div>
                <b>60+</b>
                <span>Dishes & drinks</span>
              </div>
              <div>
                <b>100%</b>
                <span>Fresh to order</span>
              </div>
              <div>
                <b>3 AM</b>
                <span>Open late</span>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="menu" className="sec menu">
          <div className="col left wide">
            <Reveal>
              <p className="kicker">The menu</p>
              <h2>Pick a dish. Watch it spin.</h2>
            </Reveal>
            <div className="tabs" role="tablist">
              {CATEGORIES.map((c) => (
                <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <Photo frame="cat-photo" src={`${BASE}images/${cat}.jpg`} alt={current.label} />
            <p className="blurb">{current.blurb}</p>
            <div className="menu-grid" key={cat}>
              {current.items.map((it, i) => (
                <article className="mcard" key={it.name} style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="mcard-media">
                    <DishImage cat={cat} index={i} name={it.name} />
                    {it.best && <span className="ribbon">★ Bestseller</span>}
                    <span className={`veg ${it.nonveg ? 'non' : ''}`} title={it.nonveg ? 'Non-veg' : 'Veg'} />
                  </div>
                  <div className="mcard-body">
                    <h3>{it.name}</h3>
                    <p>{it.desc}</p>
                    <div className="mcard-foot">
                      <span className="price">₹{it.price}</span>
                      <span className="diet">{it.nonveg ? 'Non-veg' : 'Veg'}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="vibe" className="sec">
          <div className="col right">
            <Reveal>
              <p className="kicker">The vibe</p>
              <h2>Lanterns, neon & good company.</h2>
            </Reveal>
            <div className="cards">
              {[
                ['🎶', 'Live music nights', 'Acoustic sets and open mics every weekend.'],
                ['🍕', 'Made fresh, served hot', 'Pizza, burgers & pasta straight from the kitchen.'],
                ['🌙', 'Open past midnight', 'The adda stays warm long after the city sleeps.'],
              ].map(([icon, t, d], i) => (
                <Reveal key={t} delay={i * 120} className="card">
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
              <p className="kicker">Visit us</p>
              <h2>Your cup is waiting.</h2>
            </Reveal>
            <Reveal delay={120} className="visit-grid">
              <div>
                <h4>Address</h4>
                <p>Your street address here</p>
                <p>City, State – PIN</p>
              </div>
              <div>
                <h4>Hours</h4>
                <p>Mon – Fri · 10 AM – 1 AM</p>
                <p>Sat – Sun · 9 AM – 3 AM</p>
              </div>
              <div>
                <h4>Say hello</h4>
                <p>+91 00000 00000</p>
                <p>hello@yourdomain.com</p>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <button className="btn primary" onClick={() => go('home')}>
                Back to the top ↑
              </button>
            </Reveal>
            <footer>© {new Date().getFullYear()} Chai Sutta Bar · Brewed with love</footer>
          </div>
        </section>
      </main>
    </>
  )
}
