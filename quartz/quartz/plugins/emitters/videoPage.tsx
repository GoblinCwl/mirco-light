import CustomContentMeta from "../../components/CustomContentMeta"
import { QuartzEmitterPlugin } from "../types"
import { FullPageLayout } from "../../cfg"
import { defaultProcessedContent } from "../vfile"
import { FullSlug, RelativeURL } from "../../util/path"
import { pageResources, renderPage } from "../../components/renderPage"
import Video, { VideoSidebar } from "../../components/pages/Video"
import Header from "../../components/Header"
import Body from "../../components/Body"
import { defaultListPageLayout, sharedPageComponents, standardPageHeading } from "../../../quartz.layout"
import { write } from "./helpers"
import { escapeHTML, unescapeHTML } from "../../util/escape"

export const VideoPage: QuartzEmitterPlugin = () => {
  const layout: FullPageLayout = { ...sharedPageComponents, ...defaultListPageLayout, beforeBody: [...standardPageHeading({ crumbs: [{ displayName: "Home", path: "/" }, { displayName: "Video", path: "/Video/" }] }), CustomContentMeta({ showReadingTime: false, datePrefix: "更新于：", includeSeconds: true, placeholder: true })], afterBody: [], right: [VideoSidebar], pageBody: Video() }
  const emit: NonNullable<ReturnType<QuartzEmitterPlugin>["emit"]> = async function* (ctx, content, resources) {
    const slug = "Video/index" as FullSlug
    const [tree, file] = defaultProcessedContent({ slug, frontmatter: { title: "星域: Video", description: "视频创作与系列记录", tags: [] } })
    const externalResources = pageResources("/" as RelativeURL, resources)
    const props = { ctx, fileData: file.data, externalResources, cfg: ctx.cfg.configuration, children: [], tree, allFiles: content.map(([, page]) => page.data) }
    const html = (await renderPage(props.cfg, slug, props, layout, externalResources)).replace(/\b(href|src)="(\.{1,2}(?:\/[^\"]*)?)"/g, (_, attr: string, value: string) => {
      const url = new URL(unescapeHTML(value), "https://quartz.invalid/Video/")
      return `${attr}="${escapeHTML(url.pathname + url.search + url.hash)}"`
    })
    yield write({ ctx, content: html, slug, ext: ".html" })
  }
  return { name: "VideoPage", getQuartzComponents: () => [layout.head, Header(), Body(), ...layout.beforeBody, layout.pageBody, ...layout.left, ...layout.right, layout.footer], emit, partialEmit: emit }
}
