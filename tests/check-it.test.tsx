import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Project } from '../types'
import { CAP, add, openableHref, safeHref, storeKey, toItem } from '../hooks/list'

const TOOL = 'mcp__check-it__add'
const ROOT_A = '/work/site-a'
const ROOT_B = '/work/site-b'

const PANE = {
  plugin: 'check-it',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'check-it',
  props: {
    title: 'Check it',
    isFocused: false,
    bodyColumns: 34,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'check-it',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

/** The world beneath the plugin: a store, a clock, a project root that can move, and the prompt box. */
const world = (on: On, entries: Record<string, unknown> = {}) => {
  mock.clock(on, { now: 1000 })
  const store = new Map<string, unknown>(Object.entries(entries))
  const box = { root: ROOT_A, store, slow: false, opened: 0, draft: '', filled: [] as { text: string; mode: string }[] }
  on('store.get', async (_$, e) => {
    const value = store.get(e.key)
    // A slow disk: lets two actions overlap between their read and their write.
    if (box.slow) for (let i = 0; i < 50; i += 1) await Promise.resolve()
    return { value }
  })
  on('prompt.read', () => ({ value: { text: box.draft, cursor: 0 } }))
  on('ui.open', () => {
    box.opened += 1
    return { value: { isPlaced: true } as const }
  })
  on('store.set', (_$, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('session.root', () => ({ value: box.root }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.fill', (_$, e) => {
    box.filled.push({ text: e.text, mode: e.mode })
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  return box
}

const raw = ($: Engine, args: Record<string, string>) =>
  $.tool.call({ tool: TOOL, tool_use_id: `t-${Math.random()}`, ...args })

const endTurn = ($: Engine, reason: 'answer' | 'aborted' = 'answer') =>
  $.turn.complete({ reason, answer: 'done', durationMs: 1, isAborted: reason === 'aborted', turnId: 'turn-1' })

/** One tool call in a turn that then ends with an answer. */
const call = async ($: Engine, args: Record<string, string>) => {
  const result = await raw($, args)
  await endTurn($)
  return result
}

const RUN = {
  command: 'check-it',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 150 },
} as const

const giving = { id: 'giving-button', label: 'Giving page button', expect: 'Says Give today', where: 'http://localhost:8765/give.html', place: 'local' }

test('add stores an item and dedups by id', async ($, on) => {
  const box = world(on)
  await call($, giving)
  await call($, { ...giving, expect: 'Says Give now' })
  await call($, { ...giving, id: 'staff-photos', label: 'Staff photos' })
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items.map(one => one.id)).toEqual(['giving-button', 'staff-photos'])
  expect(stored.items[0]?.expect).toBe('Says Give now')
  expect(stored.ever).toBe(true)
})

test('a re-added checked item opens again', async ($, on) => {
  const box = world(on)
  await call($, giving)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'check:giving-button' })
  await call($, giving)
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items[0]?.status).toBe('open')
})

test('bad URLs never become links and never blank the pane', async ($, on) => {
  expect(safeHref('javascript:alert(1)')).toBe(undefined)
  expect(safeHref('http://example.com/')).toBe(undefined)
  expect(safeHref('file:///etc/passwd')).toBe(undefined)
  expect(safeHref('https://user@example.com/')).toBe(undefined)
  expect(safeHref('not a url')).toBe(undefined)
  expect(safeHref('https://example.com/a b')).toBe('https://example.com/a%20b')
  expect(safeHref('http://localhost:3000/x')).toBe('http://localhost:3000/x')
  expect(safeHref('http://127.0.0.1:4321/')).toBe('http://localhost:4321/')
  expect(safeHref('http://[::1]:4321/a')).toBe('http://localhost:4321/a')
  expect(safeHref('http://192.168.1.5/')).toBe(undefined)
  const box = world(on)
  const result = await call($, { ...giving, id: 'bad', where: 'javascript:alert(1)' })
  expect(String(result.result)).toContain('plain text')
  await call($, giving)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'javascript:alert(1)' })).toBeDefined()
    const links = await ui.findAll({ type: 'Link' })
    // The terminal gets a button that opens the page; every other surface a Link.
    expect(links.map(one => one.props.href)).toEqual(surface === 'terminal' ? [] : ['http://localhost:8765/give.html'])
    await ui.unmount()
  }
})

