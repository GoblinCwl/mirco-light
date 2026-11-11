import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectReference, projectSlug } from './projectReference'

test('same-site project references preserve navigation but normalize graph identities', () => {
  for (const route of ['Repo/CwlWeb', 'Video/BV1ua4W6XEJd', 'Share/分享/测试资料']) {
    const encoded = route.split('/').map(encodeURIComponent).join('/')
    for (const href of [`https://goblincwl.site/${route}`, `https://goblincwl.site/${encoded}/`, `/${encoded}`, `//goblincwl.site/${encoded}`]) {
      assert.deepEqual(projectReference(href, 'goblincwl.site'), { slug: route, href: '/' + encoded })
    }
    assert.equal(projectReference(`https://goblincwl.site/${encoded}/?pure=true#section`, 'goblincwl.site')?.slug, route)
    assert.equal(projectReference(`/${encoded}/?pure=true#section`, 'goblincwl.site')?.href, `/${encoded}?pure=true#section`)
  }
  assert.equal(projectReference('/Repo/index', 'goblincwl.site')?.slug, 'Repo/index')
})

test('external hosts, non-project routes and invalid URLs cannot create project edges', () => {
  for (const href of [
    'https://github.com/Repo/CwlWeb', 'https://goblincwl.site.evil.test/Repo/CwlWeb',
    'https://goblincwl.site:444/Repo/CwlWeb', 'https://evil.test@goblincwl.site/Repo/CwlWeb',
    'javascript:alert(1)', 'mailto:a@example.com', '/Study/note', '/Repo/', '/Share/空间/secret',
    '/Share/分享/id/subfolder', '/Repo/CwlWeb/file.ts', '/Repo/%2Fsecret', '/Repo/%5csecret',
    '/Repo/%00secret', '/Repo/%', '/Video', 'Repo/CwlWeb', '../Repo/CwlWeb',
  ]) assert.equal(projectReference(href, 'goblincwl.site'), undefined, href)
  assert.equal(projectSlug('/Share/分享/id/'), 'Share/分享/id')
  assert.equal(projectSlug('/Repo//name'), undefined)
})
