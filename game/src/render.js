// All drawing: the arena, every entity, the HUD and every screen (title, pause,
// level-up, game over, victory). The renderer reads the world and the game state and
// draws; it never changes them. Art is drawn in code — circles, arcs and glows — so
// the game ships no image files at all.
import { ARENA, COLOURS, ENEMIES, VICTORY_WAVE, VIEW } from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const FONT = '"Trebuchet MS", Verdana, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, fill, back = 'rgba(255,255,255,0.12)') {
  ctx.fillStyle = back;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w * clamp(frac, 0, 1), h, h / 2);
    ctx.fill();
  }
}

function glowCircle(ctx, x, y, radius, colour, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
  }

  draw(game) {
    const ctx = this.ctx;
    const world = game.world;
    this.time = world.time;
    ctx.save();
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    const shake = world.particles.shakeOffset();
    ctx.translate(shake.x, shake.y);

    this.drawBackground(ctx, world);
    this.drawPickups(ctx, world);
    this.drawBullets(ctx, world);
    this.drawEnemies(ctx, world);
    if (!world.over) this.drawPlayer(ctx, world);
    world.particles.draw(ctx);
    ctx.restore();

    // HUD and overlays are not shaken.
    this.drawHud(ctx, game);
    this.drawBanner(ctx, world);
    if (game.screen === SCREEN_TITLE) this.drawTitle(ctx, game);
    else if (game.screen === SCREEN_PAUSE) this.drawPause(ctx, game);
    else if (game.screen === SCREEN_LEVELUP) this.drawLevelUp(ctx, game);
    else if (game.screen === SCREEN_OVER) this.drawOver(ctx, game);
    else if (game.screen === SCREEN_VICTORY) this.drawVictory(ctx, game);

    // Low-health red pulse + hurt flash.
    const p = world.player;
    if (!world.over && p.hp > 0 && p.hp < p.maxHp * 0.3) {
      const pulse = 0.1 + 0.08 * Math.sin(this.time * 6);
      const g = ctx.createRadialGradient(640, 360, 240, 640, 360, 720);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (world.particles.flash > 0) {
      ctx.fillStyle = `rgba(255,60,70,${world.particles.flash * 0.35})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  drawBackground(ctx, world) {
    const g = ctx.createRadialGradient(640, 360, 60, 640, 360, 820);
    g.addColorStop(0, COLOURS.bg1);
    g.addColorStop(1, COLOURS.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Faint ember grid on the arena floor.
    ctx.strokeStyle = 'rgba(255,179,71,0.05)';
    ctx.lineWidth = 1;
    for (let x = ARENA.x; x <= ARENA.x + ARENA.width; x += 88) {
      ctx.beginPath();
      ctx.moveTo(x, ARENA.y);
      ctx.lineTo(x, ARENA.y + ARENA.height);
      ctx.stroke();
    }
    for (let y = ARENA.y; y <= ARENA.y + ARENA.height; y += 88) {
      ctx.beginPath();
      ctx.moveTo(ARENA.x, y);
      ctx.lineTo(ARENA.x + ARENA.width, y);
      ctx.stroke();
    }

    // The last ember: a warm glow at the arena's heart, the thing being defended.
    const pulse = 1 + 0.06 * Math.sin(this.time * 1.6);
    glowCircle(ctx, 640, 396, 150 * pulse, 'rgba(255,123,47,0.20)', 0.8);
    glowCircle(ctx, 640, 396, 46 * pulse, 'rgba(255,233,168,0.55)', 0.9);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(640, 396, 10 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7b2f';
    ctx.beginPath();
    ctx.arc(640, 396, 5 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Arena walls.
    ctx.strokeStyle = '#4a3a72';
    ctx.lineWidth = 3;
    ctx.strokeRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
    ctx.strokeStyle = 'rgba(255,179,71,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ARENA.x + 4, ARENA.y + 4, ARENA.width - 8, ARENA.height - 8);
  }

  drawPickups(ctx, world) {
    for (const pk of world.pickups) {
      const bob = Math.sin(world.time * 4 + pk.x) * 2;
      const y = pk.y + bob;
      if (pk.kind === 'shard') {
        glowCircle(ctx, pk.x, y, 16, 'rgba(255,179,71,0.5)', 0.7);
        ctx.fillStyle = '#ffb347';
        ctx.save();
        ctx.translate(pk.x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4.5, -4.5, 9, 9);
        ctx.restore();
      } else if (pk.kind === 'heart') {
        glowCircle(ctx, pk.x, y, 20, 'rgba(125,216,125,0.45)', 0.7);
        ctx.fillStyle = '#7dd87d';
        ctx.font = `bold 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', pk.x, y + 1);
      } else if (pk.kind === 'shield') {
        glowCircle(ctx, pk.x, y, 20, 'rgba(126,224,255,0.45)', 0.7);
        ctx.strokeStyle = '#7ee0ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pk.x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#7ee0ff';
        ctx.font = `bold 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', pk.x, y + 1);
      } else if (pk.kind === 'rapid') {
        glowCircle(ctx, pk.x, y, 20, 'rgba(255,207,77,0.45)', 0.7);
        ctx.fillStyle = '#ffcf4d';
        ctx.font = `bold 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('»', pk.x, y + 1);
      }
    }
  }

  drawBullets(ctx, world) {
    for (const b of world.bullets) {
      glowCircle(ctx, b.x, b.y, b.radius * 3, 'rgba(255,233,168,0.6)', 0.8);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff7b2f';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of world.enemyBullets) {
      glowCircle(ctx, b.x, b.y, b.radius * 3, 'rgba(183,140,255,0.55)', 0.8);
      ctx.fillStyle = b.colour;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEnemies(ctx, world) {
    for (const e of world.enemies) {
      const def = ENEMIES[e.kind];
      const scale = e.spawnT < 0.5 ? e.spawnT / 0.5 : 1;
      const r = e.radius * scale;
      if (r <= 0) continue;
      // Spawn portal swirl.
      if (e.spawnT < 0.5) {
        glowCircle(ctx, e.x, e.y, 60 * (1 - e.spawnT), def.glow, 0.5);
      }
      glowCircle(ctx, e.x, e.y, r * 2.6, def.glow, 0.35);
      ctx.save();
      ctx.translate(e.x, e.y);

      if (e.kind === 'wisp') {
        // A flickering flame-ghost.
        const flick = 1 + 0.15 * Math.sin(world.time * 9 + e.id);
        ctx.fillStyle = def.colour;
        ctx.beginPath();
        ctx.arc(0, 0, r * flick, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0714';
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.15, r * 0.22, 0, Math.PI * 2);
        ctx.arc(r * 0.35, -r * 0.15, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'husk') {
        // A heavy mossy boulder with cracks.
        ctx.fillStyle = def.colour;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1d3a1d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.3);
        ctx.lineTo(0, 0);
        ctx.lineTo(r * 0.5, -r * 0.5);
        ctx.moveTo(-r * 0.2, r * 0.5);
        ctx.lineTo(r * 0.4, r * 0.2);
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(-r * 0.3, -r * 0.1, r * 0.14, 0, Math.PI * 2);
        ctx.arc(r * 0.3, -r * 0.1, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'spitter') {
        // A spiked orange orb with a mouth.
        ctx.fillStyle = def.colour;
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + world.time * 0.8;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
          ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
          ctx.lineTo(Math.cos(a + 0.35) * r * 0.8, Math.sin(a + 0.35) * r * 0.8);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a1500';
        ctx.beginPath();
        ctx.arc(0, r * 0.25, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'dasher') {
        // A blade-like shard; flashes white while it aims.
        const aiming = e.state === 'aim';
        ctx.rotate(e.state === 'dash' ? e.aimAngle : Math.atan2(world.player.y - e.y, world.player.x - e.x));
        ctx.fillStyle = aiming && Math.sin(world.time * 30) > 0 ? '#ffffff' : def.colour;
        ctx.beginPath();
        ctx.moveTo(r * 1.3, 0);
        ctx.lineTo(-r * 0.8, -r * 0.7);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.8, r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(r * 0.3, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'herald') {
        // The boss: a crowned ring of gloom with a burning core.
        ctx.rotate(Math.sin(world.time * 0.7) * 0.2);
        ctx.strokeStyle = def.colour;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + world.time * 0.3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
          ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
          ctx.stroke();
        }
        ctx.fillStyle = '#1a1030';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
        ctx.fill();
        const corePulse = 1 + 0.2 * Math.sin(world.time * 5);
        ctx.fillStyle = '#b78cff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.4 * corePulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-r * 0.28, -r * 0.15, r * 0.09, 0, Math.PI * 2);
        ctx.arc(r * 0.28, -r * 0.15, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Hit flash and health bar.
      if (e.flash > 0) {
        ctx.globalAlpha = e.flash * 0.7;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (e.hp < e.maxHp && e.kind !== 'wisp') {
        bar(ctx, e.x - e.radius, e.y - e.radius - 10, e.radius * 2, 5, e.hp / e.maxHp, '#ff5d73');
      }
    }
  }

  drawPlayer(ctx, world) {
    const p = world.player;
    const blink = p.invuln > 0 && Math.sin(world.time * 30) > 0;
    if (blink) return;
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(126,224,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 8 + Math.sin(world.time * 5) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    glowCircle(ctx, p.x, p.y, 70, 'rgba(255,179,71,0.4)', 0.8);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aimAngle);
    // Lantern staff pointing at the aim.
    ctx.strokeStyle = '#8a6b3f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(p.radius + 16, 0);
    ctx.stroke();
    glowCircle(ctx, p.radius + 18, 0, 16, 'rgba(255,233,168,0.8)', 0.9);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(p.radius + 18, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Cloaked warden: hood and shoulders.
    ctx.fillStyle = '#2c2145';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0714';
    ctx.beginPath();
    ctx.arc(p.x - 2.5, p.y - 4, 1.6, 0, Math.PI * 2);
    ctx.arc(p.x + 2.5, p.y - 4, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHud(ctx, game) {
    const world = game.world;
    const p = world.player;
    ctx.textBaseline = 'alphabetic';

    // Top strip.
    ctx.fillStyle = 'rgba(11,7,20,0.85)';
    ctx.fillRect(0, 0, VIEW.width, 64);
    ctx.strokeStyle = '#4a3a72';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(VIEW.width, 64);
    ctx.stroke();

    // Health.
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('WARDEN', 24, 26);
    bar(ctx, 24, 34, 220, 14, p.hp / p.maxHp, '#ff5d73');
    ctx.fillStyle = '#fff';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 134, 45);

    // XP + level.
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`LEVEL ${p.level}`, 280, 26);
    bar(ctx, 280, 34, 220, 14, p.xp / p.xpNext, '#7ee0ff');
    ctx.fillStyle = '#fff';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${p.xp} / ${p.xpNext} XP`, 390, 45);

    // Score, wave, combo.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`${world.score}`, 640, 32);
    ctx.fillStyle = COLOURS.dim;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText('SCORE', 640, 50);
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'right';
    const waveLabel = world.wave === 0 ? 'GET READY' : world.wave > VICTORY_WAVE ? `WAVE ${world.wave} — ENDLESS` : `WAVE ${world.wave} / 10`;
    ctx.fillText(waveLabel, 1060, 30);
    ctx.fillStyle = COLOURS.dim;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`KILLS ${world.kills}   BEST ${game.best}`, 1060, 50);
    if (world.combo >= 3) {
      ctx.fillStyle = '#ffcf4d';
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`COMBO x${world.combo}`, 1120, 30);
    }

    // Active buffs.
    let buffY = 76;
    ctx.textAlign = 'left';
    ctx.font = `bold 13px ${FONT}`;
    if (p.shield > 0) {
      ctx.fillStyle = '#7ee0ff';
      ctx.fillText(`SHIELD ${p.shield.toFixed(0)}s`, 24, buffY);
      buffY += 18;
    }
    if (p.rapid > 0) {
      ctx.fillStyle = '#ffcf4d';
      ctx.fillText(`RAPID FIRE ${p.rapid.toFixed(0)}s`, 24, buffY);
      buffY += 18;
    }

    // Boss bar.
    if (world.boss) {
      const b = world.boss;
      ctx.fillStyle = 'rgba(11,7,20,0.7)';
      ctx.fillRect(340, 668, 600, 34);
      ctx.fillStyle = '#b78cff';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(world.wave >= VICTORY_WAVE ? 'ELDER HERALD' : 'GLOOM HERALD', 640, 680);
      bar(ctx, 360, 686, 560, 8, b.hp / b.maxHp, '#b78cff');
    }

    // Mute hint.
    ctx.fillStyle = 'rgba(143,134,168,0.8)';
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(game.audio.muted ? 'M — sound off' : 'M — mute   P — pause', 1256, 712);
  }

  drawBanner(ctx, world) {
    if (world.bannerTimer <= 0 || !world.waveBanner) return;
    const a = clamp(world.bannerTimer / 0.6, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 44px ${FONT}`;
    ctx.shadowColor = 'rgba(255,123,47,0.8)';
    ctx.shadowBlur = 24;
    ctx.fillText(world.waveBanner, 640, 200);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  panel(ctx, x, y, w, h) {
    ctx.fillStyle = COLOURS.panel;
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = COLOURS.panelEdge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 16);
    ctx.stroke();
  }

  drawTitle(ctx, game) {
    const world = game.world;
    ctx.fillStyle = 'rgba(11,7,20,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('— A SURVIVAL OF LIGHT —', 640, 128);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `bold 84px ${FONT}`;
    ctx.shadowColor = 'rgba(255,123,47,0.9)';
    ctx.shadowBlur = 30;
    ctx.fillText('EMBERWARD', 640, 216);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Defend the last ember. The gloom comes in waves —', 640, 258);
    ctx.fillText('burn it back with light, grow stronger, and break the Herald.', 640, 286);

    this.panel(ctx, 390, 316, 500, 150);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('HOW TO PLAY', 640, 344);
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('WASD / Arrows — move      Mouse — aim', 640, 372);
    ctx.fillText('Hold Click / Space — fire      P — pause      M — mute', 640, 398);
    ctx.fillText('Gather ember shards to level up and choose upgrades.', 640, 424);
    ctx.fillText('Survive to Wave 10 and destroy the Elder Herald to win.', 640, 448);

    const pulse = 0.75 + 0.25 * Math.sin(this.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', 640, 524);
    ctx.globalAlpha = 1;
    if (game.best > 0) {
      ctx.fillStyle = COLOURS.dim;
      ctx.font = `16px ${FONT}`;
      ctx.fillText(`Best score: ${game.best}`, 640, 556);
    }
    ctx.fillStyle = COLOURS.dim;
    ctx.font = `13px ${FONT}`;
    ctx.fillText('An original game — no files, no network, just this page.', 640, 690);
    void world;
  }

  drawPause(ctx, game) {
    ctx.fillStyle = 'rgba(11,7,20,0.7)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.panel(ctx, 440, 250, 400, 220);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText('PAUSED', 640, 316);
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `17px ${FONT}`;
    ctx.fillText('The gloom waits for no one — except now.', 640, 352);
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText('P or Click — resume      R — restart', 640, 396);
    ctx.fillStyle = COLOURS.dim;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(`Wave ${game.world.wave}   •   Score ${game.world.score}`, 640, 430);
  }

  drawLevelUp(ctx, game) {
    const world = game.world;
    const choices = world.levelUpChoices || [];
    ctx.fillStyle = 'rgba(11,7,20,0.65)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7ee0ff';
    ctx.font = `bold 40px ${FONT}`;
    ctx.shadowColor = 'rgba(126,224,255,0.7)';
    ctx.shadowBlur = 18;
    ctx.fillText(`LEVEL ${world.player.level}!`, 640, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `19px ${FONT}`;
    ctx.fillText('Choose an upgrade — click a card or press 1, 2 or 3', 640, 186);

    const cardW = 250;
    const cardH = 220;
    const gap = 30;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    let x = 640 - totalW / 2;
    const y = 230;
    game.levelUpRects = [];
    choices.forEach((choice, i) => {
      const hover = game.hoverCard === i;
      this.panel(ctx, x, y, cardW, cardH);
      if (hover) {
        ctx.strokeStyle = '#ffcf4d';
        ctx.lineWidth = 3;
        roundRect(ctx, x, y, cardW, cardH, 16);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffcf4d';
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillText(choice.icon, x + cardW / 2, y + 72);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(choice.name, x + cardW / 2, y + 112);
      ctx.fillStyle = COLOURS.bone;
      ctx.font = `15px ${FONT}`;
      const words = choice.desc.split(' ');
      let line = '';
      let ly = y + 146;
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 22) {
          ctx.fillText(line.trim(), x + cardW / 2, ly);
          ly += 20;
          line = word;
        } else {
          line += ' ' + word;
        }
      }
      if (line.trim()) ctx.fillText(line.trim(), x + cardW / 2, ly);
      const owned = world.player.taken[choice.id] || 0;
      ctx.fillStyle = COLOURS.dim;
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`owned ${owned} / ${choice.max}   •   [${i + 1}]`, x + cardW / 2, y + cardH - 18);
      game.levelUpRects.push({ x, y, w: cardW, h: cardH, index: i });
      x += cardW + gap;
    });
  }

  drawOver(ctx, game) {
    const world = game.world;
    ctx.fillStyle = 'rgba(11,7,20,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.panel(ctx, 380, 150, 520, 420);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5d73';
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText('THE EMBER FADES', 640, 224);
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('The gloom swallows the last light… this time.', 640, 258);
    this.statRow(ctx, 640, 306, 'SCORE', String(world.score));
    this.statRow(ctx, 640, 338, 'WAVE REACHED', String(world.wave));
    this.statRow(ctx, 640, 370, 'GLOOM SLAIN', String(world.kills));
    this.statRow(ctx, 640, 402, 'BEST COMBO', `x${world.bestCombo}`);
    const acc = world.shotsFired > 0 ? Math.round((world.shotsHit / world.shotsFired) * 100) : 0;
    this.statRow(ctx, 640, 434, 'ACCURACY', `${acc}%`);
    ctx.fillStyle = game.best > 0 && world.score >= game.best ? '#ffcf4d' : COLOURS.dim;
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(world.score >= game.best && world.score > 0 ? '★ NEW BEST SCORE ★' : `Best score: ${game.best}`, 640, 472);
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('PRESS R OR CLICK TO TRY AGAIN', 640, 524);
    ctx.globalAlpha = 1;
  }

  drawVictory(ctx, game) {
    const world = game.world;
    ctx.fillStyle = 'rgba(11,7,20,0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    this.panel(ctx, 380, 140, 520, 440);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = `bold 52px ${FONT}`;
    ctx.shadowColor = 'rgba(255,179,71,0.9)';
    ctx.shadowBlur = 24;
    ctx.fillText('DAWN BREAKS', 640, 214);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLOURS.bone;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('The Elder Herald is broken. The ember burns on —', 640, 250);
    ctx.fillText('and the hollow is yours again.', 640, 276);
    this.statRow(ctx, 640, 322, 'SCORE', String(world.score));
    this.statRow(ctx, 640, 354, 'WAVES CLEARED', '10');
    this.statRow(ctx, 640, 386, 'GLOOM SLAIN', String(world.kills));
    this.statRow(ctx, 640, 418, 'BEST COMBO', `x${world.bestCombo}`);
    const acc = world.shotsFired > 0 ? Math.round((world.shotsHit / world.shotsFired) * 100) : 0;
    this.statRow(ctx, 640, 450, 'ACCURACY', `${acc}%`);
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(`Best score: ${game.best}`, 640, 488);
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffcf4d';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText('PRESS R — PLAY AGAIN', 640, 530);
    ctx.fillText('C — KEEP GOING (ENDLESS)', 640, 558);
    ctx.globalAlpha = 1;
  }

  statRow(ctx, cx, y, label, value) {
    ctx.fillStyle = COLOURS.dim;
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(label, cx - 8, y);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(value, cx + 8, y);
  }
}
