import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Held, Item, Project, Shown } from '../types'
import {
  ASK_TEXT,
  PLACE_WORDS,
  add,
  clear,
  dismiss,
  empty,
  leftLine,
  notRightText,
  safeHref,
  setStatus,
  storeKey,
  toItem,
  openableHref,
} from './list'

const TOOL = 'mcp__check-it__add'
const PANE = 'check-it'

const shown = atom({ plugin: 'check-it', key: 'shown' } as const, { root: '', ...empty() } as Shown)
const showChecked = atom({ plugin: 'check-it', key: 'showChecked' } as const, false)
const pending = atom({ plugin: 'check-it', key: 'pending' } as const, [] as Held[])

export const DESCRIPTION = [
  "Adds one item to the person's Check it list: something they should open and look at with their own eyes",
  'because you changed what a web page shows or does. Call it once per visible change, only after the edit is saved',
  'and the change can be seen at `where`, never before you make it. Do not call it for changes nobody can see (refactors, tests, config, scripts,',
  'comments). Reuse the same `id` when the same thing changes again.',
].join(' ')

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'A short stable id for this thing, e.g. "contact-hours". Reuse it when the same thing changes again.',
    },
    label: {
      type: 'string',
      description: 'What to look at, in plain words a non-developer uses, no file names. e.g. "Opening hours on the contact page".',
    },
    expect: {
      type: 'string',
      description: 'One line: what the person should see there now. e.g. "Saturday now says 9 to 1".',
    },
    where: {
      type: 'string',
      description: 'The full web address where the change can be seen now, starting with http:// or https://, with the page path. For a page on this computer write localhost, not 127.0.0.1.',
    },
    place: {
      type: 'string',
      enum: ['local', 'preview', 'live'],
      description: 'local: on this computer only. preview: a test version online. live: the public site.',
    },
  },
  required: ['id', 'label', 'expect', 'where', 'place'],
}

export const sectionText = (siteAddress: string) =>
  [
    '# Check it list',
    'The person keeps a list of things to look at after you change something they can see. When your work changes',
    'what a web page shows or how it behaves for a visitor (words, layout, colors, images, links, buttons, forms,',
    `new or removed pages), call ${TOOL} once for each distinct visible change, after your edits are saved and before`,
    'your final reply (never before making the change), with the',
    'address of the page where that change can be seen right now. Several changes on one page that a person would',
    'check at a glance can be one item; changes on different pages are separate items. A change to something every',
    'page shares (the top bar, the footer, the colors) is one item, linked to one page that shows it.',
    'Do not add items for changes with no visible effect. If a change cannot be seen yet (not built, not deployed,',
    'nothing serving it), do not add it. When you made a visible change but cannot name an address where it can be',
    'seen right now, say so in one sentence in your reply and name what you need: the site address (the person sets',
    'it in /config under check-it) or how the site is served.',
    ...(siteAddress === '' ? [] : [`The site can be seen at ${siteAddress}. Build links from it.`]),
  ].join('\n')

type $ = EngineInterface

const stored = async ($: $, root: string): Promise<Project> =>
  ((await $.store.get(storeKey(root))) as Project | undefined) ?? empty()

/**
 * Runs list writes one at a time, so two presses (or a press and a turn ending)
 * never read the same list and overwrite each other.
 */
let queue: Promise<unknown> = Promise.resolve()
const serial = <T,>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

/** Changes the list of one project, and the screen when it shows that project. */
const change = ($: $, root: string, fn: (p: Project) => Project) =>
  serial(async () => {
    const next = fn(await stored($, root))
    await $.store.set(storeKey(root), next)
    await update($, shown, now => (now.root === root || now.root === '' ? { root, ...next } : now))
    return next
  })

/** Puts the current project's list on screen. */
const show = ($: $) =>
  serial(async () => {
    const root = await $.session.root()
    const next = await stored($, root)
    await update($, shown, () => ({ root, ...next }))
  })

/** Adds text after whatever the person has typed, with a space between, and never sends it. */
const appendToPrompt = async ($: $, text: string) => {
  const draft = (await $.prompt.read()).text
  const gap = draft === '' || /\s$/.test(draft) ? '' : ' '
  return $.prompt.fill({ text: gap + text, mode: 'append' })
}

/** Opened by the person (a command or a press), so it takes the keys: Tab walks its buttons, Esc closes it. */
// The terminal draws a Link as a hyperlink with no hover or focus, so there the mod opens the
// page itself, with the system's own opener and an address safeHref already passed. No shell.
const openInBrowser = async ($: $, href: string) => {
  for (const opener of ['open', 'xdg-open']) {
    try {
      const ran = await $.process.run([opener, href], { timeoutMs: 10000 })
      if (ran.exitCode === 0) return
    } catch {
      // this opener is not on this computer; try the next
    }
  }
  $.ui.toast(`Could not open the browser. The page is at ${href}`)
}

const openPane = ($: $) => show($).then(() => openOnly($))
const openOnly = ($: $) => $.ui.open({ id: PANE, title: 'Check it', columns: 34, focus: true, closeOnEscape: true })

