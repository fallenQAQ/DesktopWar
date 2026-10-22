import {
  DISKS,
  ENEMY_BASE,
  M,
  PLAYER,
  enemyAtkSpd,
  enemyDamage,
  enemyHp,
  enemySpeed,
  type DifficultyId,
} from '../data/formulas';
import {
  ENEMY_BY_ID,
  PATTERN,
  PROTO_ORDER,
  type PatternId,
  type ProtoId,
} from '../data/enemies';
import {
  OPTIONAL_STYLES,
  STYLES,
  type BossId,
  type StyleDef,
} from '../data/styles';
import {
  BUFF_BY_ID,
  type BuffId,
  type Rarity,
} from '../data/buffs';
import type { KeycapBonus } from '../data/keycaps';
import { EventBus } from '../core/events';
import { Flags, Kind, LIMITS, World, type Entity } from '../ecs/world';
import { Rng, RngSet } from '../core/rng';
import {
  LOGICAL_H,
  LOGICAL_W,
  approachAngle,
  clamp,
  normalize,
} from '../core/math';
import { BOSS_BEHAVIOR, type BossBehavior } from './boss';
import { planWave, spawnPoint } from './spawner';
import {
  addStack,
  buffCount,
  computeStats,
  legendaryCount,
  rollOffer,
  stacksOf,
  type BuffOffer,
  type BuffStacks,
  type PlayerStats,
} from './buffs';
import type {
  BuffInstance,
  KeycapDrop,
  RunOptions,
  RunResult,
} from './types';
import type { BossView, RenderView } from '../render/renderer';
import type { Intent, StickState } from '../input/input';

export type RunPhase =
  | 'disk_intro'
  | 'folder_intro'
  | 'wave'
  | 'wave_clear'
  | 'folder_clear'
  | 'buff_pick'
  | 'boss_intro'
  | 'boss'
  | 'disk_clear'
  | 'bsod'
  | 'shutdown';

export interface RunCallbacks {
  events: EventBus;
  grantKeycap: (rarity: Rarity, rng: Rng) => KeycapDrop | null;
  addFragments: (amount: number) => void;
}

export interface ViewSettings {
  showHitbox: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
}

interface BossState {
  entity: Entity;
  bossId: BossId;
  name: string;
  maxHp: number;
  behavior: BossBehavior;
  phase: 1 | 2;
  orbit: number;
  windowCd: number;
  windowLeft: number;
  summonTimer: number;
  atkTimer: number;
  active: boolean;
  phase2Done: boolean;
}

interface WaveSpawn {
  proto: ProtoId;
  elite: boolean;
}

const C = Kind;

export class Run {
  readonly world = new World();
  readonly seed: number;
  readonly difficulty: DifficultyId;
  readonly diskCount: number;
  readonly keycapBonus: KeycapBonus;
  readonly events: EventBus;
  private readonly callbacks: RunCallbacks;
  private readonly rngSet: RngSet;
  private readonly rng: Rng;
  private readonly waveRng: Rng;
  private readonly buffRng: Rng;
  private readonly dropRng: Rng;
  private readonly styleRng: Rng;
  private autoLock: boolean;

  readonly styles: StyleDef[];
  readonly buffs: BuffStacks = {};
  stats: PlayerStats;

  phase: RunPhase = 'disk_intro';
  phaseElapsed = 0;
  disk = 1;
  folder = 1;
  wave: 1 | 2 | 3 = 1;
  ram: number;
  maxRam: number;
  pathText = '';
  runTime = 0;
  finished = false;
  playerAlpha = 1;
  boss: BossState | null = null;
  buffOffer: BuffOffer | null = null;
  rerollUsed = false;
  keycapsWon: KeycapDrop[] = [];

  readonly counters = {
    kills: 0,
    folders: 0,
    bosses: 0,
    disks: 0,
  };
  noHitFolders = 0;

