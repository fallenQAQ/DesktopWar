export type Entity = number;

export const MAX_ENTITIES = 1024;
export const LIMITS = {
  enemies: 32,
  playerBullets: 160,
  enemyBullets: 320,
  pickups: 32,
  fx: 256,
} as const;

export const Kind = {
  None: 0,
  Player: 1,
  Enemy: 2,
  PlayerBullet: 3,
  EnemyBullet: 4,
  Pickup: 5,
  Fx: 6,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export const Flags = {
  Alive: 1,
  Flash: 2,
  BossPhase2: 4,
  Invulnerable: 8,
  WindingUp: 16,
  Homing: 32,
  Warn: 64,
} as const;

export interface Components {
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  r: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  life: Float32Array;
  damage: Float32Array;
  fireCd: Float32Array;
  invuln: Float32Array;
  hitCd: Float32Array;
  aiTimer: Float32Array;
  atkTimer: Float32Array;
  spawnTimer: Float32Array;
  warnAge: Float32Array;
  baseX: Float32Array;
  baseY: Float32Array;
  orbit: Float32Array;
  scale: Float32Array;
  flash: Float32Array;
  speed: Float32Array;
  atkInterval: Float32Array;
  kind: Uint8Array;
  tier: Uint8Array;
  proto: Uint8Array;
  styleIdx: Uint8Array;
  glyphGroup: Uint8Array;
  glyphIdx: Uint8Array;
  pierce: Uint8Array;
  hits: Uint8Array;
  summonCount: Uint8Array;
  summonTotal: Uint8Array;
  splitDepth: Uint8Array;
  flags: Uint8Array;
  pickupType: Uint8Array;
  fxType: Uint8Array;
  owner: Int16Array;
  lastHit: Int32Array;
}

function floats(): Float32Array {
  return new Float32Array(MAX_ENTITIES);
}
function bytes(): Uint8Array {
  return new Uint8Array(MAX_ENTITIES);
}

function removeSwap(list: Entity[], e: Entity): void {
  const pos = list.indexOf(e);
  if (pos < 0) return;
  const last = list[list.length - 1]!;
  list[pos] = last;
  list.pop();
}

export class World {
  readonly c: Components = {
    x: floats(), y: floats(), px: floats(), py: floats(), vx: floats(), vy: floats(),
    r: floats(), hp: floats(), maxHp: floats(), life: floats(), damage: floats(),
    fireCd: floats(), invuln: floats(), hitCd: floats(), aiTimer: floats(),
    atkTimer: floats(), spawnTimer: floats(), warnAge: floats(), baseX: floats(), baseY: floats(),
    orbit: floats(), scale: floats(), flash: floats(), speed: floats(), atkInterval: floats(),
    kind: bytes(), tier: bytes(), proto: bytes(), styleIdx: bytes(),
    glyphGroup: bytes(), glyphIdx: bytes(), pierce: bytes(), hits: bytes(),
    summonCount: bytes(), summonTotal: bytes(), splitDepth: bytes(), flags: bytes(),
    pickupType: bytes(), fxType: bytes(), owner: new Int16Array(MAX_ENTITIES),
    lastHit: new Int32Array(MAX_ENTITIES),
  };

  readonly enemies: Entity[] = [];
  readonly playerBullets: Entity[] = [];
  readonly enemyBullets: Entity[] = [];
  readonly pickups: Entity[] = [];
  readonly fx: Entity[] = [];

  private readonly gen = new Uint32Array(MAX_ENTITIES);
  private readonly alive = new Uint8Array(MAX_ENTITIES);
  private readonly free: number[] = [];
  private readonly kindLists: Entity[][] = [[], [], [], [], [], [], []];

  private readonly playerEntity: Entity;

  constructor() {
    for (let i = MAX_ENTITIES - 1; i >= 0; i--) {
      this.gen[i] = 1;
      this.free.push(i);
    }
    this.playerEntity = this.spawn(Kind.Player);
    const p = this.indexOf(this.playerEntity);
    this.c.x[p] = 640;
    this.c.y[p] = 360;
    this.c.px[p] = 640;
    this.c.py[p] = 360;
    this.c.r[p] = 3;
    this.c.scale[p] = 1;
  }

  player(): Entity {
    return this.playerEntity;
  }

  indexOf(e: Entity): number {
    return (e - 1) % MAX_ENTITIES;
  }

  generationOf(e: Entity): number {
    return Math.floor((e - 1) / MAX_ENTITIES);
  }

  isAlive(e: Entity): boolean {
    if (e === 0) return false;
    const i = this.indexOf(e);
    return this.alive[i] === 1 && this.gen[i] === this.generationOf(e);
  }

  spawn(kind: Kind): Entity {
    const index = this.free.pop();
    if (index === undefined) return 0;
    const c = this.c;
    c.x[index] = 0; c.y[index] = 0; c.px[index] = 0; c.py[index] = 0;
    c.vx[index] = 0; c.vy[index] = 0; c.r[index] = 0; c.hp[index] = 0;
    c.maxHp[index] = 0; c.life[index] = 0; c.damage[index] = 0;
    c.fireCd[index] = 0; c.invuln[index] = 0; c.hitCd[index] = 0;
    c.aiTimer[index] = 0; c.atkTimer[index] = 0; c.spawnTimer[index] = 0; c.warnAge[index] = 0;
    c.baseX[index] = 0; c.baseY[index] = 0; c.orbit[index] = 0;
    c.scale[index] = 1; c.flash[index] = 0; c.speed[index] = 0; c.atkInterval[index] = 0;
    c.kind[index] = kind; c.tier[index] = 0; c.proto[index] = 0;
    c.styleIdx[index] = 0; c.glyphGroup[index] = 0; c.glyphIdx[index] = 0;
    c.pierce[index] = 0; c.hits[index] = 0; c.summonCount[index] = 0;
    c.summonTotal[index] = 0; c.splitDepth[index] = 0; c.flags[index] = Flags.Alive;
    c.pickupType[index] = 0; c.fxType[index] = 0; c.owner[index] = 0; c.lastHit[index] = 0;
    this.alive[index] = 1;
    const e = this.gen[index]! * MAX_ENTITIES + index + 1;
    this.kindLists[kind]!.push(e);
    if (kind === Kind.Enemy) this.enemies.push(e);
    else if (kind === Kind.PlayerBullet) this.playerBullets.push(e);
    else if (kind === Kind.EnemyBullet) this.enemyBullets.push(e);
    else if (kind === Kind.Pickup) this.pickups.push(e);
    else if (kind === Kind.Fx) this.fx.push(e);
    return e;
  }

  despawn(e: Entity): void {
    if (!this.isAlive(e)) return;
    const index = this.indexOf(e);
    const kind = this.c.kind[index]! as Kind;
    this.alive[index] = 0;
    this.flagsOff(index, Flags.Alive);
    this.gen[index] = this.gen[index]! + 1;
    this.free.push(index);
    this.removeFromList(kind, e);
    const dense = kind === Kind.Enemy ? this.enemies
      : kind === Kind.PlayerBullet ? this.playerBullets
        : kind === Kind.EnemyBullet ? this.enemyBullets
          : kind === Kind.Pickup ? this.pickups
            : kind === Kind.Fx ? this.fx
              : null;
    if (dense) removeSwap(dense, e);
  }

  private removeFromList(kind: Kind, e: Entity): void {
    removeSwap(this.kindLists[kind]!, e);
  }

  clear(kind: Kind): void {
    const list = kind === Kind.Enemy ? this.enemies
      : kind === Kind.PlayerBullet ? this.playerBullets
        : kind === Kind.EnemyBullet ? this.enemyBullets
          : kind === Kind.Pickup ? this.pickups
            : kind === Kind.Fx ? this.fx
              : this.kindLists[kind]!;
    for (let i = list.length - 1; i >= 0; i--) this.despawn(list[i]!);
  }

  flagsOn(index: number, flag: number): void {
    this.c.flags[index] = this.c.flags[index]! | flag;
  }

  flagsOff(index: number, flag: number): void {
    this.c.flags[index] = this.c.flags[index]! & ~flag;
  }

  hasFlag(index: number, flag: number): boolean {
    return (this.c.flags[index]! & flag) !== 0;
  }

  aliveEnemyCount(): number {
    return this.enemies.length;
  }

  snapshotPrev(): void {
    const c = this.c;
    for (let i = 0; i < this.enemies.length; i++) {
      const idx = this.indexOf(this.enemies[i]!);
      c.px[idx] = c.x[idx]!;
      c.py[idx] = c.y[idx]!;
    }
    for (let i = 0; i < this.playerBullets.length; i++) {
      const idx = this.indexOf(this.playerBullets[i]!);
      c.px[idx] = c.x[idx]!;
      c.py[idx] = c.y[idx]!;
    }
    for (let i = 0; i < this.enemyBullets.length; i++) {
      const idx = this.indexOf(this.enemyBullets[i]!);
      c.px[idx] = c.x[idx]!;
      c.py[idx] = c.y[idx]!;
    }
    const p = this.indexOf(this.playerEntity);
    c.px[p] = c.x[p]!;
    c.py[p] = c.y[p]!;
  }
}
