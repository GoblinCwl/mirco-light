import {test} from 'node:test'
import assert from 'node:assert/strict'
import {canDownloadDriveEntry} from './driveDownloadPolicy'
test('download gate rejects locked shares while allowing public and unlocked selections',()=>{
 const locked={target:'/Share/分享/private/',protectedShare:true}
 assert.equal(canDownloadDriveEntry(locked,()=>false),false)
 assert.equal(canDownloadDriveEntry(locked,id=>id==='private'),true)
 assert.equal(canDownloadDriveEntry({...locked,target:'/Share/分享/other/'},id=>id==='private'),false)
 assert.equal(canDownloadDriveEntry({target:'/Share/分享/public/',protectedShare:false},()=>false),true)
 assert.equal(canDownloadDriveEntry({target:'/Share/file.txt'},()=>false),true)
})
test('a batch containing a locked share must not proceed with a download',()=>{
 const entries=[{target:'/Share/file.txt'},{target:'/Share/分享/locked/',protectedShare:true}]
 assert.ok(entries.some(entry=>!canDownloadDriveEntry(entry,()=>false)))
 assert.ok(entries.every(entry=>canDownloadDriveEntry(entry,()=>true)))
})
