import { test } from 'node:test'
import assert from 'node:assert/strict'
import { externalDestination } from './externalLinks'
const base = 'https://goblincwl.site/Memo/note'
test('external destinations include subdomains, protocol-relative URLs and disguised hosts', () => {
  for (const href of ['https://example.com/a?b=1#c', '//drive.goblincwl.site/a', 'https://goblincwl.site.evil/a', 'https://goblincwl.site@example.com/a', 'https://user@goblincwl.site/a']) {
    assert.equal(externalDestination(href, base)?.href, new URL(href, base).href)
  }
})
test('site routes and application protocols keep native navigation', () => {
  for (const href of ['', '#heading', '/Repo/project', '../note', 'https://goblincwl.site/a', 'http://goblincwl.site/a', 'mailto:a@example.com', 'obsidian://open?vault=notes', 'tel:123', 'blob:https://example.com/abc', 'javascript:void(0)', 'https://[invalid']) {
    assert.equal(externalDestination(href, base), undefined, href)
  }
})
