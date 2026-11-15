// Obsidian frontmatter without a zone is written in the site's Shanghai time,
// independently of the build machine's TZ. Explicit zones and epoch values are
// absolute instants and must not be shifted again.
const noteWallTime = /^(\d{4}-\d{2}-\d{2})(?:[Tt ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/
export function parseNoteDate(value: string | number | Date | undefined): Date {
  if (typeof value === 'string') {
    const text = value.trim(), match = noteWallTime.exec(text)
    if (match) return new Date(`${match[1]}T${match[2] || '00:00:00'}+08:00`)
    return new Date(text)
  }
  return new Date(value as number | Date)
}
