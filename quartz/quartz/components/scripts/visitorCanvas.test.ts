import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visitorCanvasBodies, updateVisitorComet, hitVisitorComet } from './visitorCanvas'
const meteors = Array.from({ length: 60 }, (_, index) => ({ id: (index + 1).toString(16).padStart(8, '0') + '0123456789abcdef', arrivedOn: `2026-11-${String(1 + index % 14).padStart(2, '0')}`, region: `地区${index}` }))
test('Canvas preserves SVG seeded orbits, own-comet sizing and trail count', () => {
 const own = meteors[20].id
 const { bodies, sparse } = visitorCanvasBodies({ meteors, meteorId: own }, 400, 220)
 assert.equal(sparse, 0); assert.equal(bodies.length, 60); assert.equal(bodies.at(-1)?.id, own)
 for (const body of bodies) {
  assert.equal(body.trail.length, body.own ? 30 : 16)
  assert.equal(body.radius === (0.9 + 3.8 + 1.1) * 1.55 + .5, body.own)
  updateVisitorComet(body, 12.5, sparse, 400, 220)
  const angle = body.phase + 12.5 / body.period * Math.PI * 2
  assert.ok(Math.abs(body.x - (200 + body.offsetX + Math.cos(angle) * body.rx * body.cosTilt - Math.sin(angle) * body.ry * body.sinTilt)) < 1e-10)
  assert.ok(Math.abs(body.y - (110 + body.offsetY + Math.cos(angle) * body.rx * body.sinTilt + Math.sin(angle) * body.ry * body.cosTilt)) < 1e-10)
 }
 const a=visitorCanvasBodies({meteors},400,220),b=visitorCanvasBodies({meteors},400,220)
 assert.deepEqual(a,b)
})
test('hit testing follows visible head scales and owner paint priority', () => {
 const {bodies}=visitorCanvasBodies({meteors:meteors.slice(0,3),meteorId:meteors[1].id},400,220)
 for(const body of bodies){body.x=100;body.y=80;body.scale=.5}
 assert.equal(hitVisitorComet(bodies,100,80)?.id,meteors[1].id)
 assert.equal(hitVisitorComet(bodies,120,80)?.id,meteors[1].id)
 assert.equal(hitVisitorComet(bodies,123,80),undefined)
})
test('invalid identifiers are excluded and large skies retain the 500-comet limit', () => {
 const invalid=[{id:'invalid',arrivedOn:'2026-11-14'},{id:meteors[0].id,arrivedOn:'bad'}]
 assert.equal(visitorCanvasBodies({meteors:invalid},400,220).bodies.length,0)
 assert.equal(visitorCanvasBodies({meteors:Array(600).fill(meteors[0])},400,220).bodies.length,500)
})
