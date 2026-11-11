import { QuartzComponent, QuartzComponentConstructor } from './types'
import style from './styles/mobileArticleToc.scss'
// @ts-ignore
import script from './scripts/mobileArticleToc.inline'

const MobileArticleToc: QuartzComponent = ({ fileData, cfg }) => {
  if (fileData.slug === 'index' || !fileData.filePath?.endsWith('.md') || fileData.frontmatter?.enableToc === false) return null
  return <div class="mobile-article-toc" data-mobile-article-toc data-locked={Boolean(cfg.passProtected?.enabled && fileData.frontmatter?.passphrase)}>
    <button type="button" class="mobile-article-toc-launch" data-article-toc-open hidden aria-label="打开正文目录" aria-haspopup="dialog" aria-controls="mobile-article-toc-dialog" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r=".7" fill="currentColor"/><circle cx="3" cy="12" r=".7" fill="currentColor"/><circle cx="3" cy="19" r=".7" fill="currentColor"/></svg><span>目录</span>
    </button>
    <dialog id="mobile-article-toc-dialog" class="mobile-article-toc-dialog" data-article-toc-dialog tabIndex={-1} aria-labelledby="mobile-article-toc-title">
      <header><h2 id="mobile-article-toc-title">目录</h2><button type="button" data-article-toc-close aria-label="关闭目录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
      <nav aria-label="正文目录"><ul data-article-toc-list/></nav>
    </dialog>
  </div>
}
MobileArticleToc.css = style
MobileArticleToc.afterDOMLoaded = script
export default (() => MobileArticleToc) satisfies QuartzComponentConstructor
