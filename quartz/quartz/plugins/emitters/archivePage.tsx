import { QuartzEmitterPlugin } from "../types"
import { ProcessedContent, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { QuartzComponentProps } from "../../components/types"
import ArchiveContent from "../../components/pages/ArchiveContent"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FullSlug, pathToRoot } from "../../util/path"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { write } from "./helpers"

export const ArchivePage: QuartzEmitterPlugin<Partial<FullPageLayout>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultListPageLayout,
    pageBody: ArchiveContent(),
    ...userOpts,
  }
  const { head, header, beforeBody, pageBody, afterBody, left, right, footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  async function* emit(ctx: BuildCtx, content: ProcessedContent[], resources: StaticResources) {
    const slug = "archives/index" as FullSlug
    const [tree, file] = defaultProcessedContent({
      slug,
      frontmatter: { title: "文章归档", tags: [] },
    })
    const cfg = ctx.cfg.configuration
    const externalResources = pageResources(pathToRoot(slug), resources)
    const props: QuartzComponentProps = {
      ctx,
      fileData: file.data,
      externalResources,
      cfg,
      children: [],
      tree,
      allFiles: content.map(([, page]) => page.data),
    }
    const html = await renderPage(cfg, slug, props, opts, externalResources)
    yield write({ ctx, content: html, slug, ext: ".html" })
  }

  return {
    name: "ArchivePage",
    getQuartzComponents() {
      return [
        head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        footer,
      ]
    },
    emit,
    // The complete published-content set is provided for adds, edits and deletes.
    partialEmit: emit,
  }
}
