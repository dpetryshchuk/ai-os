# Homepage Gwern Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the accordion-sidebar homepage with a gwern.net-style minimal header + two-column categorized essay index, and move Bio/Projects/Library to their own pages.

**Architecture:** The homepage becomes a pure essay index — it calls `getEssays()`, groups by folder, and renders a responsive two-column grid. Bio, Projects, and Library content moves to `/about`, `/projects`, and `/library` pages, each pulling from existing data files and components. No new data layer; no new components beyond page files.

**Tech Stack:** Next.js App Router, TypeScript, inline styles (existing pattern), CSS class added to globals.css for responsive grid.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Rewrite | `src/app/page.tsx` | New Gwern-style homepage |
| Modify | `src/app/globals.css` | Add `.essay-index-grid` responsive class + link hover |
| Create | `src/app/about/page.tsx` | Bio content (moved from homepage) |
| Create | `src/app/projects/page.tsx` | Projects content (moved from homepage) |
| Create | `src/app/library/page.tsx` | Library content (moved from homepage) |

---

## Task 1: Add CSS for essay index grid and link hover

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add styles at the bottom of globals.css**

Append these lines to the end of `src/app/globals.css`:

```css
/* Essay index grid (homepage) */
.essay-index-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 48px;
  align-items: start;
}

@media (max-width: 600px) {
  .essay-index-grid {
    grid-template-columns: 1fr;
  }
}

.essay-index-link {
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.12s, color 0.12s;
}

.essay-index-link:hover {
  border-bottom-color: currentColor;
}
```

- [ ] **Step 2: Start dev server and confirm no errors**

```bash
npm run dev
```

Expected: Server starts at http://localhost:3000 with no compile errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add essay-index-grid responsive CSS"
```

---

## Task 2: Rewrite homepage

**Files:**
- Rewrite: `src/app/page.tsx`

- [ ] **Step 1: Replace the entire contents of `src/app/page.tsx`**

```tsx
import Link from 'next/link'
import { getEssays } from '@/lib/essays'
import type { Essay } from '@/lib/essays'

