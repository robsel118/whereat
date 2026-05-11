# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open `index.html` directly in a browser, or serve it with any static file server:

```
python3 -m http.server 8080
```

There is no package.json, no npm, no bundler. React 18, ReactDOM, and Babel standalone are loaded from CDN via `<script>` tags in `index.html`.

## Architecture

**whereat** is a no-build, single-page React app for tracking days spent in each country.

- `index.html` — entry point; loads CDN deps (React, ReactDOM, Babel) then `countries.js` and `app.jsx`
- `countries.js` — sets `window.COUNTRIES` (array) and `window.COUNTRY_BY_CODE` (object keyed by ISO code); accessed as globals from `app.jsx`
- `app.jsx` — all React components in one file; Babel transpiles JSX in the browser at runtime
- `styles.css` — all styles

**State model** (`localStorage` key `whereat:v1`):
- `entries`: `{ "YYYY-MM-DD": ["US", "FR", ...] }` — up to 3 country codes per day
- `recent`: ordered array of recently used country codes (max 8), drives the quick-pick row

**Component tree:**
```
App
├── StatsBar       — year-scoped day count + per-country breakdown, upcoming travel hint
├── CountryPicker  — recent country pills + add (+) + eraser buttons
├── Toolbar        — shows active country/eraser, range-mode toggle
├── Calendar       — month grid; handles paint-by-drag and range-select
└── CountryModal   — searchable full country list modal
```

**Interaction modes:**
- **Paint/drag** (default): `pointerdown` on a cell sets drag mode (`add` or `remove` based on whether the cell already has the active country), subsequent `pointerenter` events continue painting
- **Range mode**: first click sets `rangeStart`, second click applies the active country (or eraser) across the entire date range
- **Eraser**: `activeCode === "__ERASER__"` — clears all countries from a date

**Cursor**: `emojiCursor()` renders the active country flag (or eraser emoji) to a `<canvas>` and returns a CSS `cursor` data-URL; results are cached in `_cursorCache`.
