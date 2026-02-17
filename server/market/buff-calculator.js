/**
 * BuffCalculator — 일간 등락률(%) → 게임 버프/너프 변환기
 *
 * MARKET_BUFF_TIERS를 순서대로 탐색하여 매칭 티어를 결정하고,
 * MARKET_BUFF_CAP_DMG / MARKET_BUFF_CAP_SPD로 클램핑.
 */

const C = require('../constants');

const TIER_NAMES = {
  0: { en: 'SURGE',  ko: '급등' },
  1: { en: 'RISE',   ko: '상승' },
  2: { en: 'STABLE', ko: '보합' },
  3: { en: 'DIP',    ko: '하락' },
  4: { en: 'PLUNGE', ko: '급락' },
};

class BuffCalculator {
  /**
   * 일간 등락률로 팀 버프 계산
   * @param {number} changePercent - 일간 등락률 (예: 2.35)
   * @returns {{ damageModifier: number, speedModifier: number, tier: string, tierKo: string }}
   */
  calculate(changePercent) {
    const tiers = C.MARKET_BUFF_TIERS;
    let dmgMod = 0;
    let spdMod = 0;
    let tierIdx = 2; // default: STABLE

    for (let i = 0; i < tiers.length; i++) {
      if (changePercent >= tiers[i].minChange) {
        dmgMod = tiers[i].dmgMod;
        spdMod = tiers[i].spdMod;
        tierIdx = i;
        break;
      }
    }

    // 캡 클램핑
    dmgMod = Math.max(-C.MARKET_BUFF_CAP_DMG, Math.min(C.MARKET_BUFF_CAP_DMG, dmgMod));
    spdMod = Math.max(-C.MARKET_BUFF_CAP_SPD, Math.min(C.MARKET_BUFF_CAP_SPD, spdMod));

    const tierName = TIER_NAMES[tierIdx] || TIER_NAMES[2];

    return {
      damageModifier: dmgMod,
      speedModifier: spdMod,
      tier: tierName.en,
      tierKo: tierName.ko,
    };
  }

  /**
   * 두 팀의 버프를 한번에 계산
   * @param {number} samsungChange - 삼성전자 일간 등락률
   * @param {number} skhynixChange - SK하이닉스 일간 등락률
   * @returns {{ samsung: BuffResult, skhynix: BuffResult }}
   */
  calculateAll(samsungChange, skhynixChange) {
    return {
      samsung: this.calculate(samsungChange),
      skhynix: this.calculate(skhynixChange),
    };
  }
}

module.exports = BuffCalculator;
