import { test } from "node:test"
import assert from "node:assert/strict"
import { driverDefault, parseStorageAddition, userPermissions } from "./driveAdminModel"
test("driver schema defaults retain native types and opaque addition fields",()=>{
 assert.equal(driverDefault({name:"enabled",type:"bool",default:"false"}),false)
 assert.equal(driverDefault({name:"enabled",type:"bool",default:"true"}),true)
 assert.equal(driverDefault({name:"ratio",type:"float",default:"1.25"}),1.25)
 assert.equal(driverDefault({name:"order",type:"number",default:"5"}),5)
 assert.equal(driverDefault({name:"policy",type:"select",default:"302_redirect"}),"302_redirect")
 assert.deepEqual(parseStorageAddition('{"unknown":true,"token":"fixture"}'),{unknown:true,token:"fixture"})
 for(const value of ['[]','null','invalid'])assert.throws(()=>parseStorageAddition(value))
 assert.equal(userPermissions.length,16)
})
