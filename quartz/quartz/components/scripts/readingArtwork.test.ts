import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingArtworkLayout} from './readingArtwork'
test('background artwork responds to the actual width and height of each block',()=>{
 const small=readingArtworkLayout(280,280,'article'),wide=readingArtworkLayout(640,280,'article'),tall=readingArtworkLayout(280,700,'article')
 assert.ok(wide.width>small.width);assert.ok(wide.bottom<0);assert.ok(tall.bottom>0)
 assert.notDeepEqual(tall,small)
 for(const value of [small,wide,tall])assert.ok(Number.isFinite(value.width)&&value.width>0)
})
test('film follows vertical blocks while book and code art remain upright',()=>{
 assert.equal(readingArtworkLayout(280,700,'video').angle,90)
 assert.equal(readingArtworkLayout(640,280,'video').angle,0)
 assert.ok(Math.abs(readingArtworkLayout(280,700,'repo').angle)<10)
})
