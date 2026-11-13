import {isDirectoryListed} from "../../util/directoryVisibility"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

import style from "../styles/listPage.scss"
// @ts-ignore
import directorySortScript from "../scripts/directorySort.inline"
import { PageList, SortFn } from "../PageList"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { QuartzPluginData } from "../../plugins/vfile"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import { trieFromAllFiles } from "../../util/ctx"
import { DirectoryDates } from "../../util/directoryDates"

interface FolderContentOptions {
  /**
   * Whether to display number of folders
   */
  showFolderCount: boolean
  showSubfolders: boolean
  sort?: SortFn
}

const defaultOptions: FolderContentOptions = {
  showFolderCount: true,
  showSubfolders: true,
}

export default ((opts?: Partial<FolderContentOptions>) => {
  const options: FolderContentOptions = { ...defaultOptions, ...opts }

  const FolderContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, cfg } = props
    const allFiles=props.allFiles.filter(file=>isDirectoryListed(String(file.relativePath??file.slug),cfg.directoryHiddenPatterns))

    const trie = cfg.directoryHiddenPatterns?.length?trieFromAllFiles(allFiles):(props.ctx.trie ??= trieFromAllFiles(allFiles))
    const folder = trie.findNode(fileData.slug!.split("/"))
    if (!folder) {
      return null
    }

    if (!props.ctx.directoryDates) {
      props.ctx.directoryDates = new DirectoryDates()
      props.ctx.directoryDates.sync(allFiles)
    }
    const directoryDates = props.ctx.directoryDates
    const allPagesInFolder = folder.children.filter(node=>isDirectoryListed(node.slug,cfg.directoryHiddenPatterns)).flatMap<QuartzPluginData>(node => {
      if (node.isFolder && options.showSubfolders) {
        return [{
          ...node.data,
          slug: node.slug,
          dates: directoryDates.get(node.slug),
          frontmatter: node.data?.frontmatter ?? { title: node.displayName, tags: [] },
        }]
      }
      return node.data ? [node.data] : []
    })

    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    const listProps = {
      ...props,
      sort: options.sort,
      allFiles: allPagesInFolder,
    }

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren

    return (
      <div class="popover-hint directory-page">
        <article class={classes}>{content}</article>
        <div class="page-listing">
          {options.showFolderCount && (
            <p>
              {i18n(cfg.locale).pages.folderContent.itemsUnderFolder({
                count: allPagesInFolder.length,
              })}
            </p>
          )}
          <div>
            <PageList {...listProps} sourceLabels directoryLayout />
          </div>
        </div>
      </div>
    )
  }

  FolderContent.css = concatenateResources(style, PageList.css)
  FolderContent.afterDOMLoaded = directorySortScript
  return FolderContent
}) satisfies QuartzComponentConstructor
