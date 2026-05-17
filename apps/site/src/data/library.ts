export interface LibraryItem {
  title: string
  author: string
  type: 'book' | 'podcast'
  coverId?: number   // Open Library cover_i → covers.openlibrary.org/b/id/{id}-M.jpg
  isbn?: string      // fallback when coverId unavailable
}

export interface LibrarySection {
  label: string
  items: LibraryItem[]
}

export function coverUrl(item: LibraryItem): string | null {
  if (item.type !== 'book') return null
  if (item.coverId) return `https://covers.openlibrary.org/b/id/${item.coverId}-M.jpg`
  if (item.isbn)   return `https://covers.openlibrary.org/b/isbn/${item.isbn}-M.jpg`
  return null
}

export const librarySections: LibrarySection[] = [
  {
    label: 'Philosophy & Spirituality',
    items: [
      { title: 'Meditations',                       author: 'Marcus Aurelius',        type: 'book', isbn: '9780812968255' },
      { title: 'Siddhartha',                        author: 'Hermann Hesse',          type: 'book', coverId: 6562535  },
      { title: 'The Little Prince',                 author: 'Antoine de Saint-Exupéry', type: 'book', coverId: 10746692 },
      { title: "Man's Search for Meaning",          author: 'Viktor Frankl',          type: 'book', coverId: 11203708 },
      { title: 'The Untethered Soul',               author: 'Michael Singer',         type: 'book', coverId: 10630553 },
      { title: "The Heart of the Buddha's Teachings", author: 'Thich Nhat Hanh',     type: 'book', coverId: 527670   },
      { title: 'The Way to Love',                   author: 'Anthony de Mello',       type: 'book', isbn: '9780385249393' },
    ],
  },
  {
    label: 'Self-Improvement & Psychology',
    items: [
      { title: '7 Habits of Highly Effective People', author: 'Stephen Covey',       type: 'book', coverId: 10079937 },
      { title: 'Psycho-Cybernetics',                author: 'Maxwell Maltz',          type: 'book', coverId: 14428293 },
      { title: 'Essentialism',                      author: 'Greg McKeown',           type: 'book', coverId: 7285986  },
      { title: 'Wishcraft',                         author: 'Barbara Sher',           type: 'book', coverId: 211189   },
    ],
  },
  {
    label: 'Relationships & Communication',
    items: [
      { title: 'Models',                            author: 'Mark Manson',            type: 'book', coverId: 8696002  },
      { title: 'Supercommunicators',                author: 'Charles Duhigg',         type: 'book', coverId: 14591638 },
    ],
  },
  {
    label: 'Business & Leadership',
    items: [
      { title: 'The Mom Test',                      author: 'Rob Fitzpatrick',        type: 'book', coverId: 10660557 },
      { title: 'Straight Line Leadership',          author: 'Dusan Djukich',          type: 'book', coverId: 7724219  },
      { title: 'Rework',                            author: 'Jason Fried & David Heinemeier Hansson', type: 'book', coverId: 6679955 },
    ],
  },
  {
    label: 'Mastery & Skill',
    items: [
      { title: 'Mastery',                           author: 'Robert Greene',          type: 'book', coverId: 7561012  },
    ],
  },
  {
    label: 'Fiction & Memoir',
    items: [
      { title: 'Three Body Problem Series',         author: 'Liu Cixin',              type: 'book', isbn: '9780765377067' },
      { title: 'The Stormlight Archive',            author: 'Brandon Sanderson',      type: 'book', coverId: 14658316 },
      { title: 'When Breath Becomes Air',           author: 'Paul Kalanithi',         type: 'book', coverId: 11463139 },
    ],
  },
  {
    label: 'Listening',
    items: [
      { title: 'Joe Hudson',       author: '', type: 'podcast' },
      { title: 'My First Million', author: '', type: 'podcast' },
    ],
  },
]
