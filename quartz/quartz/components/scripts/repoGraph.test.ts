import { test } from "node:test"
import assert from "node:assert/strict"
import { repoGraphContent, mergeRepoGraph } from "./repoGraph"
import { repoFiles, repoList, sortRepoCatalog } from "./repoList"
import { repoSidebar, repoCatalogSidebar } from "./repoSidebar"
import type { RepoCatalog, RepoSummary } from "./repoShared"
import type { ContentDetails } from "../../util/contentTypes"
import type { SimpleSlug } from "../../util/path"

const repository = (name: string, language: string | null): RepoSummary => ({name,language,description:"项目简介",topics:[],fork:false,archived:false,default_branch:"main",pushed_at:null,stargazers_count:0,forks_count:0,license:null})
test("one project is one graph node, with its language tag and no fabricated Other tag", () => {
  const catalog: RepoCatalog = {owner:"Example",updatedAt:"",repositories:[repository("project","TypeScript"),repository("unknown",null)]}
  const records = repoGraphContent(catalog)
  assert.deepEqual(records.map(record=>record.page.tags), [["TypeScript"],[]])
  assert.equal(records[0].href,"/Repo/project/")
  const article = {title:"文章"} as ContentDetails
  const data = new Map<SimpleSlug,ContentDetails>([["Memo/note" as SimpleSlug,article],["Repo" as SimpleSlug,article]])
  mergeRepoGraph(data,catalog)
  assert.equal(data.get("Memo/note" as SimpleSlug),article)
  assert.ok(data.has("Repo/project" as SimpleSlug))
  assert.ok(!data.has("Repo" as SimpleSlug))
})
test("catalog uses project cards and stable language sorting, keeping Other last", () => {
  const repos = [repository("unknown",null),repository("one","TypeScript"),repository("two","Java")]
  assert.deepEqual(sortRepoCatalog(repos,"language").map(repo=>repo.name),["two","one","unknown"])
  assert.equal(repos[0].name,"unknown")
  const html = repoList(repos)
  assert.ok(html.includes("repo-card-grid"))
  assert.ok(!html.includes("<table"))
})
test("file metadata is escaped and commit links retain the selected branch", () => {
  const html = repoFiles([{name:"example.ts",path:"src/example.ts",type:"file",sha:"blob",lastCommit:{sha:"a".repeat(40),subject:'fix: <script>"&',author:"Example",date:"2026-11-01T00:00:00Z"}}],"project","feature/example","src")
  assert.ok(html.includes("最近提交"))
  assert.ok(html.includes("fix: &lt;script&gt;&quot;&amp;"))
  assert.ok(!html.includes("<script>"))
  assert.ok(html.includes("ref=feature%2Fexample"))
  assert.ok(html.includes("commit=" + "a".repeat(40)))
  assert.ok(html.includes('datetime="2026-11-01T00:00:00Z"'))
})

test("sidebar repository name links to GitHub without a separate jump button", () => {
  const html = repoSidebar({...repository("example","TypeScript"),owner:"Example",branches:["main"],tags:[],sha:"a".repeat(40),githubUrl:"https://github.com/Example/example"},"refs/heads/main")
  assert.ok(html.includes('href="https://github.com/Example/example"'))
  assert.ok(html.includes("<dd>TypeScript</dd>"))
  assert.ok(!html.includes('class="internal tag-link"'))
  assert.ok(!html.includes('repo-github-link'))
})

test("issue activity links remain on the issue even for a mirrored project",()=>{
 const url='https://github.com/Example/project/issues/42'
 const html=repoCatalogSidebar({owner:'Example',updatedAt:'',repositories:[repository('project','TypeScript')],social:{activities:[{id:'issue42',kind:'issue',label:'创建议题',repository:'Example/project',text:'Example issue',date:'2026-11-01T00:00:00Z',url}]}})
 assert.ok(html.includes(`href="${url}"`))
 assert.ok(!html.includes('href="/Repo/project/"'))
})
