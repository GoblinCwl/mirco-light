import {activityTimeline} from "./activityTimeline"
import { creatorProfile, creatorIcons } from "./creatorProfile"
import { sidebarModule } from "./sidebarModule"
import { homeIcons } from "../../home/icons"
import { repoEscape as e, repoHref, type RepoCatalog, type RepoInfo } from "./repoShared"
import { sortRepoCatalog } from "./repoList"

export function repoCatalogSidebar(catalog: RepoCatalog) {
  const recent=sortRepoCatalog(catalog.repositories,"updated").slice(0,3)
  const profile=catalog.social?.profile
  return creatorProfile({platform:"github",name:profile?.name||catalog.owner,avatar:profile?.avatar||(catalog.owner.toLowerCase()==="goblincwl"?"/static/Profile_compressed.png":undefined),href:`https://github.com/${encodeURIComponent(catalog.owner)}`,subtitle:`@${profile?.login||catalog.owner}`,
    metrics:[{label:"公开仓库",icon:creatorIcons.repository,value:String(profile?.public_repos??catalog.repositories.length)},{label:"关注者",icon:creatorIcons.people,value:profile?.followers==null?'—':String(profile.followers)},{label:"正在关注",icon:creatorIcons.following,value:profile?.following==null?'—':String(profile.following)}]})+
    activityTimeline("仓库动态",catalog.social?.activities!=null?catalog.social.activities.map(item=>({...item,href:item.url|| (item.repository?.toLowerCase().startsWith(catalog.owner.toLowerCase()+"/")&&catalog.repositories.some(repo=>`${catalog.owner}/${repo.name}`.toLowerCase()===item.repository?.toLowerCase())?repoHref(item.repository.split("/")[1]):`https://github.com/${item.repository||catalog.owner}`)})):recent.map(repo=>({id:repo.name,repository:`${catalog.owner}/${repo.name}`,label:"更新仓库",text:"",date:repo.pushed_at||"",href:repoHref(repo.name)})))
}

export function repoSidebar(info: RepoInfo, ref: string) {
  const row = (label: string, value: string | number) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`
  const module = (title: string, body: string) => sidebarModule(title, body, "repo-sidebar-group", "repo-sidebar-group-heading")
  return module("仓库信息", `<div class="repo-sidebar-target">${homeIcons.github}<a href="${e(info.githubUrl)}" target="_blank" rel="noopener noreferrer" data-router-ignore="true" data-no-popover="true" title="${e(info.name)} · GitHub">${e(info.name)}</a></div><dl>${row("主要语言", info.language || "其他")}${row("开源协议", info.license?.spdx_id || info.license?.name || "未声明")}${row("Star", info.stargazers_count || 0)}${row("Fork", info.forks_count || 0)}</dl>${info.topics?.length ? `<div class="repo-topics">${info.topics.map(t => `<span>${e(t)}</span>`).join("")}</div>` : ""}`) + module("版本信息", `<dl>${row(ref.startsWith("refs/tags/") ? "当前标签" : "当前分支", ref.replace(/^refs\/(heads|tags)\//, ""))}${row("分支 / 标签", `${info.branches.length} / ${info.tags.length}`)}${row("当前提交", info.sha.slice(0, 10))}</dl>`)
}
