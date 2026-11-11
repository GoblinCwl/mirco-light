// Count wide characters as two units so mixed Chinese/Latin titles stay compact.
export function compactGraphTitle(title: string, limit = 26): string {
  const characters = Array.from(title.replace(/\s+/g, " ").trim())
  const weight = (character: string) => /^[\x00-\x7f]$/.test(character) ? 1 : 2
  if (characters.reduce((sum, character) => sum + weight(character), 0) <= limit) return characters.join("")
  let result = "", used = 0
  for (const character of characters) {
    if (used + weight(character) > limit - 2) break
    result += character
    used += weight(character)
  }
  return `${result.trimEnd()}…`
}
