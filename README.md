# Thea Townhouse Explorer

An interactive Three.js / WebGL 2 model of an eight-unit townhouse block. Select a unit to inspect its structure, roof framing, electrical, data, plumbing, doors and windows, and to measure surfaces. Geometry and concealed routes are approximate.

## Run locally

```sh
npm start   # serves the repo root at http://127.0.0.1:4173
```

No build step or dependencies. Three.js is vendored in `vendor/`.

## Deploy

Static site served from the repo root. `vercel.json` disables build and install steps; `.vercelignore` excludes tests and tooling.

```sh
vercel --prod
```

## Controls

- Pick a unit to focus it; **View block** returns to both rows.
- Toggle or isolate building systems, filter floors, adjust wall opacity and separate floors.
- Select walls, floors, roofs, windows or doors for measurements.
- Drag to orbit, scroll to zoom, right-drag to pan. Arrow keys orbit, `+`/`-` zoom, Home resets, Escape clears selection.

## Layout

- `index.html`, `style.css`: page and styles
- `app.js`: model geometry and UI
- `*.mjs`: lots, block view, openings, wall surfaces, floors, conduit planning (shared geometry, floor and ceiling), measurements, selection outlines
- `tests/`: Node tests for the helpers

```sh
npm test
```

Model state is exposed on `window.townhouse` for console inspection.

## License

MIT. Three.js is vendored under its own MIT license (`vendor/THREE-LICENSE.txt`).
