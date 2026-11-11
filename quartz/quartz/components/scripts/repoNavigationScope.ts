import { repoRoute } from "./repoShared"
export function sameRepo(current: URL, target: URL) {
  const source = repoRoute(current), destination = repoRoute(target)
  return current.origin === target.origin && source.name.toLowerCase() === destination.name.toLowerCase() && /^\/Repo(?:\/|$)/.test(current.pathname) && /^\/Repo(?:\/|$)/.test(target.pathname)
}
