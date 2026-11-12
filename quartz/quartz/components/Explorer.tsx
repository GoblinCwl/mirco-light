import { createHash } from "node:crypto"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/explorer.scss"
import LoadingStars from "./LoadingStars"

// @ts-ignore
import script from "./scripts/explorer.inline"
import { isListed } from "../util/contentVisibility"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { FileTrieNode } from "../util/fileTrie"
import OverflowListFactory from "./OverflowList"
import RecentNotesFactory from "./RecentNotes"
import { concatenateResources } from "../util/resources"
import { toolPages } from "../tools/config"
import { homeIcons } from "../home/icons"

type OrderEntries = "sort" | "filter" | "map"

export interface Options {
  title?: string
  folderDefaultState: "collapsed" | "open"
  folderClickBehavior: "collapse" | "link"
  useSavedState: boolean
  sortFn: (a: FileTrieNode, b: FileTrieNode) => number
  filterFn: (node: FileTrieNode) => boolean
  mapFn: (node: FileTrieNode) => void
  order: OrderEntries[]
}

const defaultOptions: Options = {
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: true,
  mapFn: (node) => {
    return node
  },
  sortFn: (a, b) => {
    // Sort order: folders first, then files. Sort folders and files alphabeticall
    if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
      // numeric: true: Whether numeric collation should be used, such that "1" < "2" < "10"
      // sensitivity: "base": Only strings that differ in base letters compare as unequal. Examples: a ≠ b, a = á, a = A
      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    }

    if (!a.isFolder && b.isFolder) {
      return 1
    } else {
      return -1
    }
  },
  filterFn: (node) => node.slugSegment !== "tags",
  order: ["filter", "map", "sort"],
}

export type FolderState = {
  path: string
  collapsed: boolean
}

