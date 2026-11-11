import { drivePassword, driveRequest } from "./driveClient"
import { RequestCache, sharedState } from "./sharedRequest"

const state = sharedState('drive-aliases:v1', () => ({ requests: new RequestCache<Record<string,string>>(30000), listening: false }))
if (!state.listening) {
  state.listening = true
  for (const event of ['drive-files-changed', 'drive-auth-change', 'drive-directory-unlocked']) document.addEventListener(event, () => state.requests.clear())
}
export async function fetchDriveAliases(share: string, signal: AbortSignal, path = "/"): Promise<Record<string, string>> {
  const password = drivePassword("share", share, path), key = JSON.stringify([share, password])
  return state.requests.read(key, async requestSignal => {
    const value = await driveRequest<{ aliases: Record<string, string> }>("public/quartz/jellyfin/aliases", { path: `/@s/${share}`, password }, { anonymous: true, signal: requestSignal })
    return value.aliases
  }, {signal})
}
