import type { Item, Place, Project } from '../types'

export const CAP = 50
export const MAX_WHERE = 2048
export const PLACES: readonly Place[] = ['local', 'preview', 'live']

export const empty = (): Project => ({ items: [], ever: false })

export const PLACE_WORDS: Record<Place, string> = {
  local: 'on this computer',
  preview: 'test version',
  live: 'live',
}

const LOOPBACK = ['127.0.0.1', '[::1]', '0.0.0.0']

export const storeKey = (root: string) => `project:${root}`

/** The href a Link may take, or undefined when `where` must show as text. */
export const safeHref = (where: string): string | undefined => {
  let url: URL
  try {
    url = new URL(where.trim())
  } catch {
    return undefined
  }
  // A loopback address is this computer: open it as localhost, the one http: host a Link takes.
  if (url.protocol === 'http:' && LOOPBACK.includes(url.hostname)) url.hostname = 'localhost'
  const isLocal = url.protocol === 'http:' && url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !isLocal) return undefined
  if (url.username !== '' || url.password !== '') return undefined
  const href = url.href
  if (href.length > 2048 || href.includes('@') || !/^[\x21-\x7e]+$/.test(href)) return undefined
  return href
}

/**
 * The address the terminal's `open link` button may hand to the system opener, or undefined.
 * Wider than a Link takes: any http: or https: page, so a dev server on another machine, a
 * local network address or a .test domain opens too.
 */
export const openableHref = (where: string): string | undefined => {
  const safe = safeHref(where)
  if (safe !== undefined) return safe
  let url: URL
  try {
    url = new URL(where.trim())
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username !== '' || url.password !== '') return undefined
  const href = url.href
  if (href.length > 2048 || href.includes('@') || !/^[\x21-\x7e]+$/.test(href)) return undefined
  return href
}

export type AddInput = {
  id?: unknown
  label?: unknown
  expect?: unknown
  where?: unknown
  place?: unknown
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

/** Turns the model's tool input into an item, or a reason it cannot be one. */
export const toItem = (input: AddInput, now: number): Item | { error: string } => {
  const label = text(input.label, 80)
  // An address is never shortened or reworded: a cut URL can lead somewhere else.
  const where = typeof input.where === 'string' ? input.where.trim() : ''
  if (label === '') return { error: 'label is required.' }
  if (where === '') return { error: 'where is required: the web address where the change can be seen.' }
  if (where.length > MAX_WHERE) return { error: `where is longer than ${MAX_WHERE} characters. Give the page's address without extra query text.` }
  const id = slug(text(input.id, 64)) || slug(label) || 'item'
  const place = PLACES.find(one => one === input.place) ?? (safeHref(where)?.startsWith('http://localhost') ? 'local' : 'live')
  return { id, label, expect: text(input.expect, 160), where, place, addedAt: now, status: 'open' }
}

/** Adds an item, replacing one with the same id (the thing changed again). */
export const add = (project: Project, item: Item): Project =>
  cap({ items: [...project.items.filter(one => one.id !== item.id), item], ever: true })

/** Keeps at most CAP items: oldest checked go first, then oldest open. */
export const cap = (project: Project): Project => {
  const items = [...project.items]
  while (items.length > CAP) {
    const checked = items.findIndex(one => one.status === 'checked')
    items.splice(checked === -1 ? 0 : checked, 1)
  }
  return { ...project, items }
}

export const setStatus = (project: Project, id: string, status: Item['status']): Project => ({
  ...project,
  items: project.items.map(one => (one.id === id ? { ...one, status } : one)),
})

export const dismiss = (project: Project, id: string): Project => ({
  ...project,
  items: project.items.filter(one => one.id !== id),
})

export const clear = (project: Project): Project => ({ ...project, items: [] })

export const notRightText = (item: Item) => `Not right: ${item.label} (${item.where}). `

export const ASK_TEXT =
  'What should I look at to check the changes you made? Add each one to my Check it list. '

export const leftLine = (project: Project) => {
  const left = project.items.filter(one => one.status === 'open').length
  if (left === 0) return 'Check it: nothing left to look at'
  return `Check it: ${left} left to look at`
}
