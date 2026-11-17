import {test} from 'node:test'
import assert from 'node:assert/strict'
import {matchesContentPath,listedFiles,listedContent,publicLinks,isListed,visibleExplore} from './contentVisibility'
import type {GlobalConfiguration} from '../cfg'
import type {QuartzPluginData} from '../plugins/vfile'
import type {ProcessedContent} from '../plugins/vfile'
const cfg={ignorePatterns:['Resources/**','**/!(*.md)'],unlistedPatterns:['Work/**','Memo/隐藏.md']} as GlobalConfiguration
test('hide files and directory roots without matching sibling names',()=>{
 for(const path of ['Work','Work/','Work/example.md','Work/sub/note.md','Memo/隐藏.md'])assert.equal(matchesContentPath(path,cfg.unlistedPatterns),true,path)
 for(const path of ['Workshop/x.md','Memo/normal.md'])assert.equal(matchesContentPath(path,cfg.unlistedPatterns),false,path)
 assert.equal(visibleExplore('/Work/',cfg),false)
 assert.equal(visibleExplore('/Resources/',cfg),false)
 assert.equal(visibleExplore('/Memo/',cfg),true)
 assert.equal(visibleExplore('/Share/',cfg),true)
})
test('discovery uses original paths and leaves original page input intact',()=>{
 const files=[{relativePath:'Work/a.md',slug:'Work/a'},{relativePath:'Memo/隐藏.md',slug:'Memo/隐藏'},{relativePath:'Memo/hello world.md',slug:'Memo/hello-world'}] as QuartzPluginData[]
 const listed=listedFiles(files,cfg)
 assert.deepEqual(listed.map(file=>file.slug),['Memo/hello-world'])
 assert.equal(files.length,3)
 assert.equal(listedFiles(files,cfg),listed)
})
test('draft pages remain available to rendering but never enter discovery without path rules',()=>{
 const config={ignorePatterns:[]} as unknown as GlobalConfiguration
 const files=[
  {slug:'Memo/public',frontmatter:{draft:false}},
  {slug:'Memo/draft',frontmatter:{draft:true}},
  {slug:'Memo/string-draft/index',frontmatter:{draft:'true'}},
  {slug:'Memo/string-public',frontmatter:{draft:'false'}},
 ] as QuartzPluginData[]
 const content=files.map(data=>[{}, {data}]) as ProcessedContent[]
 assert.deepEqual(listedFiles(files,config).map(file=>file.slug),['Memo/public','Memo/string-public'])
 assert.equal(listedContent(content,config).length,2)
 assert.deepEqual([...publicLinks(content,config)],['Memo/draft','Memo/string-draft/index','Memo/string-draft/'])
 assert.equal(isListed(files[1],config),false)
 assert.equal(content.length,4)
 assert.equal(files[1].frontmatter?.draft,true)
})
