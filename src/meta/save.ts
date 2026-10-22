import type { DifficultyId } from '../data/formulas';
import type { Locale } from '../i18n';
import { KEYCAP_BY_ID } from '../data/keycaps';

export const SAVE_KEY = 'desktopwar.save.v1';
export const SAVE_VERSION = 1;

export interface SaveV1 {
  version: 1;
  createdAt: number;
  updatedAt: number;
  fragments: number;
  keycaps: Record<string, 1>;
  pity: { sinceRare: number; sinceLegendary: number };
  difficulty: {
    unlocked: DifficultyId;
    cleared: Record<DifficultyId, boolean>;
    firstClearBonus: Record<DifficultyId, boolean>;
  };
  stats: {
    runs: number;
    wins: number;
    deaths: number;
    kills: number;
    bossKills: number;
    playTimeSec: number;
    bestDisk: number;
  };
  settings: {
    musicVolume: number;
    sfxVolume: number;
    screenShake: boolean;
    reducedMotion: 'system' | 'on' | 'off';
    showHitbox: boolean;
    autoLock: boolean;
    language: Locale;
  };
  flags: {
    tutorialDone: boolean;
    seenBosses: string[];
    seenEnemies: string[];
  };
}

export function defaultSave(now = Date.now()): SaveV1 {
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    fragments: 0,
    keycaps: {},
    pity: { sinceRare: 0, sinceLegendary: 0 },
    difficulty: {
      unlocked: 'eco',
      cleared: { eco: false, balanced: false, performance: false },
      firstClearBonus: { eco: false, balanced: false, performance: false },
    },
    stats: {
      runs: 0,
      wins: 0,
      deaths: 0,
      kills: 0,
      bossKills: 0,
      playTimeSec: 0,
      bestDisk: 0,
    },
    settings: {
      musicVolume: 0.6,
      sfxVolume: 0.8,
      screenShake: true,
      reducedMotion: 'system',
      showHitbox: false,
      autoLock: false,
      language: 'zh-CN',
    },
    flags: {
      tutorialDone: false,
      seenBosses: [],
      seenEnemies: [],
    },
  };
}

let memorySave: SaveV1 | null = null;
let storageBroken = false;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeSave(raw: unknown): SaveV1 {
  const base = defaultSave();
  if (!isObject(raw)) return base;
  const settings = isObject(raw.settings) ? raw.settings : {};
  const difficulty = isObject(raw.difficulty) ? raw.difficulty : {};
  const cleared = isObject(difficulty.cleared) ? difficulty.cleared : {};
  const bonus = isObject(difficulty.firstClearBonus) ? difficulty.firstClearBonus : {};
  const stats = isObject(raw.stats) ? raw.stats : {};
  const pity = isObject(raw.pity) ? raw.pity : {};
  const flags = isObject(raw.flags) ? raw.flags : {};
  const unlocked = difficulty.unlocked;
  const keycapsRaw = isObject(raw.keycaps) ? raw.keycaps : {};
  const keycaps: Record<string, 1> = {};
  for (const [id, owned] of Object.entries(keycapsRaw)) {
    if (owned === 1 && KEYCAP_BY_ID[id]) keycaps[id] = 1;
  }
  const motion = settings.reducedMotion;
  return {
    ...base,
    createdAt: num(raw.createdAt, base.createdAt),
    updatedAt: num(raw.updatedAt, base.updatedAt),
    fragments: Math.max(0, Math.floor(num(raw.fragments, 0))),
    keycaps,
    pity: {
      sinceRare: Math.max(0, Math.floor(num(pity.sinceRare, 0))),
      sinceLegendary: Math.max(0, Math.floor(num(pity.sinceLegendary, 0))),
    },
    difficulty: {
      unlocked:
        unlocked === 'balanced' || unlocked === 'performance' || unlocked === 'eco'
          ? unlocked
          : 'eco',
      cleared: {
        eco: bool(cleared.eco, false),
        balanced: bool(cleared.balanced, false),
        performance: bool(cleared.performance, false),
      },
      firstClearBonus: {
        eco: bool(bonus.eco, false),
        balanced: bool(bonus.balanced, false),
        performance: bool(bonus.performance, false),
      },
    },
    stats: {
      runs: Math.max(0, Math.floor(num(stats.runs, 0))),
      wins: Math.max(0, Math.floor(num(stats.wins, 0))),
      deaths: Math.max(0, Math.floor(num(stats.deaths, 0))),
      kills: Math.max(0, Math.floor(num(stats.kills, 0))),
      bossKills: Math.max(0, Math.floor(num(stats.bossKills, 0))),
      playTimeSec: Math.max(0, Math.floor(num(stats.playTimeSec, 0))),
      bestDisk: Math.max(0, Math.floor(num(stats.bestDisk, 0))),
    },
    settings: {
      musicVolume: num(settings.musicVolume, 0.6, 0, 1),
      sfxVolume: num(settings.sfxVolume, 0.8, 0, 1),
      screenShake: bool(settings.screenShake, true),
      reducedMotion:
        motion === 'on' || motion === 'off' || motion === 'system' ? motion : 'system',
      showHitbox: bool(settings.showHitbox, false),
      autoLock: bool(settings.autoLock, false),
      language: settings.language === 'en-US' ? 'en-US' : 'zh-CN',
    },
    flags: {
      tutorialDone: bool(flags.tutorialDone, false),
      seenBosses: Array.isArray(flags.seenBosses)
        ? flags.seenBosses.filter((v): v is string => typeof v === 'string')
        : [],
      seenEnemies: Array.isArray(flags.seenEnemies)
        ? flags.seenEnemies.filter((v): v is string => typeof v === 'string')
        : [],
    },
    version: 1,
  };
}

export function loadSave(): SaveV1 {
  if (storageBroken) return memorySave ?? (memorySave = defaultSave());
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      memorySave = defaultSave();
      persist(memorySave);
      return memorySave;
    }
    const parsed: unknown = JSON.parse(raw);
    const save = normalizeSave(parsed);
    memorySave = save;
    return save;
  } catch {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) localStorage.setItem(`desktopwar.save.bad.${Date.now()}`, raw);
    } catch {
      /* storage unavailable */
    }
    memorySave = defaultSave();
    persist(memorySave);
    return memorySave;
  }
}

export function persist(save: SaveV1): void {
  save.updatedAt = Date.now();
  memorySave = save;
  if (storageBroken) return;
  try {
    const json = JSON.stringify(save);
    localStorage.setItem(`${SAVE_KEY}.tmp`, json);
    localStorage.setItem(SAVE_KEY, json);
    localStorage.removeItem(`${SAVE_KEY}.tmp`);
  } catch {
    storageBroken = true;
  }
}

export function storageAvailable(): boolean {
  return !storageBroken;
}

export function exportSave(save: SaveV1): string {
  return JSON.stringify(save, null, 2);
}

export function importSave(text: string): SaveV1 | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed) || parsed.version !== 1) return null;
    return normalizeSave(parsed);
  } catch {
    return null;
  }
}

export function reducedMotionEnabled(save: SaveV1): boolean {
  if (save.settings.reducedMotion === 'on') return true;
  if (save.settings.reducedMotion === 'off') return false;
  return typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
