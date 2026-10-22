import { describe, expect, it } from 'vitest';
import { Rng, RngSet } from '../src/core/rng';

describe('seeded RNG (docs/00 §7.9)', () => {
  it('replays identical sequences for the same seed', () => {
    const a = new Rng(0x8f3a2c1d);
    const b = new Rng(0x8f3a2c1d);
    const left = Array.from({ length: 100 }, () => a.next());
    const right = Array.from({ length: 100 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('separates named streams deterministically', () => {
    const first = new RngSet(42);
    const second = new RngSet(42);
    expect(first.fork('wave').next()).toBe(second.fork('wave').next());
    expect(first.fork('style').next()).toBe(second.fork('style').next());
    const wave = new RngSet(42).fork('wave');
    const style = new RngSet(42).fork('style');
    expect(wave.next()).not.toBe(style.next());
  });

  it('shuffles without losing items', () => {
    const rng = new Rng(7);
    const source = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = rng.shuffle([...source]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });
});
