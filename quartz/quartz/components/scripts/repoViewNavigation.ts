type Callbacks = {
  render: (url: URL, signal: AbortSignal) => Promise<void>
  busy: (pending: boolean) => void
  push: (url: URL) => void
  anchor: (url: URL) => void
  updateDirectory: () => void
  ready?: (url: URL) => void
}
export function createRepoViewNavigation(initial: URL, callbacks: Callbacks) {
  let view: AbortController | undefined
  let pending = false
  const controller = {
    url: initial,
    navigate(url: URL, push = true, force = false) {
      const unchanged = controller.url.pathname === url.pathname && controller.url.search === url.search
      controller.url = url
      if (push) callbacks.push(url)
      if (unchanged && view && !force) {
        if (!pending) { callbacks.anchor(url); callbacks.ready?.(url) }
        return
      }
      view?.abort()
      const request = new AbortController(); view = request
      pending = true
      callbacks.busy(true)
      void callbacks.render(url, request.signal).finally(() => {
        if (view !== request || request.signal.aborted) return
        pending = false
        callbacks.busy(false)
        const readyUrl = controller.url
        if (readyUrl.hash) callbacks.anchor(readyUrl)
        callbacks.ready?.(readyUrl)
      }).catch(error => { if (!request.signal.aborted) console.error("Repo navigation failed", error) })
      callbacks.updateDirectory()
    },
    dispose() { view?.abort(); view = undefined; pending = false },
  }
  return controller
}
