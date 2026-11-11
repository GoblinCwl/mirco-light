/** Keep a matching favicon mounted while SPA replaces the rest of <head>. */
export function retainFavicon(current: Document, incoming: Document) {
  const previous = current.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
  const next = incoming.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
  // Re-evaluate on every navigation so a later icon version can still replace it.
  previous?.removeAttribute('data-persist')
  next?.removeAttribute('data-persist')
  if (!previous || !next || previous.href !== next.href) return
  previous.setAttribute('data-persist', '')
  next.setAttribute('data-persist', '')
}