test('open link on the terminal opens the validated address with the system opener', async ($, on) => {
  const ran: string[][] = []
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  world(on)
  await call($, giving)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'open:giving-button' })
  expect(ran).toEqual([['open', 'http://localhost:8765/give.html']])
  await ui.unmount()
})

test('missing fields are refused, not stored', async ($, on) => {
  const box = world(on)
  const result = await call($, { id: 'x', label: '', where: '' })
  expect(String(result.result)).toContain('Not added')
  expect(box.store.get(storeKey(ROOT_A))).toBe(undefined)
})

test('tick and undo', async ($, on) => {
  const box = world(on)
  await call($, giving)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'check:giving-button' })
  let stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items[0]?.status).toBe('checked')
  expect((await ui.find({ key: 'toggle-checked' }))?.props.label).toContain('checked (1)')
  expect(await ui.find({ key: 'undo:giving-button' })).toBe(undefined)
  await ui.press({ key: 'toggle-checked' })
  await ui.press({ key: 'undo:giving-button' })
  stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items[0]?.status).toBe('open')
  expect(await ui.find({ key: 'check:giving-button' })).toBeDefined()
})

test('dismiss removes the item', async ($, on) => {
  const box = world(on)
  await call($, giving)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'dismiss:giving-button' })
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Nothing left to look at.' })).toBeDefined()
})

test('/check-it clear empties the list', async ($, on) => {
  const box = world(on)
  await call($, giving)
  await $.command.run({ ...RUN, args: 'clear' })
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items).toEqual([])
  expect(box.opened).toBe(0)
  await $.command.run({ ...RUN, args: '' })
  expect(box.opened).toBe(1)
})

test('items wait for the end of the turn', async ($, on) => {
  const box = world(on)
  const bandTarget = BAND_WITH_ENGINE(on)
  await raw($, giving)
  await raw($, { ...giving, id: 'staff-photos', label: 'Staff photos' })
  expect(box.store.get(storeKey(ROOT_A))).toBe(undefined)
  const band = await $.ui.mount(bandTarget)
  expect(await band.find({ type: 'Button', key: 'open' })).toBe(undefined)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ type: 'Text', text: 'Giving page button' })).toBe(undefined)
  await endTurn($)
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items.map(one => one.id)).toEqual(['giving-button', 'staff-photos'])
  expect(await pane.find({ type: 'Text', text: 'Giving page button' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'Check it: 2 left to look at' })).toBeDefined()
})

test('an aborted turn drops its items', async ($, on) => {
  const box = world(on)
  await call($, giving)
  await raw($, { ...giving, id: 'half-done', label: 'Half done' })
  await endTurn($, 'aborted')
  await endTurn($)
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items.map(one => one.id)).toEqual(['giving-button'])
})

test('a subagent turn ending does not release the items', async ($, on) => {
  const box = world(on)
  await raw($, giving)
  await $.turn.complete({ reason: 'answer', answer: 'sub', durationMs: 1, isAborted: false, turnId: 'turn-2', agentId: 'agent-1' })
  expect(box.store.get(storeKey(ROOT_A))).toBe(undefined)
  await endTurn($)
  expect((box.store.get(storeKey(ROOT_A)) as Project).items.length).toBe(1)
})

