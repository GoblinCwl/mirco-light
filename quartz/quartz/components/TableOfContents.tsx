import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import modernStyle from "./styles/toc.scss"
import { restoreNavigationSkeleton } from "./scripts/navigationSkeleton"
import { classNames } from "../util/lang"

// @ts-ignore
import script from "./scripts/toc.inline"
import { i18n } from "../i18n"
import OverflowListFactory from "./OverflowList"
import { concatenateResources } from "../util/resources"

let numTocs = 0
export default (() => {
  const { OverflowList, overflowListAfterDOMLoaded } = OverflowListFactory()
  const TableOfContents: QuartzComponent = ({
    fileData,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    if (fileData.slug === "index") {
      const id = `toc-${numTocs++}`
      return (
        <div class={classNames(displayClass, "toc", "home-links-toc")}>
          <h3 class="home-links-title">寻径</h3>
          <OverflowList id={id} class="toc-content" aria-busy="true" aria-label="寻径链接加载中">
            {[3, 4].map(width => <li aria-hidden="true"><span class="home-link-icon"><span class="home-navigation-skeleton-icon"/></span><span class="home-navigation-placeholder-label" style={`width:${width}rem`}>{'\u00a0'}</span></li>)}
            <li class="home-registration-divider" aria-hidden="true"/>
            <li aria-hidden="true"><span class="home-navigation-placeholder-label home-navigation-placeholder-icp" style="width:9rem">{'\u00a0'}</span></li>
          </OverflowList>
          <script dangerouslySetInnerHTML={{ __html: `(${restoreNavigationSkeleton.toString()})(document.currentScript.previousElementSibling)` }} />
        </div>
      )
    }
    if (!fileData.toc) {
      return null
    }

    const id = `toc-${numTocs++}`
    const isEncrypted = cfg.passProtected?.enabled && fileData.frontmatter?.passphrase

    if (isEncrypted) {
      return null
    }

    return (
      <div class={classNames(displayClass, "toc")}>
        <button
          type="button"
          class={fileData.collapseToc ? "collapsed toc-header" : "toc-header"}
          aria-controls={id}
          aria-expanded={!fileData.collapseToc}
        >
          <h3>{i18n(cfg.locale).components.tableOfContents.title}</h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <OverflowList
          id={id}
          class={`${fileData.collapseToc ? "collapsed " : ""}toc-content`}>
          {fileData.toc.map((tocEntry) => (
            <li key={tocEntry.slug} class={`depth-${tocEntry.depth}`}>
              <a href={`#${tocEntry.slug}`} data-for={tocEntry.slug}>
                {tocEntry.text}
              </a>
            </li>
          ))}
        </OverflowList>
      </div>
    )
  }

  TableOfContents.css = modernStyle
  TableOfContents.afterDOMLoaded = concatenateResources(script, overflowListAfterDOMLoaded)

  return TableOfContents
}) satisfies QuartzComponentConstructor
