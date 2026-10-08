import { useMemo, useState } from 'react'

// What we'd suggest alongside a dish from each category.
const PAIRS = {
  chai: ['snacks', 'sweets'],
  pizza: ['drinks', 'coffee'],
  burgers: ['drinks', 'snacks'],
  pasta: ['drinks', 'coffee'],
  sandwich: ['coffee', 'drinks'],
  maggi: ['chai', 'drinks'],
  coffee: ['sweets', 'snacks'],
  drinks: ['snacks', 'burgers'],
  snacks: ['chai', 'drinks'],
  sweets: ['chai', 'coffee'],
}

// Words people type that the menu spells differently (checked alongside the word itself).
const ALIASES = {
  tea: ['chai'],
  noodle: ['maggi'],
  noodles: ['maggi'],
  dessert: ['sweets'],
  desserts: ['sweets'],
  mithai: ['sweets'],
  cheesy: ['cheese'],
  spicy: ['spic', 'peri', 'schezwan', 'fiery', 'jalapeno', 'chipotle'],
  shake: ['frappe'],
}

// lower-case, accents stripped (jalapeño -> jalapeno), "&" spelled out, punctuation dropped
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')

const flat = new WeakMap()

// One category's dishes tagged with where they came from. Cached so every caller
// gets the same objects for the same dish.
function dishesOf(c) {
  let list = flat.get(c)
  if (!list) flat.set(c, (list = c.items.map((it, index) => ({ ...it, cat: c.id, catLabel: c.label, index }))))
  return list
}

const hit = (text, word) => {
  const alts = ALIASES[word] ? [word, ...ALIASES[word]] : [word]
  return alts.some((w) => text.includes(w)) || (word.length > 3 && word.endsWith('s') && text.includes(word.slice(0, -1)))
}

// -1 = no match, 1 = the name alone matches, 0 = matched via description/category
function score(it, words) {
  const name = fold(it.name)
  const all = `${name} ${fold(it.desc)} ${fold(it.catLabel)}`
  if (!words.every((w) => hit(all, w))) return -1
  return words.every((w) => hit(name, w)) ? 1 : 0
}

const best = (it) => (it.best ? 1 : 0)
// popular: bestsellers first, then (when searching) name matches before description matches, then menu order
const ORDER = {
  popular: (a, b) => best(b.it) - best(a.it) || b.s - a.s || a.i - b.i,
  'price-asc': (a, b) => a.it.price - b.it.price || a.i - b.i,
  'price-desc': (a, b) => b.it.price - a.it.price || a.i - b.i,
}

export function useMenuFilter(categories, activeCat) {
  const [query, setQuery] = useState('')
  const [vegOnly, setVegOnly] = useState(false)
  const [sort, setSort] = useState('popular')
  const searching = query.trim() !== ''
  const terms = fold(query).split(/\s+/).filter(Boolean).join(' ')

  const items = useMemo(() => {
    let list
    if (searching) {
      // a query of only punctuation has nothing to match on
      const words = terms ? terms.split(' ') : []
      list = words.length ? categories.flatMap(dishesOf).map((it) => ({ it, s: score(it, words) })).filter((r) => r.s >= 0) : []
    } else {
      const c = categories.find((x) => x.id === activeCat) || categories[0]
      list = c ? dishesOf(c).map((it) => ({ it, s: 0 })) : []
    }
    if (vegOnly) list = list.filter((r) => !r.it.nonveg)
    list.forEach((r, i) => (r.i = i))
    list.sort(ORDER[sort] || ORDER.popular)
    return list.map((r) => r.it)
  }, [categories, activeCat, searching, terms, vegOnly, sort])

  return { query, setQuery, vegOnly, setVegOnly, sort, setSort, searching, items }
}

const byPopular = (a, b) => best(b) - best(a) || a.index - b.index

// 2-3 dishes from complementary categories, bestsellers first. Deterministic, but the
// third pick rotates with the dish so neighbouring items don't all get the same trio.
export function pairingsFor(item, categories) {
  if (!item) return []
  const lists = (PAIRS[item.cat] || [])
    .map((id) => categories.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => dishesOf(c).filter((it) => item.nonveg || !it.nonveg).sort(byPopular))
    .filter((l) => l.length)
  if (!lists.length) return []
  const picks = lists.map((l) => l[0])
  let extra = lists.flatMap((l) => l.slice(1)).find((it) => it.best)
  if (!extra) {
    const n = item.index || 0
    const l = lists[n % lists.length]
    if (l.length > 1) extra = l[1 + (Math.floor(n / lists.length) % (l.length - 1))]
  }
  return extra ? [...picks, extra] : picks
}
