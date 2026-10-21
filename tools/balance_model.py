#!/usr/bin/env python3
"""DesktopWar balance model (v0.2, design-time sanity check).

Not shipped code: used to generate the tables in docs/50-数值与平衡.md.
All canon formulas mirror docs/00-设计总纲.md §7.3/§7.8.

Run:  PYTHONIOENCODING=utf-8 python tools/balance_model.py
"""
from math import floor
import random

DIFFS = {
    "eco":         {"cn": "节能", "D": 1.00, "disks": 3},
    "balanced":    {"cn": "平衡", "D": 1.30, "disks": 4},
    "performance": {"cn": "高性能", "D": 1.60, "disks": 5},
}
DISK_LETTERS = ["C", "D", "E", "F", "G"]

PLAYER_DPS0 = 10 / 0.8          # 12.5
NORMAL_HP0, NORMAL_DMG0 = 30, 1
ELITE_HP0, ELITE_DMG0 = 90, 2
BOSS_HP0, BOSS_DMG0 = 600, 2
WAVES = [(3, 0), (5, 0), (4, 1)]  # (normal count, elite count)
UPTIME = 0.70
WAVE_GAP = 3.0                  # seconds of spawn/transition per folder
MENU_GAP = 2.0                  # buff pick + transition per folder


def K(d):
    return 1 + 0.32 * (d - 1) + 0.08 * (d - 1) ** 2


def M(d, diff):
    return K(d) * DIFFS[diff]["D"]


def normal_hp(d, diff):
    return NORMAL_HP0 * M(d, diff)


def normal_dmg(d, diff):
    return min(2, 1 + floor((M(d, diff) - 1) / 2.0))


def elite_hp(d, diff):
    return ELITE_HP0 * M(d, diff)


def elite_dmg(d, diff):
    return min(3, 2 + floor((M(d, diff) - 1) / 2.5))


def boss_hp(d, diff):
    return BOSS_HP0 * M(d, diff)


def boss_dmg(d, diff):
    return min(4, 2 + floor((M(d, diff) - 1) / 2.0))


def spawn_count(base, d, diff):
    return round(base * (0.85 + 0.15 * M(d, diff)))


def buff_power(folder_picks, boss_picks,
               common=1.06, rare=1.10, legendary=1.15):
    """Expected raw-DPS growth. Rarity 6:3:1 per folder pick."""
    per = 0.6 * common + 0.3 * rare + 0.1 * legendary
    return per ** folder_picks * legendary ** boss_picks


def fmt(x, n=0):
    return f"{x:,.{n}f}"


print("== 敌人缩放表 ==")
print("| 难度 | 磁盘 | K | M | 小怪HP | 小怪伤害 | 精英HP | 精英伤害 | BossHP | Boss伤害 | 刷新量 W1/W2/W3 |")
print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for diff, cfg in DIFFS.items():
    for d in range(1, cfg["disks"] + 1):
        letter = DISK_LETTERS[d - 1]
        print(f"| {cfg['cn']} | {letter}: | {K(d):.2f} | {M(d,diff):.2f} | "
              f"{fmt(normal_hp(d,diff))} | {normal_dmg(d,diff)} | {fmt(elite_hp(d,diff))} | "
              f"{elite_dmg(d,diff)} | {fmt(boss_hp(d,diff))} | {boss_dmg(d,diff)} | "
              f"{spawn_count(3,d,diff)}/{spawn_count(5,d,diff)}/{spawn_count(4,d,diff)}+1 |")

