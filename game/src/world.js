// The simulation: player, bullets, pickups, waves, scoring, experience and the win/lose
// conditions. It knows nothing about the DOM or the canvas; the game loop steps it at a
// fixed 1/60 s and the renderer draws whatever it holds. `events` is the one-way channel
// the game loop reads to play sounds and switch screens.
import {
  ARENA, BREATHER_SECONDS, COMBO_WINDOW, ENEMIES, PICKUPS, PLAYER,
  VICTORY_WAVE, WAVE_CLEAR_HEAL, bossHp, isBossWave, waveBudget, waveUnlocks, xpForLevel,
} from './config.js';
import { makeRng, angleTo, chance, clamp, dist2, pick, range } from './random.js';
import { spawnEdgePosition, spawnEnemy, updateEnemy } from './enemies.js';
import { canBeElite, makeElite } from './elites.js';
import { Particles } from './particles.js';
import { rollChoices } from './upgrades.js';

export const EVENT_OVER = 1;
export const EVENT_VICTORY = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_WAVE_CLEAR = 8;

export class World {
  constructor(audio) {
    this.audio = audio;
    this.ARENA = ARENA;
    this.particles = new Particles();
    this.rng = makeRng((Date.now() % 2147483647) | 1);
    this.reset(1);
  }

  reset(seed) {
    this.rng = makeRng(seed);
    this.time = 0;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.player = this.freshPlayer();
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.pickups = [];
    this.boss = null;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveState = 'breather'; // 'breather' | 'fighting' | 'clear'
    this.waveTimer = 2;
    this.waveBanner = '';
    this.bannerTimer = 0;
    this.levelUpChoices = null;
    this.over = false;
    this.victory = false;
    this.emberTimer = 0;
    this.eliteSpawned = false;
  }

  freshPlayer() {
    return {
      x: ARENA.x + ARENA.width / 2,
      y: ARENA.y + ARENA.height / 2,
      radius: PLAYER.radius,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      speed: PLAYER.speed,
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      damage: PLAYER.damage,
      fireInterval: PLAYER.fireInterval,
      fireTimer: 0,
      bulletSpeed: PLAYER.bulletSpeed,
      bulletRadius: PLAYER.bulletRadius,
      projectiles: PLAYER.projectiles,
      pierce: PLAYER.pierce,
      critChance: PLAYER.critChance,
      critMult: PLAYER.critMult,
      magnet: PLAYER.magnet,
      regen: PLAYER.regen,
      nova: 0,
      ricochet: 0,
      orbit: 0,
      orbitAngle: 0,
      chain: 0,
      siphon: 0,
      aimAngle: -Math.PI / 2,
      invuln: 0,
      shield: 0,
      rapid: 0,
      taken: {},
    };
  }

  /** Build the next wave's spawn list from its budget, then start trickling it in. */
  startWave(n) {
    this.wave = n;
    this.waveState = 'fighting';
    this.waveBanner = isBossWave(n) ? (n >= VICTORY_WAVE ? 'THE ELDER HERALD' : 'THE GLOOM HERALD') : `WAVE ${n}`;
    this.bannerTimer = 2.2;
    let budget = waveBudget(n);
    const kinds = waveUnlocks(n);
    const queue = [];
    while (budget > 0) {
      const kind = pick(this.rng, kinds);
      const cost = ENEMIES[kind].cost;
      if (cost > budget && queue.length > 0) break;
      queue.push(kind);
      budget -= cost;
    }
    this.spawnQueue = queue;
    this.spawnTimer = 0.4;
    this.eliteSpawned = false;
    if (isBossWave(n)) {
      const pos = spawnEdgePosition(this);
      this.boss = spawnEnemy(this, 'herald', pos.x, pos.y);
      this.boss.maxHp = this.boss.hp = bossHp(n);
      this.audio.bossRoar();
    }
    this.audio.waveHorn();
  }

