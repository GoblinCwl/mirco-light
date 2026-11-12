/** A missing page is separate from a failed request or an unavailable video. */
export class PageNotFoundError extends Error {
  constructor(message = '页面不存在') { super(message); this.name = 'PageNotFoundError' }
}
export function showSiteNotFound() {
  document.dispatchEvent(new CustomEvent('quartz-not-found'))
}
