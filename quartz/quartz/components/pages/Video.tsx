import Backlinks from "../Backlinks"
import {concatenateResources} from "../../util/resources"
import dialogStyle from "../styles/driveOperations.scss"
// @ts-ignore
import tagEditor from "../scripts/contentTagEditor.inline"
import Graph from "../Graph"
import { QuartzComponent, QuartzComponentConstructor } from "../types"
import style from "../styles/video.scss"
// @ts-ignore
import script from "../scripts/video.inline"
const VideoGraph = Graph()
const ProjectBacklinks = Backlinks({panel:true})
export const VideoSidebar: QuartzComponent = (props) => <aside class="video-sidebar-panel">
  <div class="video-sidebar-content"><section class="video-local-graph" data-video-graph hidden><VideoGraph {...props} /></section><div class="video-sidebar" data-video-sidebar /><ProjectBacklinks {...props} /></div>
  <section class="video-parts-panel" data-video-parts-panel hidden aria-label="分集">
    <div class="video-parts-heading"><h3>分集</h3></div>
    <nav class="video-part-list" data-video-part-list aria-label="视频分P"/>
  </section>
</aside>
VideoSidebar.css = [VideoGraph.css,ProjectBacklinks.css].flat().filter(Boolean) as string[]
VideoSidebar.afterDOMLoaded = concatenateResources(VideoGraph.afterDOMLoaded,ProjectBacklinks.afterDOMLoaded)
export default (() => {
  const Video: QuartzComponent = () => <div class="video-frame"><article class="video-page" data-video-page aria-busy="true" /><span class="video-initial-loading" data-video-loading role="status" aria-label="正在读取视频"><span class="drive-loading" aria-hidden="true"><i /></span></span></div>
  Video.css = [style,dialogStyle]
  Video.afterDOMLoaded = concatenateResources(script,tagEditor)
  return Video
}) satisfies QuartzComponentConstructor
