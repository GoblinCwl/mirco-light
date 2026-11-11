import { QuartzComponent, QuartzComponentConstructor } from "../types"
import style from "../styles/commentsPage.scss"
// @ts-ignore
import script from "../scripts/commentsPage.inline"

export default (() => {
  const CommentsContent: QuartzComponent = () => (
    <div class="all-comments" data-all-comments>
      <p class="comments-summary" data-comments-summary>汇集文章下的公开评论</p>
      <div class="comments-status" data-comments-status role="status">正在加载评论…</div>
      <div class="comments-list" data-comments-list aria-busy="true" />
      <div class="infinite-scroll-trigger" data-comments-pagination hidden role="status"><span data-comments-more-status/><button class="comments-retry" type="button" data-comments-retry hidden>重试</button></div>
    </div>
  )
  CommentsContent.css = style
  CommentsContent.afterDOMLoaded = script
  return CommentsContent
}) satisfies QuartzComponentConstructor
