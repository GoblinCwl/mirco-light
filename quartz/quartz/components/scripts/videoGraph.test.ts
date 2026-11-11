import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoGraphContent,mergeVideoGraph,videoGraphSlug } from './videoGraph'
import type { VideoLibrary, VideoItem, VideoCollection } from './videoLibrary'
import type { ContentDetails } from '../../util/contentTypes'
import type { SimpleSlug } from '../../util/path'

const item = (bvid:string,title:string):VideoItem => ({bvid,title,cover:'',description:'',duration:1,publishedAt:null,play:0,danmaku:0,commentCount:0,url:`https://www.bilibili.com/video/${bvid}/`})
const series = (id:string,title:string,bvids:string[],kind:VideoCollection['kind']='series'):VideoCollection => ({id,title,bvids,kind,cover:'',description:''})

test('series names become normalized default tags; Other is an ordinary untagged article',()=>{
  const library:VideoLibrary={mid:'1',updatedAt:null,videos:[item('BV1xx411c7mD','A'),item('BV1yy411c7mD','B'),item('BV1zz411c7mD','C')],collections:[series('series-1','Study Notes',['BV1xx411c7mD']),series('series-2','Study Notes',['BV1xx411c7mD']),series('series-3','学习',['BV1xx411c7mD']),series('other','其他',['BV1yy411c7mD']),series('season-1','不参与',['BV1zz411c7mD'],'season')]}
  const records=videoGraphContent(library)
  assert.deepEqual(records[0].page.tags,['Study-Notes','学习'])
  assert.deepEqual(records[1].page.tags,[])
  assert.deepEqual(records[2].page.tags,[])
  assert.deepEqual(records[1].page.links,[])
  assert.equal(records[0].href,'/Video/BV1xx411c7mD/')
  assert.equal(records.length,3)
})
test('videos merge into the shared graph without replacing articles; one BV is one node',()=>{
  const article={title:'A',tags:['学习'],links:[],content:''} as unknown as ContentDetails
  const data=new Map<SimpleSlug,ContentDetails>([['Memo/article' as SimpleSlug,article]])
  const library:VideoLibrary={mid:'1',updatedAt:null,videos:[item('BV1xx411c7mD','视频')],collections:[]}
  mergeVideoGraph(data,library);mergeVideoGraph(data,library)
  assert.equal(data.size,2)
  assert.equal(data.get('Memo/article' as SimpleSlug),article)
  assert.equal(data.get(videoGraphSlug('BV1xx411c7mD'))?.title,'视频')
})
