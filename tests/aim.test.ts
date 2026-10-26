import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { computeKeycapBonus } from '../src/data/keycaps';
import { Run } from '../src/game/run';
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

describe('pointer aim', () => {
  it('tracks a fixed pointer while the player moves', () => {
    const run = makeRun();
    const dt = 1 / 60;
    for (let i = 0; i < 240 && run.phase !== 'wave'; i++) run.step(dt);
    expect(run.phase).toBe('wave');

    const view = (): ReturnType<Run['getView']> =>
      run.getView(
        { left: idleStick, right: idleStick },
        { showHitbox: false, screenShake: false, reducedMotion: false },
      );

    const pointerX = 740;
    const pointerY = 540;
    const player = run.world.player();
    const idx = run.world.indexOf(player);
    const aimAtPointer = (): { x: number; y: number } => {
      const dx = pointerX - run.world.c.x[idx]!;
      const dy = pointerY - run.world.c.y[idx]!;
      const d = Math.hypot(dx, dy);
      return { x: dx / d, y: dy / d };
    };

    const initial = aimAtPointer();
    run.setIntent({
      ...idleIntent,
      pointerX,
      pointerY,
      hasPointer: true,
      aimActive: true,
      aimX: initial.x,
      aimY: initial.y,
      moveX: -1,
    });
    run.step(dt);

    for (let i = 0; i < 45; i++) {
      const aim = aimAtPointer();
      run.setIntent({
        ...idleIntent,
        pointerX,
        pointerY,
        hasPointer: true,
        aimActive: false,
        aimX: aim.x,
        aimY: aim.y,
        moveX: -1,
      });
      run.step(dt);
    }

    expect(view().aimX).toBeGreaterThan(0.8);
    expect(view().aimY).toBeLessThan(0.65);
  });
});
