import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SITE } from '../config.js'
import { DISHES } from '../Scene.jsx'
import { useShot, requestShots, SHOTS_PER_CATEGORY } from '../Snapshots.jsx'
import {
  useCart,
  useCartOpen,
  addToCart,
  setQty,
  clearCart,
  openCart,
  closeCart,
  registerCartTarget,
  getCartTarget,
  buildOrderMessage,
  whatsAppUrl,
  inr,
  MAX_QTY,
} from './cart.js'

const BASE = import.meta.env.BASE_URL
const slug = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const plural = (n) => `${n} ${n === 1 ? 'item' : 'items'}`

// cards open a quick view on click, so nothing in here may bubble up to them
const stop = (e) => e.stopPropagation()
const stopKeys = (e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
const focusables = (root) =>
  [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
)
const MinusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 12h13" />
  </svg>
)

function Stepper({ name, qty, onDec, onInc, incRef, solid }) {
  const prev = useRef(qty)
  const dir = qty < prev.current ? 'down' : 'up'
  useEffect(() => {
    prev.current = qty
  }, [qty])
  const full = qty >= MAX_QTY
  return (
    <div className={`cart-stepper ${solid ? 'solid' : ''}`} role="group" aria-label={`Quantity of ${name}`}>
      <button type="button" className="cart-step" onClick={onDec} aria-label={qty <= 1 ? `Remove ${name} from your order` : `Remove one ${name}`}>
        <MinusIcon />
      </button>
      <span className="cart-qty" aria-live="polite" aria-atomic="true">
        <span key={qty} className={`cart-qty-n ${dir}`}>
          {qty}
        </span>
        <span className="cart-sr"> in your order</span>
      </span>
      <button ref={incRef} type="button" className="cart-step" onClick={() => !full && onInc()} aria-disabled={full || undefined} aria-label={`Add one more ${name}`}>
        <PlusIcon />
      </button>
    </div>
  )
}

export function AddButton({ item, cat, index, sourceRef }) {
  const key = `${cat}:${item.name}`
  const { lines } = useCart()
  const qty = lines.find((l) => l.key === key)?.qty || 0
  const on = qty > 0
  const last = useRef(qty || 1) // keeps the number steady while the stepper fades out
  if (qty) last.current = qty
  const wrap = useRef()
  const pill = useRef()
  const inc = useRef()
  const was = useRef(on)

  // the button that had focus is about to be hidden: hand focus to its counterpart
  useLayoutEffect(() => {
    if (was.current === on) return
    was.current = on
    if (wrap.current?.contains(document.activeElement)) (on ? inc : pill).current?.focus({ preventScroll: true })
  }, [on])

  const add = () => addToCart({ key, name: item.name, price: item.price, cat, index, nonveg: !!item.nonveg }, sourceRef?.current)

  return (
    <div ref={wrap} className={`cart-add ${on ? 'is-on' : ''}`} onClick={stop} onKeyDown={stopKeys}>
      <button ref={pill} type="button" className="cart-pill" onClick={add} aria-label={`Add ${item.name} to your order, ₹${inr(item.price)}`}>
        <PlusIcon />
        Add
      </button>
      <Stepper name={item.name} qty={last.current} incRef={inc} onDec={() => setQty(key, qty - 1)} onInc={add} solid />
    </div>
  )
}

export function CartButton() {
  const { count } = useCart()
  const open = useCartOpen()
  const ref = useRef()
  const seen = useRef(false)
  const last = useRef(count || 1)
  if (count) last.current = count
  useEffect(() => registerCartTarget(ref.current), [])
  useEffect(() => {
    seen.current = true
  }, [])
  const shown = last.current > 99 ? '99+' : last.current
  return (
    <button
      ref={ref}
      type="button"
      className="cart-btn"
      onClick={openCart}
      aria-label={count ? `Your order, ${plural(count)}` : 'Your order, empty'}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="cart-drawer"
      title="Your order"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 8h13l-1 11.2a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </svg>
      <span className={`cart-badge ${count ? 'on' : ''}`} aria-hidden="true">
        <span key={count} className={`cart-badge-pill ${seen.current && count ? 'pop' : ''}`}>
          {shown}
        </span>
      </span>
    </button>
  )
}

