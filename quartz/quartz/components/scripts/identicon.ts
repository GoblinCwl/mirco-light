// Prefer registered Gravatars; use site-owned artwork when none is available.
const avatarCache = new Map<string, string>()
const gravatarChecks = new Map<string, Promise<boolean>>()
const boundAvatars = new WeakMap<HTMLImageElement, string>()
const selectedGravatars = new WeakMap<HTMLImageElement, boolean>()
const avatarPrefix = "data:image/svg+xml,"
const adminAvatar = "/static/avatars/goblincwl-profile-transparent-v1.webp"
// Recognize both current SHA-256 and legacy MD5 email hashes; the caller must
// also supply the administrator flag from Artalk, never infer it from a name.
const adminSeeds = new Set([
  "9bf1c366a7cb94a1b5a6f7e626c9a446310b66c31d9272d22c10dd5e4a5e9dbb",
  "0bd58561894bba0aaebc6f8adfc59e59",
])

export function commentAvatar(seed: string, isAdmin = false): string {
  const hash = seed.trim().toLowerCase()
  if (isAdmin && adminSeeds.has(hash)) return adminAvatar
  return /^(?:[a-f\d]{32}|[a-f\d]{64})$/.test(hash)
    ? `https://www.gravatar.com/avatar/${hash}?d=404&s=160&r=g`
    : identicon(seed)
}

function hasGravatar(source: string): Promise<boolean> {
  const cached = gravatarChecks.get(source)
  if (cached) return cached
  const check = new Promise<boolean>((resolve) => {
    const probe = new Image()
    const finish = (available: boolean) => {
      clearTimeout(timeout)
      probe.onload = probe.onerror = null
      resolve(available)
    }
    const timeout = setTimeout(() => finish(false), 5000)
    probe.referrerPolicy = "no-referrer"
    probe.onload = () => finish(probe.naturalWidth > 0)
    probe.onerror = () => finish(false)
    probe.src = source
  })
  if (gravatarChecks.size >= 256) gravatarChecks.delete(gravatarChecks.keys().next().value!)
  gravatarChecks.set(source, check)
  return check
}

