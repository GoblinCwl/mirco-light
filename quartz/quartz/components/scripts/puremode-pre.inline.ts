// This runs from the document head so pure-mode styles apply before the first paint.
const pureModeParams = new URLSearchParams(window.location.search)
const pureModeHome = /^\/(?:index(?:\.html)?)?$/.test(window.location.pathname)
if (!pureModeHome && pureModeParams.get("pure") === "true") {
  document.documentElement.classList.add("pure-mode")
}
