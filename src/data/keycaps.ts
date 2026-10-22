import type { Rarity } from './buffs';

export type KeyStat = 'atk' | 'as' | 'mov';

export interface KeycapDef {
  readonly row: number;
  readonly rowName: string;
  readonly label: string;
  readonly id: string;
  readonly rarity: Rarity;
  readonly stat: KeyStat;
  readonly points: number;
  readonly value: number;
}

const ROW_NAMES = ['F 区', '数字区', 'QWERTY', '主键区', '下档区', '底行', '导航区'] as const;
const POINTS: Record<Rarity, number> = { common: 1, rare: 2, legendary: 4 };
const STAT_VALUE: Record<KeyStat, number> = { atk: 0.2, as: 0.12, mov: 0.15 };

function makeKeycaps(): KeycapDef[] {
  const rows: KeycapDef[][] = [[], [], [], [], [], [], []];
  const add = (row: number, label: string, id: string, rarity: Rarity, stat: KeyStat): void => {
    const points = POINTS[rarity];
    rows[row]!.push({
      row,
      rowName: ROW_NAMES[row]!,
      label,
      id,
      rarity,
      stat,
      points,
      value: Number((STAT_VALUE[stat] * points).toFixed(2)),
    });
  };

  add(0, 'Esc', 'key.escape', 'legendary', 'atk');
  for (let i = 1; i <= 5; i++) add(0, `F${i}`, `key.f${i}`, 'rare', 'atk');
  for (let i = 6; i <= 12; i++) add(0, `F${i}`, `key.f${i}`, 'common', 'as');
  add(0, 'PrtSc', 'key.print_screen', 'rare', 'mov');
  add(0, 'ScrLk', 'key.scroll_lock', 'rare', 'mov');
  add(0, 'Pause', 'key.pause', 'rare', 'mov');

  add(1, '`', 'key.backquote', 'common', 'mov');
  for (let i = 1; i <= 9; i++) add(1, String(i), `key.digit${i}`, 'common', 'atk');
  add(1, '0', 'key.digit0', 'common', 'atk');
  add(1, '-', 'key.minus', 'common', 'mov');
  add(1, '=', 'key.equal', 'common', 'mov');
  add(1, 'Backspace', 'key.backspace', 'rare', 'atk');

  add(2, 'Tab', 'key.tab', 'rare', 'atk');
  for (const ch of 'QWERTYUIOP') add(2, ch, `key.${ch.toLowerCase()}`, 'common', 'atk');
  add(2, '[', 'key.bracket_left', 'common', 'as');
  add(2, ']', 'key.bracket_right', 'common', 'as');
  add(2, '\\', 'key.backslash', 'common', 'as');

  add(3, 'Caps', 'key.caps_lock', 'rare', 'atk');
  for (const ch of 'ASDFGHJKL') add(3, ch, `key.${ch.toLowerCase()}`, 'common', 'atk');
  add(3, ';', 'key.semicolon', 'common', 'atk');
  add(3, "'", 'key.quote', 'common', 'atk');
  add(3, 'Enter', 'key.enter', 'legendary', 'as');

  add(4, 'LShift', 'key.shift_left', 'rare', 'atk');
  for (const ch of 'ZXCVBNM') add(4, ch, `key.${ch.toLowerCase()}`, 'common', 'atk');
  add(4, ',', 'key.comma', 'common', 'atk');
  add(4, '.', 'key.period', 'common', 'atk');
  add(4, '/', 'key.slash', 'common', 'mov');
  add(4, 'RShift', 'key.shift_right', 'rare', 'atk');

  add(5, 'LCtrl', 'key.ctrl_left', 'rare', 'as');
  add(5, 'LWin', 'key.meta_left', 'rare', 'as');
  add(5, 'LAlt', 'key.alt_left', 'rare', 'atk');
  add(5, 'Space', 'key.space', 'legendary', 'mov');
  add(5, 'RAlt', 'key.alt_right', 'rare', 'atk');
  add(5, 'RWin', 'key.meta_right', 'rare', 'as');
  add(5, 'Menu', 'key.menu', 'rare', 'mov');
  add(5, 'RCtrl', 'key.ctrl_right', 'rare', 'as');
  add(5, '↑', 'key.arrow_up', 'rare', 'atk');
  add(5, '←', 'key.arrow_left', 'rare', 'atk');
  add(5, '↓', 'key.arrow_down', 'rare', 'atk');
  add(5, '→', 'key.arrow_right', 'rare', 'atk');

  for (const [label, id] of [
    ['Insert', 'key.insert'],
    ['Home', 'key.home'],
    ['PgUp', 'key.page_up'],
    ['Delete', 'key.delete'],
    ['End', 'key.end'],
    ['PgDn', 'key.page_down'],
  ] as const) {
    add(6, label, id, 'common', 'mov');
  }

  return rows.flat();
}

