export type ProtoId = 'popup' | 'notifier' | 'adware' | 'trojan' | 'cache' | 'updater';

export type PatternId =
  | 'pat.aimed1'
  | 'pat.fan3'
  | 'pat.elite_aimed2'
  | 'pat.elite_fan5'
  | 'pat.ring8'
  | 'pat.ring16'
  | 'pat.spiral'
  | 'pat.wall_rows'
  | 'pat.aimed_fan5'
  | 'pat.laser_sweep'
  | 'pat.homing_slow';

export interface EnemyDef {
  readonly id: ProtoId;
  readonly hpScale: number;
  readonly speedScale: number;
  readonly baseSpeed: number;
  readonly pattern: PatternId | null;
  readonly contact: number;
  readonly windup: number;
  readonly maxAliveBullets: number;
}

export const ENEMIES: readonly EnemyDef[] = [
  { id: 'popup', hpScale: 1.0, speedScale: 1.0, baseSpeed: 60, pattern: null, contact: 1, windup: 0, maxAliveBullets: 8 },
  { id: 'notifier', hpScale: 1.0, speedScale: 0, baseSpeed: 0, pattern: 'pat.aimed1', contact: 1, windup: 0.35, maxAliveBullets: 8 },
  { id: 'adware', hpScale: 1.0, speedScale: 0, baseSpeed: 0, pattern: 'pat.fan3', contact: 1, windup: 0.35, maxAliveBullets: 8 },
  { id: 'trojan', hpScale: 0.55, speedScale: 0.85, baseSpeed: 51, pattern: null, contact: 1, windup: 0, maxAliveBullets: 8 },
  { id: 'cache', hpScale: 1.6, speedScale: 0.6, baseSpeed: 36, pattern: null, contact: 1, windup: 0, maxAliveBullets: 8 },
  { id: 'updater', hpScale: 0.6, speedScale: 0.9, baseSpeed: 54, pattern: null, contact: 1, windup: 0, maxAliveBullets: 8 },
];

export const PROTO_ORDER: readonly ProtoId[] = [
  'popup',
  'notifier',
  'adware',
  'trojan',
  'cache',
  'updater',
];

export const ENEMY_BY_ID: Readonly<Record<ProtoId, EnemyDef>> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
) as Record<ProtoId, EnemyDef>;

export const PATTERN = {
  'pat.aimed1': { speed: 240, count: 1, spread: 0, interval: 0.8 },
  'pat.fan3': { speed: 200, count: 3, spread: 30, interval: 0.8 },
  'pat.elite_aimed2': { speed: 260, count: 2, spread: 16, interval: 1.4 },
  'pat.elite_fan5': { speed: 220, count: 5, spread: 48, interval: 1.4 },
  'pat.ring8': { speed: 180, count: 8, spread: 360, interval: 1.2 },
  'pat.ring16': { speed: 200, count: 16, spread: 360, interval: 2.4 },
  'pat.spiral': { speed: 190, count: 6, spread: 360, interval: 0.35 },
  'pat.wall_rows': { speed: 160, count: 9, spread: 180, interval: 1.6 },
  'pat.aimed_fan5': { speed: 260, count: 5, spread: 40, interval: 1.2 },
  'pat.laser_sweep': { speed: 0, count: 0, spread: 0, interval: 6.0 },
  'pat.homing_slow': { speed: 90, count: 3, spread: 40, interval: 2.5 },
} as const satisfies Record<PatternId, { speed: number; count: number; spread: number; interval: number }>;

export const WAVE_WEIGHTS: Readonly<
  Record<1 | 2 | 3, readonly { proto: ProtoId; weight: number }[]>
> = {
  1: [
    { proto: 'popup', weight: 0.6 },
    { proto: 'notifier', weight: 0.4 },
  ],
  2: [
    { proto: 'popup', weight: 0.25 },
    { proto: 'notifier', weight: 0.25 },
    { proto: 'adware', weight: 0.25 },
    { proto: 'updater', weight: 0.15 },
    { proto: 'cache', weight: 0.1 },
  ],
  3: [
    { proto: 'popup', weight: 0.35 },
    { proto: 'notifier', weight: 0.25 },
    { proto: 'adware', weight: 0.2 },
    { proto: 'trojan', weight: 0.15 },
    { proto: 'cache', weight: 0.05 },
  ],
};

export const WAVE_BASE = { 1: 3, 2: 5, 3: 4 } as const;
export const WAVE_KINDS = { 1: 1, 2: 2, 3: 3 } as const;
