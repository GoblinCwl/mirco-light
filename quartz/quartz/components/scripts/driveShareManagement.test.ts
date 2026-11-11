import {test} from 'node:test'
import assert from 'node:assert/strict'
import {managedShareTarget} from './driveShareManagement'
const share={name:'项目',target:'/Share/%E5%88%86%E4%BA%AB/project/',directory:false,shared:true}
test('merged Share homepage recognizes exactly one share and rejects files, private space and mixed selections',()=>{
 const base={view:'guest' as const,path:'/',share:'',selected:[share]}
 assert.equal(managedShareTarget(base)?.name,'project')
 assert.equal(managedShareTarget({...base,selected:[{...share,shared:false}]}),undefined)
 assert.equal(managedShareTarget({...base,selected:[share,{...share,name:'second'}]}),undefined)
 assert.equal(managedShareTarget({...base,view:'storage'}),undefined)
 assert.equal(managedShareTarget({...base,path:'/folder'}),undefined)
 assert.equal(managedShareTarget({...base,selected:[{...share,target:'https://external.example/Share/分享/project/'}]}),undefined)
})
test('share project pages and their children never offer share management',()=>{
 for(const path of ['/','/Season 01/file.mkv'])assert.equal(managedShareTarget({view:'share',path,share:'project',selected:[share]}),undefined)
})
