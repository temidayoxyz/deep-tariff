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
  'rates': '{input} / {output}',
  'tooltip.hours': '高峰时段（{zone}）：{windows}',
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
  'rates': '{input} / {output}',
  'tooltip.hours': 'Peak hours ({zone}): {windows}',
  'tooltip.rates': 'Cache hit {cacheHit} · miss {cacheMiss} · output {output}',
  'tooltip.next': 'Next: {next} at {time}',
  'strip.aria': 'DeepSeek tariff: {summary}',
  'windows.sep': ', ',
}

/** Key domain of the `deepTariff` namespace (zh is the source of truth). */
export type DeepTariffKey = keyof typeof zh