export function identicon(seed: string): string {
  seed = seed.trim().normalize("NFC") || "visitor"
  const dark = document.documentElement.getAttribute("saved-theme") === "dark"
  const key = `${dark ? "dark" : "light"}:${seed}`
  const cached = avatarCache.get(key)
  if (cached) return cached
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  let state = hash || 1
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  // Celestial cut-paper emblems: bold silhouettes stay legible at avatar size.
  const palettes = [
    ["#e9eff5", "#315d88", "#d99b55", "#202e3c", "#9dbfdf", "#e4b16e"],
    ["#edf2e9", "#59743d", "#ce9b43", "#283126", "#b8ce92", "#e1b865"],
    ["#f5eae7", "#a45544", "#498a85", "#352925", "#e4a18c", "#8dbfb4"],
    ["#efeaf4", "#725194", "#dca271", "#2e2839", "#c5ace0", "#e6b88b"],
    ["#e7f1ed", "#2c796c", "#d5aa5c", "#23332e", "#96cbbb", "#e1bc79"],
    ["#f4e9ed", "#95576e", "#758fba", "#35272e", "#dba7ba", "#a6bce0"],
    ["#f2eee4", "#8a6b34", "#547f92", "#332e24", "#d8bd85", "#9dbfce"],
    ["#e9edf6", "#4d61a0", "#cc865d", "#252c3b", "#a7b7e2", "#e0a67f"],
  ]
  const palette = palettes[Math.floor(random() * palettes.length)]
  const paper = palette[dark ? 3 : 0]
  const primary = palette[dark ? 4 : 1]
  const accent = palette[dark ? 5 : 2]
  const marks = [
    '<circle cx="30" cy="33" r="20" fill="P"/><circle cx="39" cy="25" r="17" fill="B"/><circle cx="48" cy="17" r="4" fill="A"/>',
    '<path d="M12 51V30a20 20 0 0 1 40 0v21H40V30a8 8 0 0 0-16 0v21Z" fill="P"/><path d="m32 24 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="A"/>',
    '<path d="m10 48 25-29 10 7Z" fill="P"/><path d="m20 53 19-24 7 2Z" fill="A"/><circle cx="44" cy="20" r="9" fill="P"/><circle cx="44" cy="20" r="4" fill="A"/>',
    '<path d="m32 9 7 16 16 7-16 7-7 16-7-16-16-7 16-7Z" fill="P"/><path d="m32 21 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="A"/>',
    '<ellipse cx="32" cy="32" rx="25" ry="16" fill="none" stroke="P" stroke-width="2" transform="rotate(-26 32 32)"/><circle cx="22" cy="35" r="12" fill="P"/><circle cx="44" cy="27" r="9" fill="A"/>',
    '<circle cx="14" cy="32" r="7" fill="P"/><circle cx="18" cy="29" r="6" fill="B"/><circle cx="34" cy="32" r="12" fill="P"/><path d="M34 20a12 12 0 0 1 0 24Z" fill="A"/><circle cx="53" cy="32" r="5" fill="A"/>',
    '<path d="m9 51 14-25 11 18 9-17 13 24Z" fill="P"/><path d="m34 44 9-17 13 24H39Z" fill="A"/><circle cx="31" cy="15" r="6" fill="A"/>',
    '<path d="M32 9c10 9 14 19 10 33H22C18 28 22 18 32 9Z" fill="P"/><path d="m22 30-10 18 12-5Zm20 0 10 18-12-5ZM27 46h10l-5 10Z" fill="A"/><circle cx="32" cy="28" r="5" fill="B"/>',
    '<path d="M14 33a18 18 0 0 1 36 0Z" fill="P"/><path d="M12 37h40v6H12Z" fill="A"/><path d="M20 47h24v7H20Z" fill="P"/><path d="M32 16v17" stroke="B" stroke-width="4"/><circle cx="32" cy="10" r="3" fill="A"/>',
    '<path d="m21 10 11 9 11-9 2 15 12 7-12 7-2 15-11-9-11 9-2-15-12-7 12-7Z" fill="P"/><circle cx="32" cy="32" r="10" fill="B"/><circle cx="32" cy="32" r="5" fill="A"/>',
    '<circle cx="32" cy="32" r="15" fill="P"/><path d="M32 17a15 15 0 0 1 0 30Z" fill="A"/><ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="B" stroke-width="7" transform="rotate(-28 32 32)"/><ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="A" stroke-width="3" transform="rotate(-28 32 32)"/>',
    '<path d="M11 11h20v20H11Zm22 22h20v20H33Z" fill="P"/><path d="M33 11a20 20 0 0 1 20 20H33ZM11 33h20v20a20 20 0 0 1-20-20" fill="A"/><circle cx="32" cy="32" r="7" fill="B"/>',
  ]
  const markIndex = Math.floor(random() * marks.length)
  const mark = marks[markIndex]
    .replaceAll('"P"', '"' + primary + '"')
    .replaceAll('"A"', '"' + accent + '"')
    .replaceAll('"B"', '"' + paper + '"')
  const orientation = Math.floor(random() * 4) * 90
  const rotation = [1, 6, 8].includes(markIndex) ? 0 : orientation
  const mirrored = random() > 0.5 ? -1 : 1
  const scale = (0.88 + random() * 0.1).toFixed(3)
  const signatureX = random() > 0.5 ? 9 : 55
  const signatureY = random() > 0.5 ? 9 : 55
  const signature = random() > 0.5
    ? '<circle cx="' + signatureX + '" cy="' + signatureY + '" r="2" fill="' + accent + '"/>'
    : '<path d="m' + signatureX + ' ' + (signatureY - 3) + ' 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="' + accent + '"/>'
  const transform = 'translate(32 32) rotate(' + rotation + ') scale(' + (Number(scale) * mirrored) + ' ' + scale + ') translate(-32 -32)'
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-avatar-seed="' + encodeURIComponent(seed) + '"><rect width="64" height="64" fill="' + paper + '"/><g transform="' + transform + '">' + mark + '</g>' + signature + '</svg>'
  const result = avatarPrefix + encodeURIComponent(svg)
  if (avatarCache.size >= 256) avatarCache.delete(avatarCache.keys().next().value!)
  avatarCache.set(key, result)
  return result
}