export const KEYCAPS: readonly KeycapDef[] = makeKeycaps();

export const KEYCAP_BY_ID: Readonly<Record<string, KeycapDef>> = Object.fromEntries(
  KEYCAPS.map((k) => [k.id, k]),
);

export const KEYCAP_RARITY_COUNT = {
  common: KEYCAPS.filter((k) => k.rarity === 'common').length,
  rare: KEYCAPS.filter((k) => k.rarity === 'rare').length,
  legendary: KEYCAPS.filter((k) => k.rarity === 'legendary').length,
};

export interface KeycapSet {
  readonly id: string;
  readonly name: string;
  readonly keys: readonly string[];
  readonly desc: string;
}

export const KEYCAP_SETS: readonly KeycapSet[] = [
  { id: 'set.wasd', name: 'WASD', keys: ['key.w', 'key.a', 'key.s', 'key.d'], desc: '移速 +3%' },
  { id: 'set.arrows', name: '方向键', keys: ['key.arrow_up', 'key.arrow_left', 'key.arrow_down', 'key.arrow_right'], desc: '受击无敌 +0.1 s' },
  { id: 'set.f1_f4', name: 'F1–F4', keys: ['key.f1', 'key.f2', 'key.f3', 'key.f4'], desc: '每局 1 次免费重随' },
  { id: 'set.home_row', name: '主键区 8 键', keys: ['key.a', 'key.s', 'key.d', 'key.f', 'key.j', 'key.k', 'key.l', 'key.semicolon'], desc: '攻击 +2%' },
  { id: 'set.power_keys', name: 'Esc+Enter+Space', keys: ['key.escape', 'key.enter', 'key.space'], desc: '增益 4 选 1' },
  { id: 'set.full', name: '全部 87 键', keys: KEYCAPS.map((k) => k.id), desc: '攻击 +1%，移速 +3%' },
];

export const KEYCAP_CAP = { atk: 18, as: 12, mov: 10 } as const;

export interface KeycapBonus {
  readonly atkPct: number;
  readonly asPct: number;
  readonly movPct: number;
  readonly invulnBonus: number;
  readonly reroll: boolean;
  readonly fourCards: boolean;
  readonly sets: readonly string[];
  readonly owned: number;
}

export function computeKeycapBonus(owned: Readonly<Record<string, 1>>): KeycapBonus {
  let rawAtk = 0;
  let rawAs = 0;
  let rawMov = 0;
  for (const key of KEYCAPS) {
    if (!owned[key.id]) continue;
    if (key.stat === 'atk') rawAtk += key.value;
    else if (key.stat === 'as') rawAs += key.value;
    else rawMov += key.value;
  }
  const cap = (raw: number, limit: number): number =>
    raw <= 0 ? 0 : limit * (1 - Math.exp(-raw / limit));
  const completed = KEYCAP_SETS.filter((set) => set.keys.every((id) => owned[id]));
  const setIds = completed.map((s) => s.id);
  let atk = cap(rawAtk, KEYCAP_CAP.atk);
  let mov = cap(rawMov, KEYCAP_CAP.mov);
  if (setIds.includes('set.home_row')) atk += 2;
  if (setIds.includes('set.full')) {
    atk += 1;
    mov += 3;
  }
  if (setIds.includes('set.wasd')) mov += 3;
  const invulnBonus = setIds.includes('set.arrows') ? 0.1 : 0;
  return {
    atkPct: Number(atk.toFixed(2)),
    asPct: Number(cap(rawAs, KEYCAP_CAP.as).toFixed(2)),
    movPct: Number(mov.toFixed(2)),
    invulnBonus,
    reroll: setIds.includes('set.f1_f4'),
    fourCards: setIds.includes('set.power_keys'),
    sets: setIds,
    owned: KEYCAPS.filter((k) => owned[k.id]).length,
  };
}
