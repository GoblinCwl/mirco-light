import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { PageList, byDateAndAlphabetical } from "../PageList"
import style from "../styles/listPage.scss"
// @ts-ignore
import directorySortScript from "../scripts/directorySort.inline"
import { concatenateResources } from "../../util/resources"

export default (() => {
  const ArchiveContent: QuartzComponent = (props: QuartzComponentProps) => {
    const pages = props.allFiles.filter(
      (file) =>
        file.slug &&
        file.slug !== "index" &&
        !file.slug.startsWith("tags/") &&
        file.slug !== "archives" &&
        !file.slug.startsWith("archives/"),
    )
    const cfg = { ...props.cfg, defaultDateType: "modified" as const }

    return (
      <div class="popover-hint directory-page"><div class="page-listing">
        <p>共 {pages.length} 篇文章。</p>
        <PageList {...props} sourceLabels directoryLayout directorySort="modified" cfg={cfg} allFiles={pages} sort={byDateAndAlphabetical(cfg)} />
      </div></div>
    )
  }

  ArchiveContent.afterDOMLoaded = directorySortScript
  ArchiveContent.css = concatenateResources(style, PageList.css)
  return ArchiveContent
}) satisfies QuartzComponentConstructor
