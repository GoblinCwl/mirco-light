import { homeIcons } from '../../home/icons'

const elements = new Set('svg g path circle ellipse rect line polyline polygon defs lineargradient radialgradient stop clippath mask use symbol title desc text tspan'.split(' '))
const localPaint = /^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i
let iconSequence = 0
export const navigationIconSource = (value: string) => homeIcons[value] || value.trim()

/** Parse before insertion: navigation SVGs may draw, but cannot run code or
 * load external resources. Keep the original source separately for editing. */
export function navigationIcon(value: string): string {
  const source = navigationIconSource(value)
  if (!source || source.length > 16384) return ''
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = doc.documentElement
  if (doc.doctype || root.localName !== 'svg' || doc.querySelector('parsererror')) return ''
  const nodes = [root, ...root.querySelectorAll('*')]
  if (nodes.length > 512) return ''
  for (const node of nodes) {
    if (!elements.has(node.localName.toLowerCase()) || node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/2000/svg') return ''
    for (const attr of node.attributes) {
      const key = attr.localName.toLowerCase(), text = attr.value.trim()
      if (key.startsWith('on') || key === 'style' || key === 'src' || text.includes('\\')) return ''
      if (key === 'href' && !/^#[\w:.-]+$/.test(text)) return ''
      if (/url\s*\(/i.test(text) && !localPaint.test(text)) return ''
      if (attr.namespaceURI && !['http://www.w3.org/2000/xmlns/', 'http://www.w3.org/1999/xlink'].includes(attr.namespaceURI)) return ''
    }
  }
  // Exported SVGs frequently reuse IDs such as paint0/clip0. Scope them to this
  // icon so a second link cannot accidentally use the first link's gradient.
  const prefix = `navigation-icon-${++iconSequence}-`
  const ids = new Map(nodes.filter(node => node.hasAttribute('id')).map(node => [node.getAttribute('id')!, prefix + node.getAttribute('id')!]))
  for (const node of nodes) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.localName === 'id') attr.value = ids.get(attr.value)!
      else if (attr.localName === 'href' && ids.has(attr.value.slice(1))) attr.value = '#' + ids.get(attr.value.slice(1))
      else if (localPaint.test(attr.value)) attr.value = attr.value.replace(/#[\w:.-]+/, id => '#' + (ids.get(id.slice(1)) || id.slice(1)))
    }
  }
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('focusable', 'false')
  root.setAttribute('width', '100%')
  root.setAttribute('height', '100%')
  // Use CSS property setters rather than interpolating user code into style.
  // A scratch SVG also handles source without an explicit xmlns attribute.
  const paint = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  paint.style.fill = root.getAttribute('fill') || 'currentColor'
  paint.style.stroke = root.getAttribute('stroke') || 'none'
  paint.style.strokeWidth = root.getAttribute('stroke-width') || '1'
  root.setAttribute('style', paint.getAttribute('style') || '')
  return new XMLSerializer().serializeToString(root)
}
