import { useSyncExternalStore } from 'react'
import { SITE } from '../config.js'

/*
 * Cart store: a tiny external store shared by every menu card, the nav button and
 * the drawer. Lines persist to localStorage (best effort) and sync across tabs.
 */

const STORAGE_KEY = 'csb-cart-v1'
export const MAX_QTY = 99

export const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

function clean(l) {
  if (!l || typeof l.name !== 'string' || !l.name) return null
  const price = Number(l.price)
  const qty = Math.round(Number(l.qty ?? 1))
  if (!Number.isFinite(price) || price < 0 || !(qty >= 1)) return null
  const cat = String(l.cat ?? '')
  return {
    key: typeof l.key === 'string' && l.key ? l.key : `${cat}:${l.name}`,
    name: l.name,
    price,
    qty: Math.min(MAX_QTY, qty),
    cat,
    index: Math.max(0, Math.round(Number(l.index) || 0)),
    nonveg: !!l.nonveg,
  }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(data)) return []
    const seen = new Set()
    return data.map(clean).filter((l) => l && !seen.has(l.key) && seen.add(l.key))
  } catch {
    return []
  }
}

const summarize = (lines) => ({
  lines,
  count: lines.reduce((n, l) => n + l.qty, 0),
  total: lines.reduce((n, l) => n + l.qty * l.price, 0),
})

let cart = summarize(load())
const cartSubs = new Set()
const emit = (subs) => subs.forEach((f) => f())

function commit(lines) {
  cart = summarize(lines)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  } catch {}
  emit(cartSubs)
}

try {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    cart = summarize(load())
    emit(cartSubs)
  })
} catch {}

const subscribeCart = (f) => {
  cartSubs.add(f)
  return () => cartSubs.delete(f)
}

const getCart = () => cart
export const useCart = () => useSyncExternalStore(subscribeCart, getCart, getCart)

export function addToCart(line, fromEl) {
  const key = line?.key || `${line?.cat}:${line?.name}`
  const found = cart.lines.find((l) => l.key === key)
  if (found) {
    if (found.qty >= MAX_QTY) return
    // refresh name/price too, in case the menu changed since this line was saved
    commit(cart.lines.map((l) => (l.key === key ? { ...l, name: line.name ?? l.name, price: Number(line.price ?? l.price), nonveg: !!(line.nonveg ?? l.nonveg), qty: l.qty + 1 } : l)))
  } else {
    const fresh = clean({ ...line, key, qty: 1 })
    if (!fresh) return
    commit([...cart.lines, fresh])
  }
  if (fromEl) flyToCart(fromEl)
}

// Re-price saved lines against the current menu and drop dishes that no longer exist.
// catalog: Map of key -> { name, price, nonveg }
export function syncCart(catalog) {
  const next = cart.lines.filter((l) => catalog.has(l.key)).map((l) => ({ ...l, ...catalog.get(l.key) }))
  const same = next.length === cart.lines.length && next.every((l, i) => l.price === cart.lines[i].price && l.name === cart.lines[i].name && l.nonveg === cart.lines[i].nonveg)
  if (!same) commit(next)
}

export function setQty(key, qty) {
  if (!cart.lines.some((l) => l.key === key)) return
  const n = Math.round(Number(qty) || 0)
  if (n <= 0) commit(cart.lines.filter((l) => l.key !== key))
  else commit(cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, n) } : l)))
}

export function clearCart() {
  if (cart.lines.length) commit([])
}

// drawer open state
let open = false
const openSubs = new Set()
const subscribeOpen = (f) => {
  openSubs.add(f)
  return () => openSubs.delete(f)
}
const setOpen = (v) => {
  if (open === v) return
  open = v
  emit(openSubs)
}

const getOpen = () => open
export const useCartOpen = () => useSyncExternalStore(subscribeOpen, getOpen, getOpen)
export const openCart = () => setOpen(true)
export const closeCart = () => setOpen(false)

// fly-to-cart animation
let targets = []

export function registerCartTarget(el) {
  if (!el) return () => {}
  targets = [...targets.filter((t) => t !== el), el]
  return () => {
    targets = targets.filter((t) => t !== el)
  }
}