  /** One fixed step. Returns a bitmask of EVENT_* for the game loop. */
  step(dt, input) {
    if (this.over || this.victory) return 0;
    this.time += dt;
    let events = 0;
    const p = this.player;

    // --- ambient embers drifting up from the floor -------------------------
    this.emberTimer -= dt;
    if (this.emberTimer <= 0) {
      this.emberTimer = 0.25;
      this.particles.emberDrift(p.x, p.y);
    }

    // --- player movement ----------------------------------------------------
    let mx = input.moveX();
    let my = input.moveY();
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      mx /= mag;
      my /= mag;
    }
    p.x = clamp(p.x + mx * p.speed * dt, ARENA.x + p.radius, ARENA.x + ARENA.width - p.radius);
    p.y = clamp(p.y + my * p.speed * dt, ARENA.y + p.radius, ARENA.y + ARENA.height - p.radius);
    p.aimAngle = angleTo(p.x, p.y, input.mouseX, input.mouseY);
    p.invuln = Math.max(0, p.invuln - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    // --- firing --------------------------------------------------------------
    p.fireTimer -= dt;
    const interval = p.rapid > 0 ? p.fireInterval * 0.55 : p.fireInterval;
    if (input.firing() && p.fireTimer <= 0) {
      p.fireTimer = interval;
      this.fireBullets();
    }

    // --- wave director ---------------------------------------------------------
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    if (this.waveState === 'breather') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave(this.wave + 1);
    } else if (this.waveState === 'fighting') {
      if (this.spawnQueue.length > 0) {
        this.spawnTimer -= dt;
        // A boss wave stays sparse: the Herald itself is the threat.
        const aliveCap = this.boss ? 6 : 8 + this.wave;
        if (this.spawnTimer <= 0 && this.enemies.length < aliveCap) {
          this.spawnTimer = Math.max(0.25, 0.9 - this.wave * 0.04);
          const kind = this.spawnQueue.shift();
          const pos = spawnEdgePosition(this);
          const spawned = spawnEnemy(this, kind, pos.x, pos.y);
          // One elite per wave (from wave 2): the first eligible spawn is it.
          if (this.wave >= 2 && !this.eliteSpawned && canBeElite(kind)) {
            makeElite(spawned);
            this.eliteSpawned = true;
            this.particles.text(spawned.x, spawned.y - 30, 'ELITE!', '#ffcf4d', 16);
          }
        }
      } else if (this.enemies.length === 0) {
        this.waveState = 'clear';
        this.waveTimer = BREATHER_SECONDS;
        p.hp = Math.min(p.maxHp, p.hp + WAVE_CLEAR_HEAL);
        this.waveBanner = `WAVE ${this.wave} CLEARED  +${WAVE_CLEAR_HEAL} HP`;
        this.bannerTimer = 2.2;
        events |= EVENT_WAVE_CLEAR;
        this.audio.heart();
      }
    } else if (this.waveState === 'clear') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveState = 'breather';
        this.waveTimer = 0.1;
      }
    }

    // --- orbiting flames (upgrade): fireballs circle the warden and burn ------
    if (p.orbit > 0) {
      p.orbitAngle += dt * 2.4;
      for (const enemy of this.enemies) enemy.orbitHitT = Math.max(0, enemy.orbitHitT - dt);
      for (let i = 0; i < p.orbit; i += 1) {
        const a = p.orbitAngle + (i / p.orbit) * Math.PI * 2;
        const ox = p.x + Math.cos(a) * 72;
        const oy = p.y + Math.sin(a) * 72;
        for (const enemy of this.enemies) {
          const r = enemy.radius + 14;
          if (enemy.spawnT >= 0.3 && enemy.orbitHitT <= 0 && dist2(ox, oy, enemy.x, enemy.y) < r * r) {
            enemy.orbitHitT = 0.6;
            this.damageEnemy(enemy, 12 + p.orbit * 4, false);
          }
        }
      }
    }

    // --- enemies ---------------------------------------------------------------
    // Snapshot: one enemy's update can remove others (a bomber's blast can
    // kill several foes at once), so never index the live array by position.
    for (const enemy of [...this.enemies]) {
      if (!this.enemies.includes(enemy)) continue;
      updateEnemy(this, enemy, dt);
    }

    // --- bullets -----------------------------------------------------------------
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);

    // --- pickups -------------------------------------------------------------------
    this.updatePickups(dt, p);

    // --- contact damage ---------------------------------------------------------------
    for (const enemy of this.enemies) {
      if (enemy.spawnT < 0.5) continue;
      const r = enemy.radius + p.radius - 4;
      if (dist2(enemy.x, enemy.y, p.x, p.y) < r * r) {
        this.damagePlayer(enemy.damage, enemy.x, enemy.y);
        // Push the enemy back a little so one touch is not a grind.
        const a = angleTo(p.x, p.y, enemy.x, enemy.y);
        enemy.x += Math.cos(a) * 26;
        enemy.y += Math.sin(a) * 26;
      }
    }

    // --- combo decay -------------------------------------------------------------------
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;

    this.particles.update(dt);
    if (this.levelUpChoices) events |= EVENT_LEVELUP;
    if (this.over) events |= EVENT_OVER;
    if (this.victory) events |= EVENT_VICTORY;
    return events;
  }

  fireBullets() {
    const p = this.player;
    const spread = 0.14;
    const n = p.projectiles;
    for (let i = 0; i < n; i += 1) {
      const offset = (i - (n - 1) / 2) * spread;
      const a = p.aimAngle + offset;
      this.bullets.push({
        x: p.x + Math.cos(a) * (p.radius + 6),
        y: p.y + Math.sin(a) * (p.radius + 6),
        vx: Math.cos(a) * p.bulletSpeed,
        vy: Math.sin(a) * p.bulletSpeed,
        radius: p.bulletRadius,
        damage: p.damage,
        pierce: p.pierce,
        ricochet: p.ricochet,
        hitIds: new Set(),
        life: 1.1,
        age: 0,
      });
    }
    this.shotsFired += n;
    this.particles.burst(p.x + Math.cos(p.aimAngle) * 26, p.y + Math.sin(p.aimAngle) * 26, '#ffe9a8', 2, 90, 0.18, 2);
    this.audio.shoot();
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.age >= b.life;
      if (b.x < ARENA.x || b.x > ARENA.x + ARENA.width || b.y < ARENA.y || b.y > ARENA.y + ARENA.height) dead = true;
      if (!dead) {
        for (const enemy of this.enemies) {
          if (enemy.spawnT < 0.3 || b.hitIds.has(enemy.id)) continue;
          const r = enemy.radius + b.radius;
          if (dist2(b.x, b.y, enemy.x, enemy.y) < r * r) {
            b.hitIds.add(enemy.id);
            this.shotsHit += 1;
            const crit = chance(this.rng, this.player.critChance);
            const dmg = b.damage * (crit ? this.player.critMult : 1);
            this.damageEnemy(enemy, dmg, crit);
            this.audio.hit();
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else if (b.ricochet > 0) {
              const next = this.nearestEnemy(b.x, b.y, enemy.id);
              if (next) {
                b.ricochet -= 1;
                const a = angleTo(b.x, b.y, next.x, next.y);
                const speed = Math.hypot(b.vx, b.vy);
                b.vx = Math.cos(a) * speed;
                b.vy = Math.sin(a) * speed;
              } else {
                dead = true;
              }
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (let i = this.enemyBullets.length - 1; i >= 0; i -= 1) {
      const b = this.enemyBullets[i];
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.age >= b.life;
      if (b.x < ARENA.x - 20 || b.x > ARENA.x + ARENA.width + 20 || b.y < ARENA.y - 20 || b.y > ARENA.y + ARENA.height + 20) dead = true;
      if (!dead) {
        const r = b.radius + p.radius - 2;
        if (dist2(b.x, b.y, p.x, p.y) < r * r) {
          this.damagePlayer(b.damage, b.x, b.y);
          dead = true;
        }
      }
      if (dead) this.enemyBullets.splice(i, 1);
    }
  }

  updatePickups(dt, p) {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pk = this.pickups[i];
      pk.age += dt;
      if (pk.age > 14) {
        this.pickups.splice(i, 1);
        continue;
      }
      const d = Math.sqrt(dist2(pk.x, pk.y, p.x, p.y));
      const magnetR = pk.kind === 'shard' ? p.magnet : 70;
      if (d < magnetR) {
        const a = angleTo(pk.x, pk.y, p.x, p.y);
        const speed = pk.kind === 'shard' ? 320 : 200;
        pk.x += Math.cos(a) * speed * dt;
        pk.y += Math.sin(a) * speed * dt;
      }
      const r = pk.radius + p.radius + 4;
      if (d < r) {
        this.collectPickup(pk);
        this.pickups.splice(i, 1);
      }
    }
  }

  collectPickup(pk) {
    const p = this.player;
    if (pk.kind === 'shard') {
      p.xp += 1;
      this.audio.pickup();
      if (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level += 1;
        p.xpNext = xpForLevel(p.level);
        this.levelUpChoices = rollChoices(this.rng, p.taken, 3);
        this.particles.ring(p.x, p.y, '#7ee0ff', 110, 0.5);
        this.audio.levelUp();
      }
    } else if (pk.kind === 'heart') {
      p.hp = Math.min(p.maxHp, p.hp + PICKUPS.heart.heal);
      this.particles.text(p.x, p.y - 26, `+${PICKUPS.heart.heal}`, '#7dd87d', 16);
      this.audio.heart();
    } else if (pk.kind === 'shield') {
      p.shield = PICKUPS.shield.seconds;
      this.particles.text(p.x, p.y - 26, 'SHIELD', '#7ee0ff', 16);
      this.audio.heart();
    } else if (pk.kind === 'rapid') {
      p.rapid = PICKUPS.rapid.seconds;
      this.particles.text(p.x, p.y - 26, 'RAPID FIRE', '#ffb347', 16);
      this.audio.heart();
    }
  }

  damageEnemy(enemy, dmg, crit) {
    enemy.hp -= dmg;
    enemy.flash = 1;
    this.particles.burst(enemy.x, enemy.y, '#ffe9a8', 3, 120, 0.3, 2.5);
    this.particles.text(enemy.x, enemy.y - enemy.radius - 6, String(Math.round(dmg)), crit ? '#ffcf4d' : '#f2ead8', crit ? 19 : 14);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    const index = this.enemies.indexOf(enemy);
    if (index === -1) return;
    this.enemies.splice(index, 1);
    const p = this.player;
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = 1 + Math.min(this.combo, 20) * 0.1;
    const gained = Math.round(enemy.score * mult);
    this.score += gained;
    this.particles.burst(enemy.x, enemy.y, ENEMIES[enemy.kind].glow, enemy.kind === 'herald' ? 60 : 16, 260, 0.6, 4);
    this.particles.ring(enemy.x, enemy.y, ENEMIES[enemy.kind].colour, enemy.kind === 'herald' ? 220 : 60, 0.4);
    this.particles.shake(enemy.kind === 'herald' ? 0.9 : enemy.kind === 'husk' ? 0.35 : 0.18);
    if (enemy.kind === 'herald') this.particles.stopTime(0.12);
    this.audio.explode();
    if (this.combo >= 5) this.particles.text(enemy.x, enemy.y - 30, `x${this.combo} COMBO`, '#ffcf4d', 15);

    // Drops: shards always, a heart / shield / rapid now and then.
    for (let i = 0; i < enemy.xp; i += 1) {
      this.pickups.push({
        kind: 'shard', x: enemy.x + range(this.rng, -24, 24), y: enemy.y + range(this.rng, -24, 24),
        radius: PICKUPS.shard.radius, age: 0,
      });
    }
    // A splitter breaks into two wisps where it fell.
    if (enemy.kind === 'splitter') {
      this.particles.text(enemy.x, enemy.y - 30, 'SPLIT!', '#4dd0e1', 15);
      for (let i = 0; i < 2; i += 1) {
        spawnEnemy(this, 'wisp', enemy.x + range(this.rng, -18, 18), enemy.y + range(this.rng, -18, 18));
      }
    }
    // A bomber detonates: hurts the warden up close and burns nearby gloom.
    if (enemy.kind === 'bomber') {
      this.particles.burst(enemy.x, enemy.y, '#ff8a65', 40, 320, 0.7, 5);
      this.particles.ring(enemy.x, enemy.y, '#ff8a65', 130, 0.5);
      this.particles.shake(0.6);
      const p2 = this.player;
      if (dist2(enemy.x, enemy.y, p2.x, p2.y) < 110 * 110) this.damagePlayer(enemy.damage, enemy.x, enemy.y);
      for (const other of [...this.enemies]) {
        if (other !== enemy && dist2(enemy.x, enemy.y, other.x, other.y) < 110 * 110) {
          this.damageEnemy(other, 25, false);
        }
      }
    }
    // Elites drop a heart and rapid fire on top of their shards.
    if (enemy.elite) {
      this.pickups.push({ kind: 'heart', x: enemy.x - 24, y: enemy.y, radius: PICKUPS.heart.radius, age: 0 });
      this.pickups.push({ kind: 'rapid', x: enemy.x + 24, y: enemy.y, radius: PICKUPS.rapid.radius, age: 0 });
      this.particles.text(enemy.x, enemy.y - 40, 'ELITE DOWN!', '#ffcf4d', 17);
    }
    // Ember Siphon: kills mend the warden. Chain Lightning: kills zap a near foe.
    if (p.siphon > 0) p.hp = Math.min(p.maxHp, p.hp + p.siphon);
    if (p.chain > 0) {
      const target = this.nearestEnemy(enemy.x, enemy.y);
      if (target && dist2(enemy.x, enemy.y, target.x, target.y) < 240 * 240) {
        this.particles.burst(target.x, target.y, '#7ee0ff', 10, 200, 0.35, 3);
        this.particles.text(target.x, target.y - 26, 'ZAP!', '#7ee0ff', 14);
        this.damageEnemy(target, 10 + p.chain * 6, false);
      }
    }
    const roll = this.rng();
    if (enemy.kind === 'herald') {
      this.pickups.push({ kind: 'heart', x: enemy.x - 30, y: enemy.y, radius: PICKUPS.heart.radius, age: 0 });
      this.pickups.push({ kind: 'shield', x: enemy.x + 30, y: enemy.y, radius: PICKUPS.shield.radius, age: 0 });
    } else if (roll < 0.05) {
      this.pickups.push({ kind: 'heart', x: enemy.x, y: enemy.y, radius: PICKUPS.heart.radius, age: 0 });
    } else if (roll < 0.08) {
      this.pickups.push({ kind: 'shield', x: enemy.x, y: enemy.y, radius: PICKUPS.shield.radius, age: 0 });
    } else if (roll < 0.11) {
      this.pickups.push({ kind: 'rapid', x: enemy.x, y: enemy.y, radius: PICKUPS.rapid.radius, age: 0 });
    }

    // Ember Nova: kills burst flame around the warden.
    if (p.nova > 0) {
      const novaDmg = 10 + p.nova * 8;
      const novaR = 110 + p.nova * 20;
      this.particles.ring(p.x, p.y, '#ff7b2f', novaR, 0.35);
      for (const other of [...this.enemies]) {
        if (dist2(p.x, p.y, other.x, other.y) < novaR * novaR) this.damageEnemy(other, novaDmg, false);
      }
    }

    if (enemy.kind === 'herald') {
      this.boss = null;
      if (this.wave >= VICTORY_WAVE) {
        this.victory = true;
      }
    }
  }

  damagePlayer(dmg, fromX, fromY) {
    const p = this.player;
    if (p.invuln > 0 || this.over || this.victory) return;
    if (p.shield > 0) {
      this.particles.text(p.x, p.y - 26, 'BLOCKED', '#7ee0ff', 15);
      this.audio.hit();
      p.invuln = 0.3;
      return;
    }
    p.hp -= dmg;
    p.invuln = 0.7;
    this.combo = 0;
    this.particles.burst(p.x, p.y, '#ff5d73', 14, 220, 0.5, 3.5);
    this.particles.shake(0.55);
    this.particles.damageFlash();
    this.audio.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      this.over = true;
      this.particles.burst(p.x, p.y, '#ffb347', 60, 320, 1, 5);
      this.particles.ring(p.x, p.y, '#ff7b2f', 200, 0.8);
      this.audio.gameOver();
    }
    void fromX;
    void fromY;
  }

  nearestEnemy(x, y, excludeId = -1) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.id === excludeId || e.spawnT < 0.3) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  applyUpgrade(upgrade) {
    const p = this.player;
    upgrade.apply(p);
    p.taken[upgrade.id] = (p.taken[upgrade.id] || 0) + 1;
    this.levelUpChoices = null;
    this.particles.text(p.x, p.y - 30, upgrade.name.toUpperCase(), '#7ee0ff', 17);
  }
}
