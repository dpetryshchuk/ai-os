---
name: agentskills-standard
description: The agentskills.io open standard for skill file format. Read this when creating new skills.
tags: [meta, skills, standard]
---

# agentskills.io Open Standard

Skills are markdown files with YAML frontmatter. This is the cross-compatible format
used by Hermes, Claude Code, and other agent frameworks.

## File format

```yaml
---
name: skill-name          # kebab-case, unique
description: Use when...  # 1 sentence, ≤1024 chars, starts with "Use when"
tags: [tag1, tag2]        # optional, for discovery
---
```

## Sections (in order)

1. **When to Use** — triggering conditions
2. **Procedure** — step-by-step, numbered
3. **Pitfalls** — common mistakes
4. **Verification** — how to confirm it worked

## Rules

- Description must start with "Use when" so agents can decide relevance
- No more than 500 lines per skill (split if larger)
- Skills in `aios/prompts/skills/` are loaded on-demand, not preloaded
- After completing a complex task (5+ tool calls), consider writing a new skill
  capturing the approach for future reuse
