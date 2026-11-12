import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tagCameraOverview,tagCameraTarget,projectTagPoint,interpolateTagCamera} from './tagCamera'
test('tag inspection centers the selected region at every viewport size and overview restores coordinates',()=>{
 for(const [width,height] of [[320,650],[850,950],[1200,1000]]){
  const point={x:width*.21,y:height*.61},target=tagCameraTarget(point,width,height)
  assert.deepEqual(projectTagPoint(point,target,width,height),{x:width/2,y:height/2})
  const normal=projectTagPoint(point,tagCameraOverview(),width,height)
  assert.ok(Math.abs(normal.x-point.x)<1e-10&&Math.abs(normal.y-point.y)<1e-10)
  assert.deepEqual(interpolateTagCamera(tagCameraOverview(),target,0),tagCameraOverview())
  assert.deepEqual(interpolateTagCamera(tagCameraOverview(),target,1),target)
  assert.deepEqual(interpolateTagCamera(target,tagCameraOverview(),1),tagCameraOverview())
  const mid=interpolateTagCamera(tagCameraOverview(),target,.5)
  assert.ok(mid.scale>1&&mid.scale<target.scale)
 }
})
