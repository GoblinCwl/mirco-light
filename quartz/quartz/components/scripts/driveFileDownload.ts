// Also serialized into preview iframes: keep this helper self-contained.
export function trackDriveResponse(response: Response, expectedSize: number, progress: (value: number) => void): Response {
  if (!response.body) return response
  const total = expectedSize > 0 ? expectedSize : Number(response.headers.get("content-length"))
  const reader = response.body.getReader()
  let received = 0, lastUpdate = 0
  if (total > 0) progress(0)
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) { progress(1); controller.close(); return }
        received += chunk.value.byteLength
        const now = performance.now()
        if (total > 0 && now - lastUpdate >= 50) { progress(Math.min(received / total, 1)); lastUpdate = now }
        controller.enqueue(chunk.value)
      } catch (error) { controller.error(error) }
    },
    cancel(reason) { return reader.cancel(reason) },
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}
