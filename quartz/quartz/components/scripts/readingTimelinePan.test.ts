import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingTimelineTarget,readingTimelineStep,readingTimelineMotion} from './readingTimelinePan'
test('pointer travel covers the full hidden scroll range, including the middle',()=>{
 assert.equal(readingTimelineTarget(0,400,900),0)
 assert.equal(readingTimelineTarget(200,400,900),450)
 assert.equal(readingTimelineTarget(400,400,900),900)
 assert.equal(readingTimelineTarget(-50,400,900),0)
 assert.equal(readingTimelineTarget(500,400,900),900)
 assert.equal(readingTimelineTarget(50,100,200),100)
 assert.equal(readingTimelineTarget(0,0,100),0)
})
test('subpixel first frames never stop progress when browser scroll writes round to zero',()=>{
 let position=readingTimelineStep(0,4,0)
 assert.equal(Math.round(position),0,'reproduces the first-frame rounding that previously stopped scrolling')
 for(let i=0;i<80;i++)position=readingTimelineStep(position,4,16)
 assert.equal(Math.round(position),4)
})
test('interpolation approaches the mouse target smoothly without overshooting',()=>{
 let position=0
 for(let i=0;i<120;i++){const next=readingTimelineStep(position,900,16);assert.ok(next>=position&&next<=900);position=next}
 assert.ok(Math.abs(position-900)<.1)
})

test('motion is frame-rate independent and settles without oscillation',()=>{
 let a={position:0,velocity:0},b={position:0,velocity:0}
 for(let i=0;i<60;i++)a=readingTimelineMotion(a.position,a.velocity,900,16)
 for(let i=0;i<120;i++)b=readingTimelineMotion(b.position,b.velocity,900,8)
 assert.ok(Math.abs(a.position-b.position)<1e-8)
 assert.ok(a.position<900&&a.position>899)
 const reversed=readingTimelineMotion(a.position,a.velocity,0,1)
 assert.ok(Math.abs(reversed.velocity-a.velocity)<130)
})
