import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/homeDashboard.inline"
import style from "./styles/homeDashboard.scss"

/**
 * Provides build-time counts and runtime enhancements for the project homepage.
 */
const HomeDashboard: QuartzComponent = ({ allFiles, fileData }: QuartzComponentProps) => {
  if (fileData.slug !== "index") return null

  const notes = allFiles.filter((file) => file.slug && file.slug !== "index" && !file.slug.startsWith("tags/"))

  return (
    <div
      class="home-dashboard-data"
      data-article-count={notes.length}
      aria-hidden="true"
    />
  )
}

HomeDashboard.afterDOMLoaded = script
HomeDashboard.css = style

export default (() => HomeDashboard) satisfies QuartzComponentConstructor
