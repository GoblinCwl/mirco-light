import {test} from 'node:test'
import assert from 'node:assert/strict'
import {directorySwipeIntent} from './directorySwipe'
test('jitter does not capture taps; predominantly vertical movement keeps native scrolling',()=>{
  assert.equal(directorySwipeIntent(7,4),null)
  assert.equal(directorySwipeIntent(2,8),null)
  assert.equal(directorySwipeIntent(5,70),'vertical')
  assert.equal(directorySwipeIntent(20,45),'vertical')
  assert.equal(directorySwipeIntent(30,45),'vertical')
})
test('natural diagonal swipes lock early in both directions',()=>{
  for(const direction of [1,-1]){
    assert.equal(directorySwipeIntent(direction*10,8),'horizontal')
    assert.equal(directorySwipeIntent(direction*30,25),'horizontal')
    assert.equal(directorySwipeIntent(direction*30,30),'horizontal')
    assert.equal(directorySwipeIntent(direction*30,35),'horizontal')
  }
})
test('unclear direction is not prevented while the user settles into a gesture',()=>{
  assert.equal(directorySwipeIntent(30,40),null)
  assert.equal(directorySwipeIntent(50,60),null)
})
