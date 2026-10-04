# Changelog

## 0.1.5 (2026-10-04)

- In the terminal, `open link` opens any `http://` or `https://` address,
  so a dev server on another machine, a local network address or a `.test`
  domain opens too. Before, only `https:` and `http://localhost` did.
- README rewritten: it covers anything you open in a browser, not only
  websites, and the limits are stated as what the plugin does not do.

## 0.1.4 (2026-10-04)

- `open link` is a real button in the terminal, with the same hover, click
  and keyboard focus as the others. It opens the page with the system's own
  opener. Other surfaces keep a normal link.
- README: says what the button runs, notes how to fix a clashing list
  background, and states the maintenance status.

## 0.1.3 (2026-10-04)

- The list remembers which project it belongs to. After a change of
  directory, a tick or dismiss acts on the list you see, held items go to
  the project they were added in, and `open list` shows the current project.
- Only the main conversation can add items. Helper agents get a message
  asking them to say what to check in their answer instead.
- List changes run one at a time, so two quick presses no longer undo each
  other.
- Addresses longer than 2,048 characters are refused instead of shortened.
- `not right` and `ask what to check` add their text at the end of the
  prompt, after a space when needed, wherever the cursor is.
- README: measurement figures recounted, the version requirement moved next
  to the install command, and the held-items promise reworded.

## 0.1.2 (2026-10-04)

- Addresses written as `http://127.0.0.1` or another loopback address now
  open as `http://localhost` links instead of showing as plain text.
- Added the marketplace manifest, so the plugin installs with
  `claude plugin marketplace add` and `claude plugin install`.
- Added the demo sites and requests behind the measurement notes.
- An empty list now says that new items appear when Claude changes a page
  you can see.

## 0.1.1 (2026-10-04)

- New items appear when Claude's turn ends, so the list never shows a change
  that is not made yet. A stopped turn drops its items.
- When Claude cannot name an address where a change can be seen, it says so
  and names what it needs.
- Opening the list gives it the keyboard: Tab walks the buttons, Esc closes.
- One set of place words: on this computer, test version, live.

## 0.1.0 (2026-10-04)

- First version: the `add` tool, the band above the prompt, the list pane,
  `/check-it` and `/check-it clear`, a list per project, and the site address
  setting.