  private intent: Intent = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: -1,
    aimActive: false,
    aimMode: 'pointer',
    pointerX: LOGICAL_W / 2,
    pointerY: LOGICAL_H / 2,
    hasPointer: false,
    primary: false,
    touch: false,
  };

  private aimX = 0;
  private aimY = -1;
  private aimIdle = 0;
  private autoLocked = false;
  private weaponCd = 0;
  private shotCount = 0;
  private hitsSinceCrit = 0;
  private critReady = false;
  private pipelineTarget = 0;
  private pipelineHits = 0;
  private instructionTimer = 0;
  private readonlyTimer = 0;
  private quicksortTimer = 0;
  private kernelCd = 0;
  private snapshotTimer = 0;
  private snapshotRam = 0;
  private reviveUsed = false;
  private gcCounter = 0;
  private raidTimer = 0;
  private folderNoHit = true;
  private waveQueue: WaveSpawn[] = [];
  private spawnTimer = 0;
  private waveWatchdog = 0;
  private bossSummonCount = 0;
  private readonly pauseReasons = new Set<string>();

  constructor(options: RunOptions, callbacks: RunCallbacks) {
    this.seed = options.seed;
    this.difficulty = options.difficulty;
    this.diskCount = DISKS[options.difficulty];
    this.keycapBonus = options.keycapBonus;
    this.autoLock = options.autoLock;
    this.events = callbacks.events;
    this.callbacks = callbacks;
    this.rngSet = new RngSet(options.seed);
    this.rng = this.rngSet.fork('game');
    this.waveRng = this.rngSet.fork('wave');
    this.buffRng = this.rngSet.fork('buff');
    this.dropRng = this.rngSet.fork('drop');
    this.styleRng = this.rngSet.fork('style');
    this.stats = computeStats(this.buffs, this.keycapBonus);
    this.maxRam = Math.max(1, PLAYER.ram + this.stats.maxRamDelta);
    this.ram = this.maxRam;
    const optional = this.styleRng.shuffle([...OPTIONAL_STYLES]);
    this.styles = [STYLES[0]!, ...optional.slice(0, this.diskCount - 1)];
    this.startDiskIntro();
  }

  get style(): StyleDef {
    return this.styles[this.disk - 1] ?? STYLES[0]!;
  }

  get styleIndex(): number {
    return STYLES.indexOf(this.style);
  }

  get paused(): boolean {
    return this.pauseReasons.size > 0;
  }

  get activeBuffCount(): number {
    return buffCount(this.buffs);
  }

  get legendaryBuffCount(): number {
    return legendaryCount(this.buffs);
  }

  get waveRemaining(): number {
    return this.waveQueue.length + this.world.enemies.length;
  }

  get canReroll(): boolean {
    return this.stats.reroll && !this.rerollUsed && this.buffOffer !== null;
  }

  get diskLetter(): string {
    return String.fromCharCode(65 + this.disk + 1);
  }

  setIntent(intent: Intent): void {
    this.intent = intent;
  }

  setAutoLock(value: boolean): void {
    this.autoLock = value;
  }

  skipCinematic(): void {
    if (this.phase === 'bsod' || this.phase === 'shutdown') this.finished = true;
  }

  addPause(reason: string): void {
    this.pauseReasons.add(reason);
  }

  removePause(reason: string): void {
    this.pauseReasons.delete(reason);
  }

  hasPause(reason: string): boolean {
    return this.pauseReasons.has(reason);
  }

  clearPauses(): void {
    this.pauseReasons.clear();
  }

  private setPhase(phase: RunPhase): void {
    this.phase = phase;
    this.phaseElapsed = 0;
  }

  private startDiskIntro(): void {
    this.setPhase('disk_intro');
    this.world.clear(C.Enemy);
    this.world.clear(C.EnemyBullet);
    this.world.clear(C.PlayerBullet);
    this.world.clear(C.Fx);
    this.folder = 1;
    this.wave = 1;
    this.boss = null;
    this.buffOffer = null;
    this.ram = this.maxRam;
    this.playerAlpha = 1;
    this.folderNoHit = true;
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    this.world.c.x[pi] = 640;
    this.world.c.y[pi] = 430;
    this.world.c.px[pi] = 640;
    this.world.c.py[pi] = 430;
    this.world.c.invuln[pi] = 0;
    this.aimX = 0;
    this.aimY = -1;
    this.aimIdle = 0;
    this.autoLocked = false;
    this.weaponCd = 0;
    this.events.emit({ type: 'ramUp', ram: this.ram });
  }

  private startFolderIntro(): void {
    this.setPhase('folder_intro');
    this.folderNoHit = true;
    this.pathText = this.makePath();
    this.applyFolderStart();
  }

  private applyFolderStart(): void {
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    this.instructionTimer = stacksOf(this.buffs, 'buff.instruction_prefetch') > 0 ? 4 : 0;
    const backup = stacksOf(this.buffs, 'buff.incremental_backup');
    if (backup > 0 && this.ram <= 2) {
      const healed = Math.min(this.maxRam, this.ram + backup);
      if (healed !== this.ram) {
        this.ram = healed;
        this.world.c.invuln[pi] = Math.max(this.world.c.invuln[pi]!, 0.25);
        this.events.emit({ type: 'ramUp', ram: this.ram });
      }
    }
    if (stacksOf(this.buffs, 'buff.trim') > 0) this.world.clear(C.EnemyBullet);
    if (stacksOf(this.buffs, 'buff.full_format') > 0) {
      this.world.clear(C.EnemyBullet);
      const targets = [...this.world.enemies];
      for (const enemy of targets) {
        const idx = this.world.indexOf(enemy);
        this.damageEnemy(enemy, this.world.c.maxHp[idx]! * 0.1, true);
      }
      this.events.emit({ type: 'trim', x: 640, y: 360 });
    }
  }

  private makePath(): string {
    const style = this.style;
    const pool = style.paths[(this.disk + this.folder) % style.paths.length]!;
    const root = pool.roots[(this.folder + this.disk) % pool.roots.length]!;
    const dir = pool.dirs[(this.folder + 1) % pool.dirs.length]!;
    const tail = pool.tails[(this.folder + this.disk) % pool.tails.length]!;
    return `${root}\\${dir}\\${tail}`;
  }

  private startWave(wave: 1 | 2 | 3): void {
    this.wave = wave;
    this.setPhase('wave');
    const plan = planWave(this.disk, this.difficulty, wave, this.folder, this.waveRng);
    this.waveQueue = plan.protos.map((proto) => ({ proto, elite: false }));
    if (plan.elite) this.waveQueue.push({ proto: plan.elite, elite: true });
    this.spawnTimer = 0;
    this.waveWatchdog = 0;
    if (wave === 3 && stacksOf(this.buffs, 'buff.trim') >= 2) {
      this.world.clear(C.EnemyBullet);
    }
  }

  private spawnNext(): void {
    const next = this.waveQueue.shift();
    if (!next) return;
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    const interior =
      next.proto === 'notifier' || next.proto === 'adware' || next.proto === 'updater';
    const point = spawnPoint(
      this.rng,
      this.world.c.x[pi]!,
      this.world.c.y[pi]!,
      interior,
    );
    this.spawnEnemy(next.proto, next.elite, point.x, point.y);
  }

  private spawnEnemy(
    proto: ProtoId,
    elite: boolean,
    x: number,
    y: number,
    options?: {
      hpMul?: number;
      hpOverride?: number;
      speedMul?: number;
      splitDepth?: number;
      scale?: number;
      styleIndex?: number;
    },
  ): Entity {
    if (this.world.enemies.length >= LIMITS.enemies) return 0;
    const def = ENEMY_BY_ID[proto];
    const m = M(this.disk, this.difficulty);
    const tier = elite ? 1 : 0;
    const baseHp = elite ? ENEMY_BASE.eliteHp : ENEMY_BASE.normalHp * def.hpScale;
    const hp = Math.max(
      1,
      options?.hpOverride ?? enemyHp(baseHp, m) * (options?.hpMul ?? 1),
    );
    const baseSpeed = elite ? ENEMY_BASE.eliteSpeed : def.baseSpeed;
    const speed = enemySpeed(this.disk) * (baseSpeed / 60) * (options?.speedMul ?? 1);
    const atkInterval = (elite ? ENEMY_BASE.eliteRate : ENEMY_BASE.normalRate) / enemyAtkSpd(this.disk);
    const e = this.world.spawn(C.Enemy);
    if (!e) return 0;
    const idx = this.world.indexOf(e);
    const c = this.world.c;
    c.x[idx] = x;
    c.y[idx] = y;
    c.px[idx] = x;
    c.py[idx] = y;
    c.r[idx] = (elite ? 26 : 22) * (options?.scale ?? 1);
    c.hp[idx] = hp;
    c.maxHp[idx] = hp;
    c.damage[idx] = elite ? ENEMY_BASE.contactElite : ENEMY_BASE.contactNormal;
    c.tier[idx] = tier;
    c.proto[idx] = PROTO_ORDER.indexOf(proto);
    c.styleIdx[idx] = options?.styleIndex ?? this.styleIndex;
    c.spawnTimer[idx] = elite ? 0.8 : 0.4;
    c.atkTimer[idx] = proto === 'updater' ? 8 : atkInterval + 0.2;
    c.speed[idx] = speed;
    c.atkInterval[idx] = atkInterval;
    c.baseX[idx] = x;
    c.baseY[idx] = y;
    c.orbit[idx] = this.rng.range(0, Math.PI * 2);
    c.splitDepth[idx] = options?.splitDepth ?? 0;
    c.scale[idx] = options?.scale ?? 1;
    return e;
  }

  private update(dt: number): void {
    if (this.finished) return;
    if (this.paused) return;
    if (this.phase === 'buff_pick') return;

    this.phaseElapsed += dt;
    if (this.phase === 'bsod') {
      if (this.phaseElapsed >= 2.5) this.finished = true;
      return;
    }
    if (this.phase === 'shutdown') {
      if (this.phaseElapsed >= 2.0) this.finished = true;
      return;
    }

    this.runTime += dt;
    this.world.snapshotPrev();
    this.updateTimers(dt);

    switch (this.phase) {
      case 'disk_intro':
        if (this.phaseElapsed >= 4.0) this.startFolderIntro();
        break;
      case 'folder_intro':
        if (this.phaseElapsed >= 1.4) this.startWave(1);
        break;
      case 'wave':
        this.updateCombat(dt);
        this.updateWave(dt);
        break;
      case 'wave_clear':
        if (this.phaseElapsed >= 1.2) {
          if (this.wave < 3) this.startWave((this.wave + 1) as 2 | 3);
          else this.completeFolder();
        }
        break;
      case 'folder_clear':
        if (this.phaseElapsed >= 1.6) this.openBuff('folder');
        break;
      case 'boss_intro':
        if (this.phaseElapsed >= 2.0) {
          this.setPhase('boss');
          if (this.boss) {
            this.boss.active = true;
            this.boss.atkTimer = 1.0;
          }
        }
        break;
      case 'boss':
        this.updateCombat(dt);
        this.updateBoss(dt);
        break;
      case 'disk_clear':
        if (this.phaseElapsed >= 4.0) {
          this.disk += 1;
          this.startDiskIntro();
        }
        break;
      default:
        break;
    }
  }

  step(dt: number): void {
    this.update(dt);
  }

  private updateTimers(dt: number): void {
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    this.world.c.invuln[pi] = Math.max(0, this.world.c.invuln[pi]! - dt);
    if (this.instructionTimer > 0) this.instructionTimer -= dt;
    if (this.readonlyTimer > 0) this.readonlyTimer -= dt;
    if (this.quicksortTimer > 0) this.quicksortTimer -= dt;
    if (this.kernelCd > 0) this.kernelCd -= dt;
    const snapshotStacks = stacksOf(this.buffs, 'buff.snapshot');
    if (snapshotStacks > 0) {
      this.snapshotTimer += dt;
      if (this.snapshotTimer >= 60) {
        this.snapshotTimer = 0;
        this.snapshotRam = this.ram;
      }
    }
    for (let i = 0; i < this.world.enemies.length; i++) {
      const idx = this.world.indexOf(this.world.enemies[i]!);
      this.world.c.flash[idx] = Math.max(0, this.world.c.flash[idx]! - dt);
      this.world.c.hitCd[idx] = Math.max(0, this.world.c.hitCd[idx]! - dt);
      this.world.c.invuln[idx] = Math.max(0, this.world.c.invuln[idx]! - dt);
    }
  }

  private updateCombat(dt: number): void {
    this.updatePlayer(dt);
    this.updateAim(dt);
    this.updateWeapon(dt);
    this.updateRaidTurrets(dt);
    this.updatePlayerBullets(dt);
    this.updateEnemies(dt);
    this.updateEnemyBullets(dt);
    this.updateCollisions();
    this.updateFx(dt);
  }

  private updatePlayer(dt: number): void {
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    let tempMove = 0;
    if (this.readonlyTimer > 0) {
      tempMove += 20 * stacksOf(this.buffs, 'buff.readonly_cache');
    }
    const speed = PLAYER.moveSpeed * (1 + (this.stats.movePct + tempMove) / 100);
    const x = this.world.c.x[pi]! + this.intent.moveX * speed * dt;
    const y = this.world.c.y[pi]! + this.intent.moveY * speed * dt;
    this.world.c.vx[pi] = this.intent.moveX * speed;
    this.world.c.vy[pi] = this.intent.moveY * speed;
    this.world.c.x[pi] = clamp(x, 16, LOGICAL_W - 16);
    this.world.c.y[pi] = clamp(y, 16, LOGICAL_H - 48);
  }

  private updateAim(dt: number): void {
    if (this.intent.aimActive) {
      this.aimIdle = 0;
      this.autoLocked = false;
      const n = normalize(this.intent.aimX, this.intent.aimY);
      if (n.x !== 0 || n.y !== 0) {
        this.aimX = n.x;
        this.aimY = n.y;
      }
      return;
    }
    this.aimIdle += dt;
    if (!this.autoLock || this.aimIdle < 0.4) {
      this.autoLocked = false;
      return;
    }
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    const px = this.world.c.x[pi]!;
    const py = this.world.c.y[pi]!;
    let best = 0;
    let bestDist = 480 * 480;
    for (const enemy of this.world.enemies) {
      if (!this.world.isAlive(enemy)) continue;
      const idx = this.world.indexOf(enemy);
      const ex = this.world.c.x[idx]!;
      const ey = this.world.c.y[idx]!;
      if (ex < 0 || ex > LOGICAL_W || ey < 0 || ey > LOGICAL_H) continue;
      const dx = ex - px;
      const dy = ey - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = enemy;
      }
    }
    if (best) {
      const idx = this.world.indexOf(best);
      const target = Math.atan2(this.world.c.y[idx]! - py, this.world.c.x[idx]! - px);
      const current = Math.atan2(this.aimY, this.aimX);
      const next = approachAngle(current, target, (Math.PI / 180) * 360 * dt);
      this.aimX = Math.cos(next);
      this.aimY = Math.sin(next);
      this.autoLocked = true;
    } else {
      this.autoLocked = false;
    }
  }

  private updateWeapon(dt: number): void {
    this.weaponCd -= dt;
    if (this.weaponCd > 0) return;
    let tempRate = 0;
    if (this.instructionTimer > 0) {
      tempRate += 30 * stacksOf(this.buffs, 'buff.instruction_prefetch');
    }
    if (this.quicksortTimer > 0) {
      tempRate += 12 * stacksOf(this.buffs, 'buff.quicksort');
    }
    const interval = Math.max(0.12, PLAYER.fireInterval / (1 + (this.stats.fireRatePct + tempRate) / 100));
    this.weaponCd = interval;
    this.shotCount += 1;
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    const px = this.world.c.x[pi]!;
    const py = this.world.c.y[pi]!;
    const ox = px + this.aimX * 6;
    const oy = py + this.aimY * 6;

    let damage = PLAYER.damage * (1 + this.stats.attackPct / 100);
    damage *= 1 + 0.03 * stacksOf(this.buffs, 'buff.buffer');
    damage *= 1 - 0.1 * stacksOf(this.buffs, 'buff.multithreading');
    if (stacksOf(this.buffs, 'buff.hyper_threading') > 0) damage *= 0.85;
    const dbStacks = stacksOf(this.buffs, 'buff.double_buffer');
    if (dbStacks > 0 && this.shotCount % 4 === 0) {
      damage *= 1 + 0.5 + 0.25 * (dbStacks - 1);
    }
    let crit = false;
    if (this.critReady) {
      damage *= 2;
      crit = true;
      this.critReady = false;
    }

    const count = this.stats.bulletCount;
    const totalSpread = Math.min(24, 6 * count) * (Math.PI / 180);
    const baseAngle = Math.atan2(this.aimY, this.aimX);
    const radius = PLAYER.bulletRadius * this.stats.bulletRadiusMul;
    const groupRoll = this.rng.next();
    const group = groupRoll < 0.4 ? 0 : groupRoll < 0.7 ? 1 : groupRoll < 0.88 ? 2 : 3;
    const glyphIdx = this.rng.int(8);
    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : -totalSpread / 2 + (totalSpread * i) / (count - 1);
      this.spawnPlayerBullet(ox, oy, baseAngle + offset, damage, radius, group, glyphIdx);
    }
    this.events.emit({ type: 'fire', x: ox, y: oy, group, pitch: group });
    if (crit) this.events.emit({ type: 'hit', x: px, y: py, amount: 0, crit: true });
  }

  private spawnPlayerBullet(
    x: number,
    y: number,
    angle: number,
    damage: number,
    radius: number,
    group: number,
    glyphIdx: number,
  ): void {
    if (this.world.playerBullets.length >= LIMITS.playerBullets) {
      this.world.despawn(this.world.playerBullets[0]!);
    }
    const e = this.world.spawn(C.PlayerBullet);
    if (!e) return;
    const idx = this.world.indexOf(e);
    const c = this.world.c;
    c.x[idx] = x;
    c.y[idx] = y;
    c.px[idx] = x;
    c.py[idx] = y;
    c.vx[idx] = Math.cos(angle) * PLAYER.bulletSpeed;
    c.vy[idx] = Math.sin(angle) * PLAYER.bulletSpeed;
    c.r[idx] = radius;
    c.life[idx] = 2.4;
    c.damage[idx] = damage;
    c.pierce[idx] = this.stats.pierce;
    c.hits[idx] = 0;
    c.glyphGroup[idx] = group;
    c.glyphIdx[idx] = glyphIdx;
    c.lastHit[idx] = 0;
  }

  private updateRaidTurrets(dt: number): void {
    const stacks = stacksOf(this.buffs, 'buff.raid1');
    if (stacks <= 0) return;
    this.raidTimer += dt;
    if (this.raidTimer < 1.5) return;
    this.raidTimer = 0;
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    const px = this.world.c.x[pi]!;
    const py = this.world.c.y[pi]!;
    for (let s = 0; s < stacks; s++) {
      const a = this.runTime * 1.8 + (s * Math.PI * 2) / Math.max(1, stacks);
      const ox = px + Math.cos(a) * 34;
      const oy = py + Math.sin(a) * 34;
      let target: Entity = 0;
      let best = Infinity;
      for (const enemy of this.world.enemies) {
        const idx = this.world.indexOf(enemy);
        const dx = this.world.c.x[idx]! - ox;
        const dy = this.world.c.y[idx]! - oy;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          target = enemy;
        }
      }
      const angle = target
        ? Math.atan2(
            this.world.c.y[this.world.indexOf(target)]! - oy,
            this.world.c.x[this.world.indexOf(target)]! - ox,
          )
        : Math.atan2(this.aimY, this.aimX);
      this.spawnPlayerBullet(ox, oy, angle, 5, 3, 0, 0);
    }
  }

  private updatePlayerBullets(dt: number): void {
    const w = this.world;
    const c = w.c;
    for (let i = w.playerBullets.length - 1; i >= 0; i--) {
      const b = w.playerBullets[i]!;
      if (!w.isAlive(b)) continue;
      const idx = w.indexOf(b);
      c.life[idx] = c.life[idx]! - dt;
      c.x[idx] = c.x[idx]! + c.vx[idx]! * dt;
      c.y[idx] = c.y[idx]! + c.vy[idx]! * dt;
      if (
        c.life[idx]! <= 0 ||
        c.x[idx]! < -64 ||
        c.x[idx]! > LOGICAL_W + 64 ||
        c.y[idx]! < -64 ||
        c.y[idx]! > LOGICAL_H + 64
      ) {
        w.despawn(b);
      }
    }
  }

  private updateEnemies(dt: number): void {
    const w = this.world;
    const c = w.c;
    const count = w.enemies.length;
    for (let i = 0; i < count; i++) {
      const e = w.enemies[i]!;
      if (!w.isAlive(e)) continue;
      const idx = w.indexOf(e);
      if (c.tier[idx]! === 2) continue;
      const spawn = c.spawnTimer[idx]!;
      if (spawn > 0) {
        c.spawnTimer[idx] = Math.max(0, spawn - dt);
        continue;
      }
      const wx = c.x[idx]!;
      const wy = c.y[idx]!;
      const proto = PROTO_ORDER[c.proto[idx]!] ?? 'popup';
      const def = ENEMY_BY_ID[proto];
      const tier = c.tier[idx]!;
      const speed = c.speed[idx]!;
      const p = w.player();
      const pi = w.indexOf(p);
      const px = c.x[pi]!;
      const py = c.y[pi]!;

      if (proto === 'updater') {
        c.orbit[idx] = (c.orbit[idx]! + dt * 0.7) % (Math.PI * 2);
        c.x[idx] = c.baseX[idx]! + Math.cos(c.orbit[idx]!) * 86;
        c.y[idx] = c.baseY[idx]! + Math.sin(c.orbit[idx]!) * 52;
        c.atkTimer[idx] = c.atkTimer[idx]! - dt;
        if (c.atkTimer[idx]! <= 0) {
          c.atkTimer[idx] = 8;
          if (
            c.summonTotal[idx]! < 2 &&
            w.enemies.length < LIMITS.enemies &&
            stacksOf(this.buffs, 'buff.irq') === 0
          ) {
            this.spawnEnemy('popup', false, c.x[idx]! + 30, c.y[idx]!, {
              hpMul: 0.5,
              styleIndex: c.styleIdx[idx]!,
            });
            c.summonTotal[idx] = c.summonTotal[idx]! + 1;
          }
        }
      } else if (proto === 'popup' || proto === 'trojan' || proto === 'cache') {
        const angle = Math.atan2(py - wy, px - wx);
        c.vx[idx] = Math.cos(angle) * speed;
        c.vy[idx] = Math.sin(angle) * speed;
        c.x[idx] = wx + c.vx[idx]! * dt;
        c.y[idx] = wy + c.vy[idx]! * dt;
      }

      let pattern: PatternId | null = def.pattern;
      if (tier === 1) {
        pattern = proto === 'adware' ? 'pat.elite_fan5' : 'pat.elite_aimed2';
      }
      if (!pattern) continue;
      const atkInterval = c.atkInterval[idx]!;
      if ((c.flags[idx]! & Flags.WindingUp) !== 0) {
        c.aiTimer[idx] = c.aiTimer[idx]! - dt;
        if (c.aiTimer[idx]! <= 0) {
          w.flagsOff(idx, Flags.WindingUp);
          c.atkTimer[idx] = atkInterval;
          this.tryEnemyFire(e, pattern, idx, tier);
        }
      } else {
        c.atkTimer[idx] = c.atkTimer[idx]! - dt;
        if (c.atkTimer[idx]! <= 0) {
          w.flagsOn(idx, Flags.WindingUp);
          c.aiTimer[idx] = tier === 1 ? 0.8 : 0.35;
        }
      }
    }
  }

  private tryEnemyFire(
    e: Entity,
    pattern: PatternId,
    idx: number,
    tier: number,
  ): void {
    const irqStacks = stacksOf(this.buffs, 'buff.irq');
    if (irqStacks > 0) {
      const chance = irqStacks >= 2 ? 0.25 : 0.15;
      if (this.rng.next() < chance) return;
    }
    const w = this.world;
    const c = w.c;
    this.firePattern(e, pattern, tier, c.x[idx]!, c.y[idx]!, c.styleIdx[idx]!);
  }

  private firePattern(
    owner: Entity,
    pattern: PatternId,
    tier: number,
    x: number,
    y: number,
    styleIndex: number,
  ): void {
    const data = PATTERN[pattern];
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    const aim = Math.atan2(this.world.c.y[pi]! - y, this.world.c.x[pi]! - x);
    const damage = enemyDamage(
      tier === 2 ? 'boss' : tier === 1 ? 'elite' : 'normal',
      M(this.disk, this.difficulty),
    );
    const spawnAt = (ox: number, oy: number, angle: number): void => {
      this.spawnEnemyBullet(ox, oy, angle, data.speed, damage, owner, pattern === 'pat.homing_slow');
    };
    if (pattern === 'pat.ring8' || pattern === 'pat.ring16' || pattern === 'pat.spiral') {
      const count = pattern === 'pat.ring8' ? 8 : pattern === 'pat.ring16' ? 16 : 6;
      const base = pattern === 'pat.spiral'
        ? (this.world.c.orbit[this.world.indexOf(owner)] ?? 0) + this.runTime * 3
        : 0;
      for (let i = 0; i < count; i++) {
        const angle = base + (Math.PI * 2 * i) / count;
        spawnAt(x, y, angle);
      }
      return;
    }
    if (pattern === 'pat.wall_rows') {
      const gap = this.rng.int(9);
      for (let i = 0; i < 9; i++) {
        if (i === gap) continue;
        const bx = 90 + i * 130;
        spawnAt(bx, 40, Math.PI / 2);
      }
      return;
    }
    if (pattern === 'pat.laser_sweep') {
      // MVP telegraph: the boss winds up visibly, then releases a slow ring.
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        spawnAt(x, y, angle);
      }
      return;
    }
    const count = pattern === 'pat.homing_slow' ? 3 : data.count;
    const spread = (data.spread * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
      spawnAt(x, y, aim + offset);
    }
    void styleIndex;
  }

  private spawnEnemyBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    owner: Entity,
    homing: boolean,
  ): boolean {
    const w = this.world;
    if (w.enemyBullets.length >= 240) return false;
    const ownerIndex = w.indexOf(owner) + 1;
    const ownerTier = w.c.tier[w.indexOf(owner)]!;
    const cap = ownerTier === 2 ? 48 : 8;
    let owned = 0;
    for (const bullet of w.enemyBullets) {
      if (w.c.owner[w.indexOf(bullet)] === ownerIndex) owned += 1;
    }
    if (owned >= cap) return false;
    const e = w.spawn(C.EnemyBullet);
    if (!e) return false;
    const idx = w.indexOf(e);
    const c = w.c;
    c.x[idx] = x;
    c.y[idx] = y;
    c.px[idx] = x;
    c.py[idx] = y;
    c.vx[idx] = Math.cos(angle) * speed;
    c.vy[idx] = Math.sin(angle) * speed;
    c.r[idx] = 4;
    c.life[idx] = 6;
    c.damage[idx] = damage;
    c.owner[idx] = ownerIndex;
    c.styleIdx[idx] = w.c.styleIdx[w.indexOf(owner)]!;
    if (homing) this.world.flagsOn(idx, Flags.Homing);
    return true;
  }

  private updateEnemyBullets(dt: number): void {
    const w = this.world;
    const c = w.c;
    const p = w.player();
    const pi = w.indexOf(p);
    const px = c.x[pi]!;
    const py = c.y[pi]!;
    for (let i = w.enemyBullets.length - 1; i >= 0; i--) {
      const b = w.enemyBullets[i]!;
      if (!w.isAlive(b)) continue;
      const idx = w.indexOf(b);
      const speed = Math.hypot(c.vx[idx]!, c.vy[idx]!);
      if ((c.flags[idx]! & Flags.Homing) !== 0 && speed > 0) {
        const current = Math.atan2(c.vy[idx]!, c.vx[idx]!);
        const target = Math.atan2(py - c.y[idx]!, px - c.x[idx]!);
        const next = approachAngle(current, target, (Math.PI / 180) * 55 * dt);
        c.vx[idx] = Math.cos(next) * speed;
        c.vy[idx] = Math.sin(next) * speed;
      }
      c.x[idx] = c.x[idx]! + c.vx[idx]! * dt;
      c.y[idx] = c.y[idx]! + c.vy[idx]! * dt;
      c.life[idx] = c.life[idx]! - dt;
      if (
        c.life[idx]! <= 0 ||
        c.x[idx]! < -80 ||
        c.x[idx]! > LOGICAL_W + 80 ||
        c.y[idx]! < -80 ||
        c.y[idx]! > LOGICAL_H + 80
      ) {
        w.despawn(b);
      }
    }
  }

  private updateCollisions(): void {
    const w = this.world;
    const c = w.c;
    const p = w.player();
    const pi = w.indexOf(p);
    const px = c.x[pi]!;
    const py = c.y[pi]!;
    const invuln = c.invuln[pi]!;

    // Player bullets vs enemies.
    for (let bi = 0; bi < w.playerBullets.length; bi++) {
      const b = w.playerBullets[bi]!;
      if (!w.isAlive(b)) continue;
      const bidx = w.indexOf(b);
      const bx = c.x[bidx]!;
      const by = c.y[bidx]!;
      const br = c.r[bidx]!;
      let hit: Entity = 0;
      for (const enemy of w.enemies) {
        if (!w.isAlive(enemy)) continue;
        const idx = w.indexOf(enemy);
        if (c.spawnTimer[idx]! > 0) continue;
        if (c.lastHit[bidx] === enemy) continue;
        const rr = br + c.r[idx]!;
        const dx = bx - c.x[idx]!;
        const dy = by - c.y[idx]!;
        if (dx * dx + dy * dy <= rr * rr) {
          hit = enemy;
          break;
        }
      }
      if (!hit) continue;
      const hidx = w.indexOf(hit);
      let damage = c.damage[bidx]!;
      if (stacksOf(this.buffs, 'buff.copy_on_write') > 0 && c.hp[hidx]! >= c.maxHp[hidx]!) {
        damage *= 1 + 0.15 * stacksOf(this.buffs, 'buff.copy_on_write');
      }
      const pipelineStacks = stacksOf(this.buffs, 'buff.pipeline');
      if (pipelineStacks > 0) {
        if (this.pipelineTarget === hit) {
          this.pipelineHits = Math.min(5, this.pipelineHits + 1);
        } else {
          this.pipelineTarget = hit;
          this.pipelineHits = 1;
        }
        damage *= 1 + 0.06 * pipelineStacks * this.pipelineHits;
      }
      c.lastHit[bidx] = hit;
      this.hitsSinceCrit += 1;
      if (this.hitsSinceCrit >= 8) {
        this.hitsSinceCrit = 0;
        this.critReady = true;
      }
      this.damageEnemy(hit, damage, false);
      const pierce = c.pierce[bidx]!;
      if (pierce <= 0) {
        w.despawn(b);
      } else {
        c.pierce[bidx] = pierce - 1;
        const overflow = stacksOf(this.buffs, 'buff.buffer_overflow');
        if (overflow > 0) c.damage[bidx] = damage * 0.8 ** overflow;
        c.hits[bidx] = c.hits[bidx]! + 1;
      }
    }

    if (invuln > 0) return;

    // Enemy bullets + contact, highest single hit wins this step.
    let maxDamage = 0;
    for (let i = w.enemyBullets.length - 1; i >= 0; i--) {
      const b = w.enemyBullets[i]!;
      if (!w.isAlive(b)) continue;
      const idx = w.indexOf(b);
      const rr = c.r[idx]! + PLAYER.hitRadius;
      const dx = px - c.x[idx]!;
      const dy = py - c.y[idx]!;
      if (dx * dx + dy * dy <= rr * rr) {
        maxDamage = Math.max(maxDamage, c.damage[idx]!);
        w.despawn(b);
      }
    }
    for (const enemy of w.enemies) {
      if (!w.isAlive(enemy)) continue;
      const idx = w.indexOf(enemy);
      if (c.spawnTimer[idx]! > 0) continue;
      if (c.hitCd[idx]! > 0) continue;
      const rr = c.r[idx]! + PLAYER.hitRadius;
      const dx = px - c.x[idx]!;
      const dy = py - c.y[idx]!;
      if (dx * dx + dy * dy <= rr * rr) {
        maxDamage = Math.max(maxDamage, c.damage[idx]!);
        c.hitCd[idx] = 0.8;
      }
    }
    if (maxDamage > 0) this.damagePlayer(maxDamage);
  }

  private damagePlayer(rawDamage: number): void {
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    if (this.world.c.invuln[pi]! > 0) return;
    this.folderNoHit = false;
    const damage = Math.max(
      1,
      Math.round(rawDamage * (1 + this.stats.damageTakenPct / 100)),
    );
    this.ram = Math.max(0, this.ram - damage);
    this.world.c.invuln[pi] = Math.max(1.0, 1.0 + this.stats.invulnBonus);
    this.events.emit({ type: 'playerHurt', amount: damage, ram: this.ram });
    this.readonlyTimer = stacksOf(this.buffs, 'buff.readonly_cache') > 0 ? 2 : 0;
    if (
      stacksOf(this.buffs, 'buff.kernel_panic') > 0 &&
      this.kernelCd <= 0
    ) {
      this.kernelCd = 6;
      this.kernelPanic();
    }
    if (this.ram <= 0) this.handleDeath();
  }

  private kernelPanic(): void {
    const w = this.world;
    const p = w.player();
    const pi = w.indexOf(p);
    const px = w.c.x[pi]!;
    const py = w.c.y[pi]!;
    for (let i = w.enemyBullets.length - 1; i >= 0; i--) {
      const b = w.enemyBullets[i]!;
      const idx = w.indexOf(b);
      const dx = w.c.x[idx]! - px;
      const dy = w.c.y[idx]! - py;
      if (dx * dx + dy * dy <= 120 * 120) w.despawn(b);
    }
    const targets = [...w.enemies];
    for (const enemy of targets) {
      if (!w.isAlive(enemy)) continue;
      const idx = w.indexOf(enemy);
      const dx = w.c.x[idx]! - px;
      const dy = w.c.y[idx]! - py;
      if (dx * dx + dy * dy <= 160 * 160) {
        this.damageEnemy(enemy, w.c.maxHp[idx]! * 0.2, true);
      }
    }
    this.spawnFx(px, py, 4, 0, 0.5, '#34D399');
    this.events.emit({ type: 'trim', x: px, y: py });
  }

  private handleDeath(): void {
    if (this.boss) {
      const bidx = this.world.indexOf(this.boss.entity);
      if (this.boss.entity && this.world.isAlive(this.boss.entity) && this.world.c.hp[bidx]! <= 0) {
        this.ram = 1;
        return;
      }
    }
    if (!this.reviveUsed) {
      const snapshot = stacksOf(this.buffs, 'buff.snapshot');
      if (snapshot > 0) {
        this.reviveUsed = true;
        this.ram = Math.max(1, this.snapshotRam > 0 ? this.snapshotRam : this.maxRam);
        this.buffs['buff.snapshot'] = 0;
        this.refreshStats();
        const p = this.world.player();
        const pi = this.world.indexOf(p);
        this.world.c.invuln[pi] = Math.max(this.world.c.invuln[pi]!, 2.0);
        this.events.emit({ type: 'revive', x: this.world.c.x[pi]!, y: this.world.c.y[pi]! });
        return;
      }
      const swap = stacksOf(this.buffs, 'buff.swap_partition');
      if (swap > 0) {
        this.reviveUsed = true;
        this.ram = this.maxRam;
        this.buffs['buff.swap_partition'] = 0;
        this.refreshStats();
        const p = this.world.player();
        const pi = this.world.indexOf(p);
        this.world.c.invuln[pi] = Math.max(this.world.c.invuln[pi]!, 1.5);
        this.events.emit({ type: 'revive', x: this.world.c.x[pi]!, y: this.world.c.y[pi]! });
        return;
      }
    }
    this.toBsod();
  }

  private toBsod(): void {
    this.ram = 0;
    this.setPhase('bsod');
    this.playerAlpha = 0;
    this.world.clear(C.EnemyBullet);
    this.events.emit({ type: 'bsod' });
  }

  abandon(): void {
    if (this.phase === 'bsod' || this.phase === 'shutdown' || this.finished) return;
    this.toBsod();
  }

  private damageEnemy(enemy: Entity, amount: number, aoe: boolean): void {
    const w = this.world;
    if (!w.isAlive(enemy)) return;
    const idx = w.indexOf(enemy);
    const hp = w.c.hp[idx]! - amount;
    w.c.hp[idx] = hp;
    w.c.flash[idx] = 0.08;
    this.events.emit({
      type: 'hit',
      x: w.c.x[idx]!,
      y: w.c.y[idx]!,
      amount: Math.round(amount),
      crit: amount >= PLAYER.damage * 1.8,
    });
    if (hp <= 0) this.killEnemy(enemy, aoe ? 0 : 1);
  }

  private killEnemy(enemy: Entity, chainDepth: number): void {
    const w = this.world;
    if (!w.isAlive(enemy)) return;
    const idx = w.indexOf(enemy);
    const tier = w.c.tier[idx]!;
    if (tier === 2) {
      this.onBossKilled();
      return;
    }
    const proto = PROTO_ORDER[w.c.proto[idx]!] ?? 'popup';
    const x = w.c.x[idx]!;
    const y = w.c.y[idx]!;
    const maxHp = w.c.maxHp[idx]!;
    const style = STYLES[w.c.styleIdx[idx]!] ?? STYLES[0]!;
    this.counters.kills += 1;
    this.gcCounter += 1;
    const gcStacks = stacksOf(this.buffs, 'buff.garbage_collection');
    if (gcStacks > 0) {
      const threshold = gcStacks >= 2 ? 15 : 20;
      if (this.gcCounter >= threshold) {
        this.gcCounter = 0;
        if (this.ram < this.maxRam) {
          this.ram += 1;
          this.events.emit({ type: 'ramUp', ram: this.ram });
        }
      }
    }
    if (stacksOf(this.buffs, 'buff.quicksort') > 0) this.quicksortTimer = 0.8;
    if (proto === 'trojan' && w.c.splitDepth[idx]! === 0) {
      for (let i = 0; i < 2; i++) {
        const angle = (i === 0 ? -1 : 1) * Math.PI * 0.5;
        this.spawnEnemy('trojan', false, x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, {
          hpOverride: maxHp * 0.4,
          speedMul: 1.25,
          splitDepth: 1,
          scale: 0.7,
          styleIndex: w.c.styleIdx[idx]!,
        });
      }
    }
    if (stacksOf(this.buffs, 'buff.blue_screen') > 0 && chainDepth <= 3) {
      if (this.rng.next() < 0.1) this.blueScreenExplosion(x, y, chainDepth + 1);
    }
    this.spawnFx(x, y, 2, 10, 0.32, style.color);
    this.events.emit({
      type: 'enemyDie',
      x,
      y,
      elite: tier === 1,
      color: style.color,
    });
    w.despawn(enemy);
  }

  private blueScreenExplosion(x: number, y: number, depth: number): void {
    const w = this.world;
    const targets = [...w.enemies];
    this.spawnFx(x, y, 3, 0, 0.4, '#38BDF8');
    for (const enemy of targets) {
      if (!w.isAlive(enemy)) continue;
      const idx = w.indexOf(enemy);
      const dx = w.c.x[idx]! - x;
      const dy = w.c.y[idx]! - y;
      if (dx * dx + dy * dy <= 80 * 80) {
        this.damageEnemy(enemy, w.c.maxHp[idx]! * 0.15 * (depth > 1 ? 0.5 : 1), true);
      }
    }
    if (depth < 3) this.events.emit({ type: 'trim', x, y });
  }

  private spawnFx(
    x: number,
    y: number,
    type: number,
    radius: number,
    life: number,
    _color: string,
  ): void {
    const w = this.world;
    if (w.fx.length >= LIMITS.fx) w.despawn(w.fx[0]!);
    const e = w.spawn(C.Fx);
    if (!e) return;
    const idx = w.indexOf(e);
    w.c.x[idx] = x;
    w.c.y[idx] = y;
    w.c.px[idx] = x;
    w.c.py[idx] = y;
    w.c.fxType[idx] = type;
    w.c.r[idx] = radius;
    w.c.life[idx] = life;
    w.c.maxHp[idx] = life;
    w.c.orbit[idx] = this.rng.range(0, Math.PI * 2);
    w.c.styleIdx[idx] = this.styleIndex;
  }

  private updateFx(dt: number): void {
    const w = this.world;
    for (let i = w.fx.length - 1; i >= 0; i--) {
      const fx = w.fx[i]!;
      if (!w.isAlive(fx)) continue;
      const idx = w.indexOf(fx);
      w.c.life[idx] = w.c.life[idx]! - dt;
      if (w.c.life[idx]! <= 0) w.despawn(fx);
    }
  }

  private updateWave(dt: number): void {
    if (this.phase !== 'wave') return;
    const cap = Math.min(30, 14 + 3 * (this.disk - 1));
    this.spawnTimer -= dt;
    this.waveWatchdog += dt;
    if (this.waveQueue.length > 0 && this.spawnTimer <= 0) {
      if (this.world.enemies.length < cap) {
        this.spawnNext();
        this.spawnTimer = 0.6;
      } else {
        this.spawnTimer = 0.2;
      }
    }
    if (this.waveQueue.length === 0 && this.world.enemies.length === 0) {
      this.finishWave();
      return;
    }
    if (this.waveQueue.length === 0 && this.waveWatchdog > 120) {
      for (const e of [...this.world.enemies]) this.world.despawn(e);
      this.finishWave();
    }
  }

  private finishWave(): void {
    this.world.clear(C.EnemyBullet);
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    this.world.c.invuln[pi] = Math.max(this.world.c.invuln[pi]!, 0.25);
    this.events.emit({ type: 'waveClear', wave: this.wave });
    this.setPhase('wave_clear');
  }

  private completeFolder(): void {
    if (this.ram < this.maxRam) {
      this.ram += 1;
      this.events.emit({ type: 'ramUp', ram: this.ram });
    }
    this.counters.folders += 1;
    if (this.folderNoHit) this.noHitFolders += 1;
    this.events.emit({ type: 'folderClear', noHit: this.folderNoHit });
    if (this.dropRng.next() < 0.02) {
      this.dropKeycap('folder');
    }
    this.setPhase('folder_clear');
  }

  private dropKeycap(kind: 'folder' | 'boss'): void {
    const roll = this.dropRng.next();
    let rarity: Rarity;
    if (kind === 'boss') {
      rarity = roll < 0.5 ? 'common' : roll < 0.9 ? 'rare' : 'legendary';
    } else {
      rarity = roll < 0.7 ? 'common' : roll < 0.95 ? 'rare' : 'legendary';
    }
    const drop = this.callbacks.grantKeycap(rarity, this.dropRng);
    if (!drop) return;
    this.keycapsWon.push(drop);
    this.events.emit({ type: 'keycap', label: drop.label, rarity: drop.rarity });
  }

  private openBuff(kind: 'folder' | 'boss'): void {
    const offer = rollOffer(this.buffs, this.buffRng, kind, this.stats.fourCards);
    if (offer.cards.length === 0) {
      this.callbacks.addFragments(50);
      this.advanceAfterBuff(kind, 0);
      return;
    }
    this.buffOffer = offer;
    this.setPhase('buff_pick');
  }

  chooseBuff(id: BuffId): void {
    if (this.phase !== 'buff_pick' || !this.buffOffer) return;
    if (!this.buffOffer.cards.includes(id)) return;
    addStack(this.buffs, id);
    this.refreshStats();
    if (id === 'buff.snapshot' && this.snapshotRam === 0) this.snapshotRam = this.ram;
    const bonus = this.buffOffer.bonusFragments;
    if (bonus > 0) this.callbacks.addFragments(bonus);
    this.events.emit({ type: 'buffInstall' });
    const kind = this.buffOffer.kind;
    this.buffOffer = null;
    this.advanceAfterBuff(kind, bonus);
  }

  rerollOffer(): void {
    if (!this.canReroll || !this.buffOffer) return;
    this.rerollUsed = true;
    const kind = this.buffOffer.kind;
    this.buffOffer = rollOffer(this.buffs, this.buffRng, kind, this.stats.fourCards);
  }

  private advanceAfterBuff(kind: 'folder' | 'boss', bonus: number): void {
    if (kind === 'boss') {
      if (this.disk < this.diskCount) {
        this.setPhase('disk_clear');
        this.ram = this.maxRam;
      } else {
        this.startShutdown();
      }
      return;
    }
    if (this.folder < 5) {
      this.folder += 1;
      this.startFolderIntro();
    } else {
      this.startBossIntro();
    }
    void bonus;
  }

  private startBossIntro(): void {
    this.world.clear(C.Enemy);
    this.world.clear(C.EnemyBullet);
    this.setPhase('boss_intro');
    const m = M(this.disk, this.difficulty);
    this.bossSummonCount = Math.round(2 * (0.85 + 0.15 * m));
    const style = this.style;
    const behavior = BOSS_BEHAVIOR[style.bossId];
    const e = this.spawnBoss(style, behavior, m);
    if (!e) return;
    const idx = this.world.indexOf(e);
    this.boss = {
      entity: e,
      bossId: style.bossId,
      name: style.bossName,
      maxHp: this.world.c.maxHp[idx]!,
      behavior,
      phase: 1,
      orbit: 0,
      windowCd: behavior.windowPeriod,
      windowLeft: 0,
      summonTimer: 8,
      atkTimer: 1.0,
      active: false,
      phase2Done: false,
    };
    this.events.emit({ type: 'bossAlarm' });
    void this.world.c.x[idx];
  }

  private spawnBoss(style: StyleDef, behavior: BossBehavior, m: number): Entity {
    const w = this.world;
    const e = w.spawn(C.Enemy);
    if (!e) return 0;
    const idx = w.indexOf(e);
    const c = w.c;
    c.x[idx] = 640;
    c.y[idx] = 190;
    c.px[idx] = 640;
    c.py[idx] = 190;
    c.r[idx] = 54;
    c.hp[idx] = enemyHp(ENEMY_BASE.bossHp, m);
    c.maxHp[idx] = c.hp[idx]!;
    c.damage[idx] = ENEMY_BASE.contactBoss;
    c.tier[idx] = 2;
    c.styleIdx[idx] = STYLES.indexOf(style);
    c.proto[idx] = 0;
    c.spawnTimer[idx] = 0;
    c.orbit[idx] = 0;
    c.scale[idx] = 1;
    c.speed[idx] = 0;
    c.atkTimer[idx] = 1.0;
    c.baseX[idx] = 640;
    c.baseY[idx] = 190;
    void behavior;
    return e;
  }

  private updateBoss(dt: number): void {
    const boss = this.boss;
    if (!boss || !this.world.isAlive(boss.entity)) return;
    const w = this.world;
    const c = w.c;
    const idx = w.indexOf(boss.entity);
    if (this.phase !== 'boss') return;
    const hp = c.hp[idx]!;
    if (!boss.phase2Done && hp <= boss.maxHp * 0.5) {
      boss.phase2Done = true;
      boss.phase = 2;
      c.invuln[idx] = Math.max(c.invuln[idx]!, 1.0);
      w.flagsOn(idx, Flags.BossPhase2);
      this.events.emit({ type: 'bossPhase2' });
      boss.atkTimer = 1.0;
    }
    boss.orbit += dt * (boss.phase === 2 ? 1.25 : 1);
    const speedMul = boss.phase === 2 ? 1.6 : 1;
    c.x[idx] = 640 + Math.sin(boss.orbit * 0.7) * 380 * speedMul;
    c.y[idx] = 190 + Math.sin(boss.orbit * 1.1) * 34;
    c.px[idx] = c.x[idx]!;
    c.py[idx] = c.y[idx]!;

    boss.windowCd -= dt;
    if (boss.windowLeft > 0) {
      boss.windowLeft -= dt;
      if (boss.windowLeft <= 0) {
        boss.windowLeft = 0;
        boss.active = true;
        boss.atkTimer = 0.8;
      }
    } else if (boss.windowCd <= 0) {
      boss.windowCd = boss.behavior.windowPeriod;
      boss.windowLeft = boss.behavior.windowDuration;
      boss.active = false;
      const kind = boss.behavior.windowKind;
      if (kind === 'restart' || kind === 'gc' || kind === 'reformat' || kind === 'scan_gap') {
        w.clear(C.EnemyBullet);
      }
      if (kind === 'teleport' || kind === 'reconnect') {
        c.x[idx] = this.rng.next() < 0.5 ? 240 : LOGICAL_W - 240;
        c.y[idx] = 150 + this.rng.next() * 220;
      }
      if (kind === 'gc' || kind === 'restart') this.bossSummonCount = 0;
    }

    if (boss.active) {
      boss.atkTimer -= dt;
      if (boss.atkTimer <= 0) {
        const pattern = boss.phase === 2 ? boss.behavior.p2 : boss.behavior.p1;
        this.firePattern(boss.entity, pattern, 2, c.x[idx]!, c.y[idx]!, c.styleIdx[idx]!);
        boss.atkTimer = PATTERN[pattern].interval / enemyAtkSpd(this.disk);
      }
      boss.summonTimer -= dt;
      if (boss.summonTimer <= 0) {
        boss.summonTimer = boss.phase === 2 ? 6 : 8;
        for (let i = 0; i < this.bossSummonCount; i++) {
          if (w.enemies.length >= LIMITS.enemies) break;
          const angle = (Math.PI * 2 * i) / Math.max(1, this.bossSummonCount);
          this.spawnEnemy(
            boss.behavior.summonProto,
            false,
            c.x[idx]! + Math.cos(angle) * 120,
            c.y[idx]! + Math.sin(angle) * 70,
            { hpMul: 0.5, styleIndex: c.styleIdx[idx]! },
          );
        }
      }
    }
    if (c.hp[idx]! <= 0) this.onBossKilled();
  }

  private onBossKilled(): void {
    const boss = this.boss;
    if (!boss) return;
    this.counters.bosses += 1;
    this.counters.disks += 1;
    this.events.emit({ type: 'bossDie' });
    this.world.clear(C.Enemy);
    this.world.clear(C.EnemyBullet);
    this.boss = null;
    this.ram = this.maxRam;
    const p = this.world.player();
    const pi = this.world.indexOf(p);
    this.world.c.invuln[pi] = Math.max(this.world.c.invuln[pi]!, 2.0);
    this.events.emit({ type: 'ramUp', ram: this.ram });
    this.dropKeycap('boss');
    this.openBuff('boss');
  }

  private startShutdown(): void {
    this.world.clear(C.Enemy);
    this.world.clear(C.EnemyBullet);
    this.setPhase('shutdown');
    this.events.emit({ type: 'shutdown' });
  }

  private refreshStats(): void {
    const previousMax = this.maxRam;
    this.stats = computeStats(this.buffs, this.keycapBonus);
    const nextMax = Math.max(1, PLAYER.ram + this.stats.maxRamDelta);
    if (nextMax > previousMax) this.ram += nextMax - previousMax;
    this.maxRam = nextMax;
    this.ram = clamp(this.ram, 0, nextMax);
  }

  getWaveLabel(): string {
    return `${this.wave}/3`;
  }

  getBuffs(): BuffInstance[] {
    const list: BuffInstance[] = [];
    for (const [id, stacks] of Object.entries(this.buffs)) {
      if (stacks && stacks > 0 && BUFF_BY_ID[id as BuffId]) {
        list.push({ id: id as BuffId, stacks });
      }
    }
    return list;
  }

  getResult(): RunResult {
    const cleared = this.phase === 'shutdown' || this.phase === 'disk_clear';
    return {
      seed: this.seed,
      difficulty: this.difficulty,
      durationMs: Math.round(this.runTime * 1000),
      cleared,
      kills: this.counters.kills,
      foldersCleared: this.counters.folders,
      bossesKilled: this.counters.bosses,
      disksCleared: this.counters.disks,
      noHitFolders: this.noHitFolders,
      buffs: this.getBuffs(),
      keycaps: [...this.keycapsWon],
      maxDisk: this.disk,
      ramLeft: cleared ? Math.max(1, this.ram) : this.ram,
    };
  }

  getView(
    sticks: { left: StickState; right: StickState },
    settings: ViewSettings,
  ): RenderView {
    const boss = this.boss;
    let bossView: BossView | null = null;
    if (boss && this.world.isAlive(boss.entity)) {
      const idx = this.world.indexOf(boss.entity);
      bossView = {
        x: this.world.c.x[idx]!,
        y: this.world.c.y[idx]!,
        hp: this.world.c.hp[idx]!,
        maxHp: boss.maxHp,
        name: boss.name,
        phase2: boss.phase === 2,
        window: boss.windowLeft,
      };
    }
    return {
      active: this.playerAlpha > 0,
      world: this.world,
      style: this.style,
      aimX: this.aimX,
      aimY: this.aimY,
      aimMode: this.autoLocked ? 'auto' : this.intent.aimMode,
      pointerX: this.intent.pointerX,
      pointerY: this.intent.pointerY,
      touchMode: this.intent.touch,
      autoLocked: this.autoLocked,
      leftStick: sticks.left,
      rightStick: sticks.right,
      showHitbox: settings.showHitbox,
      screenShake: settings.screenShake,
      reducedMotion: settings.reducedMotion,
      boss: bossView,
      phase: this.phase,
      ram: this.ram,
      maxRam: this.maxRam,
      playerAlpha: this.playerAlpha,
    };
  }
}
