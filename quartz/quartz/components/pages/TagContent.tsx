import operationStyle from "../styles/driveOperations.scss"
import hoverStyle from "../styles/contentHover.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/listPage.scss"
import tagStyle from "../styles/tagPage.scss"
import { PageList } from "../PageList"
import { concatenateResources } from "../../util/resources"
// @ts-ignore
import script from "../scripts/tagContent.inline"

export default (() => {
  const TagContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { fileData } = props
    const slug = fileData.slug
    if (!(slug?.startsWith("tags/") || slug === "tags")) throw new Error(`Invalid tag page: ${slug}`)
    return <div class="popover-hint tag-index-page" data-tag-loading="" aria-busy="true" data-tag-page="">
      <>
        <span class="tag-index-loading" role="status" aria-label="正在汇聚星团"><svg class="tag-gather-loading" viewBox="0 0 144 80" fill="none" aria-hidden="true"><path class="tag-loader-flow" d="M13 58C35 31 91 17 132 26M21 65C50 43 100 36 125 15"/><g class="tag-loader-point"><path d="m35 43 1.5 5.5L42 50l-5.5 1.5L35 57l-1.5-5.5L28 50l5.5-1.5Z"/></g><g class="tag-loader-point"><path d="m109 19 1.5 5.5L116 26l-5.5 1.5L109 33l-1.5-5.5L102 26l5.5-1.5Z"/></g><g class="tag-loader-point"><circle cx="52" cy="25" r="1.8"/><circle cx="98" cy="55" r="1.4"/></g><path class="tag-loader-core" d="m72 25 3 11 11 3-11 3-3 11-3-11-11-3 11-3Z"/></svg></span>
        <div data-tag-index />
      </>
    </div>
  }
  TagContent.css = concatenateResources(style, tagStyle, PageList.css, hoverStyle, operationStyle)
  TagContent.afterDOMLoaded = script
  return TagContent
}) satisfies QuartzComponentConstructor
