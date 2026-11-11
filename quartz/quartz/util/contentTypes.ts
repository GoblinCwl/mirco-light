import type { FilePath, FullSlug, SimpleSlug } from "./path"

export type ContentDetails = {
  slug: FullSlug
  filePath: FilePath
  title: string
  links: SimpleSlug[]
  tags: string[]
  content: string
  createdAt?: string
  date?: Date
  description?: string
  encrypted?: boolean
}