export default function Home() {
  const essays = getEssays().sort((a, b) => b.date.localeCompare(a.date))

  const byFolder: Record<string, Essay[]> = {}
  for (const essay of essays) {
    if (!byFolder[essay.folder]) byFolder[essay.folder] = []
    byFolder[essay.folder].push(essay)
  }
  const folders = Object.keys(byFolder).sort()

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 32px 80px' }}>

        <header style={{ marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid var(--rule)' }}>
          <h1 style={{
            fontSize: 22,
            fontWeight: 'normal',
            margin: '0 0 6px',
            color: 'var(--ink)',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.01em',
          }}>
            Dmytro Petryshchuk
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', fontStyle: 'italic', margin: '0 0 14px' }}>
            Writing about consciousness, craft, and building things.
          </p>
          <nav style={{ display: 'flex', gap: 16, fontFamily: 'var(--font-sans)', fontSize: 13, flexWrap: 'wrap' }}>
            {[
              { href: '/about',    label: 'About'      },
              { href: '/projects', label: 'Projects'   },
              { href: '/library',  label: 'Library'    },
              { href: '/writing',  label: 'Newsletter' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid transparent' }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="essay-index-grid">
          {folders.map(folder => (
            <div key={folder} style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                {folder}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {byFolder[folder].map(essay => (
                  <li key={essay.slug} style={{ padding: '2px 0', lineHeight: 1.6 }}>
                    <Link
                      href={`/essays/${essay.folder}/${essay.slug}`}
                      className="essay-index-link"
                      style={{
                        fontSize: 15,
                        color: essay.status === 'draft' ? 'var(--ink-faint)' : 'var(--ink)',
                        fontStyle: essay.status === 'draft' ? 'italic' : 'normal',
                      }}
                    >
                      {essay.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000. Confirm:
- No left sidebar
- Name + tagline + nav links at top
- Essay list appears below (even with only 2 essays it should render correctly)
- No TypeScript errors in terminal

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: rewrite homepage as gwern-style essay index"
```

---

## Task 3: Create /about page

**Files:**
- Create: `src/app/about/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link'
import { EmailCopy } from '@/components/EmailCopy'

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid currentColor' }}
    >
      {children}
    </a>
  )
}

export default function AboutPage() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 32px 80px' }}>

        <Link
          href="/"
          style={{ fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'none', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 40 }}
        >
          ← Dmytro Petryshchuk
        </Link>

        <div style={{ fontSize: 18, lineHeight: 1.75, color: 'var(--ink)' }}>
          <p style={{ margin: '0 0 16px' }}>
            Hi, I'm <strong>Dmytro Petryshchuk</strong> (or Dima), an entrepreneur, engineer, writer, and worldbuilding nerd.
          </p>
          <p style={{ margin: '0 0 16px' }}>
            I'm the founder of{' '}
            <InlineLink href="https://www.onekeyflow.com">OneKeyFlow</InlineLink>
            , an AI automation agency where I help businesses use AI, build internal tools, and automate the slow manual work holding them back. Clients include a $45m/yr ecommerce company, a $3m/yr semiconductor fab, and a $2m/yr auto transport logistics company.
          </p>
          <p style={{ margin: '0 0 16px' }}>
            I worked at{' '}
            <InlineLink href="https://www.midtronics.com">Midtronics</InlineLink>
            , a $100M/yr battery technology company that develops next-generation charging, discharging, and testing equipment. There I spent three years as an embedded software engineer building these systems.
          </p>
          <p style={{ margin: '0 0 16px' }}>
            Before this, I worked with{' '}
            <InlineLink href="https://fairquanta.com">FairQuanta</InlineLink>
            {' '}as a founding engineer building and researching AI and UI/UX to improve group cohesion. I also built{' '}
            <InlineLink href="http://valandar.com/">Valandar AI</InlineLink>
            , a Word add-in for vendor agreement lawyers.
          </p>
          <p style={{ margin: '0 0 24px' }}>
            I'm a graduate of the University of Illinois at Urbana-Champaign, where I focused on neural circuits, embedded software, computer architecture, machine learning, and AI.
          </p>
          <p style={{ margin: '0 0 4px' }}>
            My resume is{' '}
            <a href="/resume.pdf" download style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>
              here
            </a>.
          </p>
          <p style={{ margin: 0 }}>
            Email me at <EmailCopy />.
          </p>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/about. Confirm bio text renders, back link works, email copy works.

- [ ] **Step 3: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: add /about page with bio content"
```

---

## Task 4: Create /projects page

**Files:**
- Create: `src/app/projects/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link'
import { projects } from '@/data/projects'

export default function ProjectsPage() {
  const work = projects.filter(p => p.category === 'work')
  const experiments = projects.filter(p => p.category === 'experiment')

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 32px 80px' }}>

        <Link
          href="/"
          style={{ fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'none', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 40 }}
        >
          ← Dmytro Petryshchuk
        </Link>

        {[{ label: 'Work', items: work }, { label: 'Experiments', items: experiments }].map(({ label, items }) => (
          <div key={label} style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
              {label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {items.map(p => (
                <div key={p.id} style={{ paddingLeft: 14, borderLeft: '2px solid var(--rule)' }}>
                  <div style={{ marginBottom: p.bullets.length > 0 ? 6 : 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                      {p.name}
                    </span>
                    {p.role && (
                      <span style={{ fontSize: 13, color: 'var(--ink-faint)', marginLeft: 8, fontFamily: 'var(--font-sans)' }}>
                        · {p.role}
                      </span>
                    )}
                    {p.dates && (
                      <span style={{ fontSize: 12, color: 'var(--ink-faint)', marginLeft: 6, fontFamily: 'var(--font-sans)' }}>
                        {p.dates}
                      </span>
                    )}
                  </div>
                  {p.bullets.length > 0 && (
                    <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                      {p.bullets.map((b, i) => (
                        <li key={i} style={{ marginBottom: 3 }}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/projects. Confirm work and experiment sections render with correct data.

- [ ] **Step 3: Commit**

```bash
git add src/app/projects/page.tsx
git commit -m "feat: add /projects page"
```

---

## Task 5: Create /library page

**Files:**
- Create: `src/app/library/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link'
import { librarySections, coverUrl } from '@/data/library'

export default function LibraryPage() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 32px 80px' }}>

        <Link
          href="/"
          style={{ fontSize: 12, color: 'var(--ink-faint)', textDecoration: 'none', fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 40 }}
        >
          ← Dmytro Petryshchuk
        </Link>

        {librarySections.map(section => (
          <div key={section.label} style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {section.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--font-sans)' }}>
                ({section.items.length})
              </span>
            </div>
            {section.items.map((item, i) => {
              const url = coverUrl(item)
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: url ? '8px 0' : '6px 0', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" width={34} height={50} style={{ objectFit: 'cover', flexShrink: 0, opacity: 0.92 }} />
                  )}
                  <span style={{ flex: 1, fontSize: 16, color: 'var(--ink)' }}>{item.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>{item.author}</span>
                </div>
              )
            })}
          </div>
        ))}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000/library. Confirm sections render with book covers and author names.

- [ ] **Step 3: Commit**

```bash
git add src/app/library/page.tsx
git commit -m "feat: add /library page"
```

---

## Task 6: Final verification

- [ ] **Step 1: Check all nav links from homepage**

Open http://localhost:3000. Click each nav link — About, Projects, Library, Newsletter — and confirm each page loads.

- [ ] **Step 2: Check mobile layout**

In browser devtools, switch to a 375px wide viewport. Confirm the essay grid collapses to a single column.

- [ ] **Step 3: Check dark mode**

Toggle dark mode (existing ThemeToggle on layout). Confirm homepage and sub-pages render correctly in dark mode.

- [ ] **Step 4: Check existing essay pages still work**

Navigate to `/essays/philosophy/analytic-idealism`. Confirm the essay page is unchanged.

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "fix: final cleanup after homepage redesign"
```
