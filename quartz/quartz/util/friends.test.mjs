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

test('backlink page survives parsing without breaking older records', () => {
 const item = {id:'one',name:'网站',url:'https://example.com/',backlinkUrl:'https://example.com/friends'}
 assert.equal(parseFriends([item])[0].backlinkUrl,item.backlinkUrl)
 assert.equal(parseFriends([{...item,backlinkUrl:undefined}])[0].backlinkUrl,'')
 for (const backlinkUrl of ['http://example.com/friends','javascript:alert(1)','https://user:secret@example.com/friends']) assert.throws(()=>parseFriends([{...item,backlinkUrl}]))
})

test('stored OpenList avatar routes survive parsing with strict filenames', () => {
 const item={id:'one',name:'网站',url:'https://example.com/',avatar:'/api/site/friends/avatar/'+'a'.repeat(64)+'.png'}
 assert.equal(parseFriends([item])[0].avatar,item.avatar)
 for(const avatar of ['/api/site/friends/avatar/../secret','/api/site/friends/avatar/'+'a'.repeat(64)+'.svg']) assert.throws(()=>parseFriends([{...item,avatar}]))
})

test('RSS is optional and persists valid HTTP or HTTPS feed URLs', () => {
 const friend={id:'rss',name:'网站',url:'https://example.com'}
 assert.equal(parseFriends([friend])[0].rssUrl,'')
 assert.equal(parseFriends([{...friend,rssUrl:'  '}])[0].rssUrl,'')
 for(const rssUrl of ['https://example.com/feed.xml','http://example.com/rss'])assert.equal(parseFriends([{...friend,rssUrl}])[0].rssUrl,rssUrl)
 for(const rssUrl of ['ftp://example.com/rss','javascript:alert(1)','https://user:pass@example.com/feed'])assert.throws(()=>parseFriends([{...friend,rssUrl}]))
})

test('friend sources and computed RSS date survive parsing', () => {
 const item={id:'latest',name:'网站',url:'https://example.com',avatarSource:'https://example.com/avatar.png',latestUpdate:'2026-11-12T06:00:00.000Z'}
 assert.equal(parseFriends([item])[0].avatarSource,item.avatarSource)
 assert.equal(parseFriends([item])[0].latestUpdate,item.latestUpdate)
 assert.equal(parseFriends([{...item,latestUpdate:undefined,avatarSource:undefined}])[0].latestUpdate,'')
 assert.throws(()=>parseFriends([{...item,avatarSource:'javascript:alert(1)'}]))
})

test('automatic review metadata survives parsing', () => {
 const friend={id:'review',name:'网站',url:'https://example.com/',reviewResult:'检测到本站链接',reviewCheckedAt:'2026-11-12T00:00:00.000Z'}
 assert.equal(parseFriends([friend])[0].reviewResult,friend.reviewResult)
 assert.equal(parseFriends([friend])[0].reviewCheckedAt,friend.reviewCheckedAt)
})

test('homepage retry metadata is preserved for greyed-out cards', () => {
 const friend={id:'retry',name:'网站',url:'https://example.com/',healthFailures:3,healthCheckedOn:'2026-11-13',healthError:'HTTP 503'}
 assert.equal(parseFriends([friend])[0].healthFailures,3)
 assert.equal(parseFriends([friend])[0].healthError,'HTTP 503')
 assert.equal(parseFriends([{...friend,healthFailures:undefined}])[0].healthFailures,0)
})

test('persisted card numbers remain stable when RSS reorders friends',()=>{
 const a={id:'fixed-a',number:12,name:'A',url:'https://a.example'},b={id:'fixed-b',number:3,name:'B',url:'https://b.example'}
 assert.deepEqual(parseFriends([b,a]).map(friend=>friend.number),[3,12])
 for(const number of [0,-1,1.5,4294967296,'12'])assert.throws(()=>parseFriends([{...a,number}]))
})
