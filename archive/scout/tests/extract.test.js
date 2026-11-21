import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCurrency,
  extractJsonLdNodes,
  extractOffersFromHtml,
  inferBeds,
  inferType,
  normalizeOffer,
  normalizeRentPeriod,
  parsePriceString,
} from '../server/agent/extract.js';

const FX = { EUR: 1, GBP: 1.17, USD: 0.92 };
const filters = {
  transaction: 'rent',
  types: ['apartment'],
  locations: ['Lagos'],
  regions: ['Algarve'],
  countries: ['Portugal'],
  bedsMin: 2,
  bedsMax: 3,
  budget: 2500,
};
const source = { id: 'src_fixture', name: 'Fixture Portal' };

test('extracts a real-estate listing from JSON-LD', () => {
  const html = `<html><head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        "name": "Two-bedroom apartment in Lagos marina",
        "url": "https://fixture.example/listing/1",
        "numberOfRooms": 2,
        "floorSize": { "@type": "QuantitativeValue", "value": 92 },
        "offers": { "@type": "Offer", "price": "1750", "priceCurrency": "EUR" },
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Lagos",
          "addressRegion": "Algarve",
          "addressCountry": "Portugal"
        }
      }
    </script>
  </head><body></body></html>`;
  const candidates = extractOffersFromHtml(html, { source, url: 'https://fixture.example/listing/1', filters, fx: FX });
  assert.equal(candidates.length, 1);
  const { offer, reason } = normalizeOffer(candidates[0], { source, filters, fx: FX });
  assert.equal(reason, null);
  assert.ok(offer);
  assert.equal(offer.title, 'Two-bedroom apartment in Lagos marina');
  assert.equal(offer.price_eur, 1750);
  assert.equal(offer.city, 'Lagos');
  assert.equal(offer.region, 'Algarve');
  assert.equal(offer.type, 'apartment');
  assert.equal(offer.bedrooms, 2);
  assert.equal(offer.area_m2, 92);
  assert.equal(offer.source_id, 'src_fixture');
});

test('JSON-LD graph and arrays are traversed', () => {
  const html = `<script type="application/ld+json">
    { "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", "name": "Fixture" },
      { "@type": "Product", "name": "Villa in Tavira", "offers": { "price": 650000, "priceCurrency": "EUR" } }
    ]}
  </script>`;
  const nodes = extractJsonLdNodes(html);
  assert.ok(nodes.some((node) => node.title === 'Villa in Tavira'));
  assert.equal(nodes.find((node) => node.title === 'Villa in Tavira').price, 650000);
});

test('falls back to OpenGraph price metadata', () => {
  const html = `<html><head>
    <meta property="og:title" content="Sea-view apartment in Lagos">
    <meta property="og:description" content="Two bedroom, 88 m2, near the marina.">
    <meta property="product:price:amount" content="1620">
    <meta property="product:price:currency" content="EUR">
  </head></html>`;
  const candidates = extractOffersFromHtml(html, { source, url: 'https://fixture.example/2', filters, fx: FX });
  assert.equal(candidates.length, 1);
  const { offer } = normalizeOffer(candidates[0], { source, filters, fx: FX });
  assert.ok(offer);
  assert.equal(offer.price_eur, 1620);
  assert.equal(offer.bedrooms, 2);
  assert.equal(offer.area_m2, 88);
});

test('falls back to visible title and price text', () => {
  const html = `<html><body><h1>Two bedroom apartment in Lagos</h1><p>Sea views. €1,700 per month. 90 m².</p></body></html>`;
  const candidates = extractOffersFromHtml(html, { source, url: 'https://fixture.example/3', filters, fx: FX });
  assert.equal(candidates.length, 1);
  const { offer } = normalizeOffer(candidates[0], { source, filters, fx: FX });
  assert.ok(offer);
  assert.equal(offer.price_eur, 1700);
  assert.equal(offer.city, 'Lagos');
});

test('converts weekly and annual rents to monthly amounts', () => {
  assert.deepEqual(normalizeRentPeriod(500, '€500 per week'), { price: 2167, period: 'month', adjusted: 'weekly' });
  assert.deepEqual(normalizeRentPeriod(18_000, '€18,000 per year'), { price: 1500, period: 'month', adjusted: 'annual' });
  assert.deepEqual(normalizeRentPeriod(1500, '€1,500 per month'), { price: 1500, period: 'month', adjusted: null });
});

test('normalises currencies, periods and unsupported records', () => {
  const { offer } = normalizeOffer(
    {
      title: 'Two-bed apartment in Lagos',
      price: 1300,
      currency: 'GBP',
      transaction: 'rent',
      type: 'apartment',
      city: 'Lagos',
      bedrooms: 2,
      area_m2: 90,
    },
    { source, filters, fx: FX }
  );
  assert.ok(offer);
  assert.equal(offer.price, 1300);
  assert.equal(offer.price_eur, 1521);
  assert.equal(offer.period, 'month');
  assert.equal(offer.currency, 'GBP');

  const missingPrice = normalizeOffer({ title: 'Lagos apartment', type: 'apartment', city: 'Lagos' }, { source, filters, fx: FX });
  assert.equal(missingPrice.offer, null);
  assert.equal(missingPrice.reason, 'missing_price');

  const implausible = normalizeOffer(
    { title: 'Lagos apartment', type: 'apartment', city: 'Lagos', price: 9, currency: 'EUR' },
    { source, filters, fx: FX }
  );
  assert.equal(implausible.reason, 'price_out_of_range');
});

test('price and content heuristics parse common portal formats', () => {
  assert.equal(parsePriceString('€1,750 per month'), 1750);
  assert.equal(parsePriceString('£2.5k'), 2500);
  assert.equal(parsePriceString('USD 3,200'), 3200);
  assert.equal(detectCurrency('£1,750'), 'GBP');
  assert.equal(detectCurrency('$2,000'), 'USD');
  assert.equal(inferBeds('3-bedroom townhouse'), 3);
  assert.equal(inferBeds('T2 apartment'), 2);
  assert.equal(inferType('Sea view flat'), 'apartment');
  assert.equal(inferType('Detached villa with pool'), 'villa');
});
