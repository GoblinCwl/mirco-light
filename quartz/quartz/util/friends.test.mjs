import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultFriends, parseFriends } from './friends.mjs'

test('default friends are explicitly marked as samples and use local picture avatars', () => {
  const [friend] = parseFriends(defaultFriends)
  assert.equal(friend.example, true)
  assert.equal(new URL(friend.url).host, 'example.com')
  assert.ok(parseFriends(defaultFriends).every(item => item.example && /^\/static\/.*\.(png|webp)$/.test(item.avatar)))
})
test('friend records preserve ordering, allow empty avatars and validate browser input', () => {
  const items = [{ id:'b', name:'  第二站  ', url:'https://b.example', description:'简介', avatar:'' }, { id:'a', name:'第一站', url:'https://a.example/', avatar:'https://a.example/avatar.png' }]
  assert.deepEqual(parseFriends(items).map(friend => friend.name), ['第二站','第一站'])
  assert.equal(parseFriends(items)[0].url, 'https://b.example/')
  assert.deepEqual(parseFriends('[]'), [])
})
test('invalid, duplicate and executable friend URLs are rejected', () => {
  const item = { id:'one', name:'网站', url:'https://example.com/', avatar:'', description:'' }
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.com', 'https://user:secret@example.com/']) assert.throws(() => parseFriends([{...item,url}]))
  for (const avatar of ['javascript:alert(1)', '/private/avatar.png', '/static/../private.png']) assert.throws(() => parseFriends([{...item,avatar}]))
  assert.throws(() => parseFriends([item, {...item,id:'two'}]))
  assert.throws(() => parseFriends([{...item,name:''}]))
  assert.throws(() => parseFriends({}))
})
