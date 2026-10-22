import {
  FIRST_CLEAR_BONUS,
  KEYCAP_COST,
  KEYCAP_DUPLICATE,
  fragmentsFor,
  type DifficultyId,
  type FragmentResult,
} from '../data/formulas';
import { KEYCAPS, computeKeycapBonus, type KeycapBonus } from '../data/keycaps';
import { BUFF_BY_ID, type Rarity } from '../data/buffs';
import { Rng } from '../core/rng';
import type { KeycapDrop, RunResult } from '../game/types';
import {
  SAVE_KEY,
  defaultSave,
  exportSave,
  importSave,
  loadSave,
  normalizeSave,
  persist,
  storageAvailable,
  type SaveV1,
} from './save';

export interface DrawOutcome {
  pulls: KeycapDrop[];
  spent: number;
  pityTriggered: boolean;
  newCount: number;
  duplicateFragments: number;
}

export interface SettlementOutcome {
  fragments: FragmentResult;
  firstClearBonus: number;
  unlocked: DifficultyId | null;
  totalFragments: number;
}

const NEXT_DIFFICULTY: Partial<Record<DifficultyId, DifficultyId>> = {
  eco: 'balanced',
  balanced: 'performance',
};

export class MetaStore {
  save: SaveV1;

  constructor() {
    this.save = loadSave();
  }

  keycapBonus(): KeycapBonus {
    return computeKeycapBonus(this.save.keycaps);
  }

  addFragments(amount: number): void {
    this.save.fragments = Math.max(0, this.save.fragments + Math.floor(amount));
    persist(this.save);
  }

  grantKeycap(keyId: string): KeycapDrop | null {
    const def = KEYCAPS.find((k) => k.id === keyId);
    if (!def) return null;
    const duplicate = Boolean(this.save.keycaps[keyId]);
    let fragments = 0;
    if (duplicate) {
      fragments = KEYCAP_DUPLICATE[def.rarity];
      this.save.fragments += fragments;
    } else {
      this.save.keycaps[keyId] = 1;
    }
    persist(this.save);
    return {
      keyId,
      label: def.label,
      rarity: def.rarity,
      duplicate,
      fragments,
    };
  }

  grantRandomKeycap(rarity: Rarity, rng: Rng): KeycapDrop | null {
    const pool = KEYCAPS.filter((k) => k.rarity === rarity);
    if (pool.length === 0) return null;
    return this.grantKeycap(rng.pick(pool).id);
  }

  private rollRarity(rng: Rng): Rarity {
    if (this.save.pity.sinceLegendary >= 50) {
      return 'legendary';
    }
    const roll = rng.next();
    if (roll < 0.05) return 'legendary';
    if (roll < 0.3) return 'rare';
    return 'common';
  }

  private applyPity(rarity: Rarity): void {
    this.save.pity.sinceLegendary += 1;
    this.save.pity.sinceRare += 1;
    if (rarity === 'legendary') {
      this.save.pity.sinceLegendary = 0;
      this.save.pity.sinceRare = 0;
    } else if (rarity === 'rare') {
      this.save.pity.sinceRare = 0;
    }
  }

  draw(count: 1 | 10, seed: number): DrawOutcome | null {
    const cost = count === 1 ? KEYCAP_COST.single : KEYCAP_COST.ten;
    if (this.save.fragments < cost) return null;
    if (Object.keys(this.save.keycaps).length >= KEYCAPS.length) return null;
    this.save.fragments -= cost;
    const rng = new Rng(seed >>> 0);
    const pulls: KeycapDrop[] = [];
    let pityTriggered = false;
    let newCount = 0;
    let duplicateFragments = 0;
    for (let i = 0; i < count; i++) {
      let rarity = this.rollRarity(rng);
      if (this.save.pity.sinceLegendary >= 50 && rarity === 'legendary') pityTriggered = true;
      if (count === 10 && i === 9 && rarity === 'common') rarity = 'rare';
      this.applyPity(rarity);
      const drop = this.grantRandomKeycap(rarity, rng);
      if (!drop) continue;
      if (!drop.duplicate) newCount += 1;
      duplicateFragments += drop.fragments;
      pulls.push(drop);
    }
    persist(this.save);
    return { pulls, spent: cost, pityTriggered, newCount, duplicateFragments };
  }

  settleRun(result: RunResult): SettlementOutcome {
    const fragments = fragmentsFor({
      kills: result.kills,
      folders: result.foldersCleared,
      bosses: result.bossesKilled,
      disks: result.disksCleared,
      noHitFolders: result.noHitFolders,
      difficulty: result.difficulty,
      cleared: result.cleared,
    });
    this.save.fragments += fragments.fragments;
    this.save.stats.runs += 1;
    this.save.stats.kills += result.kills;
    this.save.stats.bossKills += result.bossesKilled;
    this.save.stats.playTimeSec += Math.floor(result.durationMs / 1000);
    this.save.stats.bestDisk = Math.max(this.save.stats.bestDisk, result.maxDisk);
    if (result.cleared) this.save.stats.wins += 1;
    else this.save.stats.deaths += 1;

    let firstClearBonus = 0;
    let unlocked: DifficultyId | null = null;
    if (result.cleared) {
      this.save.difficulty.cleared[result.difficulty] = true;
      if (!this.save.difficulty.firstClearBonus[result.difficulty]) {
        firstClearBonus = FIRST_CLEAR_BONUS[result.difficulty];
        this.save.difficulty.firstClearBonus[result.difficulty] = true;
        this.save.fragments += firstClearBonus;
      }
      const next = NEXT_DIFFICULTY[result.difficulty];
      if (next) {
        const order: DifficultyId[] = ['eco', 'balanced', 'performance'];
        const current = order.indexOf(this.save.difficulty.unlocked);
        if (order.indexOf(next) > current) {
          this.save.difficulty.unlocked = next;
          unlocked = next;
        }
      }
    }
    for (const buff of result.buffs) {
      if (!this.save.flags.seenEnemies.includes(buff.id) && BUFF_BY_ID[buff.id]) {
        // buff discovery is tracked by UI/codex separately; keep flags lean.
      }
    }
    persist(this.save);
    return {
      fragments,
      firstClearBonus,
      unlocked,
      totalFragments: this.save.fragments,
    };
  }

  updateSettings(patch: Partial<SaveV1['settings']>): void {
    this.save.settings = { ...this.save.settings, ...patch };
    persist(this.save);
  }

  markTutorialDone(): void {
    this.save.flags.tutorialDone = true;
    persist(this.save);
  }

  markBossSeen(id: string): void {
    if (!this.save.flags.seenBosses.includes(id)) {
      this.save.flags.seenBosses.push(id);
    }
    persist(this.save);
  }

  reset(): void {
    this.save = defaultSave();
    persist(this.save);
  }

  exportText(): string {
    return exportSave(this.save);
  }

  importText(text: string): boolean {
    const save = importSave(text);
    if (!save) return false;
    this.save = normalizeSave(save);
    persist(this.save);
    return true;
  }

  clearStorage(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  storageAvailable(): boolean {
    return storageAvailable();
  }
}