test('not right puts a space after a draft that needs one', async ($, on) => {
  const box = world(on)
  await call($, giving)
  const ui = await $.ui.mount(PANE)
  box.draft = 'The color is wrong.'
  await ui.press({ key: 'bad:giving-button' })
  box.draft = 'Also: '
  await ui.press({ key: 'bad:giving-button' })
  expect(box.filled.map(one => one.text)).toEqual([
    ' Not right: Giving page button (http://localhost:8765/give.html). ',
    'Not right: Giving page button (http://localhost:8765/give.html). ',
  ])
})

test('a press acts on the project the list shows, after a change of directory', async ($, on) => {
  const other = { items: [{ ...giving, addedAt: 1, status: 'open' }], ever: true }
  const box = world(on, { [storeKey(ROOT_B)]: other })
  await call($, giving)
  const pane = await $.ui.mount(PANE)
  box.root = ROOT_B
  await pane.press({ key: 'check:giving-button' })
  expect((box.store.get(storeKey(ROOT_A)) as Project).items[0]?.status).toBe('checked')
  expect((box.store.get(storeKey(ROOT_B)) as Project).items[0]?.status).toBe('open')
})

test('opening the list shows the current project', async ($, on) => {
  const other = { items: [{ ...giving, id: 'b-only', label: 'Only in B', addedAt: 1, status: 'open' }], ever: true }
  const box = world(on, { [storeKey(ROOT_B)]: other })
  const bandTarget = BAND_WITH_ENGINE(on)
  await call($, giving)
  box.root = ROOT_B
  const band = await $.ui.mount(bandTarget)
  await band.press({ key: 'open' })
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ type: 'Text', text: 'Only in B' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Giving page button' })).toBe(undefined)
  expect(box.opened).toBe(1)
})

test('held items go to the project they were added in', async ($, on) => {
  const box = world(on)
  await raw($, giving)
  box.root = ROOT_B
  await endTurn($)
  expect((box.store.get(storeKey(ROOT_A)) as Project).items.map(one => one.id)).toEqual(['giving-button'])
  expect(box.store.get(storeKey(ROOT_B))).toBe(undefined)
})

test('a subagent cannot add items', async ($, on) => {
  const box = world(on)
  const result = await $.tool.call({ tool: TOOL, tool_use_id: 't-sub', agentId: 'agent-1', ...giving })
  expect(String(result.result)).toContain('Not added')
  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 1, isAborted: true, turnId: 'turn-2', agentId: 'agent-1' })
  await endTurn($)
  expect(box.store.get(storeKey(ROOT_A))).toBe(undefined)
})

test('overlapping presses both land', async ($, on) => {
  const box = world(on)
  await raw($, giving)
  await raw($, { ...giving, id: 'staff-photos', label: 'Staff photos' })
  await endTurn($)
  const pane = await $.ui.mount(PANE)
  box.slow = true
  await Promise.all([pane.press({ key: 'check:giving-button' }), pane.press({ key: 'check:staff-photos' })])
  const stored = box.store.get(storeKey(ROOT_A)) as Project
  expect(stored.items.map(one => one.status)).toEqual(['checked', 'checked'])
})

test('an overlong address is refused, never shortened', async ($, on) => {
  const box = world(on)
  const long = `https://example.com/?q=${'a'.repeat(2100)}`
  const result = await call($, { ...giving, where: long })
  expect(String(result.result)).toContain('longer than 2048')
  expect(box.store.get(storeKey(ROOT_A))).toBe(undefined)
  expect(safeHref(long)).toBe(undefined)
})

test('the list keeps at most 50, oldest checked dropped first', async () => {
  let p: Project = { items: [], ever: false }
  for (let i = 0; i < CAP; i += 1) {
    const item = toItem({ ...giving, id: `i${i}` }, i)
    if ('error' in item) throw new Error(item.error)
    p = add(p, i === 5 || i === 9 ? { ...item, status: 'checked' } : item)
  }
  const extra = toItem({ ...giving, id: 'new' }, 99)
  if ('error' in extra) throw new Error(extra.error)
  p = add(p, extra)
  expect(p.items.length).toBe(CAP)
  expect(p.items.some(one => one.id === 'i5')).toBe(false)
  expect(p.items.some(one => one.id === 'i9')).toBe(true)
  p = add(p, { ...extra, id: 'new2' })
  p = add(p, { ...extra, id: 'new3' })
  expect(p.items.some(one => one.id === 'i9')).toBe(false)
  expect(p.items.some(one => one.id === 'i0')).toBe(false)
  expect(p.items.length).toBe(CAP)
})

