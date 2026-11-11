import dialogStyle from "../styles/driveOperations.scss"
// @ts-ignore
import tagEditor from "../scripts/contentTagEditor.inline"
import { QuartzComponent, QuartzComponentConstructor } from "../types"
import style from "../styles/repo.scss"
// @ts-ignore
import script from "../scripts/repo.inline"
// @ts-ignore
import directorySort from "../scripts/directorySort.inline"
import { concatenateResources } from "../../util/resources"
import Graph from "../Graph"

const RepoGraph = Graph()
export const RepoSidebar: QuartzComponent = (props) => <aside class="repo-aside">
  <section class="repo-local-graph" data-repo-graph hidden><RepoGraph {...props} /></section>
  <div data-repo-aside />
</aside>
RepoSidebar.css = RepoGraph.css
RepoSidebar.afterDOMLoaded = RepoGraph.afterDOMLoaded

export default (() => {
  const Repo: QuartzComponent = () => <div class="repo-frame"><article class="repo-page" data-repo-page aria-busy="true" /><span class="repo-initial-loading" data-repo-initial-loading role="status" aria-label="正在读取仓库"><span class="drive-loading" aria-hidden="true"><i /></span></span></div>
  Repo.css = [style,dialogStyle]
  Repo.afterDOMLoaded = concatenateResources(script, directorySort,tagEditor)
  return Repo
}) satisfies QuartzComponentConstructor
