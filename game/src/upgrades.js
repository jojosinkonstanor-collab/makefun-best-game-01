// The level-up upgrade pool: each upgrade is one clear choice with a name, a plain
// description and a small effect on the player. The world offers three distinct ones
// on every level-up; the player picks with a click or keys 1-3.
export const UPGRADES = [
  {
    id: 'emberRounds', name: 'Ember Rounds', icon: '✦',
    desc: '+25% bullet damage', max: 5,
    apply: (p) => { p.damage *= 1.25; },
  },
  {
    id: 'rapidCoil', name: 'Rapid Coil', icon: '≫',
    desc: '+18% fire rate', max: 5,
    apply: (p) => { p.fireInterval *= 0.85; },
  },
  {
    id: 'twinShot', name: 'Twin Shot', icon: '⁂',
    desc: '+1 projectile per shot', max: 3,
    apply: (p) => { p.projectiles += 1; },
  },
  {
    id: 'piercingLight', name: 'Piercing Light', icon: '➶',
    desc: 'Bullets pierce +1 enemy', max: 3,
    apply: (p) => { p.pierce += 1; },
  },
  {
    id: 'swiftBoots', name: 'Swift Boots', icon: '➤',
    desc: '+12% move speed', max: 5,
    apply: (p) => { p.speed *= 1.12; },
  },
  {
    id: 'heartwood', name: 'Heartwood', icon: '♥',
    desc: '+25 max health, heal 25', max: 5,
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'keenEye', name: 'Keen Eye', icon: '◎',
    desc: '+10% critical chance (2x damage)', max: 5,
    apply: (p) => { p.critChance += 0.1; },
  },
  {
    id: 'magnet', name: 'Shard Magnet', icon: '◉',
    desc: '+60% shard pickup radius', max: 4,
    apply: (p) => { p.magnet *= 1.6; },
  },
  {
    id: 'emberNova', name: 'Ember Nova', icon: '☀',
    desc: 'Kills burst flame around you', max: 3,
    apply: (p) => { p.nova += 1; },
  },
  {
    id: 'ricochet', name: 'Ricochet', icon: '↩',
    desc: 'Bullets bounce to a nearby foe', max: 2,
    apply: (p) => { p.ricochet += 1; },
  },
  {
    id: 'regen', name: 'Slow Mend', icon: '✚',
    desc: 'Regenerate +0.8 health per second', max: 4,
    apply: (p) => { p.regen += 0.8; },
  },
  {
    id: 'heavyLight', name: 'Heavy Light', icon: '●',
    desc: '+20% bullet size and speed', max: 4,
    apply: (p) => { p.bulletSpeed *= 1.2; p.bulletRadius *= 1.2; },
  },
];

/** Pick `count` distinct upgrades the player has not maxed out yet. */
export function rollChoices(rng, taken, count = 3) {
  const available = UPGRADES.filter((u) => (taken[u.id] || 0) < u.max);
  const choices = [];
  while (choices.length < count && available.length > 0) {
    const index = Math.floor(rng() * available.length);
    choices.push(available.splice(index, 1)[0]);
  }
  return choices;
}
