import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fileHoverSupported} from './driveHoverPolicy'
import type {PreviewFile} from './drivePreviewOptions'
const file=(name:string,type?:number):PreviewFile=>({name,type,is_dir:false,size:1024,modified:''})
test('audio, video and PDF never show a hover preview even when a renderer is configured',()=>{
 for(const name of ['a.mp4','a.MKV','a.mp3','a.flac','a.PDF','a.m3u8'])assert.equal(fileHoverSupported(file(name),{}),false,name)
 assert.equal(fileHoverSupported(file('extensionless',2),{}),false)
 assert.equal(fileHoverSupported(file('extensionless',3),{}),false)
 assert.equal(fileHoverSupported(file('a.pdf'),{iframe_previews:'{"pdf":{"viewer":"https://example.com/?url=$url"}}'}),false)
})
test('files use the existing available preview choices and respect share preview settings',()=>{
 for(const name of ['a.md','a.js','a.png','a.docx','a.xlsx','a.html','a.zip'])assert.equal(fileHoverSupported(file(name),{}),true,name)
 assert.equal(fileHoverSupported(file('a.md'),{share_preview:'false'}),false)
 assert.equal(fileHoverSupported({...file('a.bin'),size:2*1024*1024},{}),false)
 assert.equal(fileHoverSupported({...file('folder.pdf'),is_dir:true},{}),true)
})
