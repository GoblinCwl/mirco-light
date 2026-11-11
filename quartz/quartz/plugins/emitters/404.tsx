import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FullPageLayout } from "../../cfg"
import { FullSlug } from "../../util/path"
import { sharedPageComponents } from "../../../quartz.layout"
import { NotFound } from "../../components"
import { defaultProcessedContent } from "../vfile"
import { write } from "./helpers"

export const NotFoundPage: QuartzEmitterPlugin = () => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    pageBody: NotFound(),
    beforeBody: [],
    left: [],
    right: [],
  }

  const { head: Head, pageBody, footer: Footer } = opts
  const Body = BodyConstructor()

  return {
    name: "404Page",
    getQuartzComponents() {
      return [Head, Body, pageBody, Footer]
    },
    async *emit(ctx, _content, resources) {
      const cfg = ctx.cfg.configuration
      const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
      const pages: Array<[number, string]> = []
      for (const code of [404, 403]) {
      const slug = String(code) as FullSlug

      const path = url.pathname as FullSlug
      const notFound = code === 403 ? "光锥之外" : "迷失星海"
      const [tree, vfile] = defaultProcessedContent({
        slug,
        text: notFound,
        description: notFound,
        frontmatter: { title: notFound, tags: [] },
      })
      const externalResources = pageResources(path, resources)
      const componentData: QuartzComponentProps = {
        ctx,
        fileData: vfile.data,
        externalResources,
        cfg,
        children: [],
        tree,
        allFiles: [],
      }

      const prepageContent = await renderPage(cfg, slug, componentData, opts, externalResources);
      pages.push([code, prepageContent])
      yield write({
        ctx,
        content: prepageContent,
        slug,
        ext: ".html",
      })
      // Other Nginx domains serve the same generated page. Resolve its shared
      // styles, scripts and home link against the blog, regardless of host/path.
      yield write({
        ctx,
        content: prepageContent.replace("<head>", `<head><base href="${url.href}">`),
        slug: `static/errors/${code}` as FullSlug,
        ext: ".html",
      })
      }
      const errorDirectory = process.env.QUARTZ_ERROR_PAGES_DIR
      if (errorDirectory) {
        try {
          // ComponentResources emits concurrently. Keep the previous snapshot
          // available while its replacement waits for this build's stylesheet.
          let css: string | undefined
          for (let attempt = 0; attempt < 100; attempt++) {
            try {
              // Written after index.css by ComponentResources: do not capture
              // a stylesheet whose write is still in progress.
              await access(join(ctx.argv.output, "postscript.js"))
              css = await readFile(join(ctx.argv.output, "index.css"), "utf8")
              break
            }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
          if (css === undefined) throw new Error("Error page stylesheet unavailable")
          await mkdir(errorDirectory, { recursive: true })
          for (const [code, html] of pages) {
            const standalone = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "")
              .replace("<head>", `<head><base href="${url.href}"><link rel="icon" href="${new URL("favicon.ico?v=profile-20261111", url).href}"><meta name="robots" content="noindex"><style>${css.replace(/<\/style/gi, "<\\/style")}</style><script>document.documentElement.setAttribute("saved-theme",matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")</script>`)
            const target = join(errorDirectory, `${code}.html`)
            await writeFile(`${target}.tmp`, standalone)
            await rename(`${target}.tmp`, target)
          }
        } catch (error) {
          console.warn("Error page snapshot retained:", error)
        }
      }
    },
    async *partialEmit() {},
  }
}
