import { useState, useEffect } from 'react'

const BASE = window.location.hostname === 'localhost' ? 'http://localhost:4111' : ''

interface ContentPost {
  id: string
  posted_date: string
  content: string
  impressions: number
  engagements: number
  comments: number
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Content() {
  const [posts, setPosts] = useState<ContentPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(BASE + '/data/content')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setPosts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>
  if (error) return <div className="p-6 text-sm text-destructive">Error: {error}</div>

  const totalImpressions = posts.reduce((s, p) => s + (p.impressions || 0), 0)
  const totalEngagements = posts.reduce((s, p) => s + (p.engagements || 0), 0)
  const totalComments = posts.reduce((s, p) => s + (p.comments || 0), 0)
  const avgRate = totalImpressions > 0 ? ((totalEngagements / totalImpressions) * 100).toFixed(1) : '—'

  return (
    <div className="overflow-y-auto flex flex-col gap-8 px-6 py-6">
      <section>
        <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-border">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Content</h2>
          <span className="text-xs text-muted-foreground">{posts.length} posts</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Posts" value={posts.length} sub="all time" />
          <StatCard label="Impressions" value={totalImpressions.toLocaleString()} sub="all time" />
          <StatCard label="Eng rate" value={avgRate === '—' ? '—' : `${avgRate}%`} sub="engagements / impressions" />
          <StatCard label="Comments" value={totalComments} sub="all time" />
        </div>

        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No posts logged yet. Use <span className="font-mono text-xs">log_content_post</span> in chat to add one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Date', 'Content', 'Impressions', 'Engagements', 'Comments', 'Rate'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts.map(post => {
                  const rate = post.impressions > 0
                    ? `${((post.engagements / post.impressions) * 100).toFixed(1)}%`
                    : '—'
                  return (
                    <tr key={post.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap">{fmtDate(post.posted_date)}</td>
                      <td className="py-2.5 px-3 max-w-xs">
                        <span className="line-clamp-2 text-xs text-muted-foreground">{post.content}</span>
                      </td>
                      <td className="py-2.5 px-3">{(post.impressions || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3">{post.engagements || 0}</td>
                      <td className="py-2.5 px-3">{post.comments || 0}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{rate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
