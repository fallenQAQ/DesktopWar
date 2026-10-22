export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = items[i]!;
      items[i] = items[j]!;
      items[j] = a;
    }
    return items;
  }
}

function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type RngStream = 'style' | 'wave' | 'buff' | 'drop' | 'telegraph' | 'game';

export class RngSet {
  private readonly root: number;
  private readonly streams = new Map<string, Rng>();

  constructor(seed: number) {
    this.root = seed >>> 0;
  }

  fork(stream: RngStream | string): Rng {
    const existing = this.streams.get(stream);
    if (existing) return existing;
    const rng = new Rng((this.root ^ hashString(stream)) >>> 0);
    this.streams.set(stream, rng);
    return rng;
  }
}

export function randomSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'getRandomValues' in cryptoApi) {
    return cryptoApi.getRandomValues(new Uint32Array(1))[0]! >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