print("\n== 运行时间模型（命中率/输出窗口 70%，含刷怪与选卡过场）==")
print("| 难度 | 磁盘 | 进入时 buff | 小怪 TTK（首/末） | 单文件夹估时 | Boss TTK | 该层估时 |")
print("| --- | --- | --- | --- | --- | --- | --- |")
for diff, cfg in DIFFS.items():
    folder_picks = 0
    boss_picks = 0
    total = 0.0
    for d in range(1, cfg["disks"] + 1):
        layer_time = 0.0
        folder_times = []
        for i in range(1, 6):
            power = buff_power(folder_picks + (i - 1), boss_picks)
            dps = PLAYER_DPS0 * power * UPTIME
            wave_hp = 0.0
            for base, elites in WAVES:
                wave_hp += normal_hp(d, diff) * spawn_count(base, d, diff) + elite_hp(d, diff) * elites
            t = wave_hp / dps + WAVE_GAP + MENU_GAP
            folder_times.append(t)
            layer_time += t
        power_boss = buff_power(folder_picks + 5, boss_picks)
        boss_time = boss_hp(d, diff) / (PLAYER_DPS0 * power_boss * UPTIME)
        layer_time += boss_time + 3.0
        ttk_first = normal_hp(d, diff) / (PLAYER_DPS0 * buff_power(folder_picks, boss_picks))
        ttk_last = normal_hp(d, diff) / (PLAYER_DPS0 * buff_power(folder_picks + 4, boss_picks))
        print(f"| {cfg['cn']} | {DISK_LETTERS[d-1]}: | {folder_picks} | "
              f"{ttk_first:.2f}s / {ttk_last:.2f}s | {sum(folder_times)/5:.0f}s | {boss_time:.0f}s | "
              f"{layer_time/60:.1f}min |")
        total += layer_time
        folder_picks += 5
        boss_picks += 1
    print(f"| **{cfg['cn']} 合计** | | | | | | **{total/60:.1f}min** |")

print("\n== 碎片经济（满通关，5 个无伤文件夹）==")
print("| 难度 | 磁盘 | 击杀估 | 文件夹 | Boss | raw | 碎片 | 折合抽数 |")
print("| --- | --- | --- | --- | --- | --- | --- | --- |")
for diff, cfg in DIFFS.items():
    folders = cfg["disks"] * 5
    bosses = cfg["disks"]
    kills = sum(
        sum(spawn_count(b, d, diff) + e for b, e in WAVES) * 5
        for d in range(1, cfg["disks"] + 1)
    ) + 60 * cfg["disks"]
    raw = 0.5 * kills + 8 * folders + 30 * bosses + 50 * cfg["disks"]
    frag = floor(raw * cfg["D"] * 1.25 * 1.25)
    print(f"| {cfg['cn']} | {cfg['disks']} | {fmt(kills)} | {folders} | {bosses} | "
          f"{fmt(raw)} | {fmt(frag)} | {frag/200:.1f} |")

print("\n== 键帽抽取：集齐 87 键所需抽数（蒙特卡洛 5000 次，含 50 抽传奇保底）==")
COUNTS = {"common": 60, "rare": 24, "legendary": 3}
RATES = {"common": 0.70, "rare": 0.25, "legendary": 0.05}


def simulate_once():
    owned = {k: 0 for k in COUNTS}
    draws = 0
    since_leg = 0
    while any(owned[k] < COUNTS[k] for k in COUNTS):
        draws += 1
        since_leg += 1
        r = random.random()
        if since_leg >= 50:
            rarity = "legendary"
        elif r < RATES["common"]:
            rarity = "common"
        elif r < RATES["common"] + RATES["rare"]:
            rarity = "rare"
        else:
            rarity = "legendary"
        if owned[rarity] < COUNTS[rarity]:
            owned[rarity] += 1
        if rarity == "legendary":
            since_leg = 0
    return draws


random.seed(7)
runs = sorted(simulate_once() for _ in range(5000))
median = runs[2500]
print(f"中位抽数: {median}, 10% 分位: {runs[500]}, 90% 分位: {runs[4500]}")
print(f"按单抽 200 碎片计，中位成本: {median*200:,} 碎片")
for diff, cfg in DIFFS.items():
    folders = cfg["disks"] * 5
    bosses = cfg["disks"]
    kills = sum(
        sum(spawn_count(b, d, diff) + e for b, e in WAVES) * 5
        for d in range(1, cfg["disks"] + 1)
    ) + 60 * cfg["disks"]
    raw = 0.5 * kills + 8 * folders + 30 * bosses + 50 * cfg["disks"]
    frag = floor(raw * cfg["D"] * 1.25 * 1.25)
    print(f"{cfg['cn']}: 每局碎片 {frag}, 纯碎片毕业约需 {median*200/frag:.1f} 局"
          f"（不含局内掉落与重复补偿）")

print("\n== 增益强度预算 ==")
print("| 难度 | 文件夹抽取 | 传奇抽取 | 期望 DPS 倍率 |")
print("| --- | --- | --- | --- |")
for diff, cfg in DIFFS.items():
    folders = cfg["disks"] * 5
    bosses = cfg["disks"]
    print(f"| {cfg['cn']} | {folders} | {bosses} | {buff_power(folders, bosses):.2f}x |")