test('store is keyed per project', async ($, on) => {
  const box = world(on)
  await call($, giving)
  box.root = ROOT_B
  await call($, { ...giving, id: 'other', label: 'Other site' })
  const a = box.store.get(storeKey(ROOT_A)) as Project
  const b = box.store.get(storeKey(ROOT_B)) as Project
  expect(a.items.map(one => one.id)).toEqual(['giving-button'])
  expect(b.items.map(one => one.id)).toEqual(['other'])
})

test('not right goes after the draft without submitting', async ($, on) => {
  const box = world(on)
  let submitted = 0
  on('prompt.submit', (_$, e) => {
    submitted += 1
    return { text: e.text }
  })
  await call($, giving)
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'bad:giving-button' })
  expect(box.filled).toEqual([{ text: 'Not right: Giving page button (http://localhost:8765/give.html). ', mode: 'append' }])
  expect(submitted).toBe(0)
})

const BAND_WITH_ENGINE = (on: On) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  return BAND
}

test('band: nothing before the first item, then count, open and ask', async ($, on) => {
  const box = world(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const before = await $.ui.mount(BAND)
  expect(await before.find({ key: 'open' })).toBe(undefined)
  await before.unmount()
  await call($, giving)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: 'Check it: 1 left to look at' })).toBeDefined()
    await ui.press({ key: 'ask' })
    await ui.unmount()
  }
  expect(box.filled[0]?.mode).toBe('append')
  expect(box.filled[0]?.text).toContain('What should I look at')
})

test('prompt section is added and the tool is not deferred', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
  on('tool.describe', (_$, e) => ({ description: e.description, isDeferred: true }))
  const composed = await $.prompt.compose({
    model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [],
  })
  const mine = composed.sections.find(one => one.id === 'check-it:guide')
  expect(mine?.text).toContain(TOOL)
  const described = await $.tool.describe({ tool: TOOL, description: 'x', provider: { plugin: 'check-it', tier: 'user' } })
  expect(described.isDeferred).toBe(false)
})

test('site address setting reaches the prompt section', { options: { siteAddress: 'https://example.org' } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))
  const composed = await $.prompt.compose({
    model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [],
  })
  expect(composed.sections[0]?.text).toContain('The site can be seen at https://example.org.')
})

test('the terminal button opens any http or https page, and nothing else', async ($, on) => {
  expect(openableHref('http://192.168.1.5:3000/admin')).toBe('http://192.168.1.5:3000/admin')
  expect(openableHref('http://myapp.test/login')).toBe('http://myapp.test/login')
  expect(openableHref('http://127.0.0.1:4321/')).toBe('http://localhost:4321/')
  expect(openableHref('javascript:alert(1)')).toBe(undefined)
  expect(openableHref('file:///etc/hosts')).toBe(undefined)
  expect(openableHref('http://user:pw@example.com/')).toBe(undefined)
  const ran: string[][] = []
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  world(on)
  await call($, { ...giving, where: 'http://192.168.1.5:3000/give' })
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'open:giving-button' })
  expect(ran).toEqual([['open', 'http://192.168.1.5:3000/give']])
  await ui.unmount()
  // Elsewhere a Link cannot take that address, so it shows as text and the pane still draws.
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.findAll({ type: 'Link' })).toEqual([])
  expect(await desktop.find({ type: 'Text', text: 'http://192.168.1.5:3000/give' })).toBeDefined()
  await desktop.unmount()
})
