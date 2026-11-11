import { QuartzEmitterPlugin } from "../types"
import { ProcessedContent, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { QuartzComponentProps } from "../../components/types"
import CommentsContent from "../../components/pages/CommentsContent"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FullSlug, pathToRoot } from "../../util/path"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { write } from "./helpers"

export const CommentsPage: QuartzEmitterPlugin<Partial<FullPageLayout>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents, ...defaultListPageLayout, pageBody: CommentsContent(), ...userOpts,
  }
  const { head, header, beforeBody, pageBody, afterBody, left, right, footer } = opts
  async function* emit(ctx: BuildCtx, content: ProcessedContent[], resources: StaticResources) {
    const slug = "comments/index" as FullSlug
    const [tree, file] = defaultProcessedContent({ slug, frontmatter: { title: "全站评论", tags: [] } })
    const cfg = ctx.cfg.configuration
    const externalResources = pageResources(pathToRoot(slug), resources)
    const props: QuartzComponentProps = { ctx, fileData: file.data, externalResources, cfg, children: [], tree,
      allFiles: content.map(([, page]) => page.data) }
    const html = await renderPage(cfg, slug, props, opts, externalResources)
    yield write({ ctx, content: html, slug, ext: ".html" })
  }
  return {
    name: "CommentsPage",
    getQuartzComponents() { return [head, HeaderConstructor(), BodyConstructor(), ...header, ...beforeBody,
      pageBody, ...afterBody, ...left, ...right, footer] },
    emit, partialEmit: emit,
  }
}
