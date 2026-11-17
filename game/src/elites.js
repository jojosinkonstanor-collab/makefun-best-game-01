// Elite foes: from wave 2 on, each wave fields one elite — a glowing, oversized
// version of a normal kind with triple health, triple score and double shards.
// Elites drop a heart and a rapid-fire pickup when they fall, so hunting them is
// worth the risk. One elite per wave, never the Herald.
export const ELITE_HP_MULT = 3;
export const ELITE_SCORE_MULT = 3;
export const ELITE_XP_MULT = 2;
export const ELITE_RADIUS_MULT = 1.2;

/** Turn a freshly spawned enemy into the wave's elite. Returns the enemy. */
export function makeElite(enemy) {
  enemy.elite = true;
  enemy.hp *= ELITE_HP_MULT;
  enemy.maxHp *= ELITE_HP_MULT;
  enemy.radius *= ELITE_RADIUS_MULT;
  enemy.score *= ELITE_SCORE_MULT;
  enemy.xp *= ELITE_XP_MULT;
  return enemy;
}

/** Is this kind allowed to be an elite? Bosses and the swarm's weakest never are. */
export function canBeElite(kind) {
  return kind !== 'herald' && kind !== 'wisp';
}