// a real photo when /public/images/items has one, else the studio render of the dish
function Thumb({ cat, index, name }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const shot = useShot(`${cat}:${index % SHOTS_PER_CATEGORY}`)
  useEffect(() => {
    if (failed && DISHES[cat]) requestShots(cat) // unknown categories would stall the studio queue
  }, [failed, cat])
  const src = failed ? shot : `${BASE}images/items/${slug(name)}.jpg`
  return (
    <span className="cart-thumb" aria-hidden="true">
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          decoding="async"
          className={loaded ? 'in' : ''}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false)
            setFailed(true)
          }}
        />
      )}
    </span>
  )
}

function Line({ line, leaving }) {
  return (
    <li className={`cart-line ${leaving ? 'leaving' : ''}`} aria-hidden={leaving || undefined} {...(leaving ? { inert: '' } : {})}>
      <div className="cart-line-in">
        <div className="cart-row">
          <Thumb cat={line.cat} index={line.index} name={line.name} />
          <p className="cart-name">
            <span className={`cart-veg ${line.nonveg ? 'non' : ''}`} role="img" aria-label={line.nonveg ? 'Non-veg' : 'Veg'} />
            <span>{line.name}</span>
          </p>
          <span className="cart-unit">₹{inr(line.price)} each</span>
          <span className="cart-line-total">₹{inr(line.price * line.qty)}</span>
          <div className="cart-line-step">
            <Stepper name={line.name} qty={line.qty} onDec={() => setQty(line.key, line.qty - 1)} onInc={() => setQty(line.key, line.qty + 1)} />
          </div>
        </div>
      </div>
    </li>
  )
}

// keeps removed lines around briefly so they can animate out
function usePresence(lines, ms = 340) {
  const [ghosts, setGhosts] = useState([])
  const prev = useRef(lines)
  useLayoutEffect(() => {
    const live = new Set(lines.map((l) => l.key))
    const gone = lines.length ? prev.current.flatMap((l, at) => (live.has(l.key) ? [] : [{ line: l, at }])) : []
    prev.current = lines
    setGhosts((g) => {
      const kept = lines.length ? g.filter((x) => !live.has(x.line.key)) : []
      return gone.length || kept.length !== g.length ? [...kept, ...gone] : g
    })
  }, [lines])
  useEffect(() => {
    if (!ghosts.length) return
    const t = setTimeout(() => setGhosts([]), ms)
    return () => clearTimeout(t)
  }, [ghosts, ms])
  const rows = lines.map((line) => ({ line, leaving: false }))
  ;[...ghosts].sort((a, b) => a.at - b.at).forEach((g) => rows.splice(Math.min(g.at, rows.length), 0, { line: g.line, leaving: true }))
  return rows
}

function EmptyKulhad() {
  return (
    <svg className="cart-kulhad" viewBox="16 8 88 96" aria-hidden="true">
      <path className="cart-steam" d="M49 36c-4-5 3-9-1-15" />
      <path className="cart-steam" d="M60 33c-4-6 4-10 0-17" />
      <path className="cart-steam" d="M71 36c-4-5 3-9-1-15" />
      <ellipse cx="60" cy="47" rx="27" ry="5.5" />
      <path d="M33 47c1.6 15 4.6 30 8.6 41.6A6 6 0 0 0 47.3 93h25.4a6 6 0 0 0 5.7-4.4C82.4 77 85.4 62 87 47" />
      <path className="cart-kulhad-band" d="M36.4 62c15.6 4 31.6 4 47.2 0M39.6 76c13.6 3.4 27.2 3.4 40.8 0" />
      <path d="M22 97c10 4.6 66 4.6 76 0" />
    </svg>
  )
}

