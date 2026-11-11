import {fileNameIcon} from '../../util/fileTypeIcons'
import { repoEscape as e, repoHref, repoIcons, repoLanguages, type RepoSummary } from "./repoShared"
import { paginateCatalog, catalogSortControl, catalogPagination } from "./catalogControls"
export type RepoCommit = { sha: string; subject: string; author: string; date: string }
export type RepoEntry = { name: string; path: string; type: "directory" | "file" | "submodule" | "symlink"; sha: string; lastCommit?: RepoCommit | null }
export type RepoSort = "updated" | "name" | "language"
const starIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>'
export function sortRepoCatalog(repos: RepoSummary[], sort: RepoSort) {
  return [...repos].sort((a,b) => {
    if (sort === "updated") {
      const difference = (Date.parse(b.pushed_at || "") || 0) - (Date.parse(a.pushed_at || "") || 0)
      if (difference) return difference
    }
    if (sort === "language") {
      const left = a.language || "其他", right = b.language || "其他"
      const difference = Number(left === "其他") - Number(right === "其他") || left.localeCompare(right,"zh-CN")
      if (difference) return difference
    }
    return a.name.localeCompare(b.name,"zh-CN",{numeric:true})
  })
}
export function repoTime(value: string | null | undefined) {
  const timestamp = Date.parse(value || "")
  if (!Number.isFinite(timestamp)) return "—"
  const age = Math.max(0, Date.now() - timestamp), days = Math.floor(age / 86400000)
  const label = age < 60000 ? "刚刚" : age < 3600000 ? `${Math.floor(age / 60000)} 分钟前` : age < 86400000 ? `${Math.floor(age / 3600000)} 小时前` : days < 30 ? `${days} 天前` : new Date(timestamp).toLocaleDateString("zh-CN")
  return `<time datetime="${e(value)}" title="${e(new Date(timestamp).toLocaleString("zh-CN"))}">${label}</time>`
}
export function repoList(repos: RepoSummary[]) {
  return `<div class="repo-card-grid">${repos.map(repo => `<article class="repo-card"><header>${repoIcons.repo}<div class="repo-card-title">${repo.fork ? '<span class="repo-title-tag">Fork</span>' : ""}<a href="${e(repoHref(repo.name))}" data-no-popover="true">${e(repo.name)}</a>${repo.archived ? '<span class="repo-title-tag">已归档</span>' : ""}</div></header><p>${e(repo.description || "暂无项目简介")}</p><footer><a class="repo-card-language" href="${e(repoHref("",{language:repo.language || "其他"}))}" data-no-popover="true"><span class="repo-language-dot" data-language="${e(repo.language || "其他")}"></span>${e(repo.language || "其他")}</a><span class="repo-card-stat" title="Star">${starIcon}${repo.stargazers_count || 0}</span><span class="repo-card-stat" title="Fork">${repoIcons.branch}${repo.forks_count || 0}</span><span class="repo-card-date">更新于 ${repoTime(repo.pushed_at)}</span></footer></article>`).join("")}</div>`
}
export function repoCatalogHref(language: string, sort: RepoSort, page = 1) {
  return repoHref("", {language:language || undefined,sort:sort==="updated"?undefined:sort,page:page>1?String(page):undefined})
}
export function repoCatalogView(repos: RepoSummary[], language: string, sort: RepoSort, requested: number) {
  const filtered = repos.filter(repo=>!language || (repo.language||"其他")===language)
  const page = paginateCatalog(sortRepoCatalog(filtered,sort),requested)
  const categories = [["",repos.length],...repoLanguages(repos).map(label=>[label,repos.filter(repo=>(repo.language||"其他")===label).length])] as [string,number][]
  return `<section class="repo-language-section"><div class="catalog-section-heading"><h2>语言分类</h2><span>${categories.length-1} 类</span></div><nav class="repo-language-nav catalog-category-nav" aria-label="仓库语言分类">${categories.map(([label,count])=>`<a href="${e(repoCatalogHref(label,sort))}" data-no-popover="true"${label===language?' aria-current="page"':''}>${label?`<span class="repo-language-dot" data-language="${e(label)}"></span>`:repoIcons.repo}<span>${e(label||"全部")}</span><small>${count}</small></a>`).join("")}</nav></section><section data-repo-catalog-section><div class="catalog-toolbar"><span>共 ${filtered.length} 个仓库</span>${catalogSortControl("data-repo-catalog-sort","仓库排序",[["updated","最近更新"],["name","仓库名称"],["language","主要语言"]],sort)}</div>${repoList(page.items)}${filtered.length?"":'<p class="repo-notice">该分类暂无仓库</p>'}${catalogPagination(page.page,page.pages,value=>repoCatalogHref(language,sort,value))}</section>`
}
export function repoCommitAvatar(author:string) {
  const local=author.trim().toLowerCase()==="goblincwl"
  const image=local?'<img src="/static/Profile_compressed.png" alt="" width="24" height="24" decoding="async" no-view />':e(Array.from(author)[0]||"G")
  return `<span class="repo-commit-avatar${local?' image-container':''}" aria-hidden="true">${image}</span>`
}
export function repoLatestCommit(commit: RepoCommit | null | undefined, name: string, ref: string) {
  if (!commit) return ""
  const href = repoHref(name,{ref:ref || undefined,tab:"commits",commit:commit.sha})
  return `<div class="repo-latest-commit">${repoCommitAvatar(commit.author)}<strong>${e(commit.author)}</strong><a class="repo-latest-subject" href="${e(href)}" title="${e(commit.subject || "无提交说明")}" data-no-popover="true">${e(commit.subject || "无提交说明")}</a><a class="repo-commit-sha" href="${e(href)}" data-no-popover="true">${e(commit.sha.slice(0,7))}</a>${repoTime(commit.date)}</div>`
}
export function repoFiles(entries: RepoEntry[], name: string, ref: string, folder: string) {
  const rows: RepoEntry[] = folder ? [{ name: "..", path: folder.split("/").slice(0, -1).join("/"), type: "directory", sha: "" }, ...entries] : entries
  return `<div class="repo-files-wrap"><table class="repo-files-table" data-directory-list data-directory-initial-sort="name" aria-label="代码文件列表"><thead><tr><th aria-sort="ascending"><button type="button" data-directory-sort="name" class="is-sorted">名称<span class="drive-sort-indicator">↑</span></button></th><th>最近提交</th><th><button type="button" data-directory-sort="modified">提交时间<span class="drive-sort-indicator">↕</span></button></th></tr></thead><tbody>${rows.map(entry => {
    const commit = entry.lastCommit
    const href = commit ? repoHref(name,{ref:ref || undefined,tab:"commits",commit:commit.sha}) : ""
    return `<tr data-directory-name="${e(entry.name)}" data-directory-folder="${entry.type === "directory"}" data-directory-modified="${commit ? Date.parse(commit.date) || 0 : ""}"><td><div class="repo-file-name">${fileNameIcon(entry.name,entry.type === "directory")}<a href="${e(repoHref(name, { ref: ref || undefined, path: entry.path }))}" title="${e(entry.name)}" data-no-popover="true">${e(entry.name)}</a></div>${commit ? `<a class="repo-file-mobile-commit" href="${e(href)}" data-no-popover="true">${e(commit.subject || "无提交说明")}</a>` : ""}</td><td class="repo-file-commit">${commit ? `<a href="${e(href)}" title="${e(commit.subject || "无提交说明")}" data-no-popover="true">${e(commit.subject || "无提交说明")}</a>` : entry.name === ".." ? "上级目录" : "—"}</td><td class="repo-file-date">${repoTime(commit?.date)}</td></tr>`
  }).join("")}</tbody></table></div>`
}
