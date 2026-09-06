# Frontend design

Cadence looks like an instrument, not an app: dense, hairline-ruled, light, and
quiet. The reference point is a Bloomberg terminal reinterpreted for a light
ground — the influence shows up as density and structure, never as costume.

## Tokens are the design system

Every color, size and radius comes from a custom property declared at the top of
`web/src/styles.css`. **Do not introduce a raw hex value in a component or a new
rule** — if something needs a color that isn't there, add a token. The previous
stylesheet drifted to ~150 one-off hexes, which is what made the UI look
inconsistent.

## Color

Two accents, with strictly separate jobs:

- `--structure` (`#16324f`, ink blue) — selection, active nav, primary buttons,
  focus rings, links. The color of "what you picked".
- `--signal` (`#b45309`, amber) — the current phase badge, phase progress, and
  comment markers. The color of "where you are". Nothing else may use it.

Keeping those apart is what stops the UI reading as a themed app. Status colors
(`--done`, `--danger`, `--warn`, `--open`) are semantic and separate from both.

## Scales — stay on them

- **Spacing**: `--s1` 4px, `--s2` 8px, `--s3` 12px, `--s4` 16px, `--s5` 24px.
- **Type**: `--fs-label` 9.5px (mono, uppercase, letterspaced), `--fs-ui` 11px,
  `--fs-body` 12px, `--fs-title` 15px, `--fs-doc` 15px. Nothing in between.
- **Radius**: `--r` 2px everywhere. Circles only for status dots and phase badges.
- **Controls**: `--ctl-h` 22px, `--ctl-pad` 3px/7px. **Rows**: `--row` 26px.

Tight is the point. If a control feels roomy, it's wrong.

## Typography

IBM Plex Sans for UI and prose, IBM Plex Mono for anything that is data — IDs,
priorities, counts, hex values, save state, column headers, micro-labels. Both
are bundled locally via `@fontsource`, so the app looks the same offline; never
add a webfont CDN. Use `font-variant-numeric: tabular-nums` wherever digits align.

## Layout

- One gutter (`--gutter`) shared by the task header, phase header and document,
  so the document's left edge lines up with the header above it.
- Every truncating label needs the full `min-width: 0` chain on its flex
  ancestors, or it escapes its container.
- Wide content (board columns, tables, code) scrolls inside its own container;
  the page body never scrolls sideways.
- Check meaningful UI changes in a browser at desktop and compact widths —
  spacing, overflow and keyboard interaction, not just compilation.

## Copy

Factual labels that name the action or state. No slogans, no explanatory
subtitles, no redundant hints. Keyboard operation and visible focus stay intact.
