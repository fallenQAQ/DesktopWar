import { describe, expect, it } from 'vitest';
import {
  KEYCAPS,
  KEYCAP_CAP,
  KEYCAP_RARITY_COUNT,
  KEYCAP_SETS,
  computeKeycapBonus,
} from '../src/data/keycaps';
import { BUFFS } from '../src/data/buffs';

describe('87-key keycap table (docs/20 §3)', () => {
  it('contains exactly 87 unique keys with the 60/24/3 split', () => {
    expect(KEYCAPS).toHaveLength(87);
    expect(new Set(KEYCAPS.map((k) => k.id)).size).toBe(87);
    expect(KEYCAP_RARITY_COUNT).toEqual({ common: 60, rare: 24, legendary: 3 });
  });

  it('keeps the fixed legendary keys', () => {
    const legendary = KEYCAPS.filter((k) => k.rarity === 'legendary').map((k) => k.id);
    expect(new Set(legendary)).toEqual(new Set(['key.escape', 'key.enter', 'key.space']));
  });

  it('applies the soft caps and set bonuses to a full keyboard', () => {
    const owned = Object.fromEntries(KEYCAPS.map((k) => [k.id, 1 as const]));
    const bonus = computeKeycapBonus(owned);
    expect(bonus.owned).toBe(87);
    expect(bonus.atkPct).toBeCloseTo(13.26, 2);
    expect(bonus.asPct).toBeCloseTo(2.37, 2);
    expect(bonus.movPct).toBeCloseTo(8.81, 2);
    expect(bonus.invulnBonus).toBe(0.1);
    expect(bonus.reroll).toBe(true);
    expect(bonus.fourCards).toBe(true);
    expect(bonus.sets).toHaveLength(KEYCAP_SETS.length);
    expect(KEYCAP_CAP).toEqual({ atk: 18, as: 12, mov: 10 });
  });

  it('completes no sets with an empty collection', () => {
    const bonus = computeKeycapBonus({});
    expect(bonus.owned).toBe(0);
    expect(bonus.atkPct).toBe(0);
    expect(bonus.asPct).toBe(0);
    expect(bonus.movPct).toBe(0);
    expect(bonus.sets).toHaveLength(0);
  });
});

describe('buff pool (docs/20 §2)', () => {
  it('contains 30 buffs split 12/10/8', () => {
    expect(BUFFS).toHaveLength(30);
    expect(BUFFS.filter((b) => b.rarity === 'common')).toHaveLength(12);
    expect(BUFFS.filter((b) => b.rarity === 'rare')).toHaveLength(10);
    expect(BUFFS.filter((b) => b.rarity === 'legendary')).toHaveLength(8);
  });

  it('uses the documented stack caps, including common exceptions', () => {
    const exceptions = new Set([
      'buff.instruction_prefetch',
      'buff.checksum',
      'buff.incremental_backup',
    ]);
    for (const buff of BUFFS) {
      const expected = exceptions.has(buff.id)
        ? 2
        : buff.rarity === 'common'
          ? 3
          : buff.rarity === 'rare'
            ? 2
            : 1;
      expect(buff.maxStacks).toBe(expected);
    }
  });
});
