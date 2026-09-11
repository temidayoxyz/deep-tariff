/** `deepTariff` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deepTariff'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'window.peak': '高峰',
  'window.offPeak': '非高峰',
  'next.peak': '高峰',
  'next.offPeak': '非高峰',
  'remaining.hm': '{hours}小时{minutes}分后进入{next}',
  'remaining.ms': '{minutes}分{seconds}秒后进入{next}',
  'remaining.s': '{seconds}秒后进入{next}',
  'model.flash': 'Flash',
  'model.pro': 'Pro',
  'cue.peakSoon': '即将高峰',
  'spend': '本会话 {amount}',
  'balance': '剩余 {amount}',
  'tooltip.spend': '本会话估算 {amount} · 未命中 {uncached} · 命中 {cached} · 输出 {output}',
  'tooltip.balance': '账户剩余 {total}（{currency}）· 赠金 {granted} · 充值 {toppedUp}',
  'tooltip.balance.unavailable': '账户余额不足，无法继续调用',
  'weekday.sun': '周日',
  'weekday.mon': '周一',
  'weekday.tue': '周二',
  'weekday.wed': '周三',
  'weekday.thu': '周四',
  'weekday.fri': '周五',
  'weekday.sat': '周六',
  'rates': '{input} / {output}',
  'tooltip.hours': '高峰时段（{zone}，UTC 周一至周五）：{windows}',
  'tooltip.rates': '缓存命中 {cacheHit} · 未命中 {cacheMiss} · 输出 {output}',
  'tooltip.next': '下一时段：{next}（{time}）',
  'strip.aria': 'DeepSeek 计费：{summary}',
  'windows.sep': '、',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<DeepTariffKey, string> = {
  'window.peak': 'Peak',
  'window.offPeak': 'Off-peak',
  'next.peak': 'peak',
  'next.offPeak': 'off-peak',
  'remaining.hm': '{hours}h {minutes}m until {next}',
  'remaining.ms': '{minutes}m {seconds}s until {next}',
  'remaining.s': '{seconds}s until {next}',
  'model.flash': 'Flash',
  'model.pro': 'Pro',
  'cue.peakSoon': 'peak soon',
  'spend': 'this chat {amount}',
  'balance': '{amount} left',
  'tooltip.spend': 'This chat (estimate) {amount} · miss {uncached} · hit {cached} · out {output}',
  'tooltip.balance': 'Account remaining {total} ({currency}) · granted {granted} · topped up {toppedUp}',
  'tooltip.balance.unavailable': 'Account has no remaining credit',
  'weekday.sun': 'Sun',
  'weekday.mon': 'Mon',
  'weekday.tue': 'Tue',
  'weekday.wed': 'Wed',
  'weekday.thu': 'Thu',
  'weekday.fri': 'Fri',
  'weekday.sat': 'Sat',
  'rates': '{input} / {output}',
  'tooltip.hours': 'Peak hours ({zone}; UTC Mon–Fri): {windows}',
  'tooltip.rates': 'Cache hit {cacheHit} · miss {cacheMiss} · output {output}',
  'tooltip.next': 'Next: {next} at {time}',
  'strip.aria': 'DeepSeek tariff: {summary}',
  'windows.sep': ', ',
}

/** Key domain of the `deepTariff` namespace (zh is the source of truth). */
export type DeepTariffKey = keyof typeof zh
