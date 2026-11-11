import { restoreNavigationSkeleton } from './navigationSkeleton'
import { applySiteSettings, readSiteSettings, type SiteSettings } from './siteSettings'
// Site presentation settings are independent of any optional player component.
document.addEventListener('nav', () => {
  for (const container of document.querySelectorAll<HTMLElement>('.home-links-toc .toc-content')) restoreNavigationSkeleton(container)
  void readSiteSettings().then(applySiteSettings) })
document.addEventListener('site-settings-changed', event => {
  applySiteSettings((event as CustomEvent<SiteSettings>).detail)
})
