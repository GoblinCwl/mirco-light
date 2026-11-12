import {test} from 'node:test'
import assert from 'node:assert/strict'
import {visitorDistribution} from './visitorDistribution'

test('historical regional percentages use the histogram rather than seven-day visitors',()=>{
 const rows=visitorDistribution([{region:'上海',count:108},{region:'其他',count:74}])
 assert.equal(Math.round(rows[0].percent*10)/10,59.3)
 assert.ok(rows.every(row=>row.percent<=100))
 assert.equal(rows.reduce((sum,row)=>sum+row.percent,0),100)
})
test('collapsed regions retain the full denominator and empty regions are safe',()=>{
 const rows=visitorDistribution(Array.from({length:8},(_,i)=>({region:String(i),count:10})))
 assert.equal(rows.length,7);assert.equal(rows[6].count,20);assert.equal(rows[6].percent,25)
 assert.deepEqual(visitorDistribution([]),[])
})
