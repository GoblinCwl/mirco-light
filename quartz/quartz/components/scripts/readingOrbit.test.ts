import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingOrbit,readingTether} from './readingOrbit'
test('beacons stay on the same tilted accretion disk and complete a 180-second orbit',()=>{
 const tilt=-11*Math.PI/180
 for(let i=0;i<4;i++)for(let time=0;time<=180;time++){
  const point=readingOrbit(i,time),x=point.x*1000,y=point.y*360
  const localX=x*Math.cos(tilt)+y*Math.sin(tilt),localY=-x*Math.sin(tilt)+y*Math.cos(tilt)
  assert.ok(Math.abs((localX/355)**2+(localY/42)**2-1)<1e-10)
  const again=readingOrbit(i,time+180)
  assert.ok(Math.abs(point.x-again.x)<1e-10&&Math.abs(point.y-again.y)<1e-10)
 }
})
test('opposite beacons occupy opposite disk positions with matching front/back depth',()=>{
 const a=readingOrbit(0,0),b=readingOrbit(2,0)
 assert.ok(Math.abs(a.x+b.x)<1e-10&&Math.abs(a.y+b.y)<1e-10)
 assert.notEqual(a.front,b.front)
 assert.ok(a.scale>b.scale)
})

test('tether always pulls toward the black hole without changing the orbit',()=>{
 for(let index=0;index<4;index++)for(let seconds=0;seconds<180;seconds+=3){
  const orbit=readingOrbit(index,seconds),pull=readingTether(index,seconds,900,324)
  const inward=Math.cos(pull.angle)*(-orbit.x*900)+Math.sin(pull.angle)*(-orbit.y*324)
  assert.ok(inward>0)
  assert.ok(pull.stretch>=1&&pull.stretch<=1.65)
  assert.ok(pull.length>=26&&pull.length<=38)
 }
})
test('elastic tension repeats slowly while the numbers keep their orbit and scale',()=>{
 const first=readingTether(0,0,1000,360),next=readingTether(0,28,1000,360)
 assert.ok(Math.abs(first.strength-next.strength)<1e-10)
 assert.ok(Math.abs(readingOrbit(0,0).scale-readingOrbit(0,180).scale)<1e-10)
})
