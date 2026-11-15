import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faviconNeedsPadding } from './favicon'
test('standalone transparent marks get padding; full tiles including rounded corners stay full bleed', () => {
  const size = 32, pixels = new Uint8ClampedArray(size * size * 4)
  for (let y = 5; y < 27; y++) for (let x = 5; x < 27; x++) pixels[(y * size + x) * 4 + 3] = 255
  assert.equal(faviconNeedsPadding(pixels, size), true)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    pixels[(y * size + x) * 4 + 3] = (x < 3 || x > 28) && (y < 3 || y > 28) ? 0 : 255
  }
  assert.equal(faviconNeedsPadding(pixels, size), false)
})

test('configured favicon matches exact host and preserves the full URL with fallback candidates', async () => {
  const { faviconCandidates } = await import('./favicon')
  const mapping = 'www.travellings.cn=https://www.travellings.cn/assets/favicon.png?a=1\nexample.com=javascript:alert(1)'
  assert.deepEqual(faviconCandidates(new URL('https://www.travellings.cn/path'), mapping), [
    'https://www.travellings.cn/assets/favicon.png?a=1', 'https://www.travellings.cn/favicon.ico', 'https://www.travellings.cn/favicon.png',
  ])
  assert.deepEqual(faviconCandidates(new URL('https://travellings.cn'), mapping), ['https://travellings.cn/favicon.ico', 'https://travellings.cn/favicon.png'])
  assert.deepEqual(faviconCandidates(new URL('https://example.com'), mapping), ['https://example.com/favicon.ico', 'https://example.com/favicon.png'])
})
