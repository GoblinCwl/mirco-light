import {activityTimeline} from "./activityTimeline"
import {videoHref} from "./videoLibrary"
import { creatorProfile, creatorIcons } from "./creatorProfile"
import type { VideoLibrary } from "./videoLibrary"

export function videoProfile(library: VideoLibrary) {
  const profile=library.profile
  const count=(value:number|null|undefined)=>value==null?"—":value.toLocaleString("zh-CN")
  const metric=(label:string,value:number|null|undefined,icon:string,title?:string)=>({label,value:count(value),icon,title:value==null?undefined:`${title||label}：${value.toLocaleString('zh-CN')}`})
  return creatorProfile({platform:"bilibili",name:profile?.name||"哔哩哔哩创作者",avatar:profile?.avatar,href:`https://space.bilibili.com/${library.mid}`,
    subtitle:`UID ${library.mid}`,level:profile?.level,
    metrics:[metric("粉丝",profile?.followers,creatorIcons.people),metric("获赞",profile?.likes,creatorIcons.heart),metric("播放",profile?.plays,creatorIcons.play,"本站缓存的本人公开视频播放合计")]}) + activityTimeline("视频动态",library.activities==null?library.videos.filter(video=>!/^BV1TEST/.test(video.bvid)&&!video.test).slice(0,20).map(video=>({id:video.bvid,bvid:video.bvid,label:"发布视频",text:video.title,date:video.publishedAt||"",href:videoHref(video.bvid)})):library.activities.map(item=>({...item,href:item.bvid&&library.videos.some(video=>video.bvid===item.bvid)?videoHref(item.bvid):`https://t.bilibili.com/${item.id}`})))
}
