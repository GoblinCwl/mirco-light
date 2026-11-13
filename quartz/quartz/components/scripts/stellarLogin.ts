import { readSiteSession } from "./siteSession"
import QRCode from "qrcode"
import { node } from "./driveUi"
import { adminPassword } from "./driveAdminFields"
import { showPasswordToast } from "./passwordFeedback"
import type { LoginPanel } from "./loginDialog"
type Enrollment = {
  setupRequired: true
  setupToken: string
  secret: string
  uri: string
  expires: number
}
type Recovery = { recoveryCodes: string[]; completionToken: string }
export function setupStellarLogin(
  dialog: HTMLDialogElement | LoginPanel,
  signal: AbortSignal,
  request: (path: string, init?: RequestInit) => Promise<any>,
  fail: (message: string) => void,
  options: { rebind?: boolean; onComplete?: () => void } = {},
) {
  const form = dialog.querySelector<HTMLFormElement>("form")!,
    heading = dialog.querySelector<HTMLElement>("[data-observatory-auth-heading]")!,
    submit = form.querySelector<HTMLButtonElement>("[type=submit]")!,
    submitText = submit.querySelector("span")!
  const passwordHost = form.querySelector<HTMLElement>("[data-observatory-password]")!,
    passwordRow = passwordHost.parentElement!,
    password = adminPassword(passwordHost, "管理员密码", "", true),
    visibility = passwordHost.querySelector<HTMLButtonElement>(".drive-password-toggle")!
  password.name = "stellar-admin-key"
  password.id = options.rebind ? "stellar-rebind-password" : "stellar-login-password"
  password.type = "password"
  for (const attribute of ["data-bwignore", "data-lpignore", "data-1p-ignore"]) password.removeAttribute(attribute)
  password.placeholder = "输入管理员密码"
  password.autocomplete = "current-password"
  form.autocomplete = "on"
  visibility.addEventListener("click", () => {
    password.type = password.classList.contains("is-plain") ? "text" : "password"
  }, { signal })
  form.noValidate = true
  const code = node("input"),
    switchMode = node("button", "", "observatory-login-mode"),
    stage = node("section", "", "observatory-totp-setup")
  code.type = "text"
  code.name = "totp"
  code.autocomplete = "one-time-code"
  code.inputMode = "numeric"
  code.maxLength = 6
  code.placeholder = "6 位动态验证码"
  code.setAttribute("aria-label", "动态验证码")
  code.spellcheck = false
  code.autocapitalize = "off"
  const fieldIcon = (path: string) => {
    const icon = node("span", "", "observatory-input-icon")
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
    icon.setAttribute("aria-hidden", "true")
    return icon
  }
  password
    .closest(".drive-password-field")!
    .append(
      fieldIcon(
        '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
      ),
    )
  const codeRow = node("label", "", "observatory-login-code"),
    codeIcon = fieldIcon(""),
    codeGroup = node("div", "", "observatory-login-code-row")
  codeRow.append(codeIcon, code)
  switchMode.type = "button"
  codeGroup.append(codeRow, switchMode)
  stage.hidden = true
  form.insertBefore(codeGroup, submit)
  form.insertBefore(stage, submit)
  let bound: boolean | undefined,
    busy = false,
    recoveryMode = false,
    enrollment: Enrollment | undefined,
    recovery: Recovery | undefined,
    ack: HTMLInputElement | undefined,
    expiredTimer: ReturnType<typeof setTimeout> | undefined,
    statusRequest: Promise<void> | undefined,
    revision = 0
  const label = () =>
    recovery
      ? options.rebind
        ? "完成绑定"
        : "完成登录"
      : enrollment
        ? "确认绑定"
        : options.rebind
          ? "验证并重新绑定"
          : bound === false
            ? "验证密码并绑定"
            : "登录"
  const update = () => {
    const close = dialog.querySelector<HTMLButtonElement>("header button")
    if (options.rebind && close) close.disabled = !!recovery
    const modeLabel = recoveryMode ? "使用动态验证码" : "使用恢复码"
    if (switchMode.getAttribute("aria-label") !== modeLabel) {
      switchMode.setAttribute("aria-label", modeLabel)
      switchMode.title = modeLabel
      switchMode.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${recoveryMode ? '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-4 14h4m-5-7h.01M12 12h.01M15 12h.01"/>' : '<circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-3-3 2-2m-5-1 2-2"/>'}</svg>`
    }
    submitText.textContent = busy ? "正在验证…" : label()
    submit.disabled =
      busy ||
      bound === undefined ||
      (recovery
        ? !ack?.checked
        : enrollment
          ? !/^\d{6}$/.test(code.value) || Date.now() >= enrollment.expires
          : !password.value ||
            (bound &&
              (recoveryMode
                ? !/^[a-fA-F0-9-]{24,29}$/.test(code.value.trim())
                : !/^\d{6}$/.test(code.value))))
    if (busy) submit.setAttribute("aria-busy", "true")
    else submit.removeAttribute("aria-busy")
    password.disabled = visibility.disabled = code.disabled = switchMode.disabled = busy
    codeIcon.innerHTML = recoveryMode
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-3-3 2-2m-5-1 2-2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-4 14h4m-5-7h.01M12 12h.01M15 12h.01"/></svg>'
    passwordRow.hidden = !!enrollment || !!recovery
    codeGroup.hidden = !!recovery || (bound !== true && !enrollment)
    switchMode.hidden = bound !== true || !!enrollment || !!recovery
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      if (!signal.aborted) {
        showPasswordToast("已复制")
        const toast = document.querySelector(".decrypt-toast")
        if (toast) dialog.append(toast)
      }
    } catch {
      if (!signal.aborted) fail("复制失败，请手动保存")
    }
  }
  const reset = () => {
    revision++
    clearTimeout(expiredTimer)
    enrollment = undefined
    recovery = undefined
    ack = undefined
    password.value = ""
    code.value = ""
    stage.replaceChildren()
    stage.hidden = true
    heading.textContent = options.rebind ? "重新绑定令牌" : "管理员登录"
    recoveryMode = false
    code.placeholder = "6 位动态验证码"
    code.setAttribute("aria-label", "动态验证码")
    code.name = "totp"
    code.inputMode = "numeric"
    code.maxLength = 6
    update()
  }
  const loadStatus = () =>
    (statusRequest ??= (async () => {
      try {
        const value = await readSiteSession()
        if (!signal.aborted) {
          bound = !!value.totpEnabled
          update()
        }
      } catch (reason) {
        if (!signal.aborted) fail(reason instanceof Error ? reason.message : "登录状态读取失败")
      }
    })().finally(() => {
      statusRequest = undefined
    }))
  const showEnrollment = async (value: Enrollment) => {
    enrollment = value
    heading.textContent = options.rebind ? "绑定新验证器" : "绑定验证器"
    stage.hidden = false
    stage.replaceChildren()
    code.value = ""
    const note = node(
        "p",
        "使用支持 TOTP 的验证器扫描二维码，再输入生成的 6 位动态验证码。",
        "observatory-login-note",
      ),
      qr = node("img"),
      manual = node("details"),
      summary = node("summary", "无法扫码？手动输入密钥"),
      key = node("code", value.secret),
      copyKey = node("button", "复制密钥", "observatory-login-alternative"),
      restart = node(
        "button",
        options.rebind ? "返回验证" : "返回登录",
        "observatory-login-alternative",
      )
    qr.alt = "使用验证器扫描，绑定微光集管理员"
    qr.width = 184
    qr.height = 184
    qr.className = "observatory-totp-qr"
    qr.setAttribute("no-view", "")
    copyKey.type = restart.type = "button"
    copyKey.onclick = () => void copy(value.secret)
    restart.onclick = () => {
      reset()
      void loadStatus()
    }
    manual.append(summary, key, copyKey)
    stage.append(note, qr, manual, restart)
    expiredTimer = setTimeout(
      () => {
        if (!signal.aborted && enrollment === value) {
          update()
          fail("绑定已过期，请返回登录重新开始")
        }
      },
      Math.max(0, value.expires - Date.now()),
    )
    update()
    const own = revision
    try {
      const url = await QRCode.toDataURL(value.uri, {
        width: 184,
        margin: 4,
        errorCorrectionLevel: "M",
      })
      if (!signal.aborted && enrollment === value && own === revision) qr.src = url
    } catch {
      qr.remove()
      if (!signal.aborted) fail("二维码生成失败，请使用手动密钥绑定")
    }
  }
  const showRecovery = (value: Recovery) => {
    clearTimeout(expiredTimer)
    recovery = value
    enrollment = undefined
    bound = true
    heading.textContent = "保存恢复码"
    stage.hidden = false
    stage.replaceChildren()
    const note = node(
        "p",
        "恢复码仅展示这一次。验证器不可用时，可配合密码登录；每个恢复码只能使用一次。",
        "observatory-login-note",
      ),
      codes = node("pre", value.recoveryCodes.join("\n"), "observatory-recovery-codes"),
      actions = node("div", "", "observatory-recovery-actions"),
      copyButton = node("button", "复制"),
      download = node("button", "下载"),
      label = node("label", "", "observatory-recovery-confirm")
    copyButton.type = download.type = "button"
    copyButton.onclick = () => void copy(value.recoveryCodes.join("\n"))
    download.onclick = () => {
      const blob = new Blob(
          [
            "微光集管理员恢复码\n每个恢复码只能使用一次，请妥善保管。\n\n" +
              value.recoveryCodes.join("\n"),
          ],
          { type: "text/plain;charset=utf-8" },
        ),
        url = URL.createObjectURL(blob),
        link = node("a")
      link.href = url
      link.download = "微光集-管理员恢复码.txt"
      link.dataset.routerIgnore = "true"
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    ack = node("input")
    ack.type = "checkbox"
    ack.onchange = update
    label.append(ack, node("span", "我已妥善保存恢复码"))
    actions.append(copyButton, download)
    stage.append(note, codes, actions, label)
    code.value = ""
    password.value = ""
    update()
  }
  password.addEventListener("input", update, { signal })
  code.addEventListener("input", update, { signal })
  switchMode.onclick = () => {
    recoveryMode = !recoveryMode
    code.value = ""
    code.name = recoveryMode ? "recovery-code" : "totp"
    code.inputMode = recoveryMode ? "text" : "numeric"
    code.maxLength = recoveryMode ? 29 : 6
    code.placeholder = recoveryMode ? "输入一次性恢复码" : "6 位动态验证码"
    code.setAttribute("aria-label", recoveryMode ? "一次性恢复码" : "动态验证码")
    update()
    code.focus()
  }
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (busy || submit.disabled) return
    busy = true
    update()
    const own = revision
    try {
      if (recovery) {
        await request("/admin/totp/finish", {
          method: "POST",
          body: JSON.stringify({ completionToken: recovery.completionToken, saved: ack?.checked }),
        })
        if (!signal.aborted && own === revision) {
          reset()
          options.onComplete?.()
          document.dispatchEvent(
            new CustomEvent("stellar-auth-changed", { detail: { authenticated: true } }),
          )
          if (!options.rebind) showPasswordToast("登录成功")
        }
      } else if (enrollment) {
        const value: Recovery = await request("/admin/totp/confirm", {
          method: "POST",
          body: JSON.stringify({ setupToken: enrollment.setupToken, code: code.value }),
        })
        if (!signal.aborted && own === revision) showRecovery(value)
      } else {
        const value = await request(options.rebind ? "/admin/totp/rebind" : "/admin/login", {
          method: "POST",
          body: JSON.stringify({
            password: password.value,
            ...(recoveryMode ? { recoveryCode: code.value } : { code: code.value }),
          }),
        })
        if (signal.aborted || own !== revision) return
        if (value.setupRequired) {
          password.value = ""
          await showEnrollment(value)
        } else {
          reset()
          options.onComplete?.()
          document.dispatchEvent(
            new CustomEvent("stellar-auth-changed", { detail: { authenticated: true } }),
          )
          if (!options.rebind) showPasswordToast("登录成功")
        }
      }
    } catch (reason) {
      if (!signal.aborted && own === revision) {
        fail(reason instanceof Error ? reason.message : "登录失败")
        code.value = ""
      }
    } finally {
      if (!signal.aborted) {
        busy = false
        update()
      }
    }
  }
  dialog.addEventListener(
    "cancel",
    (event) => {
      if (options.rebind && recovery) event.preventDefault()
    },
    { signal },
  )
  dialog.addEventListener(
    "close",
    () => {
      reset()
    },
    { signal },
  )
  signal.addEventListener("abort", reset, { once: true })
  if (options.rebind) heading.textContent = "重新绑定令牌"
  update()
  void loadStatus()
  return () => {
    reset()
    void loadStatus()
  }
}
