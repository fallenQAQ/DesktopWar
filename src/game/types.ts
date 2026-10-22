import type { DifficultyId } from '../data/formulas';
import type { BuffId, Rarity } from '../data/buffs';
import type { KeycapBonus } from '../data/keycaps';

export interface BuffInstance {
  id: BuffId;
  stacks: number;
}

export interface KeycapDrop {
  keyId: string;
  label: string;
  rarity: Rarity;
  duplicate: boolean;
  fragments: number;
}

export interface RunResult {
  seed: number;
  difficulty: DifficultyId;
  durationMs: number;
  cleared: boolean;
  kills: number;
  foldersCleared: number;
  bossesKilled: number;
  disksCleared: number;
  noHitFolders: number;
  buffs: BuffInstance[];
  keycaps: KeycapDrop[];
  maxDisk: number;
  ramLeft: number;
}

export interface RunOptions {
  difficulty: DifficultyId;
  seed: number;
  keycapBonus: KeycapBonus;
  autoLock: boolean;
}
