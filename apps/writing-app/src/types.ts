export interface Frontmatter {
  title: string
  date: string
  tags: string[]
  description: string
  status: 'in-progress' | 'published'
  abstract?: string
}

export interface EssayMeta {
  folder: string
  slug: string
  title?: string
  date?: string
  tags?: string[]
  description?: string
  status?: string
  [key: string]: unknown
}

export interface Essay {
  folder: string
  slug: string
  frontmatter: Frontmatter
  body: string
}
