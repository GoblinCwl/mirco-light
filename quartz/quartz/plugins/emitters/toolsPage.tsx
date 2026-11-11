import { QuartzEmitterPlugin } from "../types"
import { ProcessedContent, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { QuartzComponentProps } from "../../components/types"
import CustomContentMeta from "../../components/CustomContentMeta"
import OpenList from "../../components/pages/OpenList"
import DriveOperations from "../../components/DriveOperations"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FullSlug, RelativeURL } from "../../util/path"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { defaultListPageLayout, sharedPageComponents, standardPageHeading } from "../../../quartz.layout"
import { write } from "./helpers"
import { escapeHTML, unescapeHTML } from "../../util/escape"
import { toolPages } from "../../tools/config"

export const ToolsPage: QuartzEmitterPlugin = () => {
  const opts: FullPageLayout = {
    ...sharedPageComponents, ...defaultListPageLayout,
    beforeBody: [...standardPageHeading({ crumbs: [{ displayName: "Home", path: "/" }, { displayName: "Share", path: "/Share/" }] }), CustomContentMeta({ showReadingTime: false, datePrefix: "更新于：", includeSeconds: true, placeholder: true })], afterBody: [sharedPageComponents.afterBody[0]], right: [DriveOperations()], pageBody: OpenList(),
  }
  const { head, header, beforeBody, pageBody, afterBody, left, right, footer } = opts
  async function* emit(ctx: BuildCtx, content: ProcessedContent[], resources: StaticResources) {
    const tool = toolPages[0]
    const slug = tool.slug as FullSlug
    const [tree, file] = defaultProcessedContent({ slug, frontmatter: { title: `星域: ${tool.title}`, description: tool.description, tags: [] } })
    const externalResources = pageResources("/" as RelativeURL, resources)
    const props: QuartzComponentProps = { ctx, fileData: file.data, externalResources, cfg: ctx.cfg.configuration,
      children: [], tree, allFiles: content.map(([, page]) => page.data) }
    // The shell is served at arbitrary depths. Keep assets and note links rooted
    // at the site instead of resolving them relative to the requested file path.
    const html = (await renderPage(props.cfg, slug, props, opts, externalResources)).replace(
      /\b(href|src)="(\.{1,2}(?:\/[^\"]*)?)"/g,
      (_, attr: string, value: string) => {
        const url = new URL(unescapeHTML(value), "https://quartz.invalid/Share/")
        return `${attr}="${escapeHTML(url.pathname + url.search + url.hash)}"`
      },
    )
    yield write({ ctx, content: html, slug, ext: ".html" })

  }
  return {
    name: "ToolsPage",
    getQuartzComponents() { return [head, HeaderConstructor(), BodyConstructor(), ...header, ...beforeBody, pageBody, ...afterBody, ...left, ...right, footer] },
    emit, partialEmit: emit,
  }
}
