import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { computeKeycapBonus } from '../src/data/keycaps';
import { Flags } from '../src/ecs/world';
import { PHASE_SECONDS, Run } from '../src/game/run';
import type { Intent, StickState } from '../src/input/input';

const idleIntent: Intent = {
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: -1,
  aimActive: false,
  aimMode: 'pointer',
  pointerX: 640,
  pointerY: 360,
  hasPointer: false,
  primary: false,
  touch: false,
};

const idleStick: StickState = {
  active: false,
  originX: 0,
  originY: 0,
  x: 0,
  y: 0,
  pointerId: -1,
};

function makeRun(): Run {
  return new Run(
    {
      difficulty: 'eco',
      seed: 1,
      keycapBonus: computeKeycapBonus({}),
      autoLock: false,
    },
    {
      events: new EventBus(),
      grantKeycap: () => null,
      addFragments: () => {},
    },
  );
}

describe('wave pacing', () => {
  it('keeps combat running during wave_clear and advances after 1.5s', () => {
    expect(PHASE_SECONDS.waveClear).toBe(1.5);
    const run = makeRun();
    const dt = 1 / 60;

    for (let i = 0; i < 240 && run.phase !== 'wave'; i++) run.step(dt);
    expect(run.phase).toBe('wave');

    for (let i = 0; i < 1200 && run.phase === 'wave'; i++) {
      for (const enemy of [...run.world.enemies]) run.world.despawn(enemy);
      run.step(dt);
    }
    expect(run.phase).toBe('wave_clear');
    const view = (): ReturnType<Run['getView']> =>
      run.getView(
        { left: idleStick, right: idleStick },
        { showHitbox: false, screenShake: false, reducedMotion: false },
      );
    expect(view().warnings.length).toBeGreaterThan(0);

    const player = run.world.player();
    const idx = run.world.indexOf(player);
    const x0 = run.world.c.x[idx]!;
    run.setIntent({ ...idleIntent, moveX: 1 });
    for (let i = 0; i < 60; i++) run.step(dt);
    expect(run.phase).toBe('wave_clear');
    expect(run.world.c.x[idx]!).toBeGreaterThan(x0);
    expect(view().warnings.length).toBeGreaterThan(0);

    for (let i = 0; i < 70 && run.phase === 'wave_clear'; i++) run.step(dt);
    expect(run.phase).toBe('wave');
    const queued = view().warnings.length;
    expect(queued).toBeGreaterThan(0);

    for (let i = 0; i < 2; i++) run.step(dt);
    expect(view().warnings.length).toBeLessThan(queued);
    const spawned = run.world.enemies[0];
    expect(spawned).toBeDefined();
    if (spawned) {
      const spawnedIdx = run.world.indexOf(spawned);
      expect((run.world.c.flags[spawnedIdx]! & Flags.Warn) !== 0).toBe(true);
    }
  });
});