export function CartDrawer({ onBrowse }) {
  const open = useCartOpen()
  const { lines, count, total } = useCart()
  const rows = usePresence(lines)
  const panel = useRef()
  const closeBtn = useRef()
  const browseBtn = useRef()
  const after = useRef(null)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const html = document.documentElement
    const { body } = document
    const saved = [body.style.overflow, html.style.scrollbarGutter]
    const gutter = window.innerWidth - html.clientWidth
    body.style.overflow = 'hidden'
    if (gutter > 0) html.style.scrollbarGutter = 'stable'
    closeBtn.current?.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeCart()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = focusables(panel.current)
      if (!items.length) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      const a = document.activeElement
      if (!panel.current.contains(a) || a === panel.current) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && a === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && a === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onFocus = (e) => {
      if (panel.current && !panel.current.contains(e.target)) closeBtn.current?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      body.style.overflow = saved[0]
      html.style.scrollbarGutter = saved[1]
      const back = prev && prev !== body && prev.isConnected && !panel.current?.contains(prev) ? prev : getCartTarget()
      back?.focus?.({ preventScroll: true })
      const fn = after.current
      after.current = null
      fn?.()
    }
  }, [open])

  // the focused control was removed (line deleted / order cleared): keep focus inside the drawer
  useLayoutEffect(() => {
    if (!open || !panel.current) return
    const a = document.activeElement
    const lost = !a || a === document.body || !a.isConnected || (panel.current.contains(a) && a.closest('[inert]'))
    if (lost) (lines.length ? closeBtn : browseBtn).current?.focus({ preventScroll: true })
  }, [lines])

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  useEffect(() => {
    if (!open || !lines.length) setArmed(false)
  }, [open, lines.length])

  const browse = () => {
    after.current = onBrowse || null
    closeCart()
  }
  const clear = () => {
    if (!armed) return setArmed(true)
    setArmed(false)
    clearCart()
  }

  return (
    <>
      <div className={`cart-overlay ${open ? 'open' : ''}`} onClick={closeCart} aria-hidden="true" />
      <div id="cart-drawer" ref={panel} className={`cart-drawer ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cart-title" tabIndex={-1}>
        <div className="cart-head">
          <div className="cart-head-text">
            <p className="cart-kicker">{SITE.name}</p>
            <h2 id="cart-title">Your order</h2>
          </div>
          {count > 0 && <span className="cart-count">{plural(count)}</span>}
          <button ref={closeBtn} type="button" className="cart-close" onClick={closeCart} aria-label="Close your order">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </div>

        <div className="cart-body">
          {lines.length ? (
            <>
              <ul className="cart-lines" aria-label="Items in your order">
                {rows.map(({ line, leaving }) => (
                  <Line key={line.key} line={line} leaving={leaving} />
                ))}
              </ul>
              <button type="button" className="cart-more" onClick={browse}>
                <PlusIcon />
                Add more from the menu
              </button>
            </>
          ) : (
            <div className="cart-empty">
              <EmptyKulhad />
              <h3>Your tray is empty</h3>
              <p>Pick a kulhad of chai or something hot from the kitchen and it will wait for you here.</p>
              <button ref={browseBtn} type="button" className="cart-browse" onClick={browse}>
                Browse the menu
              </button>
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="cart-foot">
            <div className="cart-sum">
              <span>Subtotal</span>
              <b key={total} className="cart-sum-n">
                ₹{inr(total)}
              </b>
            </div>
            <p className="cart-note">Taxes &amp; packing extra, if applicable</p>
            <a className="cart-wa" href={whatsAppUrl(buildOrderMessage(lines, total))} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path className="cart-wa-bubble" d="M20.4 11.7a8.4 8.4 0 0 1-12.5 7.3L3.6 20.4 5 16.3a8.4 8.4 0 1 1 15.4-4.6z" />
                <path
                  className="cart-wa-phone"
                  d="M9.4 7.9c-.4 0-.8.3-.9.7-.3 1-.1 2.2.7 3.5.9 1.4 2.2 2.6 3.7 3.2 1.1.4 2.1.4 2.8-.2.3-.3.4-.7.3-1l-.5-1c-.2-.3-.5-.4-.8-.3l-.9.4c-1-.5-1.8-1.3-2.3-2.3l.4-.9c.1-.3 0-.7-.3-.8l-1-.5c-.1-.1-.2-.1-.3-.1z"
                />
              </svg>
              Order on WhatsApp
              <span className="cart-sr"> (opens in a new tab)</span>
            </a>
            <button type="button" className={`cart-clear ${armed ? 'armed' : ''}`} onClick={clear} aria-live="polite">
              {armed ? 'Tap again to clear your order' : 'Clear order'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
