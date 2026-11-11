import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fileIconKind,fileTypeIcons,fileNameIcon,bilibiliVideoIcon} from './fileTypeIcons'
test('classifies names independently of media preview support',()=>{
 for(const [name,kind]of Object.entries({'movie.MKV':'video','song.flac':'audio','photo.HEIC':'image','memo.md':'text','notes.txt':'text','main.go':'code','App.java':'code','index.ts':'code','Dockerfile':'code','.env.production':'code','CMakeLists.txt':'code','report.docx':'word','budget.xlsx':'excel','talk.pptx':'powerpoint','book.pdf':'document','source.tar.gz':'archive','program.exe':'other','LICENSE':'other'}))assert.equal(fileIconKind(name),kind,name)
 assert.equal(fileIconKind('folder.md',true),'folder')
 assert.equal(fileNameIcon('notes.md'),fileTypeIcons.text)
 assert.notEqual(bilibiliVideoIcon,fileTypeIcons.video)
})
test('all type symbols are distinct and inherit theme colors',()=>{
 assert.equal(new Set(Object.values(fileTypeIcons)).size,Object.keys(fileTypeIcons).length)
 for(const icon of Object.values(fileTypeIcons)){assert.match(icon,/viewBox="0 0 24 24"/);assert.match(icon,/stroke="currentColor"/);assert.doesNotMatch(icon,/#[a-f0-9]{3,8}/i)}
})
