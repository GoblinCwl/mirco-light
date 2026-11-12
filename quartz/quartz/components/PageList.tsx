import {tagHref} from "../util/tagLink"
import {formatDirectoryDate} from '../util/formatDate'
import {fileTypeIcons} from '../util/fileTypeIcons'
import { isFolderPath, resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import { Date, getDate, formatDate } from "./Date"
import { QuartzComponent, QuartzComponentProps } from "./types"
import { GlobalConfiguration } from "../cfg"
import EncryptedMark from "./EncryptedMark"

export type SortFn = (f1: QuartzPluginData, f2: QuartzPluginData) => number

export function byDateAndAlphabetical(cfg: GlobalConfiguration): SortFn {
  return (f1, f2) => {
    // Sort by date/alphabetical
    if (f1.dates && f2.dates) {
      // sort descending
      return getDate(cfg, f2)!.getTime() - getDate(cfg, f1)!.getTime()
    } else if (f1.dates && !f2.dates) {
      // prioritize files with dates
      return -1
    } else if (!f1.dates && f2.dates) {
      return 1
    }

    // otherwise, sort lexographically by title
    const f1Title = f1.frontmatter?.title.toLowerCase() ?? ""
    const f2Title = f2.frontmatter?.title.toLowerCase() ?? ""
    return f1Title.localeCompare(f2Title)
  }
}

export function byDateAndAlphabeticalFolderFirst(cfg: GlobalConfiguration): SortFn {
  return (f1, f2) => {
    // Sort folders first
    const f1IsFolder = isFolderPath(f1.slug ?? "")
    const f2IsFolder = isFolderPath(f2.slug ?? "")
    if (f1IsFolder && !f2IsFolder) return -1
    if (!f1IsFolder && f2IsFolder) return 1

    // If both are folders or both are files, sort by date/alphabetical
    if (f1.dates && f2.dates) {
      // sort descending
      return getDate(cfg, f2)!.getTime() - getDate(cfg, f1)!.getTime()
    } else if (f1.dates && !f2.dates) {
      // prioritize files with dates
      return -1
    } else if (!f1.dates && f2.dates) {
      return 1
    }

    // otherwise, sort lexographically by title
    const f1Title = f1.frontmatter?.title.toLowerCase() ?? ""
    const f2Title = f2.frontmatter?.title.toLowerCase() ?? ""
    return f1Title.localeCompare(f2Title)
  }
}

type Props = {
  showTags?: boolean
  directoryLayout?: boolean
  directorySort?: "name" | "modified"
  sourceLabels?: boolean
  limit?: number
  sort?: SortFn
} & QuartzComponentProps

export const PageList: QuartzComponent = ({ cfg, fileData, allFiles, limit, sort, sourceLabels, showTags, directoryLayout, directorySort = "name" }: Props) => {
  const sorter = sort ?? (directoryLayout ? ((a, b) => Number(isFolderPath(b.slug ?? "")) - Number(isFolderPath(a.slug ?? "")) || (a.frontmatter?.title || "").localeCompare(b.frontmatter?.title || "", "zh-CN", { numeric: true })) as SortFn : byDateAndAlphabeticalFolderFirst(cfg))
  let list = allFiles.sort(sorter)
  if (limit) {
    list = list.slice(0, limit)
  }

  if (directoryLayout) {
    const hasDates = true
    const hasTags = showTags ?? list.some(page => page.frontmatter?.tags?.length)
    return <table class="directory-table" data-directory-list data-directory-initial-sort={directorySort} aria-label="文章目录">
      <thead><tr><th class="drive-kind-cell"><span class="directory-column-label">类型</span></th><th class="drive-name-cell" aria-sort={directorySort === "name" ? "ascending" : undefined}><button type="button" class={directorySort === "name" ? "is-sorted" : undefined} data-directory-sort="name" title="按名称排序，Shift+点击添加次级排序">名称<span class="drive-sort-indicator" aria-hidden="true">{directorySort === "name" ? "↑" : "↕"}</span></button></th>{hasTags && <th class="drive-tags-cell"><span class="directory-column-label">标签</span></th>}{hasDates && <th class="drive-modified-cell" aria-sort={directorySort === "modified" ? "descending" : undefined}><button type="button" class={directorySort === "modified" ? "is-sorted" : undefined} data-directory-sort="modified" title="按更新时间排序，Shift+点击添加次级排序">更新时间<span class="drive-sort-indicator" aria-hidden="true">{directorySort === "modified" ? "↓" : "↕"}</span></button></th>}</tr></thead>
      <tbody>{list.map(page => {
        const directory = isFolderPath(page.slug ?? ""), encrypted = Boolean(cfg.passProtected?.enabled && page.frontmatter?.passphrase)
        const updated = page.dates?.modified
        return <tr data-directory-name={page.frontmatter?.title || ""} data-directory-folder={String(directory)} data-directory-modified={updated && Number.isFinite(updated.getTime()) ? updated.getTime() : ""}>
          <td class="drive-kind-cell"><span class="drive-file-icon" role="img" aria-label={directory ? "文件夹" : "文章"} dangerouslySetInnerHTML={{__html:directory ? fileTypeIcons.folder : fileTypeIcons.article}}/></td>
          <td class="drive-name-cell"><div class="drive-entry-name">{encrypted && <EncryptedMark/>}<a class="internal drive-file-open" href={resolveRelative(fileData.slug!, page.slug!)} data-no-popover={encrypted ? "true" : undefined}><span class="drive-file-name">{page.frontmatter?.title}</span></a></div></td>
          {hasTags && <td class="drive-tags-cell">{!!page.frontmatter?.tags?.length && <ul class="tags directory-tags" title={page.frontmatter.tags.map(tag => `#${tag}`).join(" · ")}><li><a class="internal tag-link" data-no-popover="true" href={tagHref(page.frontmatter.tags[0])}>{page.frontmatter.tags[0]}</a></li>{page.frontmatter.tags.length > 1 && <li><span class="directory-tags-more">+{page.frontmatter.tags.length - 1}</span></li>}</ul>}</td>}
          {hasDates && <td class="drive-modified-cell">{updated && Number.isFinite(updated.getTime()) ? <span title={updated.toLocaleString(cfg.locale)}><time datetime={updated.toISOString()}><span class="directory-date-full">{formatDate(updated,cfg.locale)}</span><span class="directory-date-compact">{formatDirectoryDate(updated,cfg.locale)}</span></time></span> : "—"}</td>}
        </tr>
      })}</tbody>
    </table>
  }

  return (
    <ul class={sourceLabels ? "section-ul source-labeled" : "section-ul"}>
      {list.map((page) => {
        const title = page.frontmatter?.title
        const tags = page.frontmatter?.tags ?? []
        const encrypted = Boolean(cfg.passProtected?.enabled && page.frontmatter?.passphrase)

        return (
          <li class="section-li">
            <div class="section">
              <p class="meta">
                {sourceLabels ? (isFolderPath(page.slug ?? "") ? "DIR" : "NOTE") : page.dates && <Date date={getDate(cfg, page)!} locale={cfg.locale} />}
              </p>
              <div class="desc">
                <h3>
                  <a
                    href={resolveRelative(fileData.slug!, page.slug!)}
                    class="internal"
                    data-no-popover={encrypted ? "true" : undefined}
                  >
                    {encrypted && <EncryptedMark />}
                    {title}
                  </a>
                </h3>
              </div>
              <ul class="tags">
                {tags.map((tag) => (
                  <li>
                    <a
                      class="internal tag-link"
                      data-no-popover="true"
                      href={tagHref(tag)}
                    >
                      {tag}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

PageList.css = `
.section h3 {
  margin: 0;
}

.section > .tags {
  margin: 0;
}
`
