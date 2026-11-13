let toastTimeout: number | undefined
let hideTimeout: number | undefined

export function showPasswordToast(message: string, isError = false) {
  let toast = document.querySelector(".decrypt-toast") as HTMLElement | null
  if (!toast) {
    toast = document.createElement("div")
    toast.className = "decrypt-toast"
    toast.setAttribute("role", "status")
    toast.setAttribute("aria-live", "polite")
    document.body.appendChild(toast)
  }

  toast.classList.toggle("error", isError)
  toast.innerHTML = isError
    ? '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg><span></span>'
    : ""
  if (isError) toast.querySelector("span")!.textContent = message
  else toast.textContent = message
  if (hideTimeout) window.clearTimeout(hideTimeout)
  const dialogs = document.querySelectorAll<HTMLElement>("dialog:modal, [data-inline-login][open]")
  const host = dialogs[dialogs.length - 1] || document.body
  if (host !== document.body) {
    // The modal already supplies the top layer. Do not compete with autofill menus.
    if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover()
    toast.removeAttribute("popover")
    if (toast.parentElement !== host) host.append(toast)
  } else if (typeof toast.showPopover === "function") {
    if (toast.parentElement !== host) host.append(toast)
    toast.setAttribute("popover", "manual")
    if (!toast.matches(":popover-open")) toast.showPopover()
  } else {
    if (toast.parentElement !== host) host.append(toast)
  }
  toast.classList.add("visible")
  if (toastTimeout) window.clearTimeout(toastTimeout)
  toastTimeout = window.setTimeout(() => {
    toast?.classList.remove("visible")
    hideTimeout = window.setTimeout(() => { if (toast && typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover() }, 200)
  }, 2200)
}

document.addEventListener("prenav", () => {
  if (toastTimeout) window.clearTimeout(toastTimeout)
  if (hideTimeout) window.clearTimeout(hideTimeout)
  const toast = document.querySelector<HTMLElement>(".decrypt-toast")
  toast?.classList.remove("visible")
  if (toast && typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover()
})

// Native form validation follows the same toast channel as API responses.
let invalidFeedbackQueued=false
document.addEventListener('invalid',event=>{
 const field=event.target
 if(!(field instanceof HTMLInputElement||field instanceof HTMLSelectElement||field instanceof HTMLTextAreaElement)||!field.form)return
 event.preventDefault()
 if(invalidFeedbackQueued)return
 invalidFeedbackQueued=true;queueMicrotask(()=>{invalidFeedbackQueued=false})
 const label=field.getAttribute('aria-label')||field.labels?.[0]?.textContent?.trim()
 showPasswordToast(`${label?label+'：':''}${field.validationMessage||'请检查填写内容'}`,true)
},true)

// A result toast survives the form dialog closing after a successful action.
document.addEventListener('close',event=>{
 const dialog=event.target,toast=document.querySelector<HTMLElement>('.decrypt-toast')
 if(!(dialog instanceof HTMLElement)||!dialog.matches('dialog, [data-inline-login]')||!toast||!dialog.contains(toast))return
 const visible=toast.classList.contains('visible')
 if(typeof toast.hidePopover==='function'&&toast.matches(':popover-open'))toast.hidePopover()
 document.body.append(toast)
 if(visible&&typeof toast.showPopover==='function'){toast.setAttribute('popover','manual');toast.showPopover()}
},true)
