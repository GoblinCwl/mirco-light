export const isTouchDialog = () => window.matchMedia("(max-width: 1199px), (hover: none) and (pointer: coarse)").matches

type Motion = { animation?: Animation; closing?: Promise<void>; resolve?: () => void }
const motions = new WeakMap<HTMLDialogElement, Motion>()
const isDrawer = (dialog: HTMLDialogElement) => getComputedStyle(dialog).getPropertyValue('--site-drawer').trim() === '1'
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches
const settle = (state: Motion) => {
  state.animation?.cancel(); state.animation = undefined
  const resolve = state.resolve; state.resolve = undefined; state.closing = undefined
  resolve?.()
}
const stateFor = (dialog: HTMLDialogElement) => {
  let state = motions.get(dialog)
  if (!state) {
    state = {}; motions.set(dialog, state)
    dialog.addEventListener('close', () => { if (!dialog.open) settle(state!) })
    dialog.addEventListener('cancel', event => {
      if (!isDrawer(dialog)) return
      event.preventDefault(); void closeSiteDialog(dialog)
    })
  }
  return state
}

// Native dialogs otherwise autofocus their first button/input, opening the
// mobile keyboard or leaving a close button highlighted before any interaction.
export function showSiteDialog(dialog: HTMLDialogElement) {
  const state = stateFor(dialog), current = dialog.open ? getComputedStyle(dialog) : undefined
  const from = current ? { transform: current.transform, opacity: current.opacity } : { transform: 'translateY(1.25rem)', opacity: '.45' }
  settle(state)
  const touch = isTouchDialog(), autofocus = dialog.hasAttribute("autofocus")
  if (touch) dialog.setAttribute("autofocus", "")
  if (!dialog.open) dialog.showModal()
  if (touch) {
    dialog.focus({ preventScroll: true })
    if (!autofocus) dialog.removeAttribute("autofocus")
  }
  if (isDrawer(dialog)) {
    if (!reducedMotion()) {
      const animation = dialog.animate([from, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' })
      state.animation = animation
      animation.onfinish = () => { if (state.animation === animation) settle(state) }
    }
  }
}

/** User dismissal animates; lifecycle teardown can still call native close(). */
export function closeSiteDialog(dialog: HTMLDialogElement): Promise<void> {
  const state = stateFor(dialog)
  if (!dialog.open) { settle(state); return Promise.resolve() }
  if (state.closing) return state.closing
  if (!isDrawer(dialog) || reducedMotion()) { settle(state); dialog.close(); return Promise.resolve() }
  const current = getComputedStyle(dialog), from = { transform: current.transform, opacity: current.opacity }
  settle(state)
  state.closing = new Promise(resolve => { state.resolve = resolve })
  const pending = state.closing
  const animation = dialog.animate([from, { transform: 'translateY(1.25rem)', opacity: 0 }], { duration: 140, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
  state.animation = animation
  animation.onfinish = () => {
    if (state.animation !== animation) return
    dialog.close(); settle(state)
  }
  return pending
}
