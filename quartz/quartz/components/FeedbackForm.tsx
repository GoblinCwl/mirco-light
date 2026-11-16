export default function FeedbackForm(){
 return <section class="site-feedback" data-feedback>
    <form data-feedback-form noValidate>
      <label><span>邮箱</span><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="用于回复你的反馈" maxLength={254}/></label>
      <label><span>浏览器<small>自动识别</small></span><input name="browser" readOnly aria-label="自动识别的浏览器信息" placeholder="正在识别…"/></label>
      <label><span>问题描述<output data-feedback-count>0 / 2000</output></span><textarea name="description" rows={3} maxLength={2000} placeholder="请描述遇到的问题、出现步骤，并附上相关页面链接。"/></label>
      <button type="submit" disabled><span>提交反馈</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></svg></button>
    </form>
    <dialog class="friends-confirm is-complete" data-feedback-success tabIndex={-1} aria-labelledby="feedback-success-heading">
      <header><h2 id="feedback-success-heading">反馈已提交</h2><button type="button" data-feedback-success-close aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
      <div class="friends-confirm-notice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><div><p><strong>感谢你的反馈</strong></p><p>问题已收到，处理后将通过你填写的邮箱联系你。</p></div></div>
      <footer><button type="button" data-feedback-success-close data-friends-confirm-submit>完成</button></footer>
    </dialog>
  </section>
}
