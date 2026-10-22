export type GameEvent =
  | { type: 'fire'; x: number; y: number; group: number; pitch: number }
  | { type: 'hit'; x: number; y: number; amount: number; crit: boolean }
  | { type: 'enemyDie'; x: number; y: number; elite: boolean; color: string }
  | { type: 'playerHurt'; amount: number; ram: number }
  | { type: 'ramUp'; ram: number }
  | { type: 'waveClear'; wave: number }
  | { type: 'folderClear'; noHit: boolean }
  | { type: 'bossAlarm' }
  | { type: 'bossPhase2' }
  | { type: 'bossDie' }
  | { type: 'bsod' }
  | { type: 'shutdown' }
  | { type: 'buffInstall' }
  | { type: 'legendary' }
  | { type: 'keycap'; label: string; rarity: string }
  | { type: 'uiClick' }
  | { type: 'trim'; x: number; y: number }
  | { type: 'revive'; x: number; y: number };

export class EventBus {
  private queue: GameEvent[] = [];

  emit(event: GameEvent): void {
    this.queue.push(event);
  }

  flush(handler: (event: GameEvent) => void): void {
    if (this.queue.length === 0) return;
    for (let i = 0; i < this.queue.length; i++) handler(this.queue[i]!);
    this.queue.length = 0;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
