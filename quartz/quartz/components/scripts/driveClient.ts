import {sharedState} from './sharedRequest'
import {readSiteSession} from './siteSession'
import {readSiteSettings} from './siteSettings'
import { DRIVE_AUTH_KEY, DRIVE_SHARE_PREFIX, readDriveToken, writeDriveToken, readDriveShareCode, writeDriveShareCode, clearDriveShareCode, clearDriveShareCodes } from "./driveCredentials"
import { driveApiUrl } from "./openlistShared"
import { driveRoute as parseDriveRoute, driveHref as formatDriveHref } from "../../util/driveRoutes.mjs"
import { absoluteStoragePath, relativeStoragePath } from "../../util/driveStoragePaths"

export class DriveError extends Error {
  constructor(message: string, public code: number) { super(message) }
}
export type DriveUser = { username: string; role: number; base_path: string; permission?: number }
const userState=sharedState('drive-user:v2',()=>({cache:undefined as {token:string;user:DriveUser;at:number}|undefined,pending:undefined as {token:string;value:Promise<DriveUser>}|undefined,observedToken:undefined as string|undefined,authChangePending:false}))
const authChanged = (external = false) => {
  userState.cache = undefined
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("drive-auth-change", { detail: { external } }))
}
export function driveToken() {
  const token = readDriveToken()
  if (userState.observedToken !== undefined && userState.observedToken !== token && !userState.authChangePending) {
    userState.authChangePending = true
    queueMicrotask(() => { userState.authChangePending = false; authChanged(true) })
  }
  userState.observedToken = token
  return token
}
export function setDriveToken(token: string) {
  writeDriveToken(token); userState.observedToken = token
  authChanged()
}
export async function driveRequest<T>(route: string, body?: object, options: { anonymous?: boolean; token?: string; signal?: AbortSignal; timeout?: number } = {}): Promise<T> {
  await readSiteSettings()
  const token = options.anonymous ? "" : options.token ?? driveToken()
  const signals = [AbortSignal.timeout(options.timeout ?? 30000), ...(options.signal ? [options.signal] : [])]
  const response = await fetch(driveApiUrl(route), {
    method: body ? "POST" : "GET", credentials: "omit", cache: "no-store", signal: AbortSignal.any(signals),
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new DriveError(`请求失败（${response.status}）`, response.status)
  const result = await response.json()
  if (result.code !== 200) throw new DriveError(result.message || "文件服务暂不可用", result.code)
  return result.data as T
}
const IDENTITY_KEY = "quartz-drive-identity:v1"
// Presentation only; authorization is verified by the unified identity API.
export function cachedDriveIdentity(): string {
  const token = driveToken()
  try { const saved = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null"); return token && saved?.token === token && typeof saved.username === "string" ? saved.username : "" } catch { return "" }
}
export function acceptDriveUser(token:string,user:DriveUser){
 userState.cache={token,user,at:Date.now()}
 try{localStorage.setItem(IDENTITY_KEY,JSON.stringify({token,username:user.username}))}catch{}
}

export function invalidateDriveUserCache() { userState.cache = undefined }
// Reuse the last verified account for pending UI only; requireDriveUser still
// validates it before loading authenticated content or enabling operations.
export function cachedDriveUser(): DriveUser | undefined {
  const token = driveToken()
  return token && userState.cache?.token === token ? userState.cache.user : undefined
}
export async function requireDriveUser(signal?: AbortSignal): Promise<DriveUser> {
  signal?.throwIfAborted()
  const token = driveToken()
  if (!token) throw new DriveError("请先通过星枢登录管理员", 401)
  if (userState.cache?.token === token && Date.now() - userState.cache.at < 30000) return userState.cache.user
  if(userState.pending?.token===token)return userState.pending.value
  const value=(async()=>{
    const identity=await readSiteSession(true)
    const share=identity.share
    if(!identity.authenticated||!share?.configured||!share.user||share.token!==token)throw new DriveError(share?.error||"请先登录管理员",401)
    if(driveToken()===token)acceptDriveUser(token,share.user)
    return share.user
  })().finally(()=>{if(userState.pending?.value===value)userState.pending=undefined})
  userState.pending={token,value};return value
}

export { DRIVE_BASE, driveDirectoryTitle } from "../../util/driveRoutes.mjs"
export type { DriveView } from "../../util/driveRoutes.mjs"
import type { DriveView } from "../../util/driveRoutes.mjs"

export function driveRoute(url: URL) {
  const route = parseDriveRoute(url), user = cachedDriveUser()
  if (route.valid && route.view === "storage" && user) {
    const path = relativeStoragePath(route.path, user.base_path || "/")
    if (path === null) route.valid = false
    else route.path = path
  }
  return route
}
export function driveHref(view: DriveView, path = "/", share = "", directory = path === "/") {
  const user = cachedDriveUser()
  const target = view === "storage" && path !== "/" && user ? absoluteStoragePath(path, user.base_path || "/") : path
  return formatDriveHref(view, target, share, directory)
}

// Keep file titles distinct from directory-path titles during SPA navigation.
export const drivePathKinds = new Map<string, boolean>()
export const drivePathKey = (view: DriveView, share: string, path: string) => JSON.stringify([view, share, path])

// Candidates remain in memory; only successfully validated share codes are persisted.
export const drivePasswords = new Map<string, string>()
export const drivePasswordKey = (view: DriveView, share: string, path: string) => view === "share" ? `share:${share}` : `${view}:${path}`
export function drivePassword(view: DriveView, share: string, path: string) {
  if (view === "share") return drivePasswords.get(drivePasswordKey(view, share, path)) ?? readDriveShareCode(share)
  let current = path
  while (true) {
    const value = drivePasswords.get(drivePasswordKey(view, share, current))
    if (value !== undefined) return value
    if (current === "/") return ""
    current = current.slice(0, current.lastIndexOf("/")) || "/"
  }
}

export function rememberDriveShareCode(share: string, value: string) {
  const previous = readDriveShareCode(share)
  writeDriveShareCode(share, value)
  drivePasswords.delete(drivePasswordKey("share", share, "/"))
  if (value && previous !== value) document.dispatchEvent(new CustomEvent("drive-directory-unlocked", { detail: { share } }))
}
export function forgetDriveShareCode(share: string) {
  clearDriveShareCode(share)
  drivePasswords.delete(drivePasswordKey("share", share, "/"))
}
export function clearDrivePasswords() { drivePasswords.clear(); clearDriveShareCodes() }

if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.storageArea !== localStorage) return
  if (event.key === DRIVE_AUTH_KEY || event.key === null) {
    userState.observedToken = readDriveToken(); drivePasswords.clear(); authChanged(true)
  } else if (event.key.startsWith(DRIVE_SHARE_PREFIX)) {
    document.dispatchEvent(new CustomEvent("drive-directory-unlocked"))
  }
})