export function bindIdenticon(image: HTMLImageElement, fallbackSeed: string, explicitSeed?: string, isAdmin = false) {
  image.setAttribute("no-view", "")
  const original = image.getAttribute("src") || ""
  // Artalk's avatar builder has already verified the administrator identity.
  if (!explicitSeed && (original === adminAvatar || original === new URL(adminAvatar, location.origin).href)) {
    image.classList.add("site-profile-avatar")
    delete image.dataset.identiconSeed
    image.removeAttribute("srcset")
    return
  }
  let generatedSeed: string | undefined
  if (original.startsWith(avatarPrefix)) {
    try {
      const encoded = decodeURIComponent(original.slice(avatarPrefix.length)).match(/data-avatar-seed="([^"]+)"/)?.[1]
      if (encoded) generatedSeed = decodeURIComponent(encoded)
    } catch { /* Replace malformed image data with a site-owned avatar. */ }
  }
  const hash = original.match(/\/avatar\/([a-f\d]{32,64})/i)?.[1]?.toLowerCase()
  const seed = explicitSeed || generatedSeed || hash || image.dataset.identiconSeed || fallbackSeed
  const source = commentAvatar(seed, isAdmin)
  if (source.startsWith("https://www.gravatar.com/avatar/")) {
    image.dataset.identiconSeed = seed
    image.classList.remove("site-profile-avatar")
    image.removeAttribute("srcset")
    // Attribute observers also see our own updates; never restart the same probe.
    const binding = `${seed}:${source}`
    if (boundAvatars.get(image) === binding) {
      const available = selectedGravatars.get(image)
      if (available !== undefined) {
        if (available) delete image.dataset.identiconSeed
        const selected = available ? source : identicon(seed)
        if (original !== selected) image.src = selected
      }
      return
    }
    boundAvatars.set(image, binding)
    selectedGravatars.delete(image)
    const visibility = image.style.visibility
    image.style.visibility = "hidden"
    void hasGravatar(source).then(async (available) => {
      if (boundAvatars.get(image) !== binding) return
      image.src = available ? source : identicon(seed)
      try {
        await image.decode()
      } catch {
        if (boundAvatars.get(image) !== binding) return
        image.src = identicon(seed)
        await image.decode().catch(() => {})
        available = false
      }
      if (boundAvatars.get(image) !== binding) return
      selectedGravatars.set(image, available)
      if (available) delete image.dataset.identiconSeed
      image.style.visibility = visibility
    })
    return
  }
  boundAvatars.delete(image)
  selectedGravatars.delete(image)
  image.classList.toggle("site-profile-avatar", source === adminAvatar)
  if (source === adminAvatar) delete image.dataset.identiconSeed
  else image.dataset.identiconSeed = seed
  if (original !== source) image.src = source
  image.removeAttribute("srcset")
}

export function observeArtalkIdenticons(root: HTMLElement) {
  const update = () => {
    for (const image of root.querySelectorAll<HTMLImageElement>(".atk-avatar img, img.atk-avatar")) {
      bindIdenticon(image, image.closest(".atk-comment")?.querySelector(".atk-nick")?.textContent || image.alt || "访客")
    }
  }
  const observer = new MutationObserver(update)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] })
  update()
  return () => observer.disconnect()
}

document.addEventListener("themechange", () => {
  for (const image of document.querySelectorAll<HTMLImageElement>("img[data-identicon-seed]")) {
    // Artalk can rebuild avatars while changing theme. Refresh only resolved,
    // locally generated images, never an in-flight or registered Gravatar.
    if (!image.getAttribute("src")?.startsWith(avatarPrefix)) continue
    if (boundAvatars.has(image) && selectedGravatars.get(image) !== false) continue
    image.src = identicon(image.dataset.identiconSeed!)
  }
})
