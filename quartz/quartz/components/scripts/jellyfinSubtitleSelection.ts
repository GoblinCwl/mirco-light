/** Default selection belongs to Jellyfin; only an explicit local choice overrides it. */
export function initialJellyfinSubtitle<T extends { key?: string; index?: number }>(
  tracks: T[],
  saved?: string,
  serverIndex?: number,
): T | undefined {
  if (saved === "off") return undefined
  return (
    (saved ? tracks.find((track) => track.key === saved) : undefined) ||
    tracks.find(
      (track) => typeof serverIndex === "number" && serverIndex >= 0 && track.index === serverIndex,
    )
  )
}
