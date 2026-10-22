export type Rarity = 'common' | 'rare' | 'legendary';

export type BuffId =
  | 'buff.cache_hit'
  | 'buff.memory_align'
  | 'buff.clock_cycle'
  | 'buff.hotkey'
  | 'buff.instruction_prefetch'
  | 'buff.double_buffer'
  | 'buff.readonly_cache'
  | 'buff.copy_on_write'
  | 'buff.quicksort'
  | 'buff.buffer'
  | 'buff.checksum'
  | 'buff.incremental_backup'
  | 'buff.multithreading'
  | 'buff.pipeline'
  | 'buff.raid1'
  | 'buff.overclock'
  | 'buff.buffer_overflow'
  | 'buff.garbage_collection'
  | 'buff.irq'
  | 'buff.trim'
  | 'buff.virtual_memory'
  | 'buff.disk_defrag'
  | 'buff.swap_partition'
  | 'buff.root_access'
  | 'buff.hyper_threading'
  | 'buff.raid0'
  | 'buff.kernel_panic'
  | 'buff.blue_screen'
  | 'buff.snapshot'
  | 'buff.full_format';

export interface BuffDef {
  readonly id: BuffId;
  readonly rarity: Rarity;
  readonly maxStacks: number;
  readonly icon: string;
}

export const BUFFS: readonly BuffDef[] = [
  { id: 'buff.cache_hit', rarity: 'common', maxStacks: 3, icon: '⇥' },
  { id: 'buff.memory_align', rarity: 'common', maxStacks: 3, icon: '▤' },
  { id: 'buff.clock_cycle', rarity: 'common', maxStacks: 3, icon: '◷' },
  { id: 'buff.hotkey', rarity: 'common', maxStacks: 3, icon: '⌘' },
  { id: 'buff.instruction_prefetch', rarity: 'common', maxStacks: 2, icon: '⇢' },
  { id: 'buff.double_buffer', rarity: 'common', maxStacks: 3, icon: '▥' },
  { id: 'buff.readonly_cache', rarity: 'common', maxStacks: 3, icon: '▧' },
  { id: 'buff.copy_on_write', rarity: 'common', maxStacks: 3, icon: '⧉' },
  { id: 'buff.quicksort', rarity: 'common', maxStacks: 3, icon: '≺' },
  { id: 'buff.buffer', rarity: 'common', maxStacks: 3, icon: '▣' },
  { id: 'buff.checksum', rarity: 'common', maxStacks: 2, icon: '✓' },
  { id: 'buff.incremental_backup', rarity: 'common', maxStacks: 2, icon: '⟳' },
  { id: 'buff.multithreading', rarity: 'rare', maxStacks: 2, icon: '⋮⋮' },
  { id: 'buff.pipeline', rarity: 'rare', maxStacks: 2, icon: '⇉' },
  { id: 'buff.raid1', rarity: 'rare', maxStacks: 2, icon: '◐' },
  { id: 'buff.overclock', rarity: 'rare', maxStacks: 2, icon: '⚡' },
  { id: 'buff.buffer_overflow', rarity: 'rare', maxStacks: 2, icon: '»' },
  { id: 'buff.garbage_collection', rarity: 'rare', maxStacks: 2, icon: '♻' },
  { id: 'buff.irq', rarity: 'rare', maxStacks: 2, icon: '!' },
  { id: 'buff.trim', rarity: 'rare', maxStacks: 2, icon: '⌫' },
  { id: 'buff.virtual_memory', rarity: 'rare', maxStacks: 2, icon: '▤' },
  { id: 'buff.disk_defrag', rarity: 'rare', maxStacks: 2, icon: '▦' },
  { id: 'buff.swap_partition', rarity: 'legendary', maxStacks: 1, icon: '⇄' },
  { id: 'buff.root_access', rarity: 'legendary', maxStacks: 1, icon: '#' },
  { id: 'buff.hyper_threading', rarity: 'legendary', maxStacks: 1, icon: '≋' },
  { id: 'buff.raid0', rarity: 'legendary', maxStacks: 1, icon: '∞' },
  { id: 'buff.kernel_panic', rarity: 'legendary', maxStacks: 1, icon: '⚠' },
  { id: 'buff.blue_screen', rarity: 'legendary', maxStacks: 1, icon: '▚' },
  { id: 'buff.snapshot', rarity: 'legendary', maxStacks: 1, icon: '◫' },
  { id: 'buff.full_format', rarity: 'legendary', maxStacks: 1, icon: '□' },
];

export const BUFF_BY_ID: Readonly<Record<BuffId, BuffDef>> = Object.fromEntries(
  BUFFS.map((b) => [b.id, b]),
) as Record<BuffId, BuffDef>;

export const BUFF_IDS: readonly BuffId[] = BUFFS.map((b) => b.id);

export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = {
  common: 6,
  rare: 3,
  legendary: 1,
};

export const RARITY_LABEL: Readonly<Record<Rarity, string>> = {
  common: '普通',
  rare: '稀有',
  legendary: '传奇',
};

export const RARITY_GLYPH: Readonly<Record<Rarity, string>> = {
  common: '●',
  rare: '◆',
  legendary: '★',
};
