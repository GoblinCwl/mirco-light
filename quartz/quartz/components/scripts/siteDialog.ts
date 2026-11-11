export const isTouchDialog = () => window.matchMedia("(max-width: 1199px), (hover: none) and (pointer: coarse)").matches

// Native dialogs otherwise autofocus their first button/input, opening the
// mobile keyboard or leaving a close button highlighted before any interaction.
export function showSiteDialog(dialog: HTMLDialogElement) {
  const touch = isTouchDialog(), autofocus = dialog.hasAttribute("autofocus")
  if (touch) dialog.setAttribute("autofocus", "")
  dialog.showModal()
  if (touch) {
    dialog.focus({ preventScroll: true })
    if (!autofocus) dialog.removeAttribute("autofocus")
  }
}
