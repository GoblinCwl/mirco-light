import {adminPassword,adminField} from "./driveAdminFields"
import { node } from "./driveUi"
import { setupStellarLogin } from "./stellarLogin"
import { showSiteDialog } from "./siteDialog"
import { showPasswordToast } from "./passwordFeedback"

export function setupSecurityManager(
  root: HTMLElement,
  signal: AbortSignal,
  request: (path: string, init?: RequestInit) => Promise<any>,
) {
  const card = node("section", "", "stellar-setting-card"),
    row = node("div", "", "stellar-setting-row stellar-security-row"),
    copy = node("div", "", "stellar-setting-copy"),
    action = node("button", "重新绑定令牌")
  action.type = "button"
  action.className = "stellar-action-button"
  action.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg><span>重新绑定</span>'
  copy.append(
    node("strong", "管理员验证器"),
    node("small", "验证密码与当前动态码或恢复码后，绑定新的验证器。新令牌确认前，原令牌继续有效。"),
  )
  row.append(copy, action)
  card.append(node("h3", "两步验证"), row)
  const passwords=node("section","","stellar-setting-card"),
    passwordRow=node("div","","stellar-setting-row stellar-security-row"),
    passwordCopy=node("div","","stellar-setting-copy"),
    edit=node("button","","stellar-action-button")
  edit.type="button"
  edit.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/></svg><span>修改密码</span>'
  passwordCopy.append(node("strong","管理员密码"),node("small","验证当前密码与动态验证码后修改，其他设备将退出登录。"))
  passwordRow.append(passwordCopy,edit)
  edit.onclick=()=>{
    const lifetime=new AbortController(),own=AbortSignal.any([signal,lifetime.signal]),dialog=node("dialog","","observatory-dialog stellar-password-dialog")
    dialog.tabIndex=-1;dialog.setAttribute("aria-label","修改密码")
    const header=node("header","","observatory-auth-header"),heading=node("h2","修改密码"),close=node("button"),form=node("form","","stellar-security-form")
    close.type="button";close.setAttribute("aria-label","关闭")
    close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
    close.onclick=()=>dialog.close();header.append(heading,close)
    const current=adminPassword(form,"当前密码"),next=adminPassword(form,"新密码"),confirm=adminPassword(form,"确认新密码"),code=adminField(form,"动态验证码"),submit=node("button","保存密码","stellar-action-button")
    current.required=next.required=confirm.required=code.required=true
    next.minLength=confirm.minLength=12;next.maxLength=confirm.maxLength=4096
    current.autocomplete="current-password";next.autocomplete=confirm.autocomplete="new-password"
    next.placeholder="至少 12 个字符";code.inputMode="numeric";code.autocomplete="one-time-code";code.pattern="[0-9]{6}";code.maxLength=6;code.placeholder="6 位动态验证码"
    submit.type="submit";form.append(submit);dialog.append(header,form);root.append(dialog)
    form.onsubmit=async event=>{
      event.preventDefault()
      if(next.value!==confirm.value){showPasswordToast("两次输入的新密码不一致",true);return}
      const controls=[...form.querySelectorAll<HTMLInputElement|HTMLButtonElement>("input,button")];controls.forEach(control=>control.disabled=true);close.disabled=true
      try{await request("/admin/password",{method:"POST",body:JSON.stringify({password:current.value,newPassword:next.value,code:code.value})});dialog.close();showPasswordToast("密码已修改，其他设备已退出登录")}
      catch(error){if(!own.aborted)showPasswordToast(error instanceof Error?error.message:"修改密码失败",true)}
      finally{controls.forEach(control=>control.disabled=false);close.disabled=false}
    }
    dialog.addEventListener("close",()=>{lifetime.abort();dialog.remove()},{once:true})
    own.addEventListener("abort",()=>{dialog.close();dialog.remove()},{once:true})
    root.closest("dialog")?.addEventListener("close",()=>dialog.close(),{signal:own})
    showSiteDialog(dialog)
  }
  passwords.append(node("h3","登录密码"),passwordRow)
  root.append(passwords,card)
  action.onclick = () => {
    const lifetime = new AbortController(),
      own = AbortSignal.any([signal, lifetime.signal])
    const dialog = node("dialog", "", "observatory-dialog observatory-auth-dialog")
    dialog.setAttribute("aria-label", "重新绑定令牌")
    dialog.tabIndex = -1
    dialog.innerHTML = `<header class="observatory-auth-header"><h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/></svg><span data-observatory-auth-heading>重新绑定令牌</span></h2><button type="button" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><form class="observatory-login-form" autocomplete="off"><div class="observatory-login-field"><div class="observatory-login-password" data-observatory-password></div></div><button class="observatory-login-submit" type="submit" disabled><span>验证并重新绑定</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button></form>`
    root.append(dialog)
    setupStellarLogin(dialog, own, request, (message) => showPasswordToast(message, true), {
      rebind: true,
      onComplete: () => {
        dialog.close()
        showPasswordToast("验证器已重新绑定，旧令牌及旧恢复码已失效")
      },
    })
    dialog.querySelector<HTMLButtonElement>("header button")!.onclick = () => dialog.close()
    dialog.addEventListener(
      "close",
      () => {
        lifetime.abort()
        dialog.remove()
      },
      { once: true },
    )
    own.addEventListener(
      "abort",
      () => {
        dialog.close()
        dialog.remove()
      },
      { once: true },
    )
    root.closest("dialog")?.addEventListener("close", () => dialog.close(), { signal: own })
    showSiteDialog(dialog)
  }
}
