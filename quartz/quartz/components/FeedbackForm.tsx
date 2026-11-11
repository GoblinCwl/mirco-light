export default function FeedbackForm(){
 return <section class="site-feedback" data-feedback>
    <form data-feedback-form noValidate>
      <label><span>邮箱</span><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="用于回复你的反馈" maxLength={254}/></label>
      <label><span>浏览器<small>自动识别</small></span><input name="browser" readOnly aria-label="自动识别的浏览器信息" placeholder="正在识别…"/></label>
      <label><span>问题描述<output data-feedback-count>0 / 2000</output></span><textarea name="description" rows={3} maxLength={2000} placeholder="请描述遇到的问题、出现步骤，并附上相关页面链接。"/></label>
      <button type="submit" disabled><span>提交反馈</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></svg></button>
    </form>
  </section>
}
