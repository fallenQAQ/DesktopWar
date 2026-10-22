import type { ProtoId } from './enemies';

export type StyleId =
  | 'style.system'
  | 'style.life'
  | 'style.code'
  | 'style.engineering'
  | 'style.office'
  | 'style.security'
  | 'style.creative'
  | 'style.network';

export type BossId =
  | 'boss.system_update'
  | 'boss.popup_king'
  | 'boss.dependency'
  | 'boss.memory_leak'
  | 'boss.corruption'
  | 'boss.false_positive'
  | 'boss.unsaved'
  | 'boss.reconnect';

export interface StyleDef {
  readonly id: StyleId;
  readonly name: string;
  readonly color: string;
  readonly light: string;
  readonly dark: string;
  readonly bossId: BossId;
  readonly bossName: string;
  readonly bossSoftware: string;
  readonly enemies: Readonly<Record<ProtoId, string>>;
  readonly decor: readonly string[];
  readonly paths: readonly {
    readonly roots: readonly string[];
    readonly dirs: readonly string[];
    readonly tails: readonly string[];
  }[];
}

export const STYLES: readonly StyleDef[] = [
  {
    id: 'style.system',
    name: '系统盘',
    color: '#2563EB',
    light: '#93B4F5',
    dark: '#1E3A8A',
    bossId: 'boss.system_update',
    bossName: '系统更新',
    bossSoftware: 'Windows Update',
    enemies: {
      popup: 'Edge',
      notifier: 'Teams',
      adware: 'Store',
      trojan: 'Outlook',
      cache: 'OneDrive',
      updater: 'Update',
    },
    decor: ['回收站', '此电脑', '剪切板', '设置', '任务计划', '控制面板', '设备管理', '字体'],
    paths: [
      { roots: ['Users\\DW', 'Users\\Public', 'Windows'], dirs: ['Documents', 'Downloads', 'AppData'], tails: ['新建文件夹 (3)', '临时文件', '未命名 (2)'] },
      { roots: ['Users\\DW', 'ProgramData', 'Windows'], dirs: ['Desktop', 'Pictures', 'Logs'], tails: ['备份 (1)', '系统日志', 'install_final'] },
    ],
  },
  {
    id: 'style.life',
    name: '生活软件',
    color: '#F59E0B',
    light: '#FCD34D',
    dark: '#92400E',
    bossId: 'boss.popup_king',
    bossName: '弹窗之王',
    bossSoftware: 'Zoom',
    enemies: {
      popup: 'Spotify',
      notifier: 'Slack',
      adware: 'Netflix',
      trojan: 'TikTok',
      cache: 'YouTube',
      updater: 'Steam',
    },
    decor: ['音乐', '相册', '日历', '地图', '天气', '播客', '相册备份', '家庭'],
    paths: [
      { roots: ['Users\\DW', 'Media', 'D:\\Downloads'], dirs: ['Music', 'Videos', 'Pictures'], tails: ['周末播放列表', '缓存视频', '未整理'] },
      { roots: ['Media', 'Users\\DW', 'Backup'], dirs: ['Movies', 'Camera', 'Shared'], tails: ['旅行 2026', '剪辑草稿', 'stream_save'] },
    ],
  },
  {
    id: 'style.code',
    name: '代码软件',
    color: '#10B981',
    light: '#6EE7B7',
    dark: '#065F46',
    bossId: 'boss.dependency',
    bossName: '依赖地狱',
    bossSoftware: 'Node.js',
    enemies: {
      popup: 'VS Code',
      notifier: 'GitHub',
      adware: 'npm',
      trojan: 'Docker',
      cache: 'Redis',
      updater: 'Bash',
    },
    decor: ['仓库', '终端', '构建', '提交', '分支', '测试', 'CI 缓存', '日志'],
    paths: [
      { roots: ['Projects', 'Users\\DW\\code', 'D:\\Work'], dirs: ['client', 'server', 'packages'], tails: ['client_final_v2', 'src', 'hotfix'] },
      { roots: ['Projects', 'Playground', 'D:\\Repos'], dirs: ['monorepo', 'scripts', 'test'], tails: ['feature_login', 'deps_lock', 'build_out'] },
    ],
  },
  {
    id: 'style.engineering',
    name: '工程软件',
    color: '#06B6D4',
    light: '#67E8F9',
    dark: '#0E7490',
    bossId: 'boss.memory_leak',
    bossName: '内存泄漏',
    bossSoftware: 'Blender',
    enemies: {
      popup: 'Autodesk',
      notifier: 'SketchUp',
      adware: 'Unity',
      trojan: 'Arduino',
      cache: 'Chip',
      updater: 'Cog',
    },
    decor: ['模型', '材质', '渲染', '网格', '工程图', '设备', '固件', '仿真'],
    paths: [
      { roots: ['Projects', 'Work', 'D:\\CAD'], dirs: ['Models', 'Renders', 'Source'], tails: ['engine_v4', 'draft_v12', 'assembly'] },
      { roots: ['Projects', 'Backup', 'D:\\Firmware'], dirs: ['Mesh', 'Texture', 'Sim'], tails: ['robot_arm', 'test_bench', 'old_rev'] },
    ],
  },
  {
    id: 'style.office',
    name: '办公软件',
    color: '#EF4444',
    light: '#FCA5A5',
    dark: '#991B1B',
    bossId: 'boss.corruption',
    bossName: '格式错乱',
    bossSoftware: 'Office',
    enemies: {
      popup: 'Word',
      notifier: 'Outlook',
      adware: 'Excel',
      trojan: 'PowerPoint',
      cache: 'OneDrive',
      updater: 'Teams',
    },
    decor: ['文档', '表格', '演示', '邮件', '日程', '会议', '报表', '合同'],
    paths: [
      { roots: ['Users\\DW', 'SharePoint', 'D:\\Office'], dirs: ['Documents', 'Reports', 'Meetings'], tails: ['季度总结_v7', '预算_最终', '会议纪要'] },
      { roots: ['Work', 'Users\\DW', 'Backup'], dirs: ['Finance', 'Contracts', 'Archive'], tails: ['合同_签署版', '报表_2026', '副本 (4)'] },
    ],
  },
  {
    id: 'style.security',
    name: '安全软件',
    color: '#22C55E',
    light: '#86EFAC',
    dark: '#166534',
    bossId: 'boss.false_positive',
    bossName: '误报风暴',
    bossSoftware: 'Norton',
    enemies: {
      popup: 'Avast',
      notifier: 'McAfee',
      adware: 'Kaspersky',
      trojan: 'Bitdefender',
      cache: 'Shield',
      updater: 'Sync',
    },
    decor: ['扫描', '隔离区', '防火墙', '权限', '签名', '漏洞', '安全中心', '日志'],
    paths: [
      { roots: ['Windows', 'ProgramData', 'D:\\Security'], dirs: ['Quarantine', 'Scans', 'Rules'], tails: ['full_scan', 'threat_report', 'exclusions'] },
      { roots: ['Security', 'Users\\DW', 'Backup'], dirs: ['Vault', 'Logs', 'Updates'], tails: ['quarantine_07', 'firewall_bak', 'scan_cache'] },
    ],
  },
  {
    id: 'style.creative',
    name: '创意软件',
    color: '#A855F7',
    light: '#D8B4FE',
    dark: '#6B21A8',
    bossId: 'boss.unsaved',
    bossName: '未保存的工程',
    bossSoftware: 'Creative Cloud',
    enemies: {
      popup: 'Photoshop',
      notifier: 'Illustrator',
      adware: 'Premiere',
      trojan: 'After Effects',
      cache: 'Figma',
      updater: 'Blender',
    },
    decor: ['图层', '蒙版', '时间线', '笔刷', '预设', '素材', '画板', '导出'],
    paths: [
      { roots: ['Projects', 'Users\\DW', 'D:\\Design'], dirs: ['PSD', 'AE', 'Exports'], tails: ['poster_final_v9', 'cover_draft', 'unsaved'] },
      { roots: ['Creative', 'Assets', 'Backup'], dirs: ['Illustration', 'Motion', 'Brand'], tails: ['key_visual', 'logo_test', 'render_01'] },
    ],
  },
  {
    id: 'style.network',
    name: '网络软件',
    color: '#0EA5E9',
    light: '#7DD3FC',
    dark: '#075985',
    bossId: 'boss.reconnect',
    bossName: '断线重连',
    bossSoftware: 'Discord',
    enemies: {
      popup: 'Chrome',
      notifier: 'Firefox',
      adware: 'Opera',
      trojan: 'Brave',
      cache: 'Cloudflare',
      updater: 'Dropbox',
    },
    decor: ['网络', '下载', '上传', '代理', '同步', '书签', '缓存', '连接'],
    paths: [
      { roots: ['Users\\DW', 'Downloads', 'D:\\Net'], dirs: ['Cache', 'Sync', 'Backup'], tails: ['download_tmp', 'sync_queue', 'offline_copy'] },
      { roots: ['Network', 'Users\\DW', 'Backup'], dirs: ['Uploads', 'Profile', 'Logs'], tails: ['browser_data', 'cloud_sync', 'connection_log'] },
    ],
  },
];

