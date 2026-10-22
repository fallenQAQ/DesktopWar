import { LOGICAL_H, LOGICAL_W, dist2 } from '../core/math';
import type { Rng } from '../core/rng';
import type { DifficultyId } from '../data/formulas';
import { M, spawnCount } from '../data/formulas';
import {
  ENEMY_BY_ID,
  WAVE_BASE,
  WAVE_KINDS,
  WAVE_WEIGHTS,
  type ProtoId,
} from '../data/enemies';

export interface WavePlan {
  protos: ProtoId[];
  elite: ProtoId | null;
}

function weightedPick(rng: Rng, weights: readonly { proto: ProtoId; weight: number }[]): ProtoId {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = rng.next() * total;
  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) return item.proto;
  }
  return weights[weights.length - 1]!.proto;
}

export function planWave(
  disk: number,
  difficulty: DifficultyId,
  wave: 1 | 2 | 3,
  folder: number,
  rng: Rng,
): WavePlan {
  const m = M(disk, difficulty);
  const count = Math.max(1, spawnCount(WAVE_BASE[wave], m));
  const weights = WAVE_WEIGHTS[wave];
  const protos: ProtoId[] = [];
  const counts: Partial<Record<ProtoId, number>> = {};
  const minKinds = WAVE_KINDS[wave];
  for (let i = 0; i < count; i++) {
    let proto = weightedPick(rng, weights);
    if (proto === 'cache' && (counts.cache ?? 0) >= 1) {
      proto = weightedPick(rng, weights.filter((w) => w.proto !== 'cache'));
    }
    if (proto === protos[protos.length - 1] && (counts[proto] ?? 0) >= 3) {
      proto = weightedPick(rng, weights.filter((w) => w.proto !== proto));
    }
    counts[proto] = (counts[proto] ?? 0) + 1;
    protos.push(proto);
  }

  if (wave === 1 && !protos.includes('popup')) {
    const idx = rng.int(protos.length);
    protos[idx] = 'popup';
  }
  if (wave === 3 && folder === 5 && !protos.includes('cache') && !protos.includes('trojan')) {
    protos[rng.int(protos.length)] = rng.next() < 0.5 ? 'cache' : 'trojan';
  }

  let kinds = new Set(protos).size;
  const extraOrder: ProtoId[] = ['notifier', 'adware', 'trojan', 'updater', 'popup'];
  let guard = 0;
  while (kinds < minKinds && guard++ < 20) {
    const proto = extraOrder[guard % extraOrder.length]!;
    const idx = rng.int(protos.length);
    const previous = protos[idx]!;
    protos[idx] = proto;
    if (proto !== previous) kinds = new Set(protos).size;
  }

  let elite: ProtoId | null = null;
  if (wave === 3) {
    const candidates: ProtoId[] = ['popup', 'trojan', 'cache', 'updater'];
    elite = rng.pick(candidates);
    if (ENEMY_BY_ID[elite]) {
      /* selected from legal non-stationary prototypes */
    }
  }
  return { protos, elite };
}

const SAFE_DIST2 = 180 * 180;

function interiorPoint(
  rng: Rng,
  playerX: number,
  playerY: number,
): { x: number; y: number } {
  const minX = 96;
  const maxX = LOGICAL_W - 96;
  const minY = 84;
  const maxY = LOGICAL_H - 96;
  for (let attempt = 0; attempt < 16; attempt++) {
    const x = rng.range(minX, maxX);
    const y = rng.range(minY, maxY);
    if (dist2(x, y, playerX, playerY) >= SAFE_DIST2) return { x, y };
  }
  const anchors = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
  ];
  anchors.sort(
    (a, b) => dist2(b.x, b.y, playerX, playerY) - dist2(a.x, a.y, playerX, playerY),
  );
  return anchors[0]!;
}

/**
 * Chasers enter from the offscreen ring. Stationary/turret enemies must spawn
 * inside the viewport, otherwise they can never be seen, hit, or cleared.
 */
export function spawnPoint(
  rng: Rng,
  playerX: number,
  playerY: number,
  interior = false,
): { x: number; y: number } {
  if (interior) return interiorPoint(rng, playerX, playerY);
  for (let attempt = 0; attempt < 8; attempt++) {
    const sideRoll = rng.next();
    let x = 0;
    let y = 0;
    if (sideRoll < 0.4) {
      x = 40 + rng.next() * (LOGICAL_W - 80);
      y = -40;
    } else if (sideRoll < 0.7) {
      x = -40;
      y = 40 + rng.next() * (LOGICAL_H - 140);
    } else {
      x = LOGICAL_W + 40;
      y = 40 + rng.next() * (LOGICAL_H - 140);
    }
    if (dist2(x, y, playerX, playerY) >= SAFE_DIST2) return { x, y };
  }
  return { x: playerX < LOGICAL_W / 2 ? LOGICAL_W - 120 : 120, y: -40 };
}
