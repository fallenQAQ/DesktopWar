#!/usr/bin/env python3
"""Read-only consistency checks for the DesktopWar docs (v0.2.0 alignment).

Run: PYTHONIOENCODING=utf-8 python tools/check_docs.py
Exit code 0 = all checks pass.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
REQUIRED = [
    "00-设计总纲.md", "10-玩法架构.md", "20-增益与局外成长.md",
    "30-技术架构.md", "40-美术与UX规范.md", "50-数值与平衡.md",
    "60-里程碑与验收.md", "README.md",
]

errors: list[str] = []

LINE_BUDGET = {
    "00-设计总纲.md": 555, "10-玩法架构.md": 945, "20-增益与局外成长.md": 560,
    "30-技术架构.md": 910, "40-美术与UX规范.md": 835, "50-数值与平衡.md": 300,
    "60-里程碑与验收.md": 160, "README.md": 110,
}


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not ok else ""))
    if not ok:
        errors.append(name + (f": {detail}" if detail else ""))


for f in REQUIRED:
    check(f"file exists: {f}", (DOCS / f).is_file())

texts = {f: (DOCS / f).read_text(encoding="utf-8") for f in REQUIRED}

for f, t in texts.items():
    fences = len(re.findall(r"^```", t, flags=re.M))
    check(f"code fences balanced: {f}", fences % 2 == 0, f"{fences} fences")
    actual = len(t.splitlines())
    check(f"line budget: {f}", actual <= LINE_BUDGET[f], f"{actual} > {LINE_BUDGET[f]}")

# stale Canon values (allow 40's CSS line-height 1.45)
stale = {
    "balanced D=1.45": re.compile(r"(balanced\s*:\s*1\.45|1\.45\s*/\s*2\.00)"),
    "硬编码 7.12": re.compile(r"7\.12"),
    "旧 Boss HP 4272": re.compile(r"4272"),
    "pnpm command": re.compile(r"\bpnpm\b"),
    "old Vite 8": re.compile(r"Vite 8"),
    "M0 no-code status": re.compile(r"M0 设计阶段|尚无运行时代码|M0 定稿"),
    "old boss path": re.compile(r"src/game/boss/\*"),
}
for name, pat in stale.items():
    hits = [f for f, t in texts.items() if pat.search(t)]
    check(f"no stale value: {name}", not hits, ", ".join(hits))

# canonical numbers must be present in the SSOT and derived docs
for num in ["863", "1,523", "2,412"]:
    check(f"fragment example {num} in 00/20/50",
          all(num in texts[f] for f in ["00-设计总纲.md", "20-增益与局外成长.md", "50-数值与平衡.md"]))
check("D=1.00/1.30/1.60 in 00/10/30", all("1.30" in texts[f] for f in ["00-设计总纲.md", "10-玩法架构.md", "30-技术架构.md"]))
check("wave bases 3/5/4+1 in 00",
      all(s in texts["00-设计总纲.md"] for s in ["| W1 | 3 普通小怪", "| W2 | 5 普通小怪", "| W3 | 4 普通小怪 + 1 精英"]))
check("run timeline 12.9/21.2/31.8 in 10",
      all(s in texts["10-玩法架构.md"] for s in ["12.9", "21.2", "31.8"]))
check("keycap full bonus +15.9% in 20/50",
      all("15.9" in texts[f] for f in ["20-增益与局外成长.md", "50-数值与平衡.md"]))
check("save settings fields in 20/30",
      all("musicVolume" in texts[f] and "screenShake" in texts[f] and "sinceLegendary" in texts[f]
          and "autoLock" in texts[f] for f in ["20-增益与局外成长.md", "30-技术架构.md"]))
check("Iconify pipeline steps in 30",
      all(s in texts["30-技术架构.md"] for s in ["api.iconify.design", "resvg", "license", "500KB"]))
check("40 has 14 screen sections", len(re.findall(r"^### 6\.", texts["40-美术与UX规范.md"], flags=re.M)) == 14)

# v0.1.3 control model: WASD+mouse / landscape dual-stick / optional auto-lock default off
check("00 control canon",
      all(s in texts["00-设计总纲.md"] for s in
          ["WASD", "双摇杆", "自动锁定", "仅横屏", "320 逻辑 px/s", "ADR-011"]))
check("10 control model",
      all(s in texts["10-玩法架构.md"] for s in
          ["move", "aim_intent", "双摇杆", "autoLock", "480", "0.4 s", "320 px/s"]))
check("20 autoLock default false",
      '"autoLock": false' in texts["20-增益与局外成长.md"] and "settings.autoLock" in texts["20-增益与局外成长.md"])
check("30 landscape + input model",
      all(s in texts["30-技术架构.md"] for s in
          ["move_intent", "aim_intent", "autoLock", "landscape", "1280×720", "旋转覆盖层"]))
check("40 dual-stick + autoLock + rotate copy",
      all(s in texts["40-美术与UX规范.md"] for s in
          ["左摇杆", "右摇杆", "自动锁定最近目标", "请旋转设备至横屏"]))
no_old_orientation = re.compile(r"竖屏优先|移动竖屏|720×1280|相对拖动|拖动锚点")
check("no obsolete portrait/drag wording", not any(no_old_orientation.search(t) for t in texts.values()))
check("40 copies exact BSOD/shutdown copy",
      all(s in texts["40-美术与UX规范.md"] for s in
          ["终止代码: DESKTOP_WAR_RAM_EXHAUSTED", "失败的操作: desktopwar.exe", "现在可以安全地关闭计算机了。"]))
no_equip = re.compile(r"已装备|装备 / 卸下|Enter 装/卸")
check("40 has no manual keycap equip wording", not no_equip.search(texts["40-美术与UX规范.md"]))
check("30 has no manual keycap equip wording", "装键帽" not in texts["30-技术架构.md"])

# 20: buff and keycap counts
buff_rows = [ln for ln in texts["20-增益与局外成长.md"].splitlines() if ln.startswith("| `buff.")]
key_rows = [ln for ln in texts["20-增益与局外成长.md"].splitlines() if ln.startswith("| ") and "`key." in ln]
check("20 has 30 buff rows", len(buff_rows) == 30, str(len(buff_rows)))
check("20 has 87 keycap rows", len(key_rows) == 87, str(len(key_rows)))
check("20 keycap rarity counts 60/24/3",
      sum("common" in ln for ln in key_rows) == 60
      and sum("| rare |" in ln for ln in key_rows) == 24
      and sum("legendary" in ln for ln in key_rows) == 3,
      f"common={sum('common' in ln for ln in key_rows)}, rare={sum('| rare |' in ln for ln in key_rows)}, "
      f"legendary={sum('legendary' in ln for ln in key_rows)}")

# fixed copy must match 00 §10.3
for phrase in [
    "你的电脑遇到问题，需要重新启动。",
    "终止代码: DESKTOP_WAR_RAM_EXHAUSTED",
    "计算机已安全关机",
    "现在可以安全地关闭计算机了。",
]:
    check(f"fixed copy in 00+40: {phrase[:12]}", phrase in texts["00-设计总纲.md"] and phrase in texts["40-美术与UX规范.md"])

# README relative links resolve
readme = texts["README.md"]
for target in re.findall(r"\]\((\.\.?/[^)]+|[0-9A-Za-z_./-]+\.md)\)", readme):
    path = (DOCS / target).resolve() if not target.startswith("..") else (DOCS / target).resolve()
    check(f"README link exists: {target}", path.exists(), str(path))

# key headings
headings = {
    "00-设计总纲.md": "## 7. Canon 数值与公式",
    "10-玩法架构.md": "## 8. 根目录 Boss 设计草案",
    "20-增益与局外成长.md": "## 3. 87 键键盘",
    "30-技术架构.md": "## 9. Iconify 资产管线（计划，当前未接入）",
    "40-美术与UX规范.md": "## 6. 界面清单与线框",
    "50-数值与平衡.md": "## 5. 经济与养成",
    "60-里程碑与验收.md": "## 4. 测试矩阵",
}
for f, h in headings.items():
    check(f"heading: {h[:14]}", h in texts[f])

# v0.1.5 consistency invariants
version_match = re.search(r"版本：v(\d+\.\d+\.\d+)", texts["00-设计总纲.md"])
current_version = f"v{version_match.group(1)}" if version_match else ""
check("Canon version present", bool(current_version))
check("all docs at current version", bool(current_version) and all(current_version in t for t in texts.values()))
check("00 run length 12–35",
      all(s in texts["00-设计总纲.md"] for s in ["12–16", "18–24", "25–35"])
      and "12–25" not in texts["00-设计总纲.md"])
check("conflict ids namespaced GC/AC/UC",
      "GC-01" in texts["10-玩法架构.md"] and "AC-01" in texts["30-技术架构.md"]
      and "UC-01" in texts["40-美术与UX规范.md"]
      and not any(re.search(r"(?<![A-Z])C-(?:0\d|1[0-2])", t) for t in texts.values()))
check("10/30 pool capacities aligned",
      all(s in texts["30-技术架构.md"] for s in
          ["enemies: 32, playerBullets: 160, enemyBullets: 320", "pickups: 32, fx: 256"])
      and all(s in texts["10-玩法架构.md"] for s in ["玩家子弹 160", "VFX 256"]))
check("bullet/pierce caps 12/5 in 10/20",
      "≤ 12" in texts["10-玩法架构.md"] and "≤ 5" in texts["10-玩法架构.md"]
      and "12 发" in texts["20-增益与局外成长.md"] and "穿透硬上限 5" in texts["20-增益与局外成长.md"])
check("screen shake aligned 10/40",
      all(s in texts["10-玩法架构.md"] for s in ["3 px / 120 ms", "4 px/400 ms"])
      and all(s in texts["40-美术与UX规范.md"] for s in ["3px/120 ms", "4px/400 ms"])
      and "2 px/120 ms" not in texts["10-玩法架构.md"]
      and "6 px/200" not in texts["10-玩法架构.md"])
check("single formulas path",
      all("src/data/formulas.ts" in texts[f] for f in
          ["10-玩法架构.md", "30-技术架构.md", "60-里程碑与验收.md"]))
check("single save path",
      all("src/meta/save.ts" in texts[f] for f in ["30-技术架构.md", "60-里程碑与验收.md"]))
legacy_paths = ["src/game/balance.ts", "src/data/balance.ts", "src/core/save.ts",
                "src/gameplay/", "src/game/waves.ts", "src/meta/keyboard.ts",
                "src/data/bosses"]
check("no legacy code paths", not any(p in t for t in texts.values() for p in legacy_paths))
check("boss scripts path",
      all("src/game/boss.ts" in texts[f] for f in ["10-玩法架构.md", "60-里程碑与验收.md"]))
check("no stale buff 散热器", "`散热器`" not in texts["00-设计总纲.md"] and "散热器 │" not in texts["40-美术与UX规范.md"])
check("20 boss pool full -> rare +50", "3 张稀有卡 + 50 碎片" in texts["20-增益与局外成长.md"])
check("boss pool full rule in 00/10/20",
      all("3 张稀有卡 + 50 碎片" in texts[f] for f in
          ["00-设计总纲.md", "10-玩法架构.md", "20-增益与局外成长.md"]))
check("hub draw entry aligned",
      "| 抽取 |" in texts["20-增益与局外成长.md"]
      and "[i:crystal]抽取" in texts["40-美术与UX规范.md"])
check("icon manifest single source",
      not any(s in texts["40-美术与UX规范.md"] for s in
              ["icon_map", "src/gfx", "fetch-icons", "icon-credits"]))
check("icon license whitelist",
      all(s in texts["00-设计总纲.md"] for s in ["CC0-1.0", "MIT", "Apache-2.0", "simple-icons"])
      and all(s in texts["40-美术与UX规范.md"] for s in ["CC0-1.0", "MIT", "Apache-2.0", "simple-icons"]))
check("open-source non-commercial statement",
      "开源、非商业发行" in texts["00-设计总纲.md"]
      and "开源、非商业发行" in texts["40-美术与UX规范.md"])
check("real software icon mapping",
      all(s in texts["40-美术与UX规范.md"] for s in
          ["logos:microsoft-edge", "simple-icons:microsoftword", "logos:adobe-photoshop", "logos:chrome"]))
check("simple-icons pinned", "'simple-icons': '16.35.0'" in texts["30-技术架构.md"])
check("difficulty copy/ids 节能/平衡/高性能",
      all("高性能" in texts[f] for f in
          ["00-设计总纲.md", "10-玩法架构.md", "40-美术与UX规范.md"])
      and "节能 / 平衡 / 高性能" in texts["00-设计总纲.md"]
      and all(s in texts["30-技术架构.md"] for s in
              ["eco: 1.00", "balanced: 1.30", "performance: 1.60",
               "'eco' | 'balanced' | 'performance'"])
      and not re.search(r"高负载|小白|大佬|骨灰|rookie|veteran|hardcore", "".join(texts.values())))
check("no disallowed icon set", "fa6-solid" not in "".join(texts.values()))
check("i18n reserved in 00/30/40",
      all("src/i18n" in texts[f] for f in
          ["00-设计总纲.md", "30-技术架构.md", "40-美术与UX规范.md"])
      and "ADR-013" in texts["00-设计总纲.md"]
      and "Locale = 'zh-CN' | 'en-US'" in texts["30-技术架构.md"]
      and "settings.language" in texts["20-增益与局外成长.md"]
      and "1.4×" in texts["40-美术与UX规范.md"])
check("30 language enum", "language: Locale" in texts["30-技术架构.md"]
      and "language: string" not in texts["30-技术架构.md"])
check("elite tile size aligned",
      "56 px 磁贴" in texts["10-玩法架构.md"] and "精英 56" in texts["40-美术与UX规范.md"])
check("fallback icon aligned",
      "mdi:application-outline" in texts["40-美术与UX规范.md"]
      and "mdi:application-outline" in texts["60-里程碑与验收.md"])
check("fire interval hard cap",
      "max(0.12, 0.8" in texts["10-玩法架构.md"] and "P-101" in texts["10-玩法架构.md"])
check("reducedMotion tri-state",
      "'system' | 'on' | 'off'" in texts["20-增益与局外成长.md"]
      and "'system' | 'on' | 'off'" in texts["30-技术架构.md"])
check("showHitbox setting UI",
      "显示判定点" in texts["40-美术与UX规范.md"]
      and "showHitbox" in texts["20-增益与局外成长.md"]
      and "showHitbox" in texts["30-技术架构.md"])
check("20 pending items consolidated",
      "P-02" not in texts["20-增益与局外成长.md"] and "BAL-04" in texts["20-增益与局外成长.md"])
check("30 system order defers to 10", "系统顺序以 `10 §1.3`" in texts["30-技术架构.md"])
check("30 loop drops backlog", "if (acc >= FIXED_DT) acc = 0" in texts["30-技术架构.md"])
check("30 2 Hz blink", "Math.floor(t * 4) % 2" in texts["30-技术架构.md"])
check("40 report example 863", "raw 552 × 倍率 1.5625 = 863" in texts["40-美术与UX规范.md"])
check("40 codex card count 117", "≤117" in texts["40-美术与UX规范.md"])
check("50 RAM cap 7–9", "| 高性能 | 1–2 | 2–3 | 2–4 | 5 | 7–9 | 2–4 |" in texts["50-数值与平衡.md"])
check("60 section refs",
      all(s in texts["60-里程碑与验收.md"] for s in
          ["`10 §5` 敌人", "`10 §6` 波次", "`10 §8` Boss", "`20 §3` 键帽", "`20 §6` 存档"])
      and not any(s in texts["60-里程碑与验收.md"] for s in
                  ["`10 §4` 敌人行为", "`10 §5` 波次", "`20 §4` 键帽", "`20 §8` 存档"]))
check("10 no duplicate M matrix", "| 1 | 1.00 | 1.00 | 1.30 | 1.60 |" not in texts["10-玩法架构.md"])
check("20 no duplicate fragment formula", "raw  = 0.5 × 击杀数" not in texts["20-增益与局外成长.md"])
check("spawn rule in Canon",
      "ADR-014" in texts["00-设计总纲.md"]
      and all(s in texts["00-设计总纲.md"] for s in ["可视安全区", "定点/绕行型"]))
check("spawn rule in 10",
      all(s in texts["10-玩法架构.md"] for s in
          ["出生位置（追击型）", "出生位置（定点/绕行型）", "可视安全区内"]))
check("no global offscreen spawn rule",
      "| 出生位置 | 屏幕外环" not in texts["10-玩法架构.md"]
      and "8 次失败排到队尾" not in texts["10-玩法架构.md"])
check("spawn rule synced in 30/60",
      "可视安全区" in texts["30-技术架构.md"]
      and "出生点边界" in texts["60-里程碑与验收.md"]
      and "spawner.test.ts" in texts["60-里程碑与验收.md"])
check("updater orbit matches safe area",
      "86 × 52 px" in texts["10-玩法架构.md"]
      and "D-35" in texts["10-玩法架构.md"]
      and "半径 160 px" not in texts["10-玩法架构.md"])
d_ids = re.findall(r"^\| `(D-\d+)`", texts["10-玩法架构.md"], flags=re.M)
check("unique D ids", len(d_ids) == len(set(d_ids)),
      ", ".join(sorted({x for x in d_ids if d_ids.count(x) > 1})))
check("no nonexistent spawnAnchor API", "spawnAnchor" not in "".join(texts.values()))

# v0.2.0 implementation-alignment invariants
STATUS = "M4 完成，M5/M6 部分"
check("status aligned across all docs", all(STATUS in t for t in texts.values()))

impl_files = [
    "src/main.ts", "src/game/run.ts", "src/game/spawner.ts", "src/game/boss.ts",
    "src/game/buffs.ts", "src/data/formulas.ts", "src/data/buffs.ts",
    "src/data/keycaps.ts", "src/data/styles.ts", "src/meta/save.ts",
    "src/meta/store.ts", "src/i18n/index.ts", "src/render/renderer.ts",
    "src/ui/ui.ts", "public/sw.js", "public/manifest.webmanifest",
]
check("implementation files exist", all((ROOT / p).is_file() for p in impl_files),
      ", ".join(p for p in impl_files if not (ROOT / p).is_file()))

pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
check("package scripts are documented set",
      set(pkg.get("scripts", {})) == {"dev", "build", "preview", "typecheck", "test"},
      str(sorted(pkg.get("scripts", {}))))
check("runtime dependencies empty", pkg.get("dependencies") == {}, str(pkg.get("dependencies")))
check("docs README commands",
      all(s in readme for s in ["npm install", "npm run dev", "npm test",
                                "npm run typecheck", "npm run build",
                                "python tools/check_docs.py"]))
check("docs README status vocabulary",
      all(s in readme for s in ["已实现", "部分实现", "计划"]))
check("icon pipeline marked planned",
      "（计划，当前未接入）" in texts["30-技术架构.md"]
      and "当前构建未接入" in texts["40-美术与UX规范.md"]
      and "当前可玩构建" in texts["00-设计总纲.md"]
      and "首字母磁贴" in texts["00-设计总纲.md"])
check("30 current font is system monospace", "系统等宽字体" in texts["30-技术架构.md"])
check("60 milestone table present",
      all(re.search(rf"\|\s*{m}\s*\|", texts["60-里程碑与验收.md"]) for m in
          ["M0", "M1", "M2", "M3", "M4", "M5", "M6"]))
check("test count documented", "22" in readme and "22" in texts["60-里程碑与验收.md"])

bad_current_paths = [
    "src/game/boss/*.ts", "src/data/waves.ts", "src/meta/economy.ts",
    "src/ui/screens/", "src/ecs/systems/", "src/core/hash.ts",
    "src/ui/tokens.css", "src/render/tokens.ts", "boot/loading.ts",
]
check("no nonexistent current paths",
      not any(p in t for t in texts.values() for p in bad_current_paths))

# changelogs keep only the latest change; detailed history lives in git
for f, t in texts.items():
    check(f"no historical version headings: {f}",
          not re.search(r"^## .*(变更记录|版本记录|更新记录|调参记录)", t, flags=re.M))
    m = re.search(r"^## \d+\. 最近改动\s*$", t, flags=re.M)
    if m:
        tail = t[m.end():]
        rows = [ln for ln in tail.splitlines()
                if ln.startswith("| v0.") or ln.startswith("| 2026-")]
        check(f"single latest changelog row: {f}", len(rows) == 1, str(len(rows)))
        check(f"latest changelog matches version: {f}",
              bool(rows) and current_version in rows[0])

# relative markdown links in docs + root README must resolve
root_readme = (ROOT / "README.md").read_text(encoding="utf-8")
for f, t in list(texts.items()) + [("ROOT README.md", root_readme)]:
    base = ROOT if f == "ROOT README.md" else DOCS
    for target in re.findall(r"\]\(([^)]+)\)", t):
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        clean = target.split("#", 1)[0]
        if not clean:
            continue
        check(f"link resolves: {f} -> {clean}", (base / clean).resolve().exists())

print()
if errors:
    print(f"{len(errors)} check(s) failed")
    sys.exit(1)
print("all checks passed")
