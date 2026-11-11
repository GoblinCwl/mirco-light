function copyIcpFallback(text: string) {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const field = document.createElement("textarea")
  field.value = text
  field.readOnly = true
  field.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none"
  document.body.append(field)
  field.focus({ preventScroll: true })
  field.select()
  const copied = document.execCommand("copy")
  field.remove()
  active?.focus({ preventScroll: true })
  return copied
}

document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a.home-icp") : null
  if (!link || event.defaultPrevented) return
  const number = link.textContent?.trim()
  if (!number) return
  // Start copying in the click gesture, keeping the link's normal new-tab
  // navigation (and modifier-key behavior) intact.
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(number).catch(() => { copyIcpFallback(number) })
  } else {
    copyIcpFallback(number)
  }
})