// latest registered target that is actually on screen
export function getCartTarget() {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]
    if (t.isConnected && t.getClientRects().length) return t
  }
  return null
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const bumpTimers = new WeakMap()
function bump(el) {
  clearTimeout(bumpTimers.get(el))
  el.classList.remove('cart-bump')
  void el.offsetWidth // restart the CSS animation
  el.classList.add('cart-bump')
  bumpTimers.set(el, setTimeout(() => el.classList.remove('cart-bump'), 700))
}

function intersect(a, b) {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  return right - left > 4 && bottom - top > 4 ? { left, top, width: right - left, height: bottom - top } : null
}

export function flyToCart(fromEl) {
  const target = getCartTarget()
  if (!target) return
  if (!fromEl?.getBoundingClientRect || typeof target.animate !== 'function' || reducedMotion()) return bump(target)
  const box = fromEl.getBoundingClientRect()
  if (!box.width || !box.height) return bump(target)

  const img = fromEl.tagName === 'IMG' ? fromEl : fromEl.querySelector?.('img')
  const photo = img && img.complete && img.naturalWidth > 0 ? img : null
  const DOT = 18
  const r = photo
    ? intersect(box, photo.getBoundingClientRect()) || box
    : { left: box.left + box.width / 2 - DOT / 2, top: box.top + box.height / 2 - DOT / 2, width: DOT, height: DOT }

  const ghost = document.createElement('div')
  ghost.className = `cart-fly ${photo ? 'cart-fly-img' : 'cart-fly-dot'}`
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: '0',
    zIndex: '80',
    pointerEvents: 'none',
    overflow: 'hidden',
    borderRadius: photo ? '16px' : '50%',
  })
  if (photo) {
    const copy = document.createElement('img')
    copy.src = photo.currentSrc || photo.src
    copy.alt = ''
    Object.assign(copy.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' })
    ghost.appendChild(copy)
  }
  document.body.appendChild(ghost)

  // quadratic arc from the source centre into the cart, lifting above both ends
  const t = target.getBoundingClientRect()
  const dx = t.left + t.width / 2 - (r.left + r.width / 2)
  const dy = t.top + t.height / 2 - (r.top + r.height / 2)
  const lift = Math.min(220, Math.max(70, Math.hypot(dx, dy) * 0.35))
  const cx = dx * 0.3
  const cy = Math.max(16 - r.top - r.height / 2, Math.min(0, dy) - lift)
  const side = Math.min(r.width, r.height)
  const end = Math.min(1, 20 / Math.max(r.width, r.height))
  const N = 16
  const frames = []
  for (let i = 0; i <= N; i++) {
    const p = i / N
    const q = 1 - p
    const x = 2 * q * p * cx + p * p * dx
    const y = 2 * q * p * cy + p * p * dy
    const s = p < 0.15 ? 1 + 0.06 * (p / 0.15) : 1.06 + (end - 1.06) * ((p - 0.15) / 0.85) ** 0.8
    const frame = { offset: p, transform: `translate(${x}px, ${y}px) scale(${s})`, opacity: p < 0.7 ? 1 : 1 - ((p - 0.7) / 0.3) * 0.85 }
    if (photo) frame.borderRadius = `${16 + (side / 2 - 16) * Math.min(1, p * 1.4)}px`
    frames.push(frame)
  }

  let done = false
  let safety
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(safety)
    ghost.remove()
    if (target.isConnected) bump(target)
  }
  try {
    const anim = ghost.animate(frames, { duration: 700, easing: 'cubic-bezier(0.45, 0.05, 0.4, 1)', fill: 'forwards' })
    anim.onfinish = finish
    anim.oncancel = finish
    safety = setTimeout(finish, 1400)
  } catch {
    finish()
  }
}

// WhatsApp order
export function buildOrderMessage(lines, total) {
  const items = lines.map((l) => `${l.qty} × ${l.name} — ₹${inr(l.qty * l.price)}`)
  return [`Hi ${SITE.name}! I'd like to order:`, ...items, `Total: ₹${inr(total)}`, '', 'Name:', 'Pickup / Delivery address:'].join('\n')
}

export function whatsAppUrl(message) {
  const num = String(SITE.whatsapp || '').replace(/\D/g, '')
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
}
