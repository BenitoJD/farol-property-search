function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = String(value);
  if (/^[=+@\t\r]/.test(text) || /^-\D/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function priceBasis(property) {
  return property.transaction === 'rent' ? 'per month' : 'total';
}

/**
 * Single-table CSV designed to open cleanly in Excel. Contains one portfolio
 * row per benchmarked listing plus one row per unique market offer.
 */
export function buildReportCsv(report) {
  const headers = [
    'Record type',
    'Property ref',
    'Property title',
    'Property city',
    'Property ask (EUR)',
    'Price basis',
    'Market p25 (EUR)',
    'Market median (EUR)',
    'Market p75 (EUR)',
    'Market verdict',
    'Position vs median (%)',
    'Comparables',
    'Recommended ask (EUR)',
    'Offer title',
    'Source',
    'Offer type',
    'Offer bedrooms',
    'Offer area (m2)',
    'Offer ask (EUR)',
    'Offer currency',
    'Offer original ask',
    'Match type',
    'Delta vs property (EUR)',
    'Delta vs property (%)',
    'Confidence',
    'Property URL',
    'Listing URL',
  ];
  const rows = [headers];
  const positionsByRef = new Map(report.positions.map((position) => [position.property.ref, position]));

  for (const position of report.positions) {
    const property = position.property;
    rows.push([
      'Portfolio',
      property.ref,
      property.title,
      property.city,
      property.price,
      priceBasis(property),
      position.market?.p25 ?? '',
      position.market?.median ?? '',
      position.market?.p75 ?? '',
      position.verdict,
      position.deltaPct ?? '',
      position.comparableCount,
      position.recommendedPrice ?? '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      property.url,
      '',
    ]);
  }

  for (const offer of report.offers) {
    const position = offer.comparison?.propertyRef
      ? positionsByRef.get(offer.comparison.propertyRef)
      : null;
    const property = position?.property;
    rows.push([
      'Offer',
      property?.ref ?? offer.comparison?.propertyRef ?? '',
      property?.title ?? '',
      offer.city,
      property?.price ?? '',
      property ? priceBasis(property) : '',
      position?.market?.p25 ?? '',
      position?.market?.median ?? '',
      position?.market?.p75 ?? '',
      position?.verdict ?? '',
      offer.comparison?.deltaPct ?? '',
      position?.comparableCount ?? '',
      position?.recommendedPrice ?? '',
      offer.title,
      offer.source?.name || '',
      offer.type,
      offer.bedrooms ?? '',
      offer.area_m2 ?? '',
      offer.price_eur,
      offer.currency,
      offer.price,
      offer.comparison?.kind || 'market only',
      offer.comparison?.deltaAbs ?? '',
      offer.comparison?.deltaPct ?? '',
      offer.confidence,
      property?.url ?? '',
      offer.url,
    ]);
  }

  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
