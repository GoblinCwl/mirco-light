import operationStyle from "../styles/driveOperations.scss"
import hoverStyle from "../styles/contentHover.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/listPage.scss"
import tagStyle from "../styles/tagPage.scss"
// @ts-ignore
import directorySortScript from "../scripts/directorySort.inline"
import { PageList, SortFn } from "../PageList"
import { simplifySlug, type FullSlug } from "../../util/path"
import type { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import type { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
// @ts-ignore
import script from "../scripts/tagContent.inline"

interface TagContentOptions { sort?: SortFn; numPages: number }
export default ((opts?: Partial<TagContentOptions>) => {
  const TagContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, cfg } = props
    const slug = fileData.slug
    if (!(slug?.startsWith("tags/") || slug === "tags")) throw new Error(`Invalid tag page: ${slug}`)
    const tag = simplifySlug(slug.slice("tags/".length) as FullSlug)
    const index = tag === "/"
    const content = ((tree as Root).children.length === 0 ? fileData.description : htmlToJsx(fileData.filePath!, tree)) as ComponentChildren
    const labels = i18n(cfg.locale).pages.tagContent
    const template = index ? labels.totalTags({ count: 123456789 }) : labels.itemsUnderTag({ count: 123456789 })
    return <div class={index ? "popover-hint tag-index-page" : "popover-hint directory-page"} data-tag-loading="" aria-busy="true" data-tag-page={index ? "" : tag} data-tag-label={labels.tag} data-tag-count-template={template} data-tag-items-template={labels.itemsUnderTag({ count: 123456789 })}>
      <article class={(fileData.frontmatter?.cssclasses ?? []).join(" ")}>{content}</article>
      {index ? <>
        <span class="tag-index-loading" role="status" aria-label="正在汇聚星团"><svg class="tag-gather-loading" viewBox="0 0 144 80" fill="none" aria-hidden="true"><path class="tag-loader-flow" d="M13 58C35 31 91 17 132 26M21 65C50 43 100 36 125 15"/><g class="tag-loader-point"><path d="m35 43 1.5 5.5L42 50l-5.5 1.5L35 57l-1.5-5.5L28 50l5.5-1.5Z"/></g><g class="tag-loader-point"><path d="m109 19 1.5 5.5L116 26l-5.5 1.5L109 33l-1.5-5.5L102 26l5.5-1.5Z"/></g><g class="tag-loader-point"><circle cx="52" cy="25" r="1.8"/><circle cx="98" cy="55" r="1.4"/></g><path class="tag-loader-core" d="m72 25 3 11 11 3-11 3-3 11-3-11-11-3 11-3Z"/></svg></span>
        <div data-tag-index />
        <template data-tag-directory-template><PageList {...props} directoryLayout showTags allFiles={[]} /></template>
      </> : <>
        <span class="tag-filter-loading" role="status"><span class="drive-loading" aria-hidden="true"><i /></span><span>正在读取项目</span></span>
        <div class="page-listing" data-tag-results>
          <p data-tag-count />
          <PageList {...props} sourceLabels directoryLayout showTags allFiles={[]} sort={opts?.sort} />
        </div>
      </>}
    </div>
  }
  TagContent.css = concatenateResources(style, tagStyle, PageList.css, hoverStyle, operationStyle)
  TagContent.afterDOMLoaded = concatenateResources(script, directorySortScript)
  return TagContent
}) satisfies QuartzComponentConstructor
