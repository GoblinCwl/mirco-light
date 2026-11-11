import type { ContentCatalog, IndexedContent } from './contentCatalog'

const types: Record<string, IndexedContent['type']> = { Share: 'share', Repo: 'repo', Video: 'video' }
const units = { article: '篇文章', share: '个分享', repo: '个仓库', video: '个视频' }

// The authorized catalog already contains only indexed projects. Do not load
// platform trees or count a share's children / administrator space separately.
export function domainDistribution(catalog: ContentCatalog, prefix: string) {
  const type = types[prefix.split('/')[0]] || 'article'
  const count = Object.entries(catalog.pages).filter(([slug, page]) =>
    page.type === type && (slug === prefix || slug.startsWith(prefix + '/')),
  ).length
  return { count, unit: units[type] }
}