export const register: Register = (on, options) => {
  const siteAddress = typeof options.siteAddress === 'string' ? options.siteAddress.trim() : ''

  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'add', description: DESCRIPTION, inputSchema: INPUT_SCHEMA })
    await $.command.register({
      name: 'check-it',
      description: 'Open the Check it list (/check-it clear empties it)',
    })
    await show($)
    return next(e)
  })

  on('tool.describe', { tool: TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))

  on('tool.check', { tool: TOOL }, () => ({ decision: 'allow' }))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // Only the main conversation adds items: a subagent's turn can be stopped or
    // still running when the main turn ends, and its items would show anyway.
    if (e.agentId !== undefined) {
      return { result: 'Not added: only the main conversation can add to the Check it list. Say in your answer what the person should look at.' }
    }
    const item = toItem(e as Record<string, unknown>, await $.clock.now())
    if ('error' in item) return { result: `Not added: ${item.error}` }
    // Held until the turn ends, and kept with the project it was added in.
    const root = await $.session.root()
    await update($, pending, held => [...held.filter(one => one.root !== root || one.item.id !== item.id), { root, item }])
    const note = openableHref(item.where) === undefined
      ? ' Note: that is not an http:// or https:// address, so it shows as plain text.'
      : ''
    return { result: `Added "${item.label}" to the Check it list.${note}` }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const held = await read($, pending)
      if (held.length > 0) {
        await update($, pending, () => [])
        if (e.reason !== 'aborted' && !e.isAborted) {
          for (const root of new Set(held.map(one => one.root))) {
            const items = held.filter(one => one.root === root).map(one => one.item)
            await change($, root, p => items.reduce(add, p))
          }
        }
      }
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      sections: [...composed.sections, { id: 'check-it:guide', text: sectionText(siteAddress), scope: 'session' }],
    }
  })

  on('command.run', { command: 'check-it' }, async ($, e) => {
    if (e.args.trim() === 'clear') {
      const root = await $.session.root()
      await change($, root, clear)
      await update($, pending, held => held.filter(one => one.root !== root))
      return { text: 'Check it list cleared.' }
    }
    await openPane($)
    return { text: 'Check it list opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, shown)
    if (e.props.hasSurvey || !p.ever) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text>{leftLine(p)}</Text>
        <Button key="open" label="open list" onPress={() => openPane($)} />
        <Button key="ask" label="ask what to check" onPress={() => appendToPrompt($, ASK_TEXT)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const p = await read($, shown)
    // Every press acts on the project this list belongs to, even after a change of directory.
    const root = p.root
    const isShowingChecked = await read($, showChecked)
    const open = p.items.filter(one => one.status === 'open').reverse()
    const checked = p.items.filter(one => one.status === 'checked').reverse()

    const whereOf = (item: Item) => {
      // The terminal button opens any http(s) page; a Link elsewhere takes only what safeHref passes.
      const href = e.surface === 'terminal' ? openableHref(item.where) : safeHref(item.where)
      if (href === undefined) return <Text dimColor wrap="truncate-end">{item.where}</Text>
      return e.surface === 'terminal'
        ? <Button key={`open:${item.id}`} label="open link" onPress={() => openInBrowser($, href)} />
        : <Link href={href} label="open link" />
    }

    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>
          {open.length === 0 ? 'Nothing left to look at. New items appear when Claude changes a page you can see.' : `${open.length} to look at. Claude says:`}
        </Text>
        {open.map(item => (
          <Box key={`item:${item.id}`} flexDirection="column">
            <Text bold>{item.label}</Text>
            {item.expect !== '' && <Text>{item.expect}</Text>}
            <Box flexDirection="row" columnGap={1}>
              <Text dimColor>{PLACE_WORDS[item.place]}</Text>
              {whereOf(item)}
            </Box>
            <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
              <Button key={`check:${item.id}`} label="checked" onPress={() => change($, root, q => setStatus(q, item.id, 'checked'))} />
              <Button
                key={`bad:${item.id}`}
                label="not right"
                onPress={() => appendToPrompt($, notRightText(item))}
              />
              <Button key={`dismiss:${item.id}`} label="dismiss" dimColor onPress={() => change($, root, q => dismiss(q, item.id))} />
            </Box>
          </Box>
        ))}
        {checked.length > 0 && (
          <Box key="checked" flexDirection="column">
            <Button
              key="toggle-checked"
              plain
              dimColor
              label={`${isShowingChecked ? 'v' : '>'} checked (${checked.length})`}
              onPress={() => update($, showChecked, shown => !shown)}
            />
            {isShowingChecked &&
              checked.map(item => (
                <Box key={`done:${item.id}`} flexDirection="row" columnGap={1}>
                  <Text dimColor wrap="truncate-end">{item.label}</Text>
                  <Button key={`undo:${item.id}`} label="undo" dimColor onPress={() => change($, root, q => setStatus(q, item.id, 'open'))} />
                </Box>
              ))}
          </Box>
        )}
        <Button key="ask" label="ask what to check" dimColor onPress={() => appendToPrompt($, ASK_TEXT)} />
      </Box>
    )
  })
}
