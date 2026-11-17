// Particles, floating combat text and screen shake: the juice layer. The world spawns
// effects; this module owns their lifetimes and their drawing, nothing else.
import { clamp } from './random.js';

export class Particles {
  constructor() {
    this.list = [];
    this.texts = [];
    this.trauma = 0;
    this.hitStop = 0;
    this.flash = 0;
  }

  burst(x, y, colour, count, speed = 180, life = 0.5, size = 3) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.7),
        age: 0,
        size: size * (0.6 + Math.random() * 0.8),
        colour,
        drag: 0.88,
      });
    }
    if (this.list.length > 500) this.list.splice(0, this.list.length - 500);
  }

  ring(x, y, colour, maxRadius = 90, life = 0.4) {
    this.list.push({ x, y, vx: 0, vy: 0, life, age: 0, size: 2, colour, ring: true, maxRadius, drag: 1 });
  }

  emberDrift(x, y) {
    this.list.push({
      x: x + (Math.random() - 0.5) * 40,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 12,
      vy: -14 - Math.random() * 22,
      life: 2 + Math.random() * 2,
      age: 0,
      size: 1.5 + Math.random() * 2,
      colour: Math.random() < 0.5 ? '#ffb347' : '#ff7b2f',
      drag: 1,
      ember: true,
    });
  }

  text(x, y, str, colour = '#ffe9a8', size = 15) {
    // Keep the text on screen: long strings are centred on x, so leave room.
    this.texts.push({ x: clamp(x, 110, 1130), y, str, colour, size, age: 0, life: 0.9 });
    if (this.texts.length > 40) this.texts.shift();
  }

  shake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  stopTime(seconds) {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  damageFlash() {
    this.flash = 0.55;
  }

  update(dt) {
    if (this.hitStop > 0) this.hitStop -= dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.list.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      if (p.ember) p.vy -= 6 * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const t = this.texts[i];
      t.age += dt;
      t.y -= 34 * dt;
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
  }

  shakeOffset() {
    const s = this.trauma * this.trauma * 14;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = t;
      if (p.ring) {
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = 3 * t + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.maxRadius * (1 - t * t) + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * t), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const a = 1 - t.age / t.life;
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.size}px "Trebuchet MS", Verdana, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.colour;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
