// Enemy kinds and their behaviour. Each enemy is a plain object; `updateEnemy` steers it
// for one fixed step. Kinds differ in movement and attack so the player reads the threat
// at a glance: wisps chase, husks grind forward, spitters keep their distance and shoot,
// dashers telegraph then lunge, and the Herald (boss) fires radial bursts and calls wisps.
import { ENEMIES } from './config.js';
import { angleTo, clamp, dist2, range } from './random.js';

let nextId = 1;

export function spawnEnemy(world, kind, x, y) {
  const def = ENEMIES[kind];
  const hpScale = 1 + (world.wave - 1) * 0.1 + (kind === 'herald' ? 0 : world.wave * 0.02);
  const enemy = {
    id: nextId,
    kind,
    x, y,
    radius: def.radius,
    hp: def.hp * (kind === 'herald' ? 1 : hpScale),
    maxHp: def.hp * (kind === 'herald' ? 1 : hpScale),
    speed: def.speed * (0.92 + world.rng() * 0.16),
    damage: def.damage,
    score: def.score,
    xp: def.xp,
    spawnT: 0,
    flash: 0,
    // per-kind state
    state: 'chase',
    stateT: 0,
    aimAngle: 0,
    shootT: range(world.rng, 1.2, 2.4),
    burstT: 3,
    phase: 1,
    elite: false,
    blinkT: range(world.rng, 1.6, 2.8),
    orbitHitT: 0,
  };
  nextId = 1 + nextId;
  world.enemies.push(enemy);
  return enemy;
}

/** Spawn position just outside the arena, on a random edge, away from the player. */
export function spawnEdgePosition(world) {
  const { ARENA } = world;
  for (let tries = 0; tries < 8; tries += 1) {
    const edge = Math.floor(world.rng() * 4);
    let x;
    let y;
    if (edge === 0) { x = range(world.rng, ARENA.x, ARENA.x + ARENA.width); y = ARENA.y - 30; }
    else if (edge === 1) { x = range(world.rng, ARENA.x, ARENA.x + ARENA.width); y = ARENA.y + ARENA.height + 30; }
    else if (edge === 2) { x = ARENA.x - 30; y = range(world.rng, ARENA.y, ARENA.y + ARENA.height); }
    else { x = ARENA.x + ARENA.width + 30; y = range(world.rng, ARENA.y, ARENA.y + ARENA.height); }
    if (dist2(x, y, world.player.x, world.player.y) > 220 * 220) return { x, y };
  }
  return { x: ARENA.x + ARENA.width / 2, y: ARENA.y - 30 };
}

function moveToward(enemy, tx, ty, speed, dt) {
  const a = angleTo(enemy.x, enemy.y, tx, ty);
  enemy.x += Math.cos(a) * speed * dt;
  enemy.y += Math.sin(a) * speed * dt;
  return a;
}

function separate(world, enemy, dt) {
  // Cheap pairwise push-apart so the swarm does not stack into one dot.
  for (const other of world.enemies) {
    if (other === enemy || other.spawnT < 0.4) continue;
    const dx = enemy.x - other.x;
    const dy = enemy.y - other.y;
    const d2 = dx * dx + dy * dy;
    const min = enemy.radius + other.radius;
    if (d2 > 0.01 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const push = ((min - d) / min) * 26 * dt;
      enemy.x += (dx / d) * push;
      enemy.y += (dy / d) * push;
    }
  }
}

