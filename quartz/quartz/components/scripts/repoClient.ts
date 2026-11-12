import {PageNotFoundError} from "./siteError"
import type { RepoCatalog } from "./repoShared"
import { RequestCache, sharedState } from "./sharedRequest"
const state = sharedState("repo-client:v2", () => ({
  catalog: new RequestCache<RepoCatalog>(30000, 1),
  reads: new RequestCache<unknown>(30000, 16),
  listening: false,
}))
if (typeof document !== "undefined" && !state.listening) {
  state.listening = true
  document.addEventListener("stellar-data-changed", (event) => {
    if ((event as CustomEvent).detail?.table?.startsWith("repo-")) {
      state.catalog.clear()
      state.reads.clear()
    }
  })
}
export async function repoRequest<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000),
    credentials: "omit",
  })
  const data = await response.json()
  if (response.status === 404) throw new PageNotFoundError(data.error || "仓库内容不存在")
  if (!response.ok) throw Error(data.error || "仓库数据读取失败")
  return data as T
}
export function readRepoCatalog() {
  return state.catalog.read("catalog", (signal) =>
    repoRequest<RepoCatalog>("/api/repo/catalog", signal),
  )
}
export const peekRepoCatalog = () => state.catalog.peek("catalog", true)
export function repoCachedRequest<T>(url: string): Promise<T> {
  return state.reads.read(url, (signal) => repoRequest<T>(url, signal)) as Promise<T>
}
