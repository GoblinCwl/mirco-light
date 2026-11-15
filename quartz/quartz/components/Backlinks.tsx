import { QuartzComponent, QuartzComponentConstructor } from "./types"
import style from "./styles/backlinks.scss"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"
// @ts-ignore
import script from "./scripts/backlinks.inline"

interface BacklinksOptions { hideWhenEmpty: boolean; panel: boolean }
export default ((opts?: Partial<BacklinksOptions>) => {
  const options = { hideWhenEmpty: true, panel: false, ...opts }
  const Backlinks: QuartzComponent = ({displayClass,cfg}) => (
    <section class={classNames(displayClass,"backlinks",options.panel?"backlinks-panel":"")} data-backlinks data-backlinks-panel={options.panel?"true":undefined} data-hide-empty={String(options.hideWhenEmpty)} hidden>
      <h3>{i18n(cfg.locale).components.backlinks.title}</h3>
      <ul class="backlinks-list" aria-label={i18n(cfg.locale).components.backlinks.title}/>
    </section>
  )
  Backlinks.css=style
  Backlinks.afterDOMLoaded=script
  return Backlinks
}) satisfies QuartzComponentConstructor
