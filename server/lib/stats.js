/** Price statistics used by the comparable-market stage. */

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

export function summarizePrices(values) {
  const prices = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  return {
    count: prices.length,
    min: Math.round(prices[0]),
    p25: Math.round(quantile(prices, 0.25)),
    median: Math.round(quantile(prices, 0.5)),
    p75: Math.round(quantile(prices, 0.75)),
    max: Math.round(prices[prices.length - 1]),
  };
}

export function percentileRank(values, target) {
  if (!values.length || !Number.isFinite(target)) return null;
  const below = values.filter((value) => value < target).length;
  const equal = values.filter((value) => value === target).length;
  return Math.round(((below + equal * 0.5) / values.length) * 100);
}

export function pctChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}
