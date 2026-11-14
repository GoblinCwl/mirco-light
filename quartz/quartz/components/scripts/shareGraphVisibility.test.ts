import {test} from 'node:test'
import assert from 'node:assert/strict'
import {showShareGraph} from './shareGraphVisibility'
test('locked and unlocked shares show their graph; resolved media and unresolved unlocked matches do not',()=>{
 assert.equal(showShareGraph('share',true,false,false),true)
 assert.equal(showShareGraph('share',true,false,true),false)
 assert.equal(showShareGraph('share',true,true,false),false)
 assert.equal(showShareGraph('share',false,false,false),true)
 assert.equal(showShareGraph('share',false,true,false),true)
 assert.equal(showShareGraph('share',false,false,true),false)
 for(const view of ['guest','storage'] as const)assert.equal(showShareGraph(view,true,false,false),false)
})
