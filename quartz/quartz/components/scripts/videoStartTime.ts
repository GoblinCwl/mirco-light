// Link positions are seconds or a clock value, e.g. ?t=90 or ?t=01:30.
export function videoStartTime(url: URL): number | undefined {
  const value = url.searchParams.get('t')?.trim()
  if (!value || !/^\d+(?:\.\d+)?$|^\d+:\d{2}(?::\d{2})?$/.test(value)) return
  const parts = value.split(':').map(Number)
  if (parts.length > 1 && parts.slice(1).some(part => part >= 60)) return
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return Number.isFinite(seconds) ? seconds : undefined
}
