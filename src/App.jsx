import React, { useEffect, useRef, useState } from 'react'
import Scene from './Scene.jsx'
import { store } from './store.js'
import { CATEGORIES } from './menuData.js'

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

const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function App() {
  const active = useScrollStage()
  const [cat, setCat] = useState(CATEGORIES[0].id)
  const [open, setOpen] = useState(false)
  const current = CATEGORIES.find((c) => c.id === cat)

  return (
    <>
      <div className="canvas-wrap">
        <Scene category={cat} />
      </div>
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
        <button className="burger" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          <span />
          <span />
        </button>
      </header>

      <div className="dots" aria-hidden>
        {NAV.map(([id], i) => (
          <button key={id} className={active === i ? 'on' : ''} onClick={() => go(id)} tabIndex={-1} />
        ))}
      </div>

      <main>
        <section id="home" className="sec hero">
          <div className="col left">
            <p className="kicker">Chai · Snacks · Late-night adda</p>
            <h1>
              Chai <em>Sutta</em> Bar
            </h1>
            <p className="lead">Sip the street. Slow-brewed chai in clay kulhads, hot snacks and a glow that lasts till the last cup.</p>
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
              <h2>One kettle. A thousand conversations.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="lead">
                We started with a single brass kettle and a simple idea: chai tastes better when it is brewed slowly, served in clay and shared with friends. Fresh milk, hand-crushed
                ginger and cardamom, and tea leaves we blend ourselves.
              </p>
            </Reveal>
            <Reveal delay={240} className="stats">
              <div>
                <b>12+</b>
                <span>Chai blends</span>
              </div>
              <div>
                <b>100%</b>
                <span>Clay kulhads</span>
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
              <h2>Pick your poison. Watch it spin.</h2>
            </Reveal>
            <div className="tabs" role="tablist">
              {CATEGORIES.map((c) => (
                <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="blurb">{current.blurb}</p>
            <ul className="items" key={cat}>
              {current.items.map((it, i) => (
                <li key={it.name} style={{ animationDelay: `${i * 60}ms` }}>
                  <span className={`veg ${it.nonveg ? 'non' : ''}`} title={it.nonveg ? 'Non-veg' : 'Veg'} />
                  <div className="info">
                    <h3>
                      {it.name}
                      {it.best && <em>Bestseller</em>}
                    </h3>
                    <p>{it.desc}</p>
                  </div>
                  <span className="price">₹{it.price}</span>
                </li>
              ))}
            </ul>
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
                ['🏺', 'The kulhad ritual', 'Every cup is fired clay – sip, then smash.'],
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
