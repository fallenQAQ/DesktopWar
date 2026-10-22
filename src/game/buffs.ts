import {
  BUFFS,
  BUFF_BY_ID,
  RARITY_WEIGHT,
  type BuffDef,
  type BuffId,
  type Rarity,
} from '../data/buffs';
import type { KeycapBonus } from '../data/keycaps';
import type { Rng } from '../core/rng';
import { clamp } from '../core/math';

export interface PlayerStats {
  attackPct: number;
  fireRatePct: number;
  movePct: number;
  bulletCount: number;
  pierce: number;
  critMult: number;
  bulletSpeed: number;
  maxRamDelta: number;
  invulnBonus: number;
  damageTakenPct: number;
  bulletRadiusMul: number;
  reroll: boolean;
  fourCards: boolean;
  keycaps: KeycapBonus;
}

export type BuffStacks = Partial<Record<BuffId, number>>;

export function stacksOf(stacks: BuffStacks, id: BuffId): number {
  return stacks[id] ?? 0;
}

export function addStack(stacks: BuffStacks, id: BuffId): number {
  const def = BUFF_BY_ID[id];
  const next = Math.min(def.maxStacks, (stacks[id] ?? 0) + 1);
  stacks[id] = next;
  return next;
}

export function isMaxed(stacks: BuffStacks, def: BuffDef): boolean {
  return (stacks[def.id] ?? 0) >= def.maxStacks;
}

export function buffCount(stacks: BuffStacks): number {
  let n = 0;
  for (const def of BUFFS) n += stacks[def.id] ?? 0;
  return n;
}

export function legendaryCount(stacks: BuffStacks): number {
  return BUFFS.filter((b) => b.rarity === 'legendary' && (stacks[b.id] ?? 0) > 0).length;
}

export function computeStats(stacks: BuffStacks, keycaps: KeycapBonus): PlayerStats {
  let attackPct = keycaps.atkPct;
  let fireRatePct = keycaps.asPct;
  let movePct = keycaps.movPct;
  let bulletCount = 1;
  let pierce = 0;
  let maxRamDelta = 0;
  let invulnBonus = keycaps.invulnBonus;
  let damageTakenPct = 0;
  let bulletRadiusMul = 1;

  attackPct += stacksOf(stacks, 'buff.memory_align') * 8;
  fireRatePct +=
    stacksOf(stacks, 'buff.cache_hit') * 8 +
    stacksOf(stacks, 'buff.hotkey') * 6 +
    stacksOf(stacks, 'buff.overclock') * 30 +
    stacksOf(stacks, 'buff.raid0') * 30;
  movePct +=
    stacksOf(stacks, 'buff.clock_cycle') * 5 +
    stacksOf(stacks, 'buff.disk_defrag') * 8 +
    stacksOf(stacks, 'buff.raid0') * 15;
  bulletCount += stacksOf(stacks, 'buff.multithreading');
  if (stacksOf(stacks, 'buff.hyper_threading') > 0) bulletCount *= 2;
  pierce += stacksOf(stacks, 'buff.buffer_overflow');
  if (stacksOf(stacks, 'buff.root_access') > 0) {
    pierce += 2;
    attackPct += 25;
  }
  maxRamDelta += stacksOf(stacks, 'buff.virtual_memory') * 2;
  if (stacksOf(stacks, 'buff.raid0') > 0) maxRamDelta -= 1;
  invulnBonus += stacksOf(stacks, 'buff.disk_defrag') * 0.3;
  damageTakenPct +=
    stacksOf(stacks, 'buff.overclock') * 15 +
    stacksOf(stacks, 'buff.virtual_memory') * 10;
  bulletRadiusMul += stacksOf(stacks, 'buff.buffer') * 0.3;

  bulletCount = clamp(Math.round(bulletCount), 1, 12);
  pierce = clamp(Math.round(pierce), 0, 5);
  return {
    attackPct,
    fireRatePct,
    movePct,
    bulletCount,
    pierce,
    critMult: 1.5,
    bulletSpeed: 900,
    maxRamDelta,
    invulnBonus,
    damageTakenPct,
    bulletRadiusMul,
    reroll: keycaps.reroll,
    fourCards: keycaps.fourCards,
    keycaps,
  };
}

export interface BuffOffer {
  kind: 'folder' | 'boss';
  cards: BuffId[];
  bonusFragments: number;
}

function available(stacks: BuffStacks, rarity: Rarity): BuffDef[] {
  return BUFFS.filter((b) => b.rarity === rarity && !isMaxed(stacks, b));
}

function pickUnique(
  pool: readonly BuffDef[],
  picked: readonly BuffId[],
  rng: Rng,
): BuffDef | null {
  const candidates = pool.filter((b) => !picked.includes(b.id));
  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}

export function rollOffer(
  stacks: BuffStacks,
  rng: Rng,
  kind: 'folder' | 'boss',
  fourCards: boolean,
): BuffOffer {
  const target = fourCards ? 4 : 3;
  const picked: BuffId[] = [];
  let bonusFragments = 0;

  if (kind === 'boss') {
    const legendary = available(stacks, 'legendary');
    let pool = legendary;
    if (pool.length === 0) {
      pool = available(stacks, 'rare');
      if (pool.length >= target) bonusFragments = 50;
    }
    const shuffled = rng.shuffle([...pool]);
    for (const def of shuffled) {
      if (picked.length >= target) break;
      picked.push(def.id);
    }
    if (picked.length < target) {
      for (const rarity of ['rare', 'common'] as const) {
        const extra = rng.shuffle([...available(stacks, rarity)]);
        for (const def of extra) {
          if (picked.length >= target) break;
          if (!picked.includes(def.id)) picked.push(def.id);
        }
        if (picked.length >= target) break;
      }
    }
    return { kind, cards: picked, bonusFragments };
  }

  const rarities: Rarity[] = ['common', 'rare', 'legendary'];
  while (picked.length < target) {
    const options = rarities
      .map((r) => ({ rarity: r, pool: available(stacks, r) }))
      .filter((o) => o.pool.some((b) => !picked.includes(b.id)));
    if (options.length === 0) break;
    const totalWeight = options.reduce((sum, o) => sum + RARITY_WEIGHT[o.rarity], 0);
    let roll = rng.next() * totalWeight;
    let rarity: Rarity = options[options.length - 1]!.rarity;
    for (const o of options) {
      roll -= RARITY_WEIGHT[o.rarity];
      if (roll <= 0) {
        rarity = o.rarity;
        break;
      }
    }
    const chosen = pickUnique(
      options.find((o) => o.rarity === rarity)?.pool ?? [],
      picked,
      rng,
    );
    if (chosen) picked.push(chosen.id);
    else {
      const fallback = options
        .flatMap((o) => o.pool)
        .filter((b) => !picked.includes(b.id));
      const pick = rng.pick(fallback);
      if (!pick) break;
      picked.push(pick.id);
    }
  }
  return { kind, cards: picked, bonusFragments };
}
