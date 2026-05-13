const SCHEMA = [
  {
    name: 'companies',
    columns: [
      { name: 'id', type: 'text', badge: 'PK' },
      { name: 'name', type: 'text' },
      { name: 'website', type: 'text' },
    ],
  },
  {
    name: 'contacts',
    columns: [
      { name: 'id', type: 'text', badge: 'PK' },
      { name: 'name', type: 'text' },
      { name: 'company_id', type: 'text', badge: 'FK' },
      { name: 'role', type: 'text' },
      { name: 'source', type: 'enum', hint: 'LinkedIn | YC | Cold Email | Referral | Event' },
      { name: 'stage', type: 'enum', hint: 'Outreached | Responded | Ongoing | Dead' },
      { name: 'outreach_date', type: 'date' },
      { name: 'notes', type: 'text' },
      { name: 'content_post_id', type: 'text', badge: 'FK' },
    ],
  },
  {
    name: 'job_postings',
    columns: [
      { name: 'id', type: 'text', badge: 'PK' },
      { name: 'company_id', type: 'text', badge: 'FK' },
      { name: 'title', type: 'text' },
      { name: 'link', type: 'text' },
      { name: 'source', type: 'enum', hint: 'YC | HN | RemoteOK | SimplifyJobs | LinkedIn | CompanySite' },
      { name: 'scraped_date', type: 'date' },
      { name: 'status', type: 'enum', hint: 'new | applied | dropped' },
      { name: 'description', type: 'text' },
      { name: 'resume_path', type: 'text' },
    ],
  },
  {
    name: 'interactions',
    columns: [
      { name: 'id', type: 'text', badge: 'PK' },
      { name: 'contact_id', type: 'text', badge: 'FK' },
      { name: 'date', type: 'date' },
      { name: 'direction', type: 'enum', hint: 'in | out' },
      { name: 'notes', type: 'text' },
    ],
  },
  {
    name: 'content_posts',
    columns: [
      { name: 'id', type: 'text', badge: 'PK' },
      { name: 'posted_date', type: 'date' },
      { name: 'content', type: 'text' },
      { name: 'impressions', type: 'int' },
      { name: 'engagements', type: 'int' },
      { name: 'comments', type: 'int' },
    ],
  },
]

const BADGE_STYLES: Record<string, string> = {
  PK: 'text-amber-600 dark:text-amber-400',
  FK: 'text-blue-500 dark:text-blue-400',
}

const TYPE_STYLES: Record<string, string> = {
  enum: 'text-emerald-600 dark:text-emerald-400',
  int: 'text-purple-500 dark:text-purple-400',
}

export default function Schema() {
  return (
    <div className="overflow-y-auto px-6 py-6">
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-border">
        {[['PK', 'primary key', 'text-amber-600 dark:text-amber-400'], ['FK', 'foreign key', 'text-blue-500 dark:text-blue-400']].map(([badge, label, cls]) => (
          <div key={badge as string} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`font-mono font-semibold text-[10px] ${cls}`}>{badge}</span>
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {SCHEMA.map(table => (
          <div key={table.name} className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <p className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">{table.name}</p>
            </div>
            <div className="flex flex-col">
              {table.columns.map(col => (
                <div key={col.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20 transition-colors border-b border-border/40 last:border-0">
                  <span className={`font-mono text-[10px] font-semibold w-5 shrink-0 ${BADGE_STYLES[col.badge ?? ''] ?? 'text-transparent'}`}>
                    {col.badge ?? ''}
                  </span>
                  <span className="font-mono text-xs text-foreground/80 flex-1">{col.name}</span>
                  <span className={`font-mono text-[10px] ${TYPE_STYLES[col.type] ?? 'text-muted-foreground'}`}>
                    {col.hint ?? col.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
