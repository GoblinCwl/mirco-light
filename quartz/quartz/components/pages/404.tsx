import { i18n } from "../../i18n"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/errorPage.scss"

const NotFound: QuartzComponent = ({ cfg, fileData }: QuartzComponentProps) => {
  // If baseUrl contains a pathname after the domain, use this as the home link
  const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
  const baseDir = url.pathname

  return (
    <article class="popover-hint error-page">
      <h1>{fileData.slug === "403" ? "光锥之外" : "迷失星海"}</h1>
      <p>{fileData.slug === "403" ? "403 · 星海无垠，所见终有边界。" : i18n(cfg.locale).pages.error.notFound}</p>
      <a href={baseDir}>{i18n(cfg.locale).pages.error.home}</a>
    </article>
  )
}

NotFound.css = style

export default (() => NotFound) satisfies QuartzComponentConstructor
