# Measurement, v0 (2026-10-04)

Demo: a five-page bakery site (`demo/bakery-html`), each session in a
fresh copy served on its own `http://localhost:<port>`, the port given to the
mod as `siteAddress`. Headless `claude -p --plugin-dir`, permission mode
`acceptEdits` (so shell commands such as `curl` were refused). Requests are in
plain words and never mention the list (`demo/requests-html.tsv`).

A "visible change" is one thing a person would check: a site-wide footer edit
on five pages counts once. Wrong link: the item's address does not show the
change once the session ends. Junk: an item for a change nobody can see.

| Round | Wording | Model | Sessions | Visible changes | Listed | Items | Wrong link | Junk | Added before the edit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | v1 | Opus 5.5 (default) | 10 | 10 | 10 | 13 | 0 | 0 | 0 |
| 2 | v2 | Opus 5.5 (default) | 10 | 10 | 10 | 11 | 0 | 0 | 0 |
| 3 | v2 | Sonnet 5.5 | 2 | 5 | 5 | 5 (+1 update) | 0 | 0 | 5 of 6 calls |
| 4 | v2, no address, no server | Opus 5.5 (default) | 5 | 8 | 0 | 0 | 0 | 0 | 0 |
| 5 | v3 | Opus 5.5 (default) | 2 | 5 | 5 | 5 | 0 | 0 | 0 |
| 5 | v3 | Sonnet 5.5 | 2 | 5 | 5 | 5 | 0 | 0 | 3 of 5 calls |

Round 1 split one footer change into five items (one per page); v2 says a
site-wide change is one item. v3 adds "never before making the change" for
Sonnet; one of two Sonnet runs then added after its edits.

Requests with no visible change (internal tracking, code tidy, unpublished
draft): no items in any run.

## Round 2 (v0.1, harder demo)

Demo: an Astro 7 site (`demo/bakery-astro`) with a build step. The
preview serves the last build, so an edit shows only after `npm run build`.
It has a shared top bar and footer, menu and hours in data files, an order
form with a script, and a home page button that links to the wrong page.
Sessions may run `npm run build` (exactly that command); other shell
commands are refused, as before. Requests: `demo/requests-astro.tsv`.

Modes: `local` (preview running, address set to it), `live` (preview running
and named in the README, address set to the public https site), `liveonly`
(address set to the public site, no preview running or named), `noaddr` (no
address, no preview).

| Mode | Model | Sessions | Visible changes | Viewable at session end | Listed | Wrong link | Listed at an address where not viewable | Junk | Said what it needs when not listed |
|---|---|---|---|---|---|---|---|---|---|
| local | Opus 5.5 | 7 | 7 | 6 | 6 | 0 | 0 | 0 | 1 of 1 |
| live | Opus 5.5 | 3 | 3 | 3 | 3 | 0 | 0 | 0 | n/a |
| liveonly | Opus 5.5 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 3 of 3 |
| noaddr | Opus 5.5 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 of 2 |
| local | Sonnet 5.5 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | n/a |
| live | Sonnet 5.5 | 2 | 2 | 2 | 2 | 0 | 0 | 0 | n/a |
| liveonly | Sonnet 5.5 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 of 2 |

Each item's link was checked against the built page the preview serves.

## Round 3 (interactive, v0.1.1)

Three interactive sessions in a terminal on fresh copies of the Astro demo,
with no preview running and no site address set. The person approved what
Claude asked to run.

| Request | Started a preview | Items | Links show the change | What the person did |
|---|---|---|---|---|
| Instagram link in the footer | yes, after asking | 1 | yes | approved 5 commands |
| Wrong target on the home page button | yes, after asking | 1 | yes, but shown as plain text (`http://127.0.0.1`), fixed in 0.1.2 | approved 4 commands, refused one that opened the preview to the network, typed one line |
| Monday opening hours | yes, after asking | 2 | yes | approved 7 commands, refused one that opened the preview to the network, typed one line |

The two network-wide previews came from the tester's own Claude Code
instructions, which ask for network access to local servers. They are not
part of the plugin.
