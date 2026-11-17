// The deterministic screenshot scenes behind ?shot=title|play|levelup|over&seed=N.
// Each scene plays the real rules forward from a fresh world for a fixed number of
// steps, steered by the game's own autopilot, so the frame is what a short game
// really looks like and the same seed always gives the same frame. When a scene is
// staged, main.js draws one frame and sets window.__shotReady.
import { STEP } from './config.js';
import { EVENT_LEVELUP, EVENT_OVER, EVENT_VICTORY } from './world.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { makeAutopilot } from './game.js';

const TITLE_SECONDS = 9;
const LEVELUP_SECONDS = 60;
const OVER_LIMIT_SECONDS = 240;
const OVER_WARMUP_SECONDS = 40;
const SAMPLE = STEP;

/**
 * A deliberately bad pilot for the game-over scene: it wanders, never shoots, and
 * walks into the swarm, so the warden falls the way a careless player would.
 */
function carelessPilot(world) {
  const p = world.player;
  const tx = 640 + Math.sin(world.time * 0.4) * 260;
  const ty = 396 + Math.cos(world.time * 0.3) * 200;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const mag = Math.hypot(dx, dy) || 1;
  return {
    moveX: () => dx / mag,
    moveY: () => dy / mag,
    firing: () => false,
    mouseX: p.x,
    mouseY: p.y - 100,
  };
}

function runSteps(game, seconds, pilotFn) {
  const world = game.world;
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(SAMPLE, pilotFn(world));
    if (events & (EVENT_OVER | EVENT_VICTORY)) break;
    if (events & EVENT_LEVELUP) {
      // In a shot scene the choice is made for the player: take the first card.
      world.applyUpgrade(world.levelUpChoices[0]);
    }
  }
}

/**
 * Play `seconds` of live game for a screenshot, restarting the world if the pilot
 * dies, so a title or play shot never shows a dead warden.
 */
function runAlive(game, seconds, pilotFn, seed) {
  let remaining = seconds;
  for (let attempt = 0; attempt < 3 && remaining > 0; attempt += 1) {
    const before = game.world.time;
    runSteps(game, remaining, pilotFn);
    const played = game.world.time - before;
    remaining -= played;
    if (game.world.over || game.world.victory) {
      game.world.reset(seed + attempt + 1);
      continue;
    }
    break;
  }
}

/**
 * Play until `ready(world)` is true (a busy, readable moment) or `seconds` run
 * out, restarting if the pilot dies, so the play shot shows the game at full tilt.
 */
function runUntilBusy(game, seconds, ready, pilotFn, seed) {
  const world = game.world;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const steps = Math.floor(seconds / SAMPLE);
    let done = false;
    for (let i = 0; i < steps; i += 1) {
      const events = world.step(SAMPLE, pilotFn(world));
      if (events & (EVENT_OVER | EVENT_VICTORY)) break;
      if (events & EVENT_LEVELUP) world.applyUpgrade(world.levelUpChoices[0]);
      if (ready(world)) {
        done = true;
        break;
      }
    }
    if (done || (!world.over && !world.victory)) return;
    game.world.reset(seed + attempt + 1);
  }
}

/** Stage `name` on the game and return the screen to draw over it. */
export function stageShot(game, name, seed) {
  const world = game.world;
  world.reset(seed);
  game.screen = SCREEN_PLAY;

  if (name === 'title') {
    game.attract = true;
    runAlive(game, TITLE_SECONDS, (w) => makeAutopilot(w, game.input), seed);
    game.screen = SCREEN_TITLE;
    game.attract = true;
    return;
  }

  if (name === 'play') {
    // The Herald fight on wave 5: boss, radial bullets, adds, boss bar — the
    // game at full tilt, with the warden near the middle of the frame. Wait
    // until a new v2 foe (splitter or bomber) has joined the fight too.
    runUntilBusy(
      game, 180,
      (w) => w.wave >= 5 && w.boss !== null && w.enemies.length >= 4
        && w.enemies.some((e) => e.kind === 'splitter' || e.kind === 'bomber')
        && Math.abs(w.player.x - 640) < 320 && Math.abs(w.player.y - 396) < 220,
      (w) => makeAutopilot(w, game.input), seed,
    );
    game.screen = SCREEN_PLAY;
    return;
  }

  if (name === 'levelup') {
    // Play until the first level-up, then stop on the card screen.
    const steps = Math.floor(LEVELUP_SECONDS / SAMPLE);
    for (let i = 0; i < steps; i += 1) {
      const events = world.step(SAMPLE, makeAutopilot(world, game.input));
      if (events & EVENT_LEVELUP) break;
      if (events & (EVENT_OVER | EVENT_VICTORY)) break;
    }
    if (!world.levelUpChoices) {
      // The pilot had a quiet run: top the XP bar up through the normal pickup
      // path so the level-up (and its three cards) happens for real.
      const p = world.player;
      p.xp = p.xpNext - 1;
      world.collectPickup({ kind: 'shard' });
    }
    game.screen = world.levelUpChoices ? SCREEN_LEVELUP : SCREEN_PLAY;
    return;
  }

  // 'over' (and any unknown name): the warden first plays well — a real run with a
  // score, kills and waves behind it — then the careless pilot takes over and falls.
  runSteps(game, OVER_WARMUP_SECONDS, (w) => makeAutopilot(w, game.input));
  if (!world.over && !world.victory) {
    const steps = Math.floor(OVER_LIMIT_SECONDS / SAMPLE);
    for (let i = 0; i < steps; i += 1) {
      const events = world.step(SAMPLE, carelessPilot(world));
      if (events & EVENT_LEVELUP) world.applyUpgrade(world.levelUpChoices[0]);
      if (events & EVENT_OVER) break;
      if (events & EVENT_VICTORY) break;
    }
  }
  if (!world.over) {
    // The pilot survived the limit: finish the warden off through the rules.
    world.player.hp = 1;
    world.damagePlayer(99, world.player.x, world.player.y);
  }
  // Let the death burst play out and the hurt flash fade before the frame is taken.
  for (let i = 0; i < 45; i += 1) world.particles.update(STEP);
  game.screen = SCREEN_OVER;
  if (world.score > game.best) game.best = world.score;
}
