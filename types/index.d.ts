export type Place = 'local' | 'preview' | 'live'

export type Item = {
  id: string
  label: string
  expect: string
  where: string
  place: Place
  addedAt: number
  status: 'open' | 'checked'
}

export type Project = { items: Item[]; ever: boolean }

/** The list on screen and the project root it belongs to. */
export type Shown = Project & { root: string }

/** An item Claude added this turn, and the project root it was added in. */
export type Held = { root: string; item: Item }

declare module 'claude-code' {
  interface PluginState {
    'check-it': { shown: Shown; showChecked: boolean; pending: Held[] }
  }
}