let numExplorers = 0
const DirectoryChevron = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="5 8 14 8"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fold">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
export default ((userOpts?: Partial<Options>) => {
  const opts: Options = { ...defaultOptions, ...userOpts }
  const { OverflowList, overflowListAfterDOMLoaded } = OverflowListFactory()

  const MobileRecentNotes = RecentNotesFactory({ title: "流新", limit: 5, showTags: false })
  const Explorer: QuartzComponent = (props: QuartzComponentProps) => {
    const { cfg, displayClass } = props
    const id = `explorer-${numExplorers++}`
    // The tree uses the shared article projection of the server catalog fetched for this visit.
    // Per-page allFiles snapshots can differ after incremental builds; using
    // them here would repeatedly discard the same live tree during navigation.
    const directoryVersion = createHash("sha256").update(JSON.stringify([
      "directory-layout-v21-horizon-realm",
      opts.title, opts.folderClickBehavior, opts.folderDefaultState, opts.useSavedState,
      opts.order, opts.sortFn.toString(), opts.filterFn.toString(), opts.mapFn.toString(), toolPages, cfg.locale,
    ])).digest("hex").slice(0, 16)
    const articleRoots = new Set(props.allFiles.filter(file => file.slug && file.slug !== "index" && isListed(file, cfg) && !/^(tags|Share|Repo|Video)(?:\/|$)/.test(file.slug)).map(file => file.slug!.split("/")[0]))
    const driveDirectory = () => (
      toolPages.map(tool => (
          <li class="directory-tools directory-drive"><details class="drive-nav" open={props.fileData.slug === tool.slug}>
            <summary tabindex={-1}><button type="button" class="drive-folder-toggle" aria-label={`展开 ${tool.title}`} aria-expanded={props.fileData.slug === tool.slug}><DirectoryChevron /></button><a href={tool.href} data-no-popover="true">{tool.title}</a></summary>
            <ul data-drive-entry-list aria-busy="true"><li class="drive-nav-status"><LoadingStars label="正在读取 Share 入口" /></li></ul>
          </details></li>
        ))
    )
    const realmDirectory = (mobile: boolean) => (
      <details class={`directory-tools directory-realm is-loaded ${mobile ? "directory-tools-mobile" : "directory-tools-desktop"}`} data-realm-directory open>
        <summary><h2>星垣</h2><DirectoryChevron /></summary>
        <ul>{[{ title: "视界", href: "/reading/", slug: "reading/index", icon: "reading" }, { title: "标签", href: "/tags/", slug: "tags/index", icon: "tags" }, { title: "友链", href: "/friends/", slug: "friends/index", icon: "friends" }, { title: "星枢", href: "/observatory/", slug: "observatory/index", icon: "observatory" }, { title: "关于", href: "/about/", slug: "", icon: "about" }].map(link => (
          <li><a href={link.href} data-about-link={link.icon === "about" ? "true" : undefined} data-no-popover="true" class={props.fileData.slug === link.slug ? "active" : undefined} aria-current={props.fileData.slug === link.slug ? "page" : undefined}><span class="realm-entry-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: homeIcons[link.icon] }} /><span>{link.title}</span></a></li>
        ))}</ul>
      </details>
    )

    return (
      <div class="directory-frame"><div class="directory-scroll" data-directory-version={directoryVersion}><div
        class={classNames(displayClass, "explorer")}
        data-behavior={opts.folderClickBehavior}
        data-collapsed={opts.folderDefaultState}
        data-savestate={opts.useSavedState}
        data-data-fns={JSON.stringify({
          order: opts.order,
          sortFn: opts.sortFn.toString(),
          filterFn: opts.filterFn.toString(),
          mapFn: opts.mapFn.toString(),
        })}
      >
        <button
          type="button"
          class="explorer-toggle mobile-explorer hide-until-loaded"
          data-mobile={true}
          aria-controls={id}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide-menu"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          class="title-button explorer-toggle desktop-explorer"
          data-mobile={false}
          aria-expanded={true}
        >
          <h2>{opts.title ?? i18n(cfg.locale).components.explorer.title}</h2>
          <DirectoryChevron />
        </button>
        <div id={id} class="explorer-content" aria-expanded={false} role="group">
          <details class="mobile-directory-explore" open>
            <summary><DirectoryChevron /><span>星域</span></summary>
            <div class="directory-root-list">
              <div class="explorer-loading" role="status" aria-label="正在加载星域目录">
                <ul class="explorer-skeleton overflow" aria-hidden="true">
                  {Array.from(articleRoots,(_,index)=><li>
                    <div class="explorer-skeleton-folder">
                      <span class="folder-icon explorer-skeleton-arrow"/>
                      <div><button class="folder-button" type="button" disabled tabIndex={-1}><span class="folder-title explorer-skeleton-label" style={`width:${[48,65,55][index%3]}%`}>{'\u00a0'}</span></button></div>
                    </div>
                  </li>)}
                  {Array.from({length:toolPages.length+2},(_,index)=><li class="directory-tools is-loaded">
                    <details class="drive-branch"><summary tabIndex={-1}>
                      <button class="drive-folder-toggle" type="button" disabled tabIndex={-1}><span class="explorer-skeleton-arrow"/></button>
                      <span class="explorer-skeleton-label" style={`width:${[46,52,50][index%3]}%`}>{'\u00a0'}</span>
                    </summary></details>
                  </li>)}
                  <li class="overflow-end"/>
                </ul>
              </div>
              <OverflowList class="explorer-ul">{driveDirectory()}<li class="directory-tools directory-repo"><details class="repo-nav drive-branch" data-repo-nav open={props.fileData.slug?.startsWith("Repo/")}><summary><button type="button" class="drive-folder-toggle" data-repo-toggle aria-label="展开 Repo" aria-expanded={props.fileData.slug?.startsWith("Repo/")}><DirectoryChevron /></button><a href="/Repo/" data-no-popover="true">Repo</a></summary><ul data-repo-nav-list aria-busy="true"><li class="drive-nav-status"><LoadingStars label="正在读取仓库" /></li></ul></details></li><li class="directory-tools directory-video"><details class="video-nav drive-branch" data-video-nav open={props.fileData.slug?.startsWith("Video/")}><summary tabindex={-1}><button type="button" class="drive-folder-toggle" aria-label="展开 Video" aria-expanded={props.fileData.slug?.startsWith("Video/")}><DirectoryChevron /></button><a href="/Video/" data-no-popover="true">Video</a></summary><ul data-video-nav-list aria-busy="true"><li class="drive-nav-status"><LoadingStars label="正在读取视频目录" /></li></ul></details></li></OverflowList>
            </div>
          </details>
          {realmDirectory(true)}
          <details class="mobile-directory-recent" open>
            <summary>流新</summary>
            <MobileRecentNotes {...props} displayClass={undefined} />
          </details>

        </div>
        <template id="template-file">
          <li>
            <a href="#"></a>
          </li>
        </template>
        <template id="template-folder">
          <li>
            <div class="folder-container">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="5 8 14 8"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="folder-icon"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <div>
                <button class="folder-button">
                  <span class="folder-title"></span>
                </button>
              </div>
            </div>
            <div class="folder-outer">
              <ul class="content"></ul>
            </div>
          </li>
        </template>
      </div>{realmDirectory(false)}</div></div>
    )
  }

  Explorer.css = style + "\n" + MobileRecentNotes.css
  Explorer.afterDOMLoaded = concatenateResources(script, overflowListAfterDOMLoaded)
  return Explorer
}) satisfies QuartzComponentConstructor
