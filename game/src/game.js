// The game: screen state machine, the fixed-step loop and the wiring between input,
// world, audio and renderer. The world is stepped at a fixed 1/60 s so play is the
// same on any display; rendering happens once per animation frame.
import { STEP, VICTORY_WAVE } from './config.js';
import { EVENT_LEVELUP, EVENT_OVER, EVENT_VICTORY, World } from './world.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Renderer, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const BEST_KEY = 'emberward.best';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.input.attach();
    this.world = new World(this.audio);
    this.renderer = new Renderer(canvas);
    this.screen = SCREEN_TITLE;
    this.best = this.loadBest();
    this.accumulator = 0;
    this.lastTime = 0;
    this.levelUpRects = [];
    this.hoverCard = -1;
    this.attract = false; // title screen plays a demo game behind the menu
    this.shotMode = false;
  }

  loadBest() {
    try {
      return Number(window.localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  }

  saveBest() {
    try {
      window.localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      // Storage unavailable (private mode): the best score just does not persist.
    }
  }

  start() {
    this.world.reset((Date.now() % 2147483647) | 1);
    this.screen = SCREEN_PLAY;
    this.audio.unlock();
    this.audio.startMusic();
    this.audio.intensity = 0.1;
  }

  restart() {
    this.start();
  }

  /** The title screen runs a live demo behind the menu: an autopilot warden fights. */
  startAttract() {
    this.world.reset(1337);
    this.attract = true;
    this.screen = SCREEN_TITLE;
  }

  quitToTitle() {
    this.startAttract();
  }

  applyLevelUp(index) {
    const choices = this.world.levelUpChoices;
    if (!choices || index < 0 || index >= choices.length) return;
    this.world.applyUpgrade(choices[index]);
    this.screen = SCREEN_PLAY;
    this.audio.click();
  }

  handleEvents(events) {
    // Behind the title screen the demo plays itself: a level-up is auto-picked and
    // a death just restarts the demo, so the menu never leaves the screen.
    if (this.screen === SCREEN_TITLE) {
      if (events & EVENT_LEVELUP) this.world.applyUpgrade(this.world.levelUpChoices[0]);
      if ((events & EVENT_OVER) || (events & EVENT_VICTORY)) this.startAttract();
      return;
    }
    if (events & EVENT_OVER) {
      this.screen = SCREEN_OVER;
      if (this.world.score > this.best) {
        this.best = this.world.score;
        this.saveBest();
      }
      this.audio.stopMusic();
    } else if (events & EVENT_VICTORY) {
      this.screen = SCREEN_VICTORY;
      if (this.world.score > this.best) {
        this.best = this.world.score;
        this.saveBest();
      }
      this.audio.victory();
      this.audio.stopMusic();
    } else if (events & EVENT_LEVELUP) {
      this.screen = SCREEN_LEVELUP;
    }
    if (this.screen === SCREEN_PLAY) {
      this.audio.intensity = Math.min(1, 0.1 + this.world.wave * 0.09);
    }
  }

  /** One animation frame: advance the simulation, then draw. */
  frame(now) {
    const dt = Math.min(0.1, (now - this.lastTime) / 1000 || 0);
    this.lastTime = now;

    this.updateHover();
    this.handleGlobalKeys();

    if (this.screen === SCREEN_PLAY || this.screen === SCREEN_TITLE) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.accumulator -= STEP;
        steps += 1;
        const input = this.screen === SCREEN_TITLE ? this.attractInput() : this.input;
        const stepped = this.world.step(STEP, input);
        // The flags are OR-ed in too: a win or a death set outside a step (a test,
        // a shot scene) still has to reach the screens.
        const events = stepped
          | (this.world.over ? EVENT_OVER : 0)
          | (this.world.victory ? EVENT_VICTORY : 0)
          | (this.world.levelUpChoices ? EVENT_LEVELUP : 0);
        this.handleEvents(events);
        if (this.screen !== SCREEN_PLAY && this.screen !== SCREEN_TITLE) break;
      }
      if (steps === 5) this.accumulator = 0;
    }

    this.renderer.draw(this);
    this.input.endFrame();
  }

  /** The demo pilot behind the title screen: chase, shoot, survive. */
  attractInput() {
    return makeAutopilot(this.world, this.input);
  }

  handleGlobalKeys() {
    const input = this.input;
    if (input.wasPressed('KeyM')) {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.muted);
    }
    if (this.screen === SCREEN_TITLE) {
      if (input.wasPressed('Enter') || input.wasPressed('Space') || input.wasMousePressed()) {
        this.audio.unlock();
        this.audio.click();
        this.attract = false;
        this.start();
      }
      return;
    }
    if (this.screen === SCREEN_PLAY) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        this.screen = SCREEN_PAUSE;
        this.audio.click();
      }
      return;
    }
    if (this.screen === SCREEN_PAUSE) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasMousePressed()) {
        this.screen = SCREEN_PLAY;
        this.audio.click();
      } else if (input.wasPressed('KeyR')) {
        this.restart();
      }
      return;
    }
    if (this.screen === SCREEN_LEVELUP) {
      if (input.wasPressed('Digit1')) this.applyLevelUp(0);
      else if (input.wasPressed('Digit2')) this.applyLevelUp(1);
      else if (input.wasPressed('Digit3')) this.applyLevelUp(2);
      else if (input.wasMousePressed()) {
        for (const rect of this.levelUpRects) {
          if (input.mouseX >= rect.x && input.mouseX <= rect.x + rect.w && input.mouseY >= rect.y && input.mouseY <= rect.y + rect.h) {
            this.applyLevelUp(rect.index);
            break;
          }
        }
      }
      return;
    }
    if (this.screen === SCREEN_OVER) {
      if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasPressed('Space') || input.wasMousePressed()) {
        this.restart();
      }
      return;
    }
    if (this.screen === SCREEN_VICTORY) {
      if (input.wasPressed('KeyR') || input.wasPressed('Enter')) {
        this.restart();
      } else if (input.wasPressed('KeyC')) {
        // Endless: keep playing past wave 10, the waves keep scaling.
        this.world.victory = false;
        this.world.waveState = 'clear';
        this.world.waveTimer = 2;
        this.screen = SCREEN_PLAY;
        this.audio.startMusic();
      } else if (input.wasMousePressed()) {
        this.restart();
      }
    }
  }

  updateHover() {
    this.hoverCard = -1;
    if (this.screen !== SCREEN_LEVELUP) return;
    for (const rect of this.levelUpRects) {
      if (this.input.mouseX >= rect.x && this.input.mouseX <= rect.x + rect.w && this.input.mouseY >= rect.y && this.input.mouseY <= rect.y + rect.h) {
        this.hoverCard = rect.index;
        break;
      }
    }
  }
}

