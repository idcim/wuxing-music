"""生日 → 农历 / 生肖 / 本命五行。

放在后端算而不是前端，有两个原因：
  1. 小程序 16 个页面全在主包（无 subPackages），农历库约 200-300KB 会直接吃 2MB 主包额度；
  2. 小程序 / H5 / 管理后台三处都要显示，后端算一次三处口径必然一致。

依赖 lunar-python（与前端生态的 lunar-javascript 同作者、API 同构，无第三方依赖）。
"""
from __future__ import annotations

from datetime import date

# 天干 → 五行。值域与前端 ElementId（木/火/土/金/水）完全一致，
# 前端可直接拿它去 WUXING 里取配色。
GAN_WUXING: dict[str, str] = {
    "甲": "木", "乙": "木",
    "丙": "火", "丁": "火",
    "戊": "土", "己": "土",
    "庚": "金", "辛": "金",
    "壬": "水", "癸": "水",
}

# 晚子时（23:00-23:59）的日柱归属在命理上有两派，lunar 用 sect 区分：
#   sect=1 归次日、sect=2 归当日。**库的默认值是 2**。
# 这里显式写死 2，理由：
#   - 与用户填的公历日期保持一致，不会出现「补填了时辰、本命五行就变了」的意外；
#   - 显式设定后，日后升级库改了默认值也不会悄悄改变老用户的本命五行。
# 时辰真正的价值在于凑齐四柱（时柱），而不是改日柱。
_SECT = 2

# 未填时辰时用来占位的钟点。取正午而非 0 点，避开子时跨日的边界。
_DEFAULT_HOUR = 12


def wuxing_of_gan(gan: str) -> str:
    """天干 → 五行；未知天干返回空串。"""
    return GAN_WUXING.get(gan, "")


def lunar_info(birthday: date | None, birth_hour: int | None = None) -> dict | None:
    """把公历生日换算成农历信息；未填生日返回 None。

    birth_hour 为 0-23 的钟点（可空）。填了才给完整四柱——
    不填就只有三柱，硬凑一个时柱等于编数据。
    """
    if not birthday:
        return None

    try:
        from lunar_python import Solar
    except ImportError:  # pragma: no cover
        return None

    has_hour = birth_hour is not None and 0 <= birth_hour <= 23
    hour = birth_hour if has_hour else _DEFAULT_HOUR

    try:
        solar = Solar.fromYmdHms(birthday.year, birthday.month, birthday.day, hour, 0, 0)
        lunar = solar.getLunar()
        ec = lunar.getEightChar()
        ec.setSect(_SECT)

        day_gz = ec.getDay()          # 日柱，如「丙申」
        day_gan = day_gz[0] if day_gz else ""

        return {
            # 「庚子年闰四月初二」——闰月由 getMonthInChinese 自带「闰」前缀
            "date": f"{lunar.getYearInGanZhi()}年{lunar.getMonthInChinese()}月{lunar.getDayInChinese()}",
            # 生肖用**春节口径**（getYearShengXiao），不是立春口径。
            # 民间说「正月初二出生属鼠」用的就是春节口径；立春口径是八字排年柱用的，
            # 两者在春节到立春之间会差一个生肖（如 2020-01-26：春节口径鼠、立春口径猪）。
            # 别改成 getYearShengXiaoByLiChun，那会让用户觉得生肖算错了。
            "shengXiao": lunar.getYearShengXiao(),
            "dayGan": day_gan,
            "element": wuxing_of_gan(day_gan),
            # 四柱仅在填了时辰时给出（年 月 日 时）
            "eightChar": (
                f"{ec.getYear()} {ec.getMonth()} {day_gz} {ec.getTime()}"
                if has_hour else None
            ),
        }
    except Exception:  # noqa: BLE001
        # 农历换算失败不该拖垮「读资料」这种主流程，降级成不显示
        return None
