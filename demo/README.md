# Demo sites

Two copies of a made-up bakery website, used to measure how well Claude fills
the Check it list. The numbers are in `docs/measurement-v0.md`.

- `bakery-html`: five plain HTML pages. Serve the `site` folder with any
  static server, for example `python3 -m http.server 8765 --directory site`.
- `bakery-astro`: the same bakery as an Astro site with a build step. Run
  `npm install`, `npm run build`, then `npm run preview`. The preview shows
  the last build only.

`requests-html.tsv` and `requests-astro.tsv` hold the requests each session
was given, in plain words, one per line: number, mode, kind, request.

Each measured session ran on a fresh copy, with `claude -p --plugin-dir` and
the site address set to the copy's local preview.
