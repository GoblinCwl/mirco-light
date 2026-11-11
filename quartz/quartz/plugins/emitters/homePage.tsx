import { visibleExplore } from "../../util/contentVisibility"
import { fromHtml } from "hast-util-from-html"
import { QuartzEmitterPlugin } from "../types"
import { ProcessedContent, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { QuartzComponentProps } from "../../components/types"
import Content from "../../components/pages/Content"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FilePath, FullSlug, pathToRoot } from "../../util/path"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import { defaultContentPageLayout, sharedPageComponents } from "../../../quartz.layout"
import homeConfig from "../../home/config"
import { renderHomeMarkup } from "../../home/template"
import { write } from "./helpers"

export const HomePage: QuartzEmitterPlugin<Partial<FullPageLayout>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultContentPageLayout,
    pageBody: Content(),
    ...userOpts,
  }
  const { head, header, beforeBody, pageBody, afterBody, left, right, footer } = opts

  async function* emit(ctx: BuildCtx, content: ProcessedContent[], resources: StaticResources) {
    const slug = "index" as FullSlug
    const [, file] = defaultProcessedContent({
      slug,
      filePath: "quartz/home/template.ts" as FilePath,
      frontmatter: {
        title: homeConfig.title,
        description: homeConfig.description,
        tags: [],
        socialImage: homeConfig.profile.avatar.replace(/^\/static\//, ""),
      },
    })
    const tree = fromHtml(renderHomeMarkup(homeConfig.explore.filter(item => visibleExplore(item.href, ctx.cfg.configuration))), { fragment: true })
    const cfg = ctx.cfg.configuration
    const externalResources = pageResources(pathToRoot(slug), resources)
    const props: QuartzComponentProps = {
      ctx,
      fileData: file.data,
      cfg,
      externalResources,
      children: [],
      tree,
      allFiles: content.map(([, page]) => page.data),
    }
    const html = await renderPage(cfg, slug, props, opts, externalResources)
    yield write({ ctx, content: html, slug, ext: ".html" })
  }

  return {
    name: "HomePage",
    getQuartzComponents() {
      return [
        head,
        HeaderConstructor(),
        BodyConstructor(),
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
    partialEmit: emit,
  }
}
