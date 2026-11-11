// @ts-ignore
import activityTimelineScript from "./scripts/activityTimeline.inline"
import infiniteScrollStyle from "./styles/infiniteScroll.scss"
// @ts-ignore
import siteSettingsScript from "./scripts/siteSettings.inline"
// @ts-ignore
import clipboardScript from "./scripts/clipboard.inline"
import clipboardStyle from "./styles/clipboard.scss"
// @ts-ignore
import pureModeScript from "./scripts/puremode.inline"
// @ts-ignore
import pureModePreScript from "./scripts/puremode-pre.inline"
// @ts-ignore
import visitorTrackingScript from "./scripts/visitorTracking.inline"
// @ts-ignore
import icpScript from "./scripts/icp.inline"
import pureModeStyle from "./styles/puremode.scss"
import catalogStyle from "./styles/catalogControls.scss"
import creatorStyle from "./styles/creatorProfile.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const Body: QuartzComponent = (props: QuartzComponentProps) => {
  const { children } = props
  return <div id="quartz-body">{children}</div>
}

// Apply the pure-mode marker before the first paint. The remaining DOM work
// (such as replacing the footer) still happens after the document is ready.
Body.beforeDOMLoaded = pureModePreScript
Body.afterDOMLoaded = [clipboardScript, pureModeScript, visitorTrackingScript, icpScript, siteSettingsScript, activityTimelineScript]
Body.css = clipboardStyle + "\n" + pureModeStyle + "\n" + infiniteScrollStyle + "\n" + catalogStyle + "\n" + creatorStyle

export default (() => Body) satisfies QuartzComponentConstructor
