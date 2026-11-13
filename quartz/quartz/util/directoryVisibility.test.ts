import {test} from 'node:test'
import assert from 'node:assert/strict'
import {isDirectoryListed} from './directoryVisibility'
test('directory-only rules match files, bare directories and globs without hiding siblings',()=>{
 assert.equal(isDirectoryListed('Private/关于本站：微光集.md',['Private/关于本站：微光集.md']),false)
 assert.equal(isDirectoryListed('Private/关于本站：微光集.md',['Private/关于本站：微光集']),false)
 for(const pattern of ['Memo','Memo/**'])assert.equal(isDirectoryListed('Memo/nested/note.md',[pattern]),false)
 assert.equal(isDirectoryListed('Memo-other/note.md',['Memo']),true)
 assert.equal(isDirectoryListed('Memo/note.md',[]),true)
 assert.equal(isDirectoryListed('Private/other.md',['Private/about.md']),true)
})
