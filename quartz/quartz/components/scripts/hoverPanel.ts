export function showHoverPanel(panel: HTMLElement, anchor: HTMLElement) {
  const dialog = anchor.closest("dialog[open]")
  const host = dialog || document.body
  if (panel.parentElement !== host) host.append(panel)
  if (dialog && anchor.closest(".starbud-markdown") && typeof panel.showPopover === "function") {
    panel.setAttribute("popover", "manual")
    panel.classList.add("starbud-hover-panel")
    if (!panel.matches(":popover-open")) panel.showPopover()
  } else if (panel.classList.contains("starbud-hover-panel")) {
    panel.removeAttribute("popover")
    panel.classList.remove("starbud-hover-panel")
  }
}

export function hideHoverPanel(panel: Element) {
  if (panel instanceof HTMLElement && panel.classList.contains("starbud-hover-panel") && panel.matches(":popover-open")) {
    panel.hidePopover()
  }
}
