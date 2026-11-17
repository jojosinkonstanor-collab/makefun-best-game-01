// EMBERWARD — tuning constants. One place for every number the designers argue about,
// so balancing a wave or a weapon never means hunting through the simulation.
export const VIEW = { width: 1280, height: 720 };

/** Fixed simulation step: the world always advances in 1/60 s slices. */
export const STEP = 1 / 60;

/** The arena is the whole view; the warden fights inside its walls. */
export const ARENA = { x: 24, y: 84, width: 1232, height: 612 };

export const PLAYER = {
  radius: 16,
  speed: 250,
  maxHp: 100,
  fireInterval: 0.32,
  bulletSpeed: 620,
  bulletRadius: 6,
  damage: 14,
  projectiles: 1,
  pierce: 0,
  critChance: 0.05,
  critMult: 2,
  magnet: 90,
  regen: 0,
  invulnAfterHit: 0.7,
};

/** Experience needed to reach the next level (level is 1-based). */
export function xpForLevel(level) {
  return 6 + level * 5 + Math.floor(level * level * 0.5);
}

export const COMBO_WINDOW = 2.5;
export const WAVE_CLEAR_HEAL = 10;
export const BREATHER_SECONDS = 4;
export const VICTORY_WAVE = 10;

/**
 * Enemy kinds. `cost` is the wave director's budget price, `xp` the shards it drops.
 * Every kind has its own shape, colour, movement and attack so the arena reads at a glance.
 */
export const ENEMIES = {
  wisp:   { name: 'Wisp',   hp: 12,  radius: 12, speed: 118, damage: 8,  score: 50,  xp: 1, cost: 1, colour: '#b78cff', glow: '#8b5cf6' },
  husk:   { name: 'Husk',   hp: 70,  radius: 23, speed: 42,  damage: 16, score: 100, xp: 3, cost: 3, colour: '#7dd87d', glow: '#3f9e4d' },
  spitter:{ name: 'Spitter',hp: 26,  radius: 14, speed: 64,  damage: 10, score: 150, xp: 2, cost: 2, colour: '#ff9f43', glow: '#e0651f' },
  dasher: { name: 'Dasher', hp: 34,  radius: 14, speed: 76,  damage: 14, score: 150, xp: 2, cost: 2, colour: '#ff5d73', glow: '#d92638' },
  herald: { name: 'Gloom Herald', hp: 950, radius: 48, speed: 34, damage: 20, score: 5000, xp: 20, cost: 0, colour: '#e8e4ff', glow: '#7c6cff' },
};

/** What each wave may spend, and how the director mixes the kinds. */
export function waveBudget(wave) {
  return 8 + wave * 6;
}
export function waveUnlocks(wave) {
  const kinds = ['wisp'];
  if (wave >= 2) kinds.push('dasher');
  if (wave >= 3) kinds.push('spitter');
  if (wave >= 4) kinds.push('husk');
  return kinds;
}
export function isBossWave(wave) {
  return wave === 5 || wave === VICTORY_WAVE;
}
export function bossHp(wave) {
  return wave >= VICTORY_WAVE ? 1800 : 950;
}

export const PICKUPS = {
  shard: { radius: 7, magnet: true },
  heart: { radius: 11, heal: 25 },
  shield: { radius: 11, seconds: 6 },
  rapid: { radius: 11, seconds: 8 },
};

export const COLOURS = {
  bg0: '#0b0714',
  bg1: '#17102a',
  ember: '#ffb347',
  emberHot: '#ff7b2f',
  emberCore: '#ffe9a8',
  bone: '#f2ead8',
  dim: '#8f86a8',
  hp: '#ff5d73',
  xp: '#7ee0ff',
  panel: 'rgba(16, 10, 30, 0.82)',
  panelEdge: '#4a3a72',
};
