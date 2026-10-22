import { describe, expect, it } from 'vitest';
import { LOGICAL_H, LOGICAL_W, dist2 } from '../src/core/math';
import { Rng } from '../src/core/rng';
import { spawnPoint } from '../src/game/spawner';

const SAFE_DIST2 = 180 * 180;

describe('enemy spawn points', () => {
  it('keeps stationary enemies inside the viewport', () => {
    const rng = new Rng(0x51a7);
    const players = [
      { x: LOGICAL_W / 2, y: LOGICAL_H / 2 },
      { x: 16, y: 16 },
      { x: LOGICAL_W - 16, y: 16 },
      { x: 16, y: LOGICAL_H - 48 },
      { x: LOGICAL_W - 16, y: LOGICAL_H - 48 },
    ];
    for (const player of players) {
      for (let i = 0; i < 100; i++) {
        const point = spawnPoint(rng, player.x, player.y, true);
        expect(point.x).toBeGreaterThanOrEqual(96);
        expect(point.x).toBeLessThanOrEqual(LOGICAL_W - 96);
        expect(point.y).toBeGreaterThanOrEqual(84);
        expect(point.y).toBeLessThanOrEqual(LOGICAL_H - 96);
        expect(dist2(point.x, point.y, player.x, player.y)).toBeGreaterThanOrEqual(SAFE_DIST2);
      }
    }
  });

  it('spawns chasers on the offscreen ring, away from the player', () => {
    const rng = new Rng(0xc0ffee);
    const players = [
      { x: LOGICAL_W / 2, y: LOGICAL_H / 2 },
      { x: 16, y: 16 },
      { x: LOGICAL_W - 16, y: LOGICAL_H - 48 },
    ];
    for (const player of players) {
      for (let i = 0; i < 100; i++) {
        const point = spawnPoint(rng, player.x, player.y);
        const outside =
          point.x < 0 || point.x > LOGICAL_W || point.y < 0 || point.y > LOGICAL_H;
        expect(outside).toBe(true);
        expect(dist2(point.x, point.y, player.x, player.y)).toBeGreaterThanOrEqual(SAFE_DIST2);
      }
    }
  });
});
