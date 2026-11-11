export {}

declare global {
  interface Window {
    addCleanup: (fn: () => void) => void
    spaNavigate: (url: URL, isBack?: boolean, source?: URL) => Promise<void>
  }
}
