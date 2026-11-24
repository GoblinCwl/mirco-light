export const artalkUserStorageKey = "ArtalkUser"
export const artalkIdentityChange = "site-artalk-identity-changed"

export function readCachedArtalkIdentity() {
  try {
    const user = JSON.parse(localStorage.getItem(artalkUserStorageKey) || "null")
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : ""
    const name = [user?.name, user?.nick].find(value => typeof value === "string" && value.trim())?.trim() || ""
    if (email || name) return { email, name, admin: user.is_admin === true || (user.is_admin === undefined && user.isAdmin === true) }
  } catch { /* Leave the avatar empty when Artalk has no readable local identity. */ }
}

export function notifyArtalkIdentityChange() {
  document.dispatchEvent(new Event(artalkIdentityChange))
}
