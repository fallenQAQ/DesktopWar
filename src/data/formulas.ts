// Canon implementation: docs/00 §7.3. Any change requires an ADR.
export const K = (d: number): number => 1 + 0.32 * (d - 1) + 0.08 * (d - 1) ** 2;

export const D = { eco: 1.0, balanced: 1.3, performance: 1.6 } as const;

export type DifficultyId = keyof typeof D;

export const M = (d: number, diff: DifficultyId): number => K(d) * D[diff];

export const enemyHp = (hp0: number, m: number): number => Math.round(hp0 * m);

export type EnemyTier = 'normal' | 'elite' | 'boss';

export const enemyDamage = (t: EnemyTier, m: number): number =>
  t === 'normal'
    ? Math.min(2, 1 + Math.floor((m - 1) / 2.0))
    : t === 'elite'
      ? Math.min(3, 2 + Math.floor((m - 1) / 2.5))
      : Math.min(4, 2 + Math.floor((m - 1) / 2.0));

// Boss does not use this formula (docs/10 GC-01).
export const enemySpeed = (d: number): number => 60 * Math.min(1.3, 1 + 0.05 * (d - 1));

export const enemyAtkSpd = (d: number): number => Math.min(1.2, 1 + 0.04 * (d - 1));

export const spawnCount = (base: number, m: number): number =>
  Math.round(base * (0.85 + 0.15 * m));

export const DISKS: Readonly<Record<DifficultyId, number>> = {
  eco: 3,
  balanced: 4,
  performance: 5,
};

export const PLAYER = {
  ram: 5,
  damage: 10,
  fireInterval: 0.8,
  bulletSpeed: 900,
  bulletRadius: 4,
  hitRadius: 3,
  invuln: 1.0,
  moveSpeed: 320,
} as const;

export const ENEMY_BASE = {
  normalHp: 30,
  eliteHp: 90,
  bossHp: 600,
  normalDmg: 1,
  eliteDmg: 2,
  bossDmg: 2,
  normalRate: 0.8,
  eliteRate: 1.4,
  bossRate: 1.2,
  normalSpeed: 60,
  eliteSpeed: 50,
  contactNormal: 1,
  contactElite: 2,
  contactBoss: 2,
} as const;

export interface FragmentInput {
  kills: number;
  folders: number;
  bosses: number;
  disks: number;
  noHitFolders: number;
  difficulty: DifficultyId;
  cleared: boolean;
}

export interface FragmentResult {
  raw: number;
  mult: number;
  fragments: number;
}

export function fragmentsFor(input: FragmentInput): FragmentResult {
  const raw =
    0.5 * input.kills + 8 * input.folders + 30 * input.bosses + 50 * input.disks;
  const mult =
    D[input.difficulty] *
    (1 + 0.05 * Math.min(input.noHitFolders, 5)) *
    (input.cleared ? 1.25 : 1.0);
  return { raw, mult, fragments: Math.floor(raw * mult) };
}

export const FIRST_CLEAR_BONUS: Readonly<Record<DifficultyId, number>> = {
  eco: 200,
  balanced: 400,
  performance: 800,
};

export const KEYCAP_COST = { single: 200, ten: 1800 } as const;
export const KEYCAP_DUPLICATE = { common: 20, rare: 60, legendary: 250 } as const;

export const LOGIC_DT = 1 / 60;
