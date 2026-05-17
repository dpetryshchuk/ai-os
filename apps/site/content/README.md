# Writing Content

## How to create an essay

1. Create a `.md` file in `content/essays/`
2. The filename becomes the URL: `analytical-idealism.md` → `/essays/analytical-idealism`
3. Add YAML frontmatter at the top, then write in Markdown below

---

## Frontmatter fields

```yaml
---
title: "On Analytical Idealism"        # required — displayed as the page heading
date: "2026-04-30"                      # required — ISO format YYYY-MM-DD
tags: ["philosophy", "idealism"]        # required — used to group essays on /essays index
description: "One line summary."        # optional — shown under title and in the index
status: "draft"                         # optional — draft | in-progress | finished
---
```

### `title`
The heading shown on the page and in the index. Wrap in quotes if it contains a colon.

### `date`
Always `"YYYY-MM-DD"`. Keep it quoted.

### `tags`
A list of one or more tags. These group essays on the `/essays` page. Use lowercase, hyphenated.
```yaml
tags: ["philosophy"]
tags: ["philosophy", "idealism", "consciousness"]
tags: ["business"]
tags: ["theology"]
tags: ["meta"]
```

### `description`
One sentence. Shows up under the title and in the index listing. Optional but recommended.

### `status`
Controls the badge shown on the essay.
- `"draft"` — rough, not ready to share
- `"in-progress"` — actively being developed
- `"finished"` — complete, no badge shown

---

## Markdown reference

### Headings
```md
## Section title
### Subsection
```
Don't use `#` (that's the page title, already set by `title` in frontmatter).

### Blockquotes
```md
> The universe is not made of matter. It is made of experience.
> — Bernardo Kastrup
```
Renders with a left border, italic, and attribution line.

### Links
```md
[link text](https://example.com)          external link
[another essay](/essays/on-theology)      link to your own essay
```

### Bold and italic
```md
**bold**
*italic*
```

### Lists
```md
- item one
- item two
  - nested item
```

---

## Example essay

```md
---
title: "On Analytical Idealism"
date: "2026-04-30"
tags: ["philosophy", "idealism"]
description: "Why consciousness is fundamental, not emergent."
status: "in-progress"
---

Bernardo Kastrup argues that the hard problem of consciousness dissolves
if we invert the standard assumption: instead of matter giving rise to mind,
mind is the substrate from which matter is abstracted.

## The hard problem

David Chalmers famously asked why physical processes give rise to subjective
experience at all. Physicalism has no clean answer.

> Why should any physical system give rise to experience?
> Why isn't there just information processing in the dark?
> — David Chalmers

Kastrup's response is that asking why mind emerges from matter is the wrong
question. Matter is a representation *within* mind, not the other way around.

## What this means practically

If idealism is correct, our introspective access to experience is more
fundamental than our theoretical models of the physical world...
```
