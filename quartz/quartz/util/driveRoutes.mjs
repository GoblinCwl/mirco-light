export const isDriveShareId = value => typeof value === "string" && /^[\p{L}\p{N}\p{M}_-]{1,64}$/u.test(value)

export const DRIVE_BASE = "/Share/"
const safePart = (part) => !!part && part !== "." && part !== ".." && !/[\/\\\u0000-\u001f\u007f]/.test(part)
export function driveRoute(url) {
  const route = { view: "guest", share: "", path: "/", valid: true }
  const invalid = () => ({ ...route, valid: false })
  const base = url.pathname === DRIVE_BASE.slice(0, -1) || url.pathname.startsWith(DRIVE_BASE) ? DRIVE_BASE : undefined
  if (!base) return invalid()
  const remainder = url.pathname.slice(base.length)
  if (remainder.startsWith("/") || remainder.endsWith("//")) return invalid()
  const raw = remainder.replace(/\/$/, "")
  let parts
  try { parts = raw ? raw.split("/").map(decodeURIComponent) : [] } catch { return invalid() }
  if (!parts.every(safePart)) return invalid()
  if (parts[0] === "空间") { route.view = "storage"; parts.shift() }
  else if (parts[0] === "分享") {
    parts.shift()
    if (!parts.length) return invalid()
    else {
      route.view = "share"; route.share = parts.shift()
      if (!isDriveShareId(route.share)) return invalid()
    }
  } else if (parts[0] === "访客") parts.shift()
  route.path = parts.length ? `/${parts.join("/")}` : "/"
  return route
}
export function driveHref(view, path = "/", share = "", directory = path === "/") {
  const parts = path.split("/").filter(Boolean)
  if (!["guest", "storage", "share"].includes(view)) throw new Error("无效的 Share 视图")
  if (!parts.every(safePart) || view === "share" && !isDriveShareId(share)) throw new Error("无效的 Share 路径")
  const prefix = view === "storage" ? ["空间"] : view === "share" ? ["分享", share]
    : ["分享", "空间", "访客"].includes(parts[0]) ? ["访客"] : []
  const encoded = [...prefix, ...parts].map(encodeURIComponent).join("/")
  return `${DRIVE_BASE}${encoded}${encoded && directory ? "/" : ""}`
}

export function driveDirectoryTitle(view, path, share = "") {
  const name = path.split("/").filter(Boolean).at(-1)
  if (name) return name
  if (view === "share") return share
  const group = view === "storage" ? "/空间" : ""
  return `星域: Share${group}`
}

