export function visitorHeaders(): Record<string, string> {
  try {
    const id = localStorage.getItem("quartz-visitor-id")
    return id && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)
      ? { "X-Visitor-ID": id } : {}
  } catch { return {} }
}

export function ownMeteorId(): string | undefined {
  try {
    const id = localStorage.getItem("quartz-visitor-meteor-id")
    return id && /^[a-f\d]{24}$/i.test(id) ? id : undefined
  } catch { return undefined }
}
