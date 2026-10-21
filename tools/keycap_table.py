#!/usr/bin/env python3
"""Generate + validate the 87-key table shown in docs/20-增益与局外成长.md.

Design-time helper only. Run:
  python tools/keycap_table.py
"""
from pathlib import Path
from math import exp

# (row, label, id, rarity, stat, points)
KEYS = []


def add(row, label, kid, rarity, stat):
    points = {"common": 1, "rare": 2, "legendary": 4}[rarity]
    KEYS.append((row, label, kid, rarity, stat, points))


# ---- F 区 (16)
add("F 区", "Esc", "key.escape", "legendary", "atk")
for i in range(1, 6):
    add("F 区", f"F{i}", f"key.f{i}", "rare", "atk")
for i in range(6, 13):
    add("F 区", f"F{i}", f"key.f{i}", "common", "as")
add("F 区", "PrtSc", "key.print_screen", "rare", "mov")
add("F 区", "ScrLk", "key.scroll_lock", "rare", "mov")
add("F 区", "Pause", "key.pause", "rare", "mov")

# ---- 数字区 (14)
add("数字区", "`", "key.backquote", "common", "mov")
for i in range(1, 10):
    add("数字区", str(i), f"key.digit{i}", "common", "atk")
add("数字区", "0", "key.digit0", "common", "atk")
add("数字区", "-", "key.minus", "common", "mov")
add("数字区", "=", "key.equal", "common", "mov")
add("数字区", "Backspace", "key.backspace", "rare", "atk")

# ---- QWERTY 行 (14)
add("QWERTY", "Tab", "key.tab", "rare", "atk")
for ch in "QWERTYUIOP":
    add("QWERTY", ch, f"key.{ch.lower()}", "common", "atk")
add("QWERTY", "[", "key.bracket_left", "common", "as")
add("QWERTY", "]", "key.bracket_right", "common", "as")
add("QWERTY", "\\", "key.backslash", "common", "as")

# ---- 主键区 (13)
add("主键区", "Caps", "key.caps_lock", "rare", "atk")
for ch in "ASDFGHJKL":
    add("主键区", ch, f"key.{ch.lower()}", "common", "atk")
add("主键区", ";", "key.semicolon", "common", "atk")
add("主键区", "'", "key.quote", "common", "atk")
add("主键区", "Enter", "key.enter", "legendary", "as")

# ---- 下档区 (12)
add("下档区", "LShift", "key.shift_left", "rare", "atk")
for ch in "ZXCVBNM":
    add("下档区", ch, f"key.{ch.lower()}", "common", "atk")
add("下档区", ",", "key.comma", "common", "atk")
add("下档区", ".", "key.period", "common", "atk")
add("下档区", "/", "key.slash", "common", "mov")
add("下档区", "RShift", "key.shift_right", "rare", "atk")

# ---- 底行 (12)
add("底行", "LCtrl", "key.ctrl_left", "rare", "as")
add("底行", "LWin", "key.meta_left", "rare", "as")
add("底行", "LAlt", "key.alt_left", "rare", "atk")
add("底行", "Space", "key.space", "legendary", "mov")
add("底行", "RAlt", "key.alt_right", "rare", "atk")
add("底行", "RWin", "key.meta_right", "rare", "as")
add("底行", "Menu", "key.menu", "rare", "mov")
add("底行", "RCtrl", "key.ctrl_right", "rare", "as")
add("底行", "↑", "key.arrow_up", "rare", "atk")
add("底行", "←", "key.arrow_left", "rare", "atk")
add("底行", "↓", "key.arrow_down", "rare", "atk")
add("底行", "→", "key.arrow_right", "rare", "atk")

# ---- 导航区 (6)
for label, kid in [
    ("Insert", "key.insert"),
    ("Home", "key.home"),
    ("PgUp", "key.page_up"),
    ("Delete", "key.delete"),
    ("End", "key.end"),
    ("PgDn", "key.page_down"),
]:
    add("导航区", label, kid, "common", "mov")

STAT_CN = {"atk": "攻击", "as": "攻速", "mov": "移速"}
POINT_VALUE = {"atk": 0.20, "as": 0.12, "mov": 0.15}
CAP = {"atk": 18.0, "as": 12.0, "mov": 10.0}
SET_BONUS = {"atk": 3.0, "mov": 6.0, "as": 0.0}

assert len(KEYS) == 87, len(KEYS)
for rarity, expected in [("common", 60), ("rare", 24), ("legendary", 3)]:
    got = sum(1 for k in KEYS if k[3] == rarity)
    assert got == expected, (rarity, got)
assert len({k[2] for k in KEYS}) == 87

rows = []
for row, label, kid, rarity, stat, points in KEYS:
    val = POINT_VALUE[stat] * points
    rows.append(
        f"| {row} | {label} | `{kid}` | {rarity} | {STAT_CN[stat]} +{val:.2f}% |"
    )

table = "\n".join(rows)

raw = {s: 0.0 for s in ("atk", "as", "mov")}
for _, _, _, _, stat, points in KEYS:
    raw[stat] += POINT_VALUE[stat] * points

lines = ["| 属性 | 87 键 raw | 套装追加 | 软上限 cap | 实际生效 |", "| --- | --- | --- | --- | --- |"]
for s in ("atk", "as", "mov"):
    eff = CAP[s] * (1 - exp(-raw[s] / CAP[s]))
    total = eff + SET_BONUS[s]
    lines.append(
        f"| {STAT_CN[s]} | {raw[s]:.2f}% | +{SET_BONUS[s]:.2f}% | {CAP[s]:.0f}% | **{total:.2f}%** |"
    )
eff_atk = CAP["atk"] * (1 - exp(-raw["atk"] / CAP["atk"])) + SET_BONUS["atk"]
eff_as = CAP["as"] * (1 - exp(-raw["as"] / CAP["as"])) + SET_BONUS["as"]
eff_mov = CAP["mov"] * (1 - exp(-raw["mov"] / CAP["mov"])) + SET_BONUS["mov"]
dps = (1 + eff_atk / 100) * (1 + eff_as / 100)
lines.append(f"| **综合** | — | — | — | **DPS ×{dps:.3f}（+{(dps-1)*100:.1f}%）· 移速 +{eff_mov:.2f}%** |")
summary = "\n".join(lines)

path = Path(__file__).resolve().parent.parent / "docs" / "20-增益与局外成长.md"
text = path.read_text(encoding="utf-8")
ids_in_doc = {f"`{kid}`" for _, _, kid, _, _, _ in KEYS}
rows_in_doc = [line for line in text.splitlines() if line.startswith("| ") and "`key." in line]
assert len(rows_in_doc) == 87, f"doc rows = {len(rows_in_doc)}, expected 87"
missing = [kid for kid in ids_in_doc if kid not in text]
assert not missing, f"missing key ids in doc: {missing[:5]}"
assert "DPS ×1.159" in text or "DPS ×1.159" in text.replace("**", ""), "summary DPS missing"

print("===KEYCAP_TABLE_START===")
print(table)
print("===KEYCAP_TABLE_END===")
print("===KEYCAP_SUMMARY_START===")
print(summary)
print("===KEYCAP_SUMMARY_END===")

print("OK: 87 keys validated against docs/20")
print(f"raw atk/as/mov = {raw['atk']:.2f}% / {raw['as']:.2f}% / {raw['mov']:.2f}%")
print(f"eff atk/as/mov = {eff_atk:.2f}% / {eff_as:.2f}% / {eff_mov:.2f}% ; DPS x{dps:.3f}")
print(f"target doc = {path}")
