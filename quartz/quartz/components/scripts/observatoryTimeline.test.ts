import {test} from 'node:test'
import assert from 'node:assert/strict'
import {observationTimeline} from './observatoryTimeline'
const points=(...times:number[])=>times.map(time=>({time}))
test('reconnection within one minute fits only the fresh batch across the full plot',()=>{
 const next=observationTimeline(points(1000,3000,35000,37000),1000,3000,37000)
 assert.equal(next.reset,true);assert.deepEqual(next.history,points(35000,37000));assert.equal(next.start,35000);assert.equal(next.range,2000)
 const continued=observationTimeline(points(35000,37000,39000),next.first,next.end,39000)
 assert.equal(continued.reset,false);assert.equal(continued.start,35000);assert.equal(continued.range,4000)
})
test('empty observations reset the old origin; a single point is centered before the batch grows',()=>{
 const empty=observationTimeline([],1000,3000,90000);assert.equal(empty.first,undefined)
 const single=observationTimeline(points(91000),empty.first,empty.end,91000);assert.equal(single.start,90500);assert.equal(single.range,1000)
 const batch=observationTimeline(points(91000,93000),single.first,single.end,93000);assert.equal(batch.start,91000);assert.equal(batch.range,2000)
})
test('continuous data retains the rolling one-minute view',()=>{
 const next=observationTimeline(points(61000,63000,65000),1000,63000,65000)
 assert.equal(next.reset,false);assert.equal(next.range,60000);assert.equal(next.start,5000)
})
