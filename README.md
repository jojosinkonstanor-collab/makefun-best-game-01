# EMBERWARD — Defend the Last Ember

An original top-down arena survival shooter for the make.fun **best-game-01**
bounty ("Make the best game", $1,000). You are the Warden of the last ember:
hold the arena against waves of gloom, gather ember shards, level up and choose
upgrades, and break the Gloom Herald — then the Elder Herald on Wave 10 — to win.

## How to run

No build step, no network, no install. Any static file server works:

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

or open `game/index.html` directly in a desktop browser (Chrome recommended).
The game is plain ES modules under `game/`; every asset is drawn or synthesised
in code, so it plays fully offline.

## Controls

| Input | Action |
| --- | --- |
| WASD / Arrow keys | Move |
| Mouse | Aim |
| Hold Left Click / Space | Fire |
| 1 / 2 / 3 or click a card | Choose a level-up upgrade |
| P / Esc | Pause / resume |
| R | Restart (from pause, game over, victory) |
| C | Keep going in Endless mode (after victory) |
| M | Mute / unmute |

## The game

- **Goal:** survive 10 waves and destroy the Elder Herald on Wave 10. After the
  win you can keep playing in Endless mode while the waves keep scaling.
- **Enemies:** Wisps (fast chasers), Dashers (telegraph then lunge), Spitters
  (keep their distance and shoot), Husks (slow tanks), and the Herald boss
  (radial bullet bursts, summons Wisps, three phases).
- **Progress:** enemies drop ember shards — collect them to level up and pick
  1 of 3 upgrades from a pool of 12 (damage, fire rate, multishot, pierce,
  ricochet, crit, nova bursts, magnet, regen, max health, move speed, bullet
  size). Hearts, shields and rapid-fire pickups drop as well.
- **Scoring:** kills build a combo multiplier (up to x3); score, wave, kills,
  best combo and accuracy are shown on the game-over and victory screens.
  Best score persists in `localStorage`.
- **Feel:** particles, screen shake, hit-stop on boss kills, floating damage
  numbers, damage flash, low-health pulse — and fully synthesised WebAudio
  sound effects plus a generative music loop that intensifies with the wave.
  No audio files are shipped.
- **Screens:** animated title (a demo game plays behind the menu), pause,
  level-up card choice, game over with stats and restart, victory with stats,
  restart and Endless continue.

## Screenshots

`?shot=<scene>&seed=N` stages a deterministic scene from the real rules
(autopilot plays, same seed = same frame) and sets `window.__shotReady`:

- `1-title.jpg` — `?shot=title&seed=1`
- `2-play.jpg` — `?shot=play&seed=1`
- `3-levelup.jpg` — `?shot=levelup&seed=1`
- `4-over.jpg` — `?shot=over&seed=1`

## Layout

```
main.ts                  entrypoint: copies game/ + screenshots/ to /output,
                         writes /output/dossier.json (Node 22, stdlib only)
serve.ts                 tiny static server for local play
vendor/makefun-game.ts   the kit's dossier library, unchanged
game/
  index.html             canvas + module bootstrap
  src/
    config.js            tuning constants, enemy table, wave rules
    random.js            seeded RNG + math helpers
    audio.js             WebAudio SFX + generative music (no audio files)
    input.js             keyboard + mouse state
    particles.js         particles, floating text, screen shake, hit-stop
    enemies.js           enemy kinds, AI, spawning
    upgrades.js          the 12-upgrade level-up pool
    world.js             simulation: player, bullets, waves, XP, scoring
    render.js            all canvas drawing: arena, entities, HUD, screens
    game.js              screen state machine + fixed-step loop + autopilot
    shots.js             deterministic screenshot scenes
    main.js              bootstrap + ?shot= handling
screenshots/            1-title, 2-play, 3-levelup, 4-over (real renders)
```

## Building the entry output

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/game/`, `out/screenshots/` and `out/dossier.json` — exactly
what the grader reads. Run it twice and compare: both runs must be byte
identical.

## Notes for iteration

- Balance lives in `game/src/config.js` (enemy stats, wave budget, XP curve)
  and `game/src/upgrades.js` (upgrade pool).
- The autopilot in `game/src/game.js` (`makeAutopilot`) drives both the
  title-screen demo and the screenshot scenes; improving it improves the
  screenshots and the demo at once.
- The game never fetches, never loads a remote asset and never touches the
  network: the only storage it uses is `localStorage` for the best score.