export function updateEnemy(world, enemy, dt) {
  const player = world.player;
  if (enemy.spawnT < 0.5) {
    enemy.spawnT += dt;
    return;
  }
  enemy.flash = Math.max(0, enemy.flash - dt * 6);
  const dPlayer = Math.sqrt(dist2(enemy.x, enemy.y, player.x, player.y));
  const p = world.player;

  if (enemy.kind === 'wisp') {
    // A wisp wobbles as it chases, so its path is never a straight line.
    const wobble = Math.sin(world.time * 3 + enemy.id * 1.7) * 0.6;
    const a = angleTo(enemy.x, enemy.y, player.x, player.y) + wobble * 0.35;
    enemy.x += Math.cos(a) * enemy.speed * dt;
    enemy.y += Math.sin(a) * enemy.speed * dt;
  } else if (enemy.kind === 'husk') {
    moveToward(enemy, player.x, player.y, enemy.speed, dt);
  } else if (enemy.kind === 'spitter') {
    // Keep a shooting distance; drift sideways while it fires.
    if (dPlayer > 300) moveToward(enemy, player.x, player.y, enemy.speed, dt);
    else if (dPlayer < 200) moveToward(enemy, player.x, player.y, -enemy.speed * 0.8, dt);
    else {
      const a = angleTo(enemy.x, enemy.y, player.x, player.y) + Math.PI / 2;
      enemy.x += Math.cos(a) * enemy.speed * 0.4 * dt;
      enemy.y += Math.sin(a) * enemy.speed * 0.4 * dt;
    }
    enemy.shootT -= dt;
    if (enemy.shootT <= 0 && dPlayer < 520) {
      enemy.shootT = range(world.rng, 1.9, 2.6);
      const a = angleTo(enemy.x, enemy.y, player.x, player.y);
      world.enemyBullets.push({
        x: enemy.x, y: enemy.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210,
        radius: 7, damage: enemy.damage, life: 4, age: 0, colour: '#ff9f43',
      });
      world.audio.spitterShoot?.();
    }
  } else if (enemy.kind === 'dasher') {
    enemy.stateT -= dt;
    if (enemy.state === 'chase') {
      moveToward(enemy, player.x, player.y, enemy.speed, dt);
      if (dPlayer < 260 && enemy.stateT <= 0) {
        enemy.state = 'aim';
        enemy.stateT = 0.55;
        enemy.aimAngle = angleTo(enemy.x, enemy.y, player.x, player.y);
      }
    } else if (enemy.state === 'aim') {
      // Telegraph: hold still, flashing, aimed at where the player was.
      enemy.aimAngle = angleTo(enemy.x, enemy.y, player.x, player.y);
      if (enemy.stateT <= 0) {
        enemy.state = 'dash';
        enemy.stateT = 0.42;
        world.audio.dash?.();
      }
    } else if (enemy.state === 'dash') {
      enemy.x += Math.cos(enemy.aimAngle) * 430 * dt;
      enemy.y += Math.sin(enemy.aimAngle) * 430 * dt;
      if (enemy.stateT <= 0) {
        enemy.state = 'chase';
        enemy.stateT = range(world.rng, 0.8, 1.6);
      }
    }
  } else if (enemy.kind === 'splitter') {
    // A splitter wobbles after the warden like a wisp, but slower and heavier;
    // it breaks into two wisps when it dies (see World.killEnemy).
    const wobble = Math.sin(world.time * 2.4 + enemy.id * 1.3) * 0.5;
    const a = angleTo(enemy.x, enemy.y, player.x, player.y) + wobble * 0.3;
    enemy.x += Math.cos(a) * enemy.speed * dt;
    enemy.y += Math.sin(a) * enemy.speed * dt;
  } else if (enemy.kind === 'bomber') {
    // A bomber lumbers at the warden and detonates when it gets close.
    moveToward(enemy, player.x, player.y, enemy.speed, dt);
    if (dPlayer < 64) {
      world.killEnemy(enemy);
      return;
    }
  } else if (enemy.kind === 'wraith') {
    // A wraith chases fast, then blinks a short way toward the warden.
    enemy.blinkT -= dt;
    if (enemy.blinkT <= 0) {
      enemy.blinkT = range(world.rng, 2.2, 3.2);
      const a = angleTo(enemy.x, enemy.y, player.x, player.y);
      world.particles.burst(enemy.x, enemy.y, '#ce93d8', 10, 140, 0.4, 3);
      enemy.x += Math.cos(a) * 130;
      enemy.y += Math.sin(a) * 130;
      world.particles.burst(enemy.x, enemy.y, '#ce93d8', 10, 140, 0.4, 3);
      world.audio.spitterShoot?.();
    }
    const wobble = Math.sin(world.time * 5 + enemy.id * 2.1) * 0.5;
    const a = angleTo(enemy.x, enemy.y, player.x, player.y) + wobble * 0.25;
    enemy.x += Math.cos(a) * enemy.speed * dt;
    enemy.y += Math.sin(a) * enemy.speed * dt;
  } else if (enemy.kind === 'herald') {
    // Boss: slow chase, radial bursts, and it calls wisps when hurt.
    const frac = enemy.hp / enemy.maxHp;
    const phase = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
    if (phase !== enemy.phase) {
      enemy.phase = phase;
      world.particles.ring(enemy.x, enemy.y, '#b78cff', 200, 0.6);
      world.particles.shake(0.5);
      world.audio.bossRoar();
    }
    const speed = enemy.speed * (1 + (phase - 1) * 0.35);
    moveToward(enemy, player.x, player.y, speed, dt);
    enemy.burstT -= dt;
    if (enemy.burstT <= 0) {
      enemy.burstT = phase === 3 ? 2.6 : phase === 2 ? 3.2 : 3.8;
      const count = 6 + phase * 2;
      const offset = world.rng() * Math.PI * 2;
      for (let i = 0; i < count; i += 1) {
        const a = offset + (i / count) * Math.PI * 2;
        world.enemyBullets.push({
          x: enemy.x, y: enemy.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
          radius: 8, damage: 14, life: 5, age: 0, colour: '#b78cff',
        });
      }
      world.audio.bossBurst?.();
      world.particles.ring(enemy.x, enemy.y, '#8b5cf6', 120, 0.35);
    }
    enemy.shootT -= dt;
    if (enemy.shootT <= 0 && world.enemies.length < 10) {
      enemy.shootT = 6;
      for (let i = 0; i < 2; i += 1) {
        const pos = spawnEdgePosition(world);
        spawnEnemy(world, 'wisp', pos.x, pos.y);
      }
      world.particles.text(enemy.x, enemy.y - 60, 'The Herald calls!', '#b78cff', 16);
    }
  }

  // Stay inside the arena (with a margin so big foes do not clip the walls).
  enemy.x = clamp(enemy.x, world.ARENA.x + enemy.radius * 0.4, world.ARENA.x + world.ARENA.width - enemy.radius * 0.4);
  enemy.y = clamp(enemy.y, world.ARENA.y + enemy.radius * 0.4, world.ARENA.y + world.ARENA.height - enemy.radius * 0.4);
  separate(world, enemy, dt);
  void p;
}
