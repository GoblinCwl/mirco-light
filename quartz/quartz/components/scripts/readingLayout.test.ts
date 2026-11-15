import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingBands} from './readingLayout'
test('similar prose still produces staggered blocks rather than repeated pairs',()=>{
 const bands=readingBands(Array.from({length:24},()=>({title:'标题',opening:'正文'.repeat(60)})))
 assert.ok(bands.some(band=>band.cells?.some(cell=>cell.height>1)))
 const shapes=bands.filter(band=>band.cells).map(band=>JSON.stringify(band.cells?.map(({column,row,width,height})=>[column,row,width,height])))
 assert.ok(new Set(shapes).size>1)
})
test('long prose spans beside two short entries while retaining time-ordered indices',()=>{
 const bands=readingBands([{title:'长文章',opening:'文字'.repeat(190)},{title:'短内容',opening:'简短正文'},{title:'另一篇',opening:'几句话'}])
 assert.equal(bands.length,1);assert.equal(bands[0].tall,0);assert.deepEqual(bands[0].indices,[0,1,2]);assert.ok((bands[0].tallLeft?bands[0].left:100-bands[0].left)>=24&&(bands[0].tallLeft?bands[0].left:100-bands[0].left)<=34)
})
test('packing never drops or repeats entries and every band has a complete rectangle',()=>{
 const items=Array.from({length:31},(_,i)=>({title:'标题'+i,opening:'正文'.repeat((i*37)%200)}))
 const bands=readingBands(items)
 assert.deepEqual(bands.flatMap(band=>band.indices),items.map((_,i)=>i))
 for(const band of bands){assert.ok(band.left>0&&band.left<=100);if(band.tall!==undefined){assert.ok(band.indices.length===3||band.indices.length===4);assert.ok(band.indices.includes(band.tall))}}
})

test('full-length prose can fill a vertical block rather than forcing uniform rows',()=>{
 const bands=readingBands(Array.from({length:3},()=>({title:'长文',opening:'文字'.repeat(190)})))
 assert.equal(bands.length,1);assert.equal(bands[0].indices.length,3);assert.notEqual(bands[0].tall,undefined)
})

test('mosaic cells tile every row exactly once and retain chronological visual order',()=>{
 const items=Array.from({length:60},(_,i)=>({title:'Project '+i,opening:'a'.repeat(80+(i*37)%320)}))
 const bands=readingBands(items)
 assert.deepEqual(bands.flatMap(band=>band.indices),items.map((_,i)=>i))
 for(const band of bands){
  if(!band.cells)continue
  const occupied=new Set<string>()
  for(const cell of band.cells){
   assert.ok(cell.lines>=3&&cell.lines<=18)
   for(let x=cell.column;x<cell.column+cell.width;x++)for(let y=cell.row;y<cell.row+cell.height;y++){
    const key=`${x},${y}`;assert.ok(!occupied.has(key),'cells must not overlap');occupied.add(key)
   }
  }
  const height=Math.max(...band.cells.map(cell=>cell.row+cell.height-1))
  assert.equal(occupied.size,6*height,'no empty cells')
  assert.deepEqual(band.cells.slice().sort((a,b)=>a.row-b.row||a.column-b.column).map(cell=>cell.index),band.indices)
 }
})

function visualOrder(band:ReturnType<typeof readingBands>[number]){
 if(band.cells)return band.cells.slice().sort((a,b)=>a.row-b.row||a.column-b.column).map(cell=>cell.index)
 if(band.tall===undefined)return band.indices
 let short=0
 return band.indices.map(index=>index===band.tall?{index,row:1,column:band.tallLeft?1:2}:{index,row:++short,column:band.tallLeft?2:1}).sort((a,b)=>a.row-b.row||a.column-b.column).map(cell=>cell.index)
}
test('short latest entries and later long prose never trade chronological positions',()=>{
 for(let length=1;length<=36;length++)for(let longest=0;longest<length;longest++){
  const items=Array.from({length},(_,i)=>({title:'按时间排序 '+i,opening:i===longest?'长正文'.repeat(600):'短文'.repeat(i%3)}))
  const bands=readingBands(items)
  assert.deepEqual(bands.flatMap(visualOrder),items.map((_,i)=>i),`count=${length}, long=${longest}`)
 }
})