export const STYLE_BY_ID: Readonly<Record<StyleId, StyleDef>> = Object.fromEntries(
  STYLES.map((s) => [s.id, s]),
) as Record<StyleId, StyleDef>;

export const OPTIONAL_STYLES: readonly StyleDef[] = STYLES.filter(
  (s) => s.id !== 'style.system',
);

export const BOSS_PATTERNS: Readonly<
  Record<BossId, { p1: 'ring' | 'fan' | 'wall' | 'laser' | 'homing' | 'spiral'; p2: 'ring' | 'fan' | 'wall' | 'laser' | 'homing' | 'spiral'; window: string }>
> = {
  'boss.system_update': { p1: 'ring', p2: 'ring', window: 'restart' },
  'boss.popup_king': { p1: 'fan', p2: 'fan', window: 'teleport' },
  'boss.dependency': { p1: 'fan', p2: 'laser', window: 'break_guard' },
  'boss.memory_leak': { p1: 'spiral', p2: 'spiral', window: 'gc' },
  'boss.corruption': { p1: 'wall', p2: 'wall', window: 'reformat' },
  'boss.false_positive': { p1: 'laser', p2: 'laser', window: 'scan_gap' },
  'boss.unsaved': { p1: 'ring', p2: 'wall', window: 'save' },
  'boss.reconnect': { p1: 'homing', p2: 'homing', window: 'reconnect' },
};

export const BOSS_NAMES: Readonly<Record<BossId, string>> = {
  'boss.system_update': '系统更新',
  'boss.popup_king': '弹窗之王',
  'boss.dependency': '依赖地狱',
  'boss.memory_leak': '内存泄漏',
  'boss.corruption': '格式错乱',
  'boss.false_positive': '误报风暴',
  'boss.unsaved': '未保存的工程',
  'boss.reconnect': '断线重连',
};
