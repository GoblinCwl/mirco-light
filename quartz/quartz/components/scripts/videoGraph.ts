import type { ContentDetails } from '../../util/contentTypes'
import { slugTag, type FullSlug, type SimpleSlug } from '../../util/path'
import { videoHref, type VideoLibrary } from './videoLibrary'

export const videoGraphSlug = (bvid:string) => `Video/${bvid}` as SimpleSlug
export function videoTagsByBvid(library:VideoLibrary) {
  const tags = new Map<string,Set<string>>()
  for(const series of library.collections) {
    if(series.id==='other'||series.kind!=='series')continue
    const tag=slugTag(series.title)
    if(!tag)continue
    for(const bvid of series.bvids) {
      const labels=tags.get(bvid)||new Set<string>();labels.add(tag);tags.set(bvid,labels)
    }
  }
  return tags
}
export function videoGraphContent(library:VideoLibrary) {
  const tags=videoTagsByBvid(library)
  return library.videos.map(video=>{
    const slug=videoGraphSlug(video.bvid)
    return {slug:String(slug) as FullSlug,href:videoHref(video.bvid),protected:false,
      page:{slug:String(slug) as FullSlug,filePath:String(slug) as ContentDetails['filePath'],title:video.title,links:[],createdAt:video.publishedAt||undefined,tags:[...tags.get(video.bvid)||[]],content:video.description||''} as ContentDetails}
  })
}
export function mergeVideoGraph(data:Map<SimpleSlug,ContentDetails>,library:VideoLibrary) {
  for(const video of videoGraphContent(library))data.set(video.slug as unknown as SimpleSlug,video.page)
}
