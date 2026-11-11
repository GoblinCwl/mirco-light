export const encryptedIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/></svg>'

export const unlockedIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 7.5-2M12 15v2"/></svg>'

// Only page titles reflect a successfully validated share code.
export function updateTitleLock(heading: HTMLElement, locked: boolean | null) {
  let mark = heading.querySelector<HTMLElement>(".encrypted-mark")
  if (locked === null) { mark?.remove(); return }
  if (!mark) {
    mark = document.createElement("span"); mark.className = "encrypted-mark"; mark.setAttribute("role", "img")
    heading.querySelector(".article-title-copy")?.prepend(mark)
  }
  mark.dataset.lockState = locked ? "locked" : "unlocked"
  mark.setAttribute("aria-label", locked ? "已加密" : "已解锁")
  mark.innerHTML = locked ? encryptedIcon : unlockedIcon
}
