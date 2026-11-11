export type DirectoryGroup = { domain: "explore" | "drive"; root: string; path?: string }
const key = Symbol.for("quartz.directory.group")
const shared = globalThis as unknown as Record<symbol, { active?: DirectoryGroup }>
const state = shared[key] ??= {}
export const activeDirectoryGroup = () => state.active
export function activateDirectoryGroup(group?: DirectoryGroup) {
  state.active = group
  document.dispatchEvent(new CustomEvent("directory-group-change", { detail: group }))
}
export function driveDirectoryRoot(details: HTMLDetailsElement) {
  const root = details.closest<HTMLDetailsElement>(".drive-nav")!
  const link = root.querySelector<HTMLAnchorElement>(":scope > summary > a")!
  return decodeURIComponent(new URL(link.href).pathname.split("/").filter(Boolean)[0])
}
