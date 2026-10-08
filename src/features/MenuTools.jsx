import React, { useEffect, useRef } from 'react'

const SORTS = [
  ['popular', 'Popular'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
]
const IDEAS = ['paneer', 'cold coffee', 'maggi']

const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
// closed dialogs (like the cart drawer) stay in the DOM, so only count ones actually on screen
const modalOpen = () =>
  [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function MenuTools({ filter, resultCount }) {
  const { query, setQuery, vegOnly, setVegOnly, sort, setSort, searching } = filter
  const input = useRef()
  const count = resultCount ?? filter.items?.length ?? 0
  const q = query.trim()

  // "/" jumps to the search box from anywhere on the page
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (isTyping(document.activeElement) || modalOpen()) return
      const el = input.current
      if (!el) return
      e.preventDefault()
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // these buttons can disappear once results change, so hand focus back to the search box
  const then = (fn) => () => {
    fn()
    input.current?.focus()
  }
  const clear = then(() => setQuery(''))

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && query) {
      e.preventDefault()
      e.stopPropagation()
      setQuery('')
    } else if (e.key === 'Enter' && window.matchMedia?.('(pointer: coarse)').matches) {
      e.currentTarget.blur() // drops the on-screen keyboard so the results are visible
    }
  }

  return (
    <div className="mt-tools" role="search" aria-label="Menu">
      <div className="mt-bar">
        <div className="mt-search" onClick={(e) => e.target === e.currentTarget && input.current?.focus()}>
          <svg className="mt-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search chai, pizza, maggi…"
            aria-label="Search the menu"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query ? (
            <button type="button" className="mt-clear" onClick={clear} aria-label="Clear search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
            </button>
          ) : (
            <kbd className="mt-kbd" aria-hidden="true">
              /
            </kbd>
          )}
        </div>

        <div className="mt-controls">
          <button type="button" role="switch" aria-checked={vegOnly} className={`mt-veg${vegOnly ? ' is-on' : ''}`} onClick={() => setVegOnly(!vegOnly)}>
            <span className="mt-veg-mark" aria-hidden="true" />
            Veg only
            <span className="mt-track" aria-hidden="true">
              <span className="mt-thumb" />
            </span>
          </button>

          <label className="mt-sort">
            <span className="mt-sr">Sort by</span>
            <svg className="mt-sort-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3" />
            </svg>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <svg className="mt-chev" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 10 5 5 5-5" />
            </svg>
          </label>
        </div>
      </div>

      <div className="mt-status" role="status">
        {searching &&
          (count > 0 ? (
            <p className="mt-count" key="count">
              <b>{count}</b> {count === 1 ? 'result' : 'results'} for <span className="mt-q">“{q}”</span>
              {vegOnly && <span className="mt-note"> · veg only</span>}
            </p>
          ) : (
            <div className="mt-empty" key="empty">
              <p className="mt-empty-title">Nothing on the menu matches “{q}”{vegOnly ? ' in veg' : ''}.</p>
              <p className="mt-empty-sub">Try one of these instead</p>
              <div className="mt-ideas">
                {IDEAS.map((idea) => (
                  <button type="button" key={idea} onClick={then(() => setQuery(idea))}>
                    {idea}
                  </button>
                ))}
                {vegOnly && (
                  <button type="button" className="mt-ideas-alt" onClick={then(() => setVegOnly(false))}>
                    Include non-veg
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

export default MenuTools
