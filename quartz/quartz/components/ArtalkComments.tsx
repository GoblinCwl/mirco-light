import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { simplifySlug } from "../util/path"
// @ts-ignore
import script from "./scripts/artalk.inline"
// @ts-ignore
import style from "./styles/artalk.scss"
// @ts-ignore
import readerModeStyle from "./styles/artalk-readermode.scss"

type Options = {
  server: string
  site: string
  theme?: string
  lang?: string
  darkMode?: boolean
  useBackendConf?: boolean
  pageKey?: string
  pageTitle?: string
}

export default ((opts: Options) => {
  const ArtalkComments: QuartzComponent = ({ displayClass, fileData, cfg }: QuartzComponentProps) => {
    const frontmatter: any = fileData.frontmatter || {}
    // `false` is deliberately distinct from an absent value: it means the
    // page stays visible, but only an Artalk administrator may comment.
    const dynamicShare = fileData.slug === "Share/index" || fileData.slug === "Repo/index"
    const commentValue = frontmatter.comment
    if (!dynamicShare && commentValue !== true && commentValue !== false) {
      return <></>
    }
    const adminOnly = dynamicShare || commentValue === false
    const encrypted = Boolean(cfg.passProtected?.enabled && frontmatter.passphrase)

    // Artalk page keys must be the public URL path, not Quartz's source path
    // (e.g. `content/index.md`). Otherwise Artalk produces invalid page links.
    const pageKey =
      opts.pageKey || (fileData.slug ? simplifySlug(fileData.slug) : fileData.filePath) || ""
    const pageTitle = opts.pageTitle || (frontmatter.title as string) || ""

    return (
      <div
        id="artalk-comments"
        class={classNames(
          displayClass,
          "artalk-comments",
          "artalk-loading",
          adminOnly ? "artalk-admin-only-pending" : "",
        )}
        hidden={dynamicShare || encrypted}
        data-drive-share-comments={dynamicShare ? "pending" : undefined}
        data-server={opts.server}
        data-site={opts.site}
        data-theme={opts.theme ?? "light"}
        data-lang={opts.lang ?? "zh-CN"}
        data-dark-mode={opts.darkMode ? "true" : "false"}
        data-use-backend-conf={opts.useBackendConf ? "true" : "false"}
        data-page-key={pageKey}
        data-page-title={pageTitle}
        data-admin-only={adminOnly ? "true" : "false"}
      ></div>
    )
  }

  ArtalkComments.afterDOMLoaded = script
  ArtalkComments.css = [style, readerModeStyle]

  return ArtalkComments
}) satisfies QuartzComponentConstructor<Options>
