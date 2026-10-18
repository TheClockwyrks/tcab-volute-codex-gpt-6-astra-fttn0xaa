# Volute

An original arcade puzzle game set in a geothermal pump hall. Aim the injector,
seat mineral cores into the moving train, and extract runs of three or more
matching charges before the intake consumes a cell. Close the gaps to build
chains. Recover machinery marks for choke, backflow, bore, and sightline effects.
Clear all five halls with three cells.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser, with no
backend, credentials, or runtime network dependencies.

## Production

```sh
npm run build
npm run preview
```

Publish the contents of `dist/` to any static host. `dist/index.html` is the entry
point. Assets resolve relative to the page, including deployments under a
sub-path. The build only bundles committed files; no asset tools are required.

## Controls

| Control                      | Action                       |
| ---------------------------- | ---------------------------- |
| Mouse / pen / touch position | Aim                          |
| A / D or left / right arrows | Rotate the injector          |
| Click / tap or Space         | Fire once per press          |
| X                            | Swap loaded and queued cores |
| Enter / Space or click / tap | Start or dismiss an ending   |
| P / Escape                   | Pause or resume              |
| M                            | Mute or unmute               |
| Backtick                     | Toggle engine diagnostics    |

The engine also supplies touch controls. Match by glyph as well as color:
plus, triangle, square, diamond, and fork identify the five mineral charges.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests use the actual Simple 2D engine with a constant clock and a Node canvas,
decode the committed images, validate audio file headers, and exercise the debug
surface, inputs, fixed ticks, collisions, extraction, machinery, and progression.
Coverage and test reports are written to `coverage/`.

The simulation is in `src/simulation.ts`, the debug contract in `src/game.ts`
and `src/debug.ts`, and the canvas presentation in `src/presentation.ts`.
The engine owns state, timing, input, audio, loading, fitting, and diagnostics.
Presentation events are derived by simulation transitions and never affect the
rules; rendering replays seeded particle systems to their current age without
writing back to the game.

## Authored assets

`public/assets/` contains 15 pixel-art sprites, 16 animation frames, four live
particle systems, thirteen sound effects, two music loops, and their MIDI files.
All were authored for Volute using `draw`, `draw-sheet`, `particle-2d`,
`sfx-synth`, `sfx-sample`, and `music`. The one-time authoring recipe is
`tools/generate_assets.py`; it is not part of installation or building. Running
that recipe requires the original authoring tools and their sample/instrument
banks. The shipped PNG, JSON, WAV, and MIDI files are the production assets.
