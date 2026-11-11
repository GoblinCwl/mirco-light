import {test} from 'node:test'
import assert from 'node:assert/strict'
import {activityTimelineTime,activityTimeline} from './activityTimeline'

test('platform activity uses relative times for 30 days and full dates for older or future records',()=>{
 const now=new Date(2026,10,11,12).getTime()
 const ago=(ms:number)=>activityTimelineTime(new Date(now-ms).toISOString(),now)
 assert.equal(ago(30000),'刚刚')
 assert.equal(ago(60000),'1分钟前')
 assert.equal(ago(2*3600000),'2小时前')
 assert.equal(ago(29*86400000),'29天前')
 assert.equal(ago(30*86400000),'2026/10/12')
 assert.equal(activityTimelineTime(new Date(2025,4,1,12).toISOString(),now),'2025/5/1')
 assert.equal(activityTimelineTime(new Date(2026,11,1,12).toISOString(),now),'2026/12/1')
 assert.equal(activityTimelineTime('invalid',now),'')
})

test('both platform timelines keep their records without annual rows or a visible heading',()=>{
 const html=activityTimeline('公开动态',[
  {id:'one',date:'2026-01-01T12:00:00Z',label:'提交代码',text:'first'},
  {id:'two',date:'2025-01-01T12:00:00Z',label:'发布视频',text:'second'},
 ])
 assert.doesNotMatch(html,/data-activity-year|platform-activity-year|<h[1-6]/)
 assert.match(html,/first/);assert.match(html,/second/)
 assert.match(html,/datetime="2026-01-01T12:00:00.000Z"/)
})
