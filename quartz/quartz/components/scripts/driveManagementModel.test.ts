import { test } from "node:test"
import assert from "node:assert/strict"
import { emptyDriveMeta, taskCategories, taskFinished, canOperateTask, groupTaskIds, taskIdentity, safeTaskText, type ManagedTask } from "./driveManagementModel"
test("metadata defaults cover every OpenList inheritance field without sharing mutable arrays", () => {
  const one=emptyDriveMeta(),two=emptyDriveMeta();one.read_users.push(1)
  assert.deepEqual(two.read_users,[])
  for(const key of ["p_sub","read_users_sub","write_users_sub","w_sub","h_sub","header_sub","r_sub"] as const)assert.equal(two[key],false)
})
test("task controls follow OpenList states, distinguish category IDs, and group transfer phases correctly", () => {
  const task=(category:ManagedTask["category"],state:number):ManagedTask=>({category,state,id:"same",name:"Task",progress:0})
  for(const state of [0,1,5,6,8,9])assert.equal(canOperateTask(task("copy",state),"cancel"),true)
  assert.equal(canOperateTask(task("copy",3),"cancel"),false)
  for(const state of [2,4,7]){assert.equal(taskFinished(task("copy",state)),true);assert.equal(canOperateTask(task("copy",state),"delete"),true)}
  assert.equal(canOperateTask(task("copy",2),"retry"),false)
  for(const state of [4,7])assert.equal(canOperateTask(task("copy",state),"retry"),true)
  assert.deepEqual([...groupTaskIds([task("copy",7),task("move",4),task("copy",1)],"retry")],[ ["copy",["same"]],["move",["same"]] ])
  assert.notEqual(taskIdentity(task("copy",1)),taskIdentity(task("move",1)))
  assert.deepEqual(taskCategories.filter(c=>c.group==="offline").map(c=>c.key),["offline_download","offline_download_transfer"])
  assert.deepEqual(taskCategories.filter(c=>c.group==="extract").map(c=>c.key),["decompress","decompress_upload"])
  assert.equal(safeTaskText("decompress archive with password <secret>"),"decompress archive with password <••••>")
})
