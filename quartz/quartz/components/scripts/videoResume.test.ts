import {test} from 'node:test'
import assert from 'node:assert/strict'
import {resumeSeekTarget} from './videoResume'
const media = (state:Partial<HTMLVideoElement>={}) => ({duration:7200,readyState:1,seeking:false,seekable:{length:1,start:()=>0,end:()=>10},...state}) as HTMLVideoElement
test('MSE can restore a late position at metadata without downloading the opening first',()=>{
 assert.equal(resumeSeekTarget(media(),3600,false,false),3600)
 assert.equal(resumeSeekTarget(media({readyState:0}),3600,false,false),undefined)
})
test('when HLS.js owns startPosition, do not issue a second metadata-time seek',()=>{
 assert.equal(resumeSeekTarget(media(),3600,false,false,true),undefined)
 assert.equal(resumeSeekTarget(media({readyState:3}),3600,false,true,true),3600)
})
test('native HLS retains the playing and available timeline safeguards',()=>{
 assert.equal(resumeSeekTarget(media({readyState:2}),3600,true,false),undefined)
 assert.equal(resumeSeekTarget(media({readyState:2}),3600,true,true),undefined)
 assert.equal(resumeSeekTarget(media({readyState:2,seekable:{length:1,start:()=>0,end:()=>7200}}),3600,true,true),3600)
})
test('invalid timelines and active seeks never consume the saved position',()=>{
 for(const state of [{duration:Infinity},{duration:NaN},{duration:0},{seeking:true}]) assert.equal(resumeSeekTarget(media(state),3600,false,true),undefined)
 assert.equal(resumeSeekTarget(media(),NaN,false,true),undefined)
 assert.equal(resumeSeekTarget(media(),0,false,true),undefined)
 assert.equal(resumeSeekTarget(media({duration:3000}),3600,false,true),2999)
})
