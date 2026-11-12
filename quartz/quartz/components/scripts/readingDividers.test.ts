import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingDividers,readingDividerSegments} from './readingDividers'
test('only vertical neighbours of the same type receive a divider',()=>{
 const result=readingDividers([
  {type:'article',top:0,bottom:100,left:0,right:200},
  {type:'article',top:0,bottom:100,left:200,right:400},
  {type:'article',top:100,bottom:200,left:0,right:200},
  {type:'repo',top:100,bottom:200,left:200,right:400},
 ])
 assert.deepEqual(result,[{index:2,left:0,width:200}])
})
test('wide blocks only divide portions touching matching narrow blocks',()=>{
 assert.deepEqual(readingDividers([
  {type:'repo',top:0,bottom:100,left:0,right:150},
  {type:'share',top:0,bottom:100,left:150,right:400},
  {type:'repo',top:100,bottom:200,left:0,right:400},
 ]),[{index:2,left:0,width:150}])
})
test('matching edges merge and ignore visible gaps',()=>{
 assert.deepEqual(readingDividers([
  {type:'video',top:0,bottom:100,left:0,right:150},
  {type:'video',top:0,bottom:100,left:150,right:400},
  {type:'video',top:100,bottom:200,left:0,right:400},
  {type:'video',top:205,bottom:300,left:0,right:400},
 ]),[{index:2,left:0,width:400}])
})

test('separator belongs to the shared outer edge rather than inside the lower block',()=>{
 const rects=[{type:'article',top:20,bottom:150,left:40,right:340},{type:'article',top:150,bottom:320,left:40,right:340}]
 assert.deepEqual(readingDividerSegments(rects,{top:20,left:40}),[{left:0,top:130,width:300}])
 const scrolled=rects.map(rect=>({...rect,top:rect.top-80,bottom:rect.bottom-80}))
 assert.deepEqual(readingDividerSegments(scrolled,{top:-60,left:40}),[{left:0,top:130,width:300}])
})
