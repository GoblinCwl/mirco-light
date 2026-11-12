import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tagClusterRadius,layoutTagRiver,tagStarPositions,tagRiverPosition,tagStarMotion,tagFocusAngle} from './tagClusters'
import {collectTagStats} from './tagIndex'

test('cluster radius uses square-root heat scaling, not linear project counts',()=>{
 const baseline=tagClusterRadius(0,100)
 assert.ok(Math.abs((tagClusterRadius(4,100)-baseline)/(tagClusterRadius(1,100)-baseline)-2)<1e-9)
 assert.ok(tagClusterRadius(100,100)<=130)
 assert.ok(tagClusterRadius(1,100)>0)
 assert.ok(tagClusterRadius(9,100)>tagClusterRadius(4,100))
})
test('the article window crops a huge galaxy whose center stays outside the right edge',()=>{
 const input=Array.from({length:73},(_,i)=>({tag:`主题${i}`,count:i===0?1000:i%25+1}))
 for(const [width,height] of [[280,680],[760,900],[1200,1100]]){
  const {clusters,galaxy}=layoutTagRiver(input,width,height)
  assert.equal(clusters.length,input.length)
  assert.ok(galaxy.centerX>width)
  assert.ok(galaxy.centerX-galaxy.innerRadius>width,'the inner void stays beyond the crop')
  assert.ok(galaxy.innerRadius>0&&galaxy.outerRadius>galaxy.innerRadius)
  for(const cluster of clusters){
   assert.ok(cluster.orbitRadius>galaxy.innerRadius&&cluster.orbitRadius<galaxy.outerRadius)
   const centeredAngle=Math.PI-cluster.phase
   const centered=tagRiverPosition(cluster,centeredAngle,galaxy)
   assert.ok(centered.x>0&&centered.x<width)
   assert.ok(Math.abs(centered.y-height/2)<1e-7)
   const advanced=tagRiverPosition(cluster,centeredAngle+.02,galaxy)
   assert.ok(advanced.y<centered.y)
   assert.ok(Math.abs(Math.hypot(advanced.x-galaxy.centerX,advanced.y-galaxy.centerY)-cluster.orbitRadius)<1e-7)
   const repeated=tagRiverPosition(cluster,centeredAngle+Math.PI*2,galaxy)
   assert.ok(Math.hypot(repeated.x-centered.x,repeated.y-centered.y)<1e-7)
  }
 }
})
test('one member produces exactly one deterministic star, including large clusters',()=>{
 const ids=Array.from({length:1000},(_,i)=>`article-${i}`)
 const points=tagStarPositions('主题',ids,100)
 assert.equal(points.length,1000)
 assert.deepEqual(points,tagStarPositions('主题',ids,100))
 assert.ok(points.every(point=>Math.abs(point.y)>=22||Math.abs(point.x)>=70))
 assert.notDeepEqual(points,tagStarPositions('另一个主题',ids,100))
})
test('a project contributes one membership per tag and inherited parent',()=>{
 const stats=collectTagStats([
  {id:'a',tags:['开发/Go','开发/Go','开发']},
  {id:'a',tags:['开发/Go']},
  {id:'b',tags:['开发/Go']},
 ])
 assert.equal(stats.pageCount,2)
 for(const tag of stats.counts){assert.equal(tag.count,2);assert.deepEqual(tag.members,['a','b'])}
})

test('star motion is deterministic, bounded and keeps the label area clear',()=>{
 const radius=100,points=tagStarPositions('开发',Array.from({length:100},(_,i)=>`article-${i}`),radius)
 let moving=0
 for(const point of points){
  assert.deepEqual(tagStarMotion(point,radius,0),{x:point.x,y:point.y})
  const later=tagStarMotion(point,radius,15)
  if(Math.hypot(later.x-point.x,later.y-point.y)>.5)moving++
  for(const time of [1,5,15,60,1000]){
   const moved=tagStarMotion(point,radius,time)
   assert.ok(Number.isFinite(moved.x)&&Number.isFinite(moved.y))
   assert.ok(Math.abs(moved.x-point.x)<=24&&Math.abs(moved.y-point.y)<=15)
   assert.ok(Math.abs(moved.x)>=70||Math.abs(moved.y)>=22)
   assert.deepEqual(moved,tagStarMotion(point,radius,time))
  }
 }
 assert.ok(moving>points.length/2)
})

test('tag focus chooses the shortest rotation and ends on the visible left arc',()=>{
 const {clusters,galaxy}=layoutTagRiver([{tag:'开发',count:3},{tag:'学习',count:5}],760,900)
 for(const cluster of clusters)for(const current of [-100,-Math.PI-.1,0,Math.PI-.1,100]){
  const target=tagFocusAngle(current,cluster.phase)
  assert.ok(Math.abs(target-current)<=Math.PI+1e-9)
  const position=tagRiverPosition(cluster,target,galaxy)
  assert.ok(Math.abs(position.y-galaxy.centerY)<1e-7)
  assert.ok(position.x>0&&position.x<760)
 }
})
