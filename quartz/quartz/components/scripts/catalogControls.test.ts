import { test } from "node:test"
import assert from "node:assert/strict"
import { paginateCatalog, catalogPagination } from "./catalogControls"
import { repoCatalogView } from "./repoList"
import { videoMediaListing } from "./videoMedia"
import { sameRepo } from "./repoNavigationScope"
import type { RepoSummary } from "./repoShared"
import type { VideoLibrary } from "./videoLibrary"

test("catalog paging clamps invalid pages and retains the original source", () => {
  const items=Array.from({length:25},(_,i)=>i)
  assert.deepEqual(paginateCatalog(items,2).items,items.slice(12,24))
  assert.deepEqual(paginateCatalog(items,999).items,[24])
  assert.equal(paginateCatalog(items,NaN).page,1)
  assert.equal(paginateCatalog([],1).pages,1)
  assert.equal(catalogPagination(1,1,()=>"/"),"")
  assert.equal(items.length,25)
})
test("repository language entry precedes paged projects; catalog navigation stays local", () => {
  const repos=Array.from({length:25},(_,i)=>({name:`repo-${String(i).padStart(2,"0")}`,language:i%2?"Java":"Python",pushed_at:null,description:"",topics:[],fork:false,archived:false,default_branch:"main",stargazers_count:0,forks_count:0,license:null})) as RepoSummary[]
  const html=repoCatalogView(repos,"","name",2)
  assert.equal((html.match(/class="repo-card"/g)||[]).length,12)
  assert.ok(html.indexOf("语言分类")<html.indexOf('class="repo-card-grid"'))
  assert.ok(html.includes('/Repo/repo-12/'))
  assert.ok(!html.includes('/Repo/repo-00/'))
  assert.ok(html.includes('sort=name&amp;page=3'))
  assert.equal(sameRepo(new URL('https://example.com/Repo/'),new URL('https://example.com/Repo/?language=Python&page=2')),true)
  assert.equal(sameRepo(new URL('https://example.com/Repo/'),new URL('https://example.com/Repo/project/')),false)
})
test("video home shows lightweight series filters then every video; sorting happens before pagination", () => {
  const videos=Array.from({length:25},(_,i)=>({bvid:`BV${String(i).padStart(10,'0')}`,title:`视频${i}`,cover:"",description:"",duration:60,publishedAt:new Date(Date.UTC(2026,0,i+1)).toISOString(),play:0,danmaku:0,commentCount:0,url:""}))
  const series={id:"series-1",kind:"series" as const,title:"系列",description:"",cover:"",bvids:videos.slice(0,3).map(video=>video.bvid)}
  const library:VideoLibrary={mid:"1",updatedAt:null,videos,collections:[series]}
  const html=videoMediaListing(library,undefined,"newest",2)
  assert.ok(html.indexOf('class="catalog-category-section"')<html.indexOf('data-video-all'))
  assert.equal((html.match(/<article class="video-media-card/g)||[]).length,12)
  assert.ok(html.includes('/Video/BV0000000012/'))
  assert.ok(!html.includes('/Video/BV0000000024/'))
  const oldest=videoMediaListing(library,undefined,"oldest",1)
  assert.ok(oldest.includes('/Video/BV0000000000/'))
  const allSeries={...series,bvids:videos.map(video=>video.bvid)}
  const last=videoMediaListing(library,allSeries,"newest",3)
  assert.equal((last.match(/<article class="video-media-card/g)||[]).length,1)
  assert.ok(last.includes('series-1/?page=2'))
})
