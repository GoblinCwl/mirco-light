import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingTimelineTarget,readingTimelineStep} from './readingTimelinePan'
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
