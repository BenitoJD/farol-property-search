/** Fixed-rate FX conversion. Rates express "EUR per unit of currency". */
export function convertToEur(amount, currency, fx) {
  const rate = fx[String(currency || 'EUR').toUpperCase()];
  if (!Number.isFinite(rate)) return null;
  const result = Number(amount) * rate;
  if (!Number.isFinite(result)) return null;
  return Math.round(result);
}

export function normalizeCurrency(code) {
  const value = String(code || 'EUR').toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : 'EUR';
}

export function formatMoney(amount, currency = 'EUR', { compact = false } = {}) {
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: compact && Math.abs(amount) >= 10000 ? 'compact' : 'standard',
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString('en-GB')} ${currency}`;
  }
}
