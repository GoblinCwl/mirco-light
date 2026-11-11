let isReaderMode = false

const emitReaderModeChangeEvent = (mode: "on" | "off") => {
  const event: CustomEventMap["readermodechange"] = new CustomEvent("readermodechange", {
    detail: { mode },
  })
  document.dispatchEvent(event)
}

document.addEventListener("nav", () => {
  const switchReaderMode = () => {
    isReaderMode = !isReaderMode
    const newMode = isReaderMode ? "on" : "off"
    document.documentElement.setAttribute("reader-mode", newMode)
    emitReaderModeChangeEvent(newMode)
  }

  const enterPureMode = (event: Event) => {
    if (document.body.dataset.slug === "index" || !(event instanceof MouseEvent) || event.detail !== 3) return

    const url = new URL(window.location.href)
    url.searchParams.set("pure", "true")
    window.location.href = url.href
  }

  for (const readerModeButton of document.getElementsByClassName("readermode")) {
    readerModeButton.addEventListener("click", switchReaderMode)
    readerModeButton.addEventListener("click", enterPureMode)
    // @ts-ignore
    window.addCleanup(() => {
      readerModeButton.removeEventListener("click", switchReaderMode)
      readerModeButton.removeEventListener("click", enterPureMode)
    })
  }

  // Set initial state
  document.documentElement.setAttribute("reader-mode", isReaderMode ? "on" : "off")
})
