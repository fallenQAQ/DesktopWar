import type { PatternId } from '../data/enemies';
import type { BossId } from '../data/styles';

export type BossWindowKind =
  | 'restart'
  | 'teleport'
  | 'break_guard'
  | 'gc'
  | 'reformat'
  | 'scan_gap'
  | 'save'
  | 'reconnect';

export interface BossBehavior {
  p1: PatternId;
  p2: PatternId;
  windowKind: BossWindowKind;
  windowPeriod: number;
  windowDuration: number;
  summonProto: 'popup' | 'updater';
}

export const BOSS_BEHAVIOR: Readonly<Record<BossId, BossBehavior>> = {
  'boss.system_update': {
    p1: 'pat.ring8',
    p2: 'pat.ring16',
    windowKind: 'restart',
    windowPeriod: 20,
    windowDuration: 5,
    summonProto: 'updater',
  },
  'boss.popup_king': {
    p1: 'pat.fan3',
    p2: 'pat.aimed_fan5',
    windowKind: 'teleport',
    windowPeriod: 6,
    windowDuration: 1.2,
    summonProto: 'popup',
  },
  'boss.dependency': {
    p1: 'pat.fan3',
    p2: 'pat.elite_fan5',
    windowKind: 'break_guard',
    windowPeriod: 12,
    windowDuration: 4,
    summonProto: 'popup',
  },
  'boss.memory_leak': {
    p1: 'pat.spiral',
    p2: 'pat.spiral',
    windowKind: 'gc',
    windowPeriod: 15,
    windowDuration: 3,
    summonProto: 'updater',
  },
  'boss.corruption': {
    p1: 'pat.wall_rows',
    p2: 'pat.wall_rows',
    windowKind: 'reformat',
    windowPeriod: 12,
    windowDuration: 2,
    summonProto: 'popup',
  },
  'boss.false_positive': {
    p1: 'pat.laser_sweep',
    p2: 'pat.laser_sweep',
    windowKind: 'scan_gap',
    windowPeriod: 9,
    windowDuration: 2.5,
    summonProto: 'notifier' as 'popup',
  },
  'boss.unsaved': {
    p1: 'pat.ring8',
    p2: 'pat.ring16',
    windowKind: 'save',
    windowPeriod: 18,
    windowDuration: 3,
    summonProto: 'updater',
  },
  'boss.reconnect': {
    p1: 'pat.homing_slow',
    p2: 'pat.ring8',
    windowKind: 'reconnect',
    windowPeriod: 7,
    windowDuration: 1.5,
    summonProto: 'popup',
  },
};

export const BOSS_POSITIONS = {
  p1Speed: 40,
  p2Speed: 65,
  enrageSpeed: 70,
} as const;

export function bossBaseY(): number {
  return 190;
}
