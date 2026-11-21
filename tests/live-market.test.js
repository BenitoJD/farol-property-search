import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImovirtualSearchHtml, searchUrlForSubject } from '../server/agent/live-market.js';

test('builds the live market search URL from the subject', () => {
  assert.equal(
    searchUrlForSubject({ transaction: 'rent', type: 'apartment', city: 'Lagos' }),
    'https://www.imovirtual.com/pt/resultados/arrendar/apartamento/faro/lagos'
  );
  assert.equal(
    searchUrlForSubject({ transaction: 'sale', type: 'villa', city: 'Tavira' }),
    'https://www.imovirtual.com/pt/resultados/comprar/moradia/faro/tavira'
  );
  assert.match(
    searchUrlForSubject({ transaction: 'rent', type: 'apartment', city: 'Lisbon' }),
    /\/lisboa\/lisboa$/
  );
});

test('parses the live search page listing payload', () => {
  const payload = {
    props: {
      pageProps: {
        data: {
          searchAds: {
            items: [
              { id: 1, title: 'T2 Lagos', totalPrice: { value: 1400, currency: 'EUR' } },
              { id: 2, title: 'T3 Lagos', totalPrice: { value: 1850, currency: 'EUR' } },
            ],
          },
        },
      },
    },
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">${JSON.stringify(
    payload
  )}</script></html>`;
  const items = parseImovirtualSearchHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'T2 Lagos');
  assert.equal(items[1].totalPrice.value, 1850);
});

test('rejects a live page without the structured payload', () => {
  assert.throws(() => parseImovirtualSearchHtml('<html>challenge</html>'), /structured data payload|malformed/i);
  assert.throws(
    () => parseImovirtualSearchHtml('<script id="__NEXT_DATA__">not json</script>'),
    /malformed/i
  );
});