/**
 * A simple autopilot used for the title-screen demo and for the deterministic
 * screenshot scenes: move toward the nearest shard or enemy, keep away from
 * anything touching, aim at the nearest enemy and always fire.
 */
export function makeAutopilot(world, input) {
  const p = world.player;
  let tx = p.x;
  let ty = p.y;
  let nearest = null;
  let nearestD = Infinity;
  for (const e of world.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < nearestD) {
      nearestD = d;
      nearest = e;
    }
  }
  let shard = null;
  let shardD = Infinity;
  for (const pk of world.pickups) {
    if (pk.kind !== 'shard') continue;
    const d = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
    if (d < shardD) {
      shardD = d;
      shard = pk;
    }
  }
  // Dodge: if an enemy orb is close and flying at us, sidestep perpendicular to it.
  let dodgeX = 0;
  let dodgeY = 0;
  for (const b of world.enemyBullets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 120 * 120) {
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const toward = (dx * b.vx + dy * b.vy) / (Math.sqrt(d2) * speed);
      if (toward < -0.5) {
        dodgeX += -b.vy / speed;
        dodgeY += b.vx / speed;
      }
    }
  }
  if (nearest && nearestD < 260 * 260) {
    // Kite: back away from the closest threat while shooting it.
    const a = Math.atan2(p.y - nearest.y, p.x - nearest.x);
    tx = p.x + Math.cos(a) * 120;
    ty = p.y + Math.sin(a) * 120;
  } else if (shard && shardD < 300 * 300) {
    tx = shard.x;
    ty = shard.y;
  } else if (nearest) {
    tx = nearest.x;
    ty = nearest.y;
  }
  tx += dodgeX * 60;
  ty += dodgeY * 60;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const mag = Math.hypot(dx, dy) || 1;
  const aim = nearest ? Math.atan2(nearest.y - p.y, nearest.x - p.x) : p.aimAngle;
  input.mouseX = p.x + Math.cos(aim) * 100;
  input.mouseY = p.y + Math.sin(aim) * 100;
  return {
    moveX: () => (Math.abs(dx) > 12 ? Math.sign(dx / mag) : 0),
    moveY: () => (Math.abs(dy) > 12 ? Math.sign(dy / mag) : 0),
    firing: () => nearest !== null,
    mouseX: input.mouseX,
    mouseY: input.mouseY,
  };
}

export { VICTORY_WAVE };
