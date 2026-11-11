import {fileTypeIcons} from '../../util/fileTypeIcons'
import type {Activity} from "./activityTimeline"
export type RepoSummary = {
  name: string; description: string | null; language: string | null; topics: string[] | null
  fork: boolean; archived: boolean; default_branch: string; pushed_at: string | null
  stargazers_count: number; forks_count: number; license: { name: string; spdx_id: string } | null
}
export type RepoCatalog = { owner: string; updatedAt: string; repositories: RepoSummary[]; social?:{profile?:{name:string|null;bio:string|null;avatar:string;login?:string;followers?:number;following?:number;public_repos?:number};activities:Activity[]|null} }
export type RepoInfo = RepoSummary & { owner: string; branches: string[]; tags: string[]; sha: string; githubUrl: string }
export const repoEscape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
export function repoHref(name = "", values: Record<string, string | undefined> = {}) {
  const url = new URL(`/Repo/${name ? encodeURIComponent(name) + "/" : ""}`, "https://repo.invalid")
  for (const [key, value] of Object.entries(values)) if (value) url.searchParams.set(key, value)
  return url.pathname + url.search
}
export function repoApi(name: string, action: string, values: Record<string, string> = {}) {
  return `/api/repo/${encodeURIComponent(name)}/${action}?${new URLSearchParams(values)}`
}
export function repoRoute(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean)
  return { name: segments[0] === "Repo" && segments[1] ? decodeURIComponent(segments[1]) : "", ref: url.searchParams.get("ref") || "", path: url.searchParams.get("path") || "", tab: url.searchParams.get("tab") || "code", language: url.searchParams.get("language") || "" }
}
export function repoLanguages(repositories: Pick<RepoSummary, "language">[]) {
  return [...new Set(repositories.map(r => r.language || "其他"))].sort((a, b) => Number(a === "其他") - Number(b === "其他") || a.localeCompare(b, "zh-CN"))
}
export function repoMarkdownLink(value: string, filename: string, name: string, ref: string, image = false) {
  if (value.startsWith("#")) return value
  if (/^(?:https?:|mailto:)/i.test(value)) return value
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return ""
  const base = new URL(filename.split("/").slice(0, -1).map(encodeURIComponent).join("/") + "/", "https://repo.invalid/")
  let resolved: URL, path: string
  try { resolved = new URL(value, base); path = decodeURIComponent(resolved.pathname.slice(1)) } catch { return "" }
  return (image ? repoApi(name, "raw", { ref, path }) : repoHref(name, { ref, path })) + resolved.hash
}
export const repoIcons = {
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7m2-4v5l3 2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 13-8 8L3 11V3h8Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',
  repo: fileTypeIcons.repo,
  branch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10a10 10 0 0 1-10 10"/></svg>',
  folder: fileTypeIcons.folder,
  file: fileTypeIcons.other,
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
}
