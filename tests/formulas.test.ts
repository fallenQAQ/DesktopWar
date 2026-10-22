import { describe, expect, it } from 'vitest';
import {
  D,
  K,
  M,
  enemyAtkSpd,
  enemyDamage,
  enemyHp,
  enemySpeed,
  fragmentsFor,
  spawnCount,
} from '../src/data/formulas';

describe('Canon scaling (docs/00 §7.3)', () => {
  it('matches the K column', () => {
    const expected = [1, 1.4, 1.96, 2.68, 3.56];
    expected.forEach((value, index) => {
      expect(K(index + 1)).toBeCloseTo(value, 10);
    });
  });

  it('matches the 15-cell M table', () => {
    const table = {
      eco: [1.0, 1.4, 1.96],
      balanced: [1.3, 1.82, 2.55, 3.48],
      performance: [1.6, 2.24, 3.14, 4.29, 5.696],
    } as const;
    for (const [difficulty, values] of Object.entries(table)) {
      values.forEach((expected, index) => {
        expect(M(index + 1, difficulty as keyof typeof D)).toBeCloseTo(expected, 2);
      });
    }
  });

  it('derives enemy stats with clamped damage', () => {
    expect(enemyHp(30, 1)).toBe(30);
    expect(enemyHp(30, 5.696)).toBe(171);
    expect(enemyHp(600, 1)).toBe(600);
    expect(enemyHp(600, 5.696)).toBe(3418);
    expect(enemyDamage('normal', 1)).toBe(1);
    expect(enemyDamage('normal', 5.696)).toBe(2);
    expect(enemyDamage('elite', 1)).toBe(2);
    expect(enemyDamage('boss', 5.696)).toBe(4);
    expect(enemySpeed(1)).toBeCloseTo(60, 10);
    expect(enemySpeed(5)).toBeCloseTo(72, 10);
    expect(enemyAtkSpd(5)).toBeCloseTo(1.16, 10);
  });

  it('matches the published spawn counts', () => {
    expect(spawnCount(3, 1)).toBe(3);
    expect(spawnCount(5, 1)).toBe(5);
    expect(spawnCount(4, 1)).toBe(4);
    expect(spawnCount(4, 5.696)).toBe(7);
    expect(spawnCount(5, 5.696)).toBe(9);
  });
});

describe('Fragment economy (docs/00 §7.8)', () => {
  it('matches the three published full-clear examples', () => {
    const eco = fragmentsFor({
      kills: 385,
      folders: 15,
      bosses: 3,
      disks: 3,
      noHitFolders: 5,
      difficulty: 'eco',
      cleared: true,
    });
    expect(eco.raw).toBeCloseTo(552.5, 8);
    expect(eco.mult).toBeCloseTo(1.5625, 8);
    expect(eco.fragments).toBe(863);

    const balanced = fragmentsFor({
      kills: 540,
      folders: 20,
      bosses: 4,
      disks: 4,
      noHitFolders: 5,
      difficulty: 'balanced',
      cleared: true,
    });
    expect(balanced.fragments).toBe(1523);

    const performance = fragmentsFor({
      kills: 730,
      folders: 25,
      bosses: 5,
      disks: 5,
      noHitFolders: 5,
      difficulty: 'performance',
      cleared: true,
    });
    expect(performance.fragments).toBe(2412);
  });

  it('caps the no-hit multiplier at five folders', () => {
    const base = {
      kills: 0,
      folders: 10,
      bosses: 0,
      disks: 0,
      difficulty: 'eco' as const,
      cleared: false,
    };
    const five = fragmentsFor({ ...base, noHitFolders: 5 });
    const nine = fragmentsFor({ ...base, noHitFolders: 9 });
    expect(nine.mult).toBeCloseTo(five.mult, 10);
    expect(five.fragments).toBe(100);
  });
});
